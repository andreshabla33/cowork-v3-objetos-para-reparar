-- =====================================================
-- MIGRACIÓN: Reuniones Programadas
-- Fecha: 15 de Enero 2026
-- Descripción: Sistema de reuniones con calendario
-- =====================================================

-- Tabla: reuniones_programadas
CREATE TABLE IF NOT EXISTS reuniones_programadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio_id UUID NOT NULL REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  sala_id UUID REFERENCES salas_reunion(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  es_recurrente BOOLEAN DEFAULT false,
  recurrencia_regla TEXT,
  recordatorio_minutos INTEGER DEFAULT 15,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para reuniones_programadas
CREATE INDEX IF NOT EXISTS idx_reuniones_espacio ON reuniones_programadas(espacio_id);
CREATE INDEX IF NOT EXISTS idx_reuniones_fecha ON reuniones_programadas(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_reuniones_creador ON reuniones_programadas(creado_por);

COMMENT ON TABLE reuniones_programadas IS 'Reuniones programadas con fecha y hora específica';

-- Tabla: reunion_participantes
CREATE TABLE IF NOT EXISTS reunion_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id UUID NOT NULL REFERENCES reuniones_programadas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'tentativo')),
  notificado BOOLEAN DEFAULT false,
  respondido_en TIMESTAMPTZ,
  UNIQUE(reunion_id, usuario_id)
);

-- Índices para reunion_participantes
CREATE INDEX IF NOT EXISTS idx_participantes_reunion ON reunion_participantes(reunion_id);
CREATE INDEX IF NOT EXISTS idx_participantes_usuario ON reunion_participantes(usuario_id);

COMMENT ON TABLE reunion_participantes IS 'Participantes invitados a reuniones programadas';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE reuniones_programadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_participantes ENABLE ROW LEVEL SECURITY;

-- Políticas para reuniones_programadas
CREATE POLICY "reuniones_select" ON reuniones_programadas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM miembros_espacio me 
    WHERE me.espacio_id = reuniones_programadas.espacio_id 
    AND me.usuario_id = auth.uid() 
    AND me.aceptado = true
  )
);

CREATE POLICY "reuniones_insert" ON reuniones_programadas FOR INSERT WITH CHECK (
  creado_por = auth.uid() AND
  EXISTS (
    SELECT 1 FROM miembros_espacio me 
    WHERE me.espacio_id = reuniones_programadas.espacio_id 
    AND me.usuario_id = auth.uid() 
    AND me.aceptado = true
  )
);

CREATE POLICY "reuniones_update" ON reuniones_programadas FOR UPDATE USING (
  creado_por = auth.uid()
);

CREATE POLICY "reuniones_delete" ON reuniones_programadas FOR DELETE USING (
  creado_por = auth.uid()
);

-- Políticas para reunion_participantes
CREATE POLICY "participantes_select" ON reunion_participantes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM reuniones_programadas rp
    JOIN miembros_espacio me ON me.espacio_id = rp.espacio_id
    WHERE rp.id = reunion_participantes.reunion_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
  )
);

CREATE POLICY "participantes_insert" ON reunion_participantes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM reuniones_programadas rp
    WHERE rp.id = reunion_participantes.reunion_id
    AND rp.creado_por = auth.uid()
  )
);

CREATE POLICY "participantes_update" ON reunion_participantes FOR UPDATE USING (
  usuario_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM reuniones_programadas rp
    WHERE rp.id = reunion_participantes.reunion_id
    AND rp.creado_por = auth.uid()
  )
);

CREATE POLICY "participantes_delete" ON reunion_participantes FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM reuniones_programadas rp
    WHERE rp.id = reunion_participantes.reunion_id
    AND rp.creado_por = auth.uid()
  )
);

-- =====================================================
-- FUNCIÓN: Actualizar estado de respuesta
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_respuesta_reunion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado != NEW.estado THEN
    NEW.respondido_en = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_respuesta_reunion ON reunion_participantes;
CREATE TRIGGER trigger_respuesta_reunion
BEFORE UPDATE ON reunion_participantes
FOR EACH ROW
EXECUTE FUNCTION actualizar_respuesta_reunion();
