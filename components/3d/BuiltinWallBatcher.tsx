/**
 * @module BuiltinWallBatcher
 *
 * Fase 5A/5B: Merge-batcher para objetos builtin (paredes procedurales).
 *
 * Problema: 221 paredes builtin × 1-11 meshes cada una = ~330 draw calls.
 * Solución: Mergear geometrías opacas y metal → ~2 draw calls + ~6 vidrios individuales.
 *
 * Fase 5C (2026-04-09): Glass panes are NOT merged — they render as individual meshes.
 * WebGPU requires per-mesh BLEND pipeline classification for correct alpha blending.
 * Merging transparent geometry caused alphaTest/MASK pipeline, making glass opaque.
 *
 * Clean Architecture — Presentation layer:
 *   - Delega generación de geometrías a GenerarGeometriasMergeadasBuiltinUseCase
 *   - Delega creación de materiales a fabricaMaterialesArquitectonicos (lib/rendering)
 *   - Solo contiene hooks R3F, montaje JSX, y runtime diagnostic de vidrio
 *
 * Ref: Three.js r182 — BufferGeometryUtils.mergeGeometries
 * Ref: Three.js r182 — MeshStandardMaterial (transparent, depthWrite, blending)
 * Ref: Three.js r182 — Material.side (FrontSide for merged opaque, DoubleSide for glass)
 * Ref: Three.js Issue #2476 — DoubleSide + transparent depth artifacts
 * Ref: Three.js Issue #32570 — WebGPU alphaTest forces MASK pipeline, not BLEND
 */

'use client';
import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { logger } from '@/lib/logger';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { resolverPerfilVisualArquitectonico } from '@/src/core/domain/entities/estilosVisualesArquitectonicos';
import {
  crearMaterialMarcoArquitectonico,
  crearMaterialPBRArquitectonico,
} from '@/lib/rendering/fabricaMaterialesArquitectonicos';
import { GeometriaProceduralParedesAdapter } from '@/src/core/infrastructure/adapters/GeometriaProceduralParedesAdapter';
import { GenerarGeometriasMergeadasBuiltinUseCase } from '@/src/core/application/usecases/GenerarGeometriasMergeadasBuiltinUseCase';
import {
  MERGED_OPAQUE_SIDE,
  type OpaqueMaterialSubType,
  type WallObjectData,
} from '@/src/core/domain/ports/IBuiltinWallGeometryService';

const log = logger.child('BuiltinWallBatcher');

// ─── Singleton Use Case (module-level, stateless except cache) ──────────────
const geometryAdapter = new GeometriaProceduralParedesAdapter();
const mergeUseCase = new GenerarGeometriasMergeadasBuiltinUseCase(geometryAdapter);

// Singleton fallback material — avoids allocating GPU resources on every render.
// Ref: https://threejs.org/docs/#api/en/materials/MeshBasicMaterial
const _fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

// ─── Props ──────────────────────────────────────────────────────────────────

interface BuiltinWallBatcherProps {
  /** Objetos builtin (modelo_url starts with 'builtin:') */
  objetos: EspacioObjeto[];
}

// ─── Component (Presentation layer only) ────────────────────────────────────

