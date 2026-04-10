-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260410_keyboard_premerged.sql
-- Purpose:   Apunta el catálogo 3D al GLB pre-fusionado del teclado,
--            eliminando el over-meshing detectado en la auditoría de
--            rendimiento 2026-04-09 (BUG-3).
--
-- Related docs:
--   - PLAN-BUGS-POST-HOTFIX-2026-04-10
--   - PERF-P1-HOTFIX-RENDER-PHASE-2026-04-10
--
-- Pre-requisito:
--   Ejecutar ANTES el script `scripts/assets/premerge-glb.mjs`, que sube
--   `Keyboard.merged.glb` al bucket `avatars/pruebasObjetos/`.
--
-- Rollback:
--   UPDATE public.catalogo_objetos_3d
--   SET modelo_url = REPLACE(modelo_url, 'Keyboard.merged.glb', 'Keyboard.glb')
--   WHERE nombre = 'Keyboard';
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Actualizar catálogo para apuntar al asset pre-fusionado.
--    Solo actualiza si la URL actual termina en 'Keyboard.glb' (idempotente).
UPDATE public.catalogo_objetos_3d
SET modelo_url = REPLACE(modelo_url, 'Keyboard.glb', 'Keyboard.merged.glb'),
    updated_at = NOW()
WHERE nombre = 'Keyboard'
  AND modelo_url LIKE '%/Keyboard.glb';

-- 2. Verificación: debe haber exactamente 1 fila afectada.
DO $$
DECLARE
  updated_count INT;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.catalogo_objetos_3d
  WHERE nombre = 'Keyboard'
    AND modelo_url LIKE '%/Keyboard.merged.glb';

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'Migration failed: Keyboard catalog entry not found or already migrated';
  END IF;

  RAISE NOTICE 'Keyboard catalog updated: % row(s)', updated_count;
END $$;

COMMIT;
