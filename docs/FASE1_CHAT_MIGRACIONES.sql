-- =====================================================
-- FASE 1: CHAT AVANZADO - MIGRACIONES SQL
-- Fecha: 15 de Enero 2026
-- Descripción: Tablas necesarias para el sistema de chat
--              con canales, threads y menciones
-- =====================================================

-- 1. TABLA: canales
-- Descripción: Canales de chat dentro de un espacio de trabajo
CREATE TABLE IF NOT EXISTS canales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio_id UUID NOT NULL REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  es_privado BOOLEAN DEFAULT false,
  icono VARCHAR(10) DEFAULT '💬',
  creado_por UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para canales
CREATE INDEX IF NOT EXISTS idx_canales_espacio ON canales(espacio_id);
CREATE INDEX IF NOT EXISTS idx_canales_nombre ON canales(espacio_id, nombre);

-- Comentario de tabla
COMMENT ON TABLE canales IS 'Canales de chat dentro de espacios de trabajo. Pueden ser públicos o privados.';

-- 2. TABLA: canal_miembros
-- Descripción: Miembros de canales privados
CREATE TABLE IF NOT EXISTS canal_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id UUID NOT NULL REFERENCES canales(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol VARCHAR(20) DEFAULT 'miembro', -- admin, miembro
  agregado_en TIMESTAMPTZ DEFAULT NOW(),
  agregado_por UUID REFERENCES auth.users(id),
  UNIQUE(canal_id, usuario_id)
);

-- Índices para canal_miembros
CREATE INDEX IF NOT EXISTS idx_canal_miembros_canal ON canal_miembros(canal_id);
CREATE INDEX IF NOT EXISTS idx_canal_miembros_usuario ON canal_miembros(usuario_id);

COMMENT ON TABLE canal_miembros IS 'Relación de usuarios con canales privados. Para canales públicos no se usa.';

-- 3. TABLA: mensajes_chat
-- Descripción: Mensajes de chat con soporte para threads
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id UUID NOT NULL REFERENCES canales(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  contenido TEXT NOT NULL,
  thread_padre_id UUID REFERENCES mensajes_chat(id) ON DELETE CASCADE,
  menciones UUID[] DEFAULT '{}',
  tiene_respuestas BOOLEAN DEFAULT false,
  cantidad_respuestas INTEGER DEFAULT 0,
  editado BOOLEAN DEFAULT false,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  editado_en TIMESTAMPTZ
);

-- Índices para mensajes_chat
CREATE INDEX IF NOT EXISTS idx_mensajes_canal ON mensajes_chat(canal_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_usuario ON mensajes_chat(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_thread ON mensajes_chat(thread_padre_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_fecha ON mensajes_chat(canal_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_menciones ON mensajes_chat USING GIN(menciones);

COMMENT ON TABLE mensajes_chat IS 'Mensajes de chat con soporte para threads y menciones.';

-- 4. TABLA: mensajes_leidos
-- Descripción: Tracking de último mensaje leído por usuario/canal
CREATE TABLE IF NOT EXISTS mensajes_leidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canal_id UUID NOT NULL REFERENCES canales(id) ON DELETE CASCADE,
  ultimo_mensaje_id UUID REFERENCES mensajes_chat(id),
  ultimo_acceso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, canal_id)
);

-- Índices para mensajes_leidos
CREATE INDEX IF NOT EXISTS idx_leidos_usuario ON mensajes_leidos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_leidos_canal ON mensajes_leidos(canal_id);

COMMENT ON TABLE mensajes_leidos IS 'Tracking de mensajes leídos para mostrar indicadores de no leídos.';

-- 5. TABLA: reacciones_mensaje
-- Descripción: Reacciones emoji a mensajes
CREATE TABLE IF NOT EXISTS reacciones_mensaje (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id UUID NOT NULL REFERENCES mensajes_chat(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mensaje_id, usuario_id, emoji)
);

-- Índices para reacciones
CREATE INDEX IF NOT EXISTS idx_reacciones_mensaje ON reacciones_mensaje(mensaje_id);

COMMENT ON TABLE reacciones_mensaje IS 'Reacciones emoji a mensajes de chat.';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE canal_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes_leidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reacciones_mensaje ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: canales
-- Ver canales públicos del espacio o canales privados donde soy miembro
CREATE POLICY "canales_select" ON canales FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM miembros_espacio me 
    WHERE me.espacio_id = canales.espacio_id 
    AND me.usuario_id = auth.uid() 
    AND me.aceptado = true
  )
  AND (
    es_privado = false 
    OR EXISTS (
      SELECT 1 FROM canal_miembros cm 
      WHERE cm.canal_id = canales.id 
      AND cm.usuario_id = auth.uid()
    )
  )
);

-- Crear canales si soy miembro del espacio
CREATE POLICY "canales_insert" ON canales FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM miembros_espacio me 
    WHERE me.espacio_id = canales.espacio_id 
    AND me.usuario_id = auth.uid() 
    AND me.aceptado = true
  )
);

