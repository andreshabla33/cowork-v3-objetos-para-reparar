-- =====================================================
-- FASE 2: GRABACIÓN Y AI NOTES - MIGRACIONES SQL
-- =====================================================
-- Fecha: Enero 2026
-- Descripción: Tablas para sistema de grabación, transcripción,
--              análisis de emociones y resúmenes AI
-- =====================================================

-- =====================================================
-- 1. TABLA: grabaciones
-- =====================================================
CREATE TABLE IF NOT EXISTS grabaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id UUID REFERENCES reuniones_programadas(id) ON DELETE SET NULL,
  sala_id UUID REFERENCES salas_reunion(id) ON DELETE SET NULL,
  espacio_id UUID NOT NULL REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  creado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Archivo
  archivo_url TEXT,
  archivo_nombre TEXT,
  duracion_segundos INTEGER DEFAULT 0,
  tamano_bytes BIGINT,
  formato VARCHAR(50) DEFAULT 'video/webm',
  
  -- Estado y progreso
  estado VARCHAR(30) DEFAULT 'grabando' CHECK (estado IN (
    'idle', 'requesting_consent', 'recording', 'paused', 'stopped',
    'uploading', 'processing', 'transcribing', 'analyzing', 'completed', 'error'
  )),
  progreso_porcentaje INTEGER DEFAULT 0,
  error_mensaje TEXT,
  
  -- Tipo de grabación
  tipo VARCHAR(20) DEFAULT 'reunion' CHECK (tipo IN ('reunion', 'pantalla', 'audio_solo')),
  tiene_video BOOLEAN DEFAULT true,
  tiene_audio BOOLEAN DEFAULT true,
  
  -- Timestamps
  inicio_grabacion TIMESTAMPTZ,
  fin_grabacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_grabaciones_espacio ON grabaciones(espacio_id);
CREATE INDEX IF NOT EXISTS idx_grabaciones_creador ON grabaciones(creado_por);
CREATE INDEX IF NOT EXISTS idx_grabaciones_reunion ON grabaciones(reunion_id);
CREATE INDEX IF NOT EXISTS idx_grabaciones_estado ON grabaciones(estado);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_grabaciones_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_grabaciones_updated ON grabaciones;
CREATE TRIGGER trigger_grabaciones_updated
  BEFORE UPDATE ON grabaciones
  FOR EACH ROW EXECUTE FUNCTION update_grabaciones_timestamp();

-- RLS
ALTER TABLE grabaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver grabaciones de su espacio"
  ON grabaciones FOR SELECT
  USING (
    espacio_id IN (
      SELECT espacio_id FROM miembros_espacio 
      WHERE usuario_id = auth.uid() AND aceptado = true
    )
  );

CREATE POLICY "Usuarios pueden crear grabaciones en su espacio"
  ON grabaciones FOR INSERT
  WITH CHECK (
    espacio_id IN (
      SELECT espacio_id FROM miembros_espacio 
      WHERE usuario_id = auth.uid() AND aceptado = true
    )
  );

CREATE POLICY "Creador puede actualizar su grabación"
  ON grabaciones FOR UPDATE
  USING (creado_por = auth.uid());

CREATE POLICY "Creador puede eliminar su grabación"
  ON grabaciones FOR DELETE
  USING (creado_por = auth.uid());

-- =====================================================
-- 2. TABLA: transcripciones
-- =====================================================
CREATE TABLE IF NOT EXISTS transcripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grabacion_id UUID NOT NULL REFERENCES grabaciones(id) ON DELETE CASCADE,
  
  -- Contenido
  texto TEXT NOT NULL,
  inicio_segundos NUMERIC(10,3) DEFAULT 0,
  fin_segundos NUMERIC(10,3) DEFAULT 0,
  
  -- Speaker (opcional)
  speaker_id UUID REFERENCES auth.users(id),
  speaker_nombre TEXT,
  
  -- Metadata
  confianza NUMERIC(3,2) DEFAULT 0.9,
  idioma VARCHAR(10) DEFAULT 'es',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transcripciones_grabacion ON transcripciones(grabacion_id);
CREATE INDEX IF NOT EXISTS idx_transcripciones_tiempo ON transcripciones(inicio_segundos);

-- RLS
ALTER TABLE transcripciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver transcripciones de grabaciones accesibles"
  ON transcripciones FOR SELECT
  USING (
    grabacion_id IN (
      SELECT id FROM grabaciones WHERE espacio_id IN (
        SELECT espacio_id FROM miembros_espacio 
        WHERE usuario_id = auth.uid() AND aceptado = true
      )
    )
  );

CREATE POLICY "Sistema puede insertar transcripciones"
  ON transcripciones FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 3. TABLA: analisis_comportamiento
