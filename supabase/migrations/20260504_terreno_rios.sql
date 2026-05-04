-- =====================================================
-- MIGRACIÓN: Terreno y ríos por espacio (montañas via heightmap)
-- Fecha: 4 de Mayo 2026
-- Plan: docs/PLAN-TERRENO-RIOS.md
-- =====================================================

CREATE TABLE IF NOT EXISTS espacio_terreno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio_id UUID NOT NULL REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('flat', 'heightfield')),
  heightmap_url TEXT,
  nrows INTEGER CHECK (nrows IS NULL OR nrows BETWEEN 16 AND 256),
  ncols INTEGER CHECK (ncols IS NULL OR ncols BETWEEN 16 AND 256),
  scale_xyz JSONB NOT NULL DEFAULT '{"x":100,"y":10,"z":100}'::jsonb,
  zonas_agua JSONB NOT NULL DEFAULT '[]'::jsonb,
  configuracion JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (espacio_id),
  CONSTRAINT terreno_heightfield_requiere_dimensiones CHECK (
    tipo = 'flat' OR (nrows IS NOT NULL AND ncols IS NOT NULL AND heightmap_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_espacio_terreno_espacio ON espacio_terreno(espacio_id);

COMMENT ON TABLE espacio_terreno IS 'Terreno (suelo + montañas + ríos) por espacio. 1:1 con espacios_trabajo.';
COMMENT ON COLUMN espacio_terreno.tipo IS 'flat = suelo plano default | heightfield = terreno desde heightmap';
COMMENT ON COLUMN espacio_terreno.heightmap_url IS 'URL pública del PNG (canal R = altura). NULL si tipo=flat.';
COMMENT ON COLUMN espacio_terreno.scale_xyz IS '{x,y,z} escala física en metros. y = altura máxima.';
COMMENT ON COLUMN espacio_terreno.zonas_agua IS 'Array de {id,x,z,ancho,profundo,nivel,color} — ríos/lagos.';

-- Trigger para mantener actualizado_en sincronizado
CREATE OR REPLACE FUNCTION trg_espacio_terreno_actualizado()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS espacio_terreno_actualizado_trigger ON espacio_terreno;
CREATE TRIGGER espacio_terreno_actualizado_trigger
  BEFORE UPDATE ON espacio_terreno
  FOR EACH ROW
  EXECUTE FUNCTION trg_espacio_terreno_actualizado();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE espacio_terreno ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro aceptado del espacio puede leer
CREATE POLICY "espacio_terreno_select" ON espacio_terreno FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM miembros_espacio me
    WHERE me.espacio_id = espacio_terreno.espacio_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
  )
);

-- INSERT/UPDATE/DELETE: solo owner / admin / super_admin del espacio
CREATE POLICY "espacio_terreno_insert" ON espacio_terreno FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM miembros_espacio me
    WHERE me.espacio_id = espacio_terreno.espacio_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
    AND me.rol IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "espacio_terreno_update" ON espacio_terreno FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM miembros_espacio me
    WHERE me.espacio_id = espacio_terreno.espacio_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
    AND me.rol IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "espacio_terreno_delete" ON espacio_terreno FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM miembros_espacio me
    WHERE me.espacio_id = espacio_terreno.espacio_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
    AND me.rol IN ('owner', 'admin', 'super_admin')
  )
);