-- Actualizar canales si soy el creador o admin
CREATE POLICY "canales_update" ON canales FOR UPDATE USING (
  creado_por = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM miembros_espacio me 
    WHERE me.espacio_id = canales.espacio_id 
    AND me.usuario_id = auth.uid() 
    AND me.rol IN ('owner', 'admin')
  )
);

-- POLÍTICAS: canal_miembros
CREATE POLICY "canal_miembros_select" ON canal_miembros FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM canal_miembros cm 
    WHERE cm.canal_id = canal_miembros.canal_id 
    AND cm.usuario_id = auth.uid()
  )
);

CREATE POLICY "canal_miembros_insert" ON canal_miembros FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM canales c
    JOIN miembros_espacio me ON me.espacio_id = c.espacio_id
    WHERE c.id = canal_miembros.canal_id
    AND me.usuario_id = auth.uid()
    AND me.rol IN ('owner', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM canal_miembros cm 
    WHERE cm.canal_id = canal_miembros.canal_id 
    AND cm.usuario_id = auth.uid() 
    AND cm.rol = 'admin'
  )
);

-- POLÍTICAS: mensajes_chat
CREATE POLICY "mensajes_select" ON mensajes_chat FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM canales c
    WHERE c.id = mensajes_chat.canal_id
    AND (
      c.es_privado = false 
      OR EXISTS (
        SELECT 1 FROM canal_miembros cm 
        WHERE cm.canal_id = c.id 
        AND cm.usuario_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "mensajes_insert" ON mensajes_chat FOR INSERT WITH CHECK (
  usuario_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM canales c
    WHERE c.id = mensajes_chat.canal_id
    AND (
      c.es_privado = false 
      OR EXISTS (
        SELECT 1 FROM canal_miembros cm 
        WHERE cm.canal_id = c.id 
        AND cm.usuario_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "mensajes_update" ON mensajes_chat FOR UPDATE USING (
  usuario_id = auth.uid()
);

CREATE POLICY "mensajes_delete" ON mensajes_chat FOR DELETE USING (
  usuario_id = auth.uid()
);

-- POLÍTICAS: mensajes_leidos
CREATE POLICY "leidos_all" ON mensajes_leidos FOR ALL USING (
  usuario_id = auth.uid()
);

-- POLÍTICAS: reacciones_mensaje
CREATE POLICY "reacciones_select" ON reacciones_mensaje FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM mensajes_chat m
    JOIN canales c ON c.id = m.canal_id
    WHERE m.id = reacciones_mensaje.mensaje_id
    AND (
      c.es_privado = false 
      OR EXISTS (
        SELECT 1 FROM canal_miembros cm 
        WHERE cm.canal_id = c.id 
        AND cm.usuario_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "reacciones_insert" ON reacciones_mensaje FOR INSERT WITH CHECK (
  usuario_id = auth.uid()
);

CREATE POLICY "reacciones_delete" ON reacciones_mensaje FOR DELETE USING (
  usuario_id = auth.uid()
);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar contador de respuestas en threads
CREATE OR REPLACE FUNCTION actualizar_contador_thread()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.thread_padre_id IS NOT NULL THEN
    UPDATE mensajes_chat 
    SET 
      tiene_respuestas = true,
      cantidad_respuestas = (
        SELECT COUNT(*) FROM mensajes_chat 
        WHERE thread_padre_id = NEW.thread_padre_id
      )
    WHERE id = NEW.thread_padre_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para contador de respuestas
DROP TRIGGER IF EXISTS trigger_contador_thread ON mensajes_chat;
CREATE TRIGGER trigger_contador_thread
AFTER INSERT ON mensajes_chat
FOR EACH ROW
EXECUTE FUNCTION actualizar_contador_thread();

-- Función para crear canal #general automáticamente
CREATE OR REPLACE FUNCTION crear_canal_general()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO canales (espacio_id, nombre, descripcion, es_privado, icono, creado_por)
  VALUES (
    NEW.id, 
    'general', 
    'Canal general del espacio de trabajo', 
    false, 
    '📢',
    NEW.creado_por
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear canal general (aplicar a espacios_trabajo si existe)
-- DROP TRIGGER IF EXISTS trigger_canal_general ON espacios_trabajo;
-- CREATE TRIGGER trigger_canal_general
-- AFTER INSERT ON espacios_trabajo
-- FOR EACH ROW
-- EXECUTE FUNCTION crear_canal_general();

-- =====================================================
-- DATOS INICIALES (OPCIONAL)
-- =====================================================

-- Crear canal general para espacios existentes que no tengan
-- INSERT INTO canales (espacio_id, nombre, descripcion, es_privado, icono)
-- SELECT id, 'general', 'Canal general del espacio de trabajo', false, '📢'
-- FROM espacios_trabajo
-- WHERE NOT EXISTS (
--   SELECT 1 FROM canales WHERE canales.espacio_id = espacios_trabajo.id AND nombre = 'general'
-- );
