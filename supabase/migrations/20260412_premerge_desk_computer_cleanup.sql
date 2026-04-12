-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260412_premerge_desk_computer_cleanup.sql
-- Purpose:   Flag 2 (DEBT-002) — Apunta catálogo 3D a los GLBs pre-fusionados
--            de Adjustable Desk y Simple computer. Limpia entrada duplicada
--            `keyboard_merged` (deuda técnica de la migración original).
--            Repara drift en espacio_objetos para ambos assets.
--
-- Pre-requisito:
--   Ejecutar ANTES los scripts de premerge que suben los GLBs merged:
--     npm run assets:premerge-desk
--     npm run assets:premerge-computer
--     npm run assets:premerge-keyboard   (re-genera para consistencia)
--
-- Impacto en rendimiento (según logs de producción 2026-04-12):
--   - Adjustable Desk: 23 meshes/modelo × 21 instancias = 483 instances → ~2 meshes × 21 = 42 (-91%)
--   - Simple computer: 34 meshes/modelo × 21 instancias = 714 instances → ~3 meshes × 21 = 63 (-91%)
--   - Reducción total estimada: ~1197 → ~105 BatchedMesh instances (-91%)
--
-- Justificación técnica:
--   - Three.js BatchedMesh: cada instancia consume 1 draw call overhead en el
--     peor caso. Reducir instances de 1197 a 105 libera ~1092 draw calls.
--     Ref: https://threejs.org/docs/#api/en/objects/BatchedMesh
--   - gltf-transform join(): fusiona primitivas por material identity offline.
--     Ref: https://gltf-transform.dev/functions.html#join
--
-- Rollback:
--   UPDATE catalogo_objetos_3d SET modelo_url = REPLACE(modelo_url, '.merged.glb', '.glb')
--     WHERE slug IN ('adjustable_desk', 'simple_computer');
--   UPDATE espacio_objetos SET modelo_url = REPLACE(modelo_url, '.merged.glb', '.glb')
--     WHERE modelo_url LIKE '%.merged.glb' AND (modelo_url LIKE '%Adjustable Desk%' OR modelo_url LIKE '%Simple computer%');
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Actualizar catálogo: Adjustable Desk → merged
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.catalogo_objetos_3d
SET modelo_url = REPLACE(modelo_url, 'Adjustable Desk.glb', 'Adjustable Desk.merged.glb'),
    actualizado_en = NOW()
WHERE slug = 'adjustable_desk'
  AND modelo_url LIKE '%/Adjustable Desk.glb';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Actualizar catálogo: Simple computer → merged
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.catalogo_objetos_3d
SET modelo_url = REPLACE(modelo_url, 'Simple computer.glb', 'Simple computer.merged.glb'),
    actualizado_en = NOW()
WHERE slug = 'simple_computer'
  AND modelo_url LIKE '%/Simple computer.glb';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reparar drift en espacio_objetos (instancias en espacios existentes)
--    Alinea las URLs de instancia con el catálogo actualizado.
--    Ref: DEBT-001 (v_espacio_objetos_resuelto ya resuelve en runtime, pero
--    reparar la fuente evita inconsistencias si el VIEW se elimina).
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.espacio_objetos
SET modelo_url = REPLACE(modelo_url, 'Adjustable Desk.glb', 'Adjustable Desk.merged.glb')
WHERE modelo_url LIKE '%/Adjustable Desk.glb';

UPDATE public.espacio_objetos
SET modelo_url = REPLACE(modelo_url, 'Simple computer.glb', 'Simple computer.merged.glb')
WHERE modelo_url LIKE '%/Simple computer.glb';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Limpiar entrada duplicada keyboard_merged (deuda técnica)
--    El catálogo ya tiene slug='keyboard' apuntando a Keyboard.merged.glb.
--    La entrada duplicada keyboard_merged (id=8e5011c1-...) es redundante.
--    Verificamos que no tenga FKs activas antes de eliminar.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM public.catalogo_objetos_3d
WHERE slug = 'keyboard_merged'
  AND NOT EXISTS (
    SELECT 1 FROM public.espacio_objetos eo
    WHERE eo.catalogo_id = catalogo_objetos_3d.id
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Verificación post-migración
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  desk_ok   BOOLEAN;
  comp_ok   BOOLEAN;
  dup_gone  BOOLEAN;
  drift_cnt INT;
BEGIN
  -- Catálogo apunta a merged
  SELECT EXISTS(
    SELECT 1 FROM catalogo_objetos_3d
    WHERE slug = 'adjustable_desk' AND modelo_url LIKE '%.merged.glb'
  ) INTO desk_ok;

  SELECT EXISTS(
    SELECT 1 FROM catalogo_objetos_3d
    WHERE slug = 'simple_computer' AND modelo_url LIKE '%.merged.glb'
  ) INTO comp_ok;

  -- Duplicado eliminado
  SELECT NOT EXISTS(
    SELECT 1 FROM catalogo_objetos_3d WHERE slug = 'keyboard_merged'
  ) INTO dup_gone;

  -- Zero drift en espacio_objetos para los 3 assets
  SELECT COUNT(*) INTO drift_cnt
  FROM espacio_objetos
  WHERE (modelo_url LIKE '%/Adjustable Desk.glb'
      OR modelo_url LIKE '%/Simple computer.glb'
      OR modelo_url LIKE '%/Keyboard.glb');

  IF NOT desk_ok THEN
    RAISE EXCEPTION 'FAIL: adjustable_desk not pointing to merged GLB';
  END IF;
  IF NOT comp_ok THEN
    RAISE EXCEPTION 'FAIL: simple_computer not pointing to merged GLB';
  END IF;
  IF NOT dup_gone THEN
    RAISE WARNING 'keyboard_merged entry still exists (may have active FK refs)';
  END IF;
  IF drift_cnt > 0 THEN
    RAISE EXCEPTION 'FAIL: % espacio_objetos still point to non-merged URLs', drift_cnt;
  END IF;

  RAISE NOTICE '✓ Catálogo migrado: desk=%, computer=%, dup_cleaned=%, drift=%',
    desk_ok, comp_ok, dup_gone, drift_cnt;
END $$;

COMMIT;