-- =====================================================
CREATE TABLE IF NOT EXISTS analisis_comportamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grabacion_id UUID NOT NULL REFERENCES grabaciones(id) ON DELETE CASCADE,
  
  -- Participante (opcional)
  participante_id UUID REFERENCES auth.users(id),
  participante_nombre TEXT,
  
  -- Timestamp
  timestamp_segundos NUMERIC(10,3) NOT NULL,
  
  -- Emoción
  emocion_dominante VARCHAR(20) DEFAULT 'neutral',
  emocion_confianza NUMERIC(3,2) DEFAULT 0.5,
  emociones_detalle JSONB,
  
  -- Engagement
  engagement_score NUMERIC(3,2) DEFAULT 0.5,
  mirando_camara BOOLEAN DEFAULT true,
  
  -- Action Units (blendshapes)
  action_units JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_analisis_grabacion ON analisis_comportamiento(grabacion_id);
CREATE INDEX IF NOT EXISTS idx_analisis_timestamp ON analisis_comportamiento(timestamp_segundos);
CREATE INDEX IF NOT EXISTS idx_analisis_emocion ON analisis_comportamiento(emocion_dominante);

-- RLS
ALTER TABLE analisis_comportamiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver análisis de grabaciones accesibles"
  ON analisis_comportamiento FOR SELECT
  USING (
    grabacion_id IN (
      SELECT id FROM grabaciones WHERE espacio_id IN (
        SELECT espacio_id FROM miembros_espacio 
        WHERE usuario_id = auth.uid() AND aceptado = true
      )
    )
  );

CREATE POLICY "Sistema puede insertar análisis"
  ON analisis_comportamiento FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- 4. TABLA: resumenes_ai
-- =====================================================
CREATE TABLE IF NOT EXISTS resumenes_ai (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grabacion_id UUID NOT NULL REFERENCES grabaciones(id) ON DELETE CASCADE,
  
  -- Resumen
  resumen_corto TEXT,
  resumen_detallado TEXT,
  
  -- Puntos y tareas
  puntos_clave JSONB DEFAULT '[]'::jsonb,
  action_items JSONB DEFAULT '[]'::jsonb,
  
  -- Análisis
  sentimiento_general VARCHAR(20) DEFAULT 'neutral' CHECK (
    sentimiento_general IN ('positivo', 'neutral', 'negativo', 'mixto')
  ),
  momentos_clave JSONB DEFAULT '[]'::jsonb,
  metricas_conductuales JSONB,
  
  -- Metadata del modelo
  modelo_usado VARCHAR(50) DEFAULT 'gpt-4o-mini',
  tokens_usados INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_resumenes_grabacion ON resumenes_ai(grabacion_id);

-- RLS
ALTER TABLE resumenes_ai ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver resúmenes de grabaciones accesibles"
  ON resumenes_ai FOR SELECT
  USING (
    grabacion_id IN (
      SELECT id FROM grabaciones WHERE espacio_id IN (
        SELECT espacio_id FROM miembros_espacio 
        WHERE usuario_id = auth.uid() AND aceptado = true
      )
    )
  );

CREATE POLICY "Sistema puede insertar/actualizar resúmenes"
  ON resumenes_ai FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sistema puede actualizar resúmenes"
  ON resumenes_ai FOR UPDATE
  USING (true);

-- =====================================================
-- 5. TABLA: notificaciones (si no existe)
-- =====================================================
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  espacio_id UUID REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  
  -- Tipo y contenido
  tipo VARCHAR(50) NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT,
  
  -- Entidad relacionada
  entidad_tipo VARCHAR(50),
  entidad_id UUID,
  datos_extra JSONB,
  
  -- Estado
  leida BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(usuario_id, leida);
CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo ON notificaciones(tipo);

-- RLS
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver sus notificaciones"
  ON notificaciones FOR SELECT
  USING (usuario_id = auth.uid());

CREATE POLICY "Sistema puede crear notificaciones"
  ON notificaciones FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuarios pueden marcar sus notificaciones como leídas"
  ON notificaciones FOR UPDATE
  USING (usuario_id = auth.uid());

CREATE POLICY "Usuarios pueden eliminar sus notificaciones"
  ON notificaciones FOR DELETE
  USING (usuario_id = auth.uid());

-- =====================================================
-- 6. STORAGE BUCKET: grabaciones
-- =====================================================
-- Ejecutar en Supabase Dashboard > Storage
-- O via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('grabaciones', 'grabaciones', true)
ON CONFLICT (id) DO NOTHING;

-- Política de Storage
CREATE POLICY "Usuarios autenticados pueden subir grabaciones"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'grabaciones' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Cualquiera puede ver grabaciones públicas"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'grabaciones');

CREATE POLICY "Usuarios pueden eliminar sus grabaciones"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'grabaciones' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================
-- FIN DE MIGRACIONES
-- =====================================================
