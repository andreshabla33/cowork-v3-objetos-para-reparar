-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260410_resolver_modelo_url_view_y_drift_repair
-- Purpose:   DEBT-001. Hace que la URL del modelo resuelta sea siempre la del
--            catálogo cuando el objeto tiene catalogo_id. Repara drift existente
--            y crea una VIEW que expone la URL resuelta a clientes que quieran
--            consultar sin aplicar el JOIN en la app.
--
-- Context:
--   La tabla `espacio_objetos` guarda `modelo_url` denormalizado además de
--   `catalogo_id`. Esto provoca drift cuando el catálogo se actualiza (p. ej.
--   swap a Keyboard.merged.glb tras premerge). Ya pasó con BUG-3: el catálogo
--   apuntaba al asset fusionado pero las 21 instancias seguían en la versión
--   vieja y el runtime re-renderizaba 67 meshes por instancia.
--
-- Ref oficial:
--   - PostgREST + Views:  https://postgrest.org/en/stable/references/views.html
--   - Supabase security_invoker:
--     https://supabase.com/docs/guides/database/postgres/row-level-security
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. REPAIR DRIFT ─────────────────────────────────────────────────────────
-- Sincroniza toda instancia con catalogo_id que tenga una URL distinta
-- a la del catálogo. Solo afecta objetos con catalogo_id válido y URL no vacía.
UPDATE public.espacio_objetos eo
SET modelo_url    = c.modelo_url,
    actualizado_en = NOW()
FROM public.catalogo_objetos_3d c
WHERE eo.catalogo_id IS NOT NULL
  AND eo.catalogo_id = c.id
  AND c.modelo_url IS NOT NULL
  AND c.modelo_url <> ''
  AND (eo.modelo_url IS DISTINCT FROM c.modelo_url)
  -- No tocar objetos con URL builtin (no son archivos remotos).
  AND (eo.modelo_url IS NULL OR eo.modelo_url NOT LIKE 'builtin:%');

-- ─── 2. VIEW RESOLUTORA ──────────────────────────────────────────────────────
-- Expone todas las columnas de espacio_objetos pero con modelo_url resuelto
-- desde el catálogo cuando aplique. Los clientes pueden hacer
--   .from('v_espacio_objetos_resuelto').select('*')
-- y olvidarse del JOIN.
--
-- security_invoker=true → la VIEW hereda el RLS de `espacio_objetos`
-- y `catalogo_objetos_3d`. Es el patrón recomendado por Supabase para
-- evitar elevación silenciosa de privilegios.
CREATE OR REPLACE VIEW public.v_espacio_objetos_resuelto
WITH (security_invoker = true)
AS
SELECT
  eo.id,
  eo.espacio_id,
  eo.catalogo_id,
  -- URL resuelta: catálogo > instancia > fallback builtin del catálogo
  COALESCE(
    NULLIF(c.modelo_url, ''),
    NULLIF(eo.modelo_url, ''),
    CASE
      WHEN c.built_in_geometry IS NOT NULL
        THEN 'builtin:' || c.built_in_geometry || ':' || COALESCE(REPLACE(c.built_in_color, '#', ''), '6366f1')
      ELSE NULL
    END
  ) AS modelo_url,
  eo.modelo_url AS modelo_url_original,
  eo.tipo,
  eo.nombre,
  eo.posicion_x, eo.posicion_y, eo.posicion_z,
  eo.rotacion_x, eo.rotacion_y, eo.rotacion_z,
  eo.escala_x,   eo.escala_y,   eo.escala_z,
  eo.owner_id,
  eo.creado_en,
  eo.actualizado_en,
  eo.interactuable,
  eo.escala_normalizacion,
  eo.configuracion_geometria,
  eo.empresa_id,
  eo.es_de_plantilla,
  eo.plantilla_origen
FROM public.espacio_objetos eo
LEFT JOIN public.catalogo_objetos_3d c
  ON c.id = eo.catalogo_id;

COMMENT ON VIEW public.v_espacio_objetos_resuelto IS
  'DEBT-001: expone modelo_url resuelto (catálogo > instancia). Respeta RLS via security_invoker. Ver documentacion.REFACTOR-DEBT-001-2026-04-10';

-- ─── 3. VERIFICACIÓN ─────────────────────────────────────────────────────────
DO $$
DECLARE
  drift_count INT;
BEGIN
  SELECT COUNT(*)
    INTO drift_count
    FROM public.espacio_objetos eo
    JOIN public.catalogo_objetos_3d c ON c.id = eo.catalogo_id
   WHERE c.modelo_url IS NOT NULL
     AND c.modelo_url <> ''
     AND eo.modelo_url IS DISTINCT FROM c.modelo_url
     AND (eo.modelo_url IS NULL OR eo.modelo_url NOT LIKE 'builtin:%');

  IF drift_count > 0 THEN
    RAISE EXCEPTION 'DEBT-001 repair failed: % rows still drifted after UPDATE', drift_count;
  END IF;

  RAISE NOTICE 'DEBT-001 repair: 0 rows drifted';
END $$;

COMMIT;