export const BuiltinWallBatcher: React.FC<BuiltinWallBatcherProps> = ({ objetos }) => {

  // ── Merged geometries via Use Case ──
  const merged = useMemo(() => {
    const { merged: result } = mergeUseCase.ejecutar(objetos as WallObjectData[]);
    return result;
  }, [objetos]);

  // ── Materials (shared across all merged groups) ──
  //
  // Fase 6A (2026-04-09): Opaque materials are now created PER materialSubType.
  // Previously, ALL opaque walls shared a single 'yeso' material, causing brick,
  // concrete, and wood walls to lose their textures in batched mode.
  //
  // vertexColors = true → 'color' attribute from merged geometry is MULTIPLIED
  // with color_base of the material. We use '#ffffff' as neutral base.
  // Ref: https://threejs.org/docs/#api/en/materials/Material.vertexColors
  //
  // polygonOffset = true on opaque materials: pushes opaque depth writes slightly
  // away from the camera, preventing depth-buffer occlusion of glass panes that
  // sit at GLASS_Z_OFFSET_FACTOR (0.35) inside the wall body.
  // Ref: https://threejs.org/docs/#api/en/materials/Material.polygonOffset
  const opaqueMaterialSubTypes: OpaqueMaterialSubType[] = useMemo(() => {
    if (!merged) return [];
    const subTypes = new Set<OpaqueMaterialSubType>();
    for (const g of merged) {
      if (g.category === 'opaque' && g.materialSubType) {
        subTypes.add(g.materialSubType);
      }
    }
    return Array.from(subTypes);
  }, [merged]);

  const materials = useMemo(() => {
    const perfil = resolverPerfilVisualArquitectonico('corporativo');

    // ── Opaque materials: one per materialSubType ──
    // Each sub-type gets its own procedural PBR material (albedo/roughness/normal).
    // FrontSide prevents back-face depth writes that occlude glass.
    // polygonOffset pushes depth slightly back to avoid z-fighting with glass.
    const opaqueMap = new Map<OpaqueMaterialSubType, ReturnType<typeof crearMaterialPBRArquitectonico>>();

    for (const subType of opaqueMaterialSubTypes) {
      const mat = crearMaterialPBRArquitectonico({
        tipo_material: subType,
        ancho: 4,
        alto: 3,
        repetir_textura: true,
        escala_textura: 1,
        color_base: '#ffffff',
        opacidad: 1,
        rugosidad: 0.7,
        metalicidad: subType === 'metal' ? 0.8 : 0.05,
        resaltar: false,
        side: MERGED_OPAQUE_SIDE as THREE.Side,
      });
      if (mat?.material) {
        mat.material.vertexColors = true;
        // polygonOffset: push opaque depth slightly behind to prevent
        // depth-buffer occlusion of glass panes sitting inside the wall body.
        mat.material.polygonOffset = true;
        mat.material.polygonOffsetFactor = 1;
        mat.material.polygonOffsetUnits = 1;
      }
      opaqueMap.set(subType, mat);
    }

    // Glass: MeshStandardMaterial with opacity-based alpha blending.
    //
    // CRITICAL FIX (Fase 5C — 2026-04-09): Glass panes are now rendered as
    // INDIVIDUAL meshes (not merged) for correct WebGPU transparency.
    //
    // Fix:
    //   1. REMOVED alphaTest (let transparent: true drive the BLEND pipeline)
    //   2. REMOVED forceSinglePass (allow back-then-front double-sided rendering)
    //   3. Glass geometries are NOT merged (see GenerarGeometriasMergeadasBuiltinUseCase)
    //
    // Ref: Three.js r182 — WebGPU pipeline selection: transparent → BLEND, alphaTest → MASK
    // Ref: Three.js GitHub #32570 — WebGPU transparent regression
    const glass = crearMaterialPBRArquitectonico({
      tipo_material: 'vidrio',
      ancho: 2,
      alto: 2,
      repetir_textura: false,
      escala_textura: 1,
      color_base: perfil.materiales.color_vidrio ?? '#d6e7f1',
      opacidad: perfil.materiales.opacidad_vidrio_mampara,
      rugosidad: perfil.materiales.rugosidad_vidrio_mampara,
      metalicidad: 0,
      resaltar: false,
    });

    // ── Glass material assertion ──
    // Ensure glass material has correct BLEND pipeline properties.
    // Glass z-offset: see GeometriaProceduralParedesAdapter (GLASS_Z_OFFSET_FACTOR).
    if (glass?.material) {
      const gm = glass.material as THREE.MeshStandardMaterial;
      gm.transparent = true;
      gm.depthWrite = false;
      gm.opacity = Math.min(
        perfil.materiales.opacidad_vidrio_mampara ?? 0.35,
        0.4,
      );
      gm.side = THREE.DoubleSide;
      gm.blending = THREE.NormalBlending;
      gm.depthTest = true;
      gm.polygonOffset = false;
      gm.needsUpdate = true;
    }

    const metal = crearMaterialMarcoArquitectonico('vidrio', false);
    if (metal?.material) {
      metal.material.vertexColors = true;
      // Metal frames also use FrontSide in merge pipeline (same depth-buffer rationale as opaque).
      metal.material.side = MERGED_OPAQUE_SIDE as THREE.Side;
      // polygonOffset for metal too (frames sit near glass panes)
      metal.material.polygonOffset = true;
      metal.material.polygonOffsetFactor = 1;
      metal.material.polygonOffsetUnits = 1;
    }

    return { opaqueMap, glass, metal };
  }, [opaqueMaterialSubTypes]);

  // ── Cleanup: dispose materials + invalidate geometry cache on unmount ──
  //
  // CRITICAL FIX (Fase 5B): Do NOT dispose texture clones (texturas array).
  // Texture.clone() shares the same .source (canvas) with the module-level
  // base texture cache. Disposing a clone on WebGPU can corrupt the shared
  // source's GPU binding.
  // Ref: https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js
  //
  // CRITICAL FIX (Fase 5C — 2026-04-09): Exhaustive GPU resource cleanup.
  // On edit-mode toggle, this component unmounts and remounts. Without full
  // cleanup, orphaned GPU resources accumulate and eventually cause
  // "WebGL: INVALID_OPERATION: loseContext: context already lost".
  //
  // Disposal order:
  //   1. Materials (release GPU programs + uniform buffers)
  //   2. Merged geometries via invalidarCache (release GPU vertex/index buffers)
  //   3. Reset glass monitoring refs (prevent stale state on remount)
  //
  // Ref: Three.js — How to dispose of objects
  //   https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
  useEffect(() => {
    return () => {
      let disposedMaterials = 0;

      // Dispose all opaque materials (one per sub-type) — textures are NOT disposed (shared cache)
      for (const mat of materials.opaqueMap.values()) {
        if (mat?.material) {
          mat.material.dispose();
          disposedMaterials++;
        }
      }

      // Dispose glass and metal materials
      for (const mat of [materials.glass, materials.metal]) {
        if (mat?.material) {
          mat.material.dispose();
          disposedMaterials++;
        }
      }

      // Invalidate geometry cache — disposes ALL cached geometries (opaque, metal, glass individual)
      mergeUseCase.invalidarCache();

      // Reset glass monitoring refs to prevent stale state on remount
      hasLoggedGlassState.current = false;
      hasLoggedGeoDiag.current = false;

      log.info('BuiltinWallBatcher unmounted — GPU resources disposed', {
        disposedMaterials,
        geometryCacheInvalidated: true,
      });
    };
  }, [materials]);

  // ── Runtime glass material integrity monitor ──
  // Verifies glass material BLEND pipeline state on first frame post-mount.
  // If corruption is detected (WebGPU pipeline cache, R3F reconciler),
  // forces recovery by resetting alpha-blend properties.
  //
  // FIX (Fase 5C — 2026-04-09): Removed alphaTest/forceSinglePass from checks.
  // alphaTest forces ALPHA_MASK pipeline (binary discard) not BLEND (alpha blending).
  // forceSinglePass prevents correct back-to-front double-sided transparency.
  const glassRef = useRef<THREE.Mesh>(null);
  const hasLoggedGlassState = useRef(false);

  useEffect(() => {
    hasLoggedGlassState.current = false;
  }, [materials]);

  useFrame(() => {
    if (hasLoggedGlassState.current) return;
    const mesh = glassRef.current;
    if (!mesh) return;

    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) return;

    hasLoggedGlassState.current = true;

    // BLEND pipeline criteria: transparent=true, depthWrite=false, 0 < opacity < 1
    // NO alphaTest (would force ALPHA_MASK), NO forceSinglePass (breaks DoubleSide blend)
    const isHealthy =
      mat.transparent === true &&
      mat.depthWrite === false &&
      mat.opacity < 1.0 &&
      mat.opacity > 0 &&
      mat.alphaTest === 0 &&
      mat.polygonOffset === false;

    if (!isHealthy) {
      log.warn('Glass material BLEND pipeline check FAILED — forcing recovery', {
        transparent: mat.transparent,
        depthWrite: mat.depthWrite,
        opacity: mat.opacity,
        blending: mat.blending,
        side: mat.side,
        alphaTest: mat.alphaTest,
        forceSinglePass: mat.forceSinglePass,
        polygonOffset: mat.polygonOffset,
        visible: mat.visible,
      });
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = Math.min(mat.opacity || 0.35, 0.4);
      mat.side = THREE.DoubleSide;
      mat.blending = THREE.NormalBlending;
      mat.alphaTest = 0;
      mat.polygonOffset = false;
      mat.forceSinglePass = false;
      mat.needsUpdate = true;
    } else {
      log.info('Glass material BLEND pipeline check PASSED', {
        transparent: mat.transparent,
        opacity: mat.opacity,
        depthWrite: mat.depthWrite,
        alphaTest: mat.alphaTest,
        side: mat.side,
        renderOrder: mesh.renderOrder,
        visible: mesh.visible,
        geometryVertices: mesh.geometry?.attributes?.position?.count ?? 0,
      });
    }
  });

  // ── Render ──

  // ── Geometry diagnostic log (once per merge) ──
  // Logs vertex counts per category. Glass now reports individual pane counts.
  const hasLoggedGeoDiag = useRef(false);
  useEffect(() => { hasLoggedGeoDiag.current = false; }, [merged]);
  useEffect(() => {
    if (hasLoggedGeoDiag.current || !merged || merged.length === 0) return;
    hasLoggedGeoDiag.current = true;
    const diag: Record<string, number> = {};
    let glassCount = 0;
    let glassTotalVerts = 0;
    for (const { geometry, category, materialSubType } of merged) {
      const geo = geometry as THREE.BufferGeometry;
      const verts = geo.attributes?.position?.count ?? 0;
      if (category === 'glass') {
        glassCount++;
        glassTotalVerts += verts;
      } else if (category === 'opaque' && materialSubType) {
        diag[`opaque_${materialSubType}_Vertices`] = verts;
      } else {
        diag[`${category}Vertices`] = verts;
      }
    }
    diag['glassPanes'] = glassCount;
    diag['glassTotalVertices'] = glassTotalVerts;
    log.info('Batched geometry diagnostic', diag);
  }, [merged]);

  if (!merged || merged.length === 0) return null;

  const glassMaterial = materials.glass?.material ?? _fallbackMaterial;
  const metalMaterial = materials.metal?.material ?? _fallbackMaterial;

  // Separate merged groups by category.
  // Fase 6A: opaque groups are now per-materialSubType (1-3 groups typically).
  // Glass geometries are NOT merged (Fase 5C fix) for correct WebGPU BLEND pipeline.
  const opaqueGroups = merged.filter(({ category }) => category === 'opaque');
  const metalGroup = merged.find(({ category }) => category === 'metal');
  const glassGroups = merged.filter(({ category }) => category === 'glass');

  return (
    <group name="BuiltinWallBatcher">
      {/* Opaque walls — one merged mesh PER materialSubType.
        *
        * Fase 6A (2026-04-09): Each sub-type (yeso, ladrillo, concreto, etc.)
        * gets its own merged geometry + procedural PBR material with correct
        * albedo/roughness/normal textures.
        *
        * Previous bug: ALL opaque walls merged into 1 mesh with hardcoded 'yeso'
        * material, causing brick/concrete/wood walls to lose their textures.
        *
        * Typical draw calls: 1-3 (yeso + ladrillo + concreto).
        * polygonOffset on each material prevents depth-buffer occlusion of glass.
        */}
      {opaqueGroups.map(({ geometry, materialSubType }) => {
        const subType = materialSubType ?? 'yeso';
        const matEntry = materials.opaqueMap.get(subType);
        const material = matEntry?.material ?? _fallbackMaterial;
        return (
          <mesh
            key={`opaque-${subType}`}
            geometry={geometry as THREE.BufferGeometry}
            material={material}
            castShadow
            receiveShadow
            renderOrder={0}
          />
        );
      })}

      {/* Metal frames — single merged mesh */}
      {metalGroup && (
        <mesh
          key="metal"
          geometry={metalGroup.geometry as THREE.BufferGeometry}
          material={metalMaterial}
          castShadow
          receiveShadow
          renderOrder={0}
        />
      )}

      {/* Glass panes — individual meshes for correct WebGPU BLEND pipeline.
        *
        * Each glass pane is a separate mesh so:
        *   1. WebGPU compiles a proper BLEND (alpha blending) render pipeline per-mesh
        *   2. Three.js can depth-sort individual panes back-to-front for correct compositing
        *   3. No alphaTest interference (MASK vs BLEND pipeline conflict)
        *
        * Performance: ~6 extra draw calls (was 1 merged). Negligible impact.
        *
        * renderOrder={10}: renders well after all opaque/metal (renderOrder=0)
        * frustumCulled={false}: individual panes are small but renderOrder must be respected
        *
        * Ref: Three.js docs — Object3D.renderOrder
        *   https://threejs.org/docs/#api/en/core/Object3D.renderOrder
        */}
      {glassGroups.map(({ geometry }, idx) => (
        <mesh
          key={`glass-${idx}`}
          ref={idx === 0 ? glassRef : undefined}
          geometry={geometry as THREE.BufferGeometry}
          material={glassMaterial}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
          renderOrder={10}
        />
      ))}
    </group>
  );
};
