/**
 * @module BuiltinWallBatcher
 *
 * Fase 5A/5B: Merge-batcher para objetos builtin (paredes procedurales).
 *
 * Problema: 221 paredes builtin × 1-11 meshes cada una = ~330 draw calls.
 * Solución: Mergear geometrías por tipo de material → ~3-5 draw calls totales.
 *
 * Clean Architecture — Presentation layer:
 *   - Delega generación de geometrías a GenerarGeometriasMergeadasBuiltinUseCase
 *   - Delega creación de materiales a fabricaMaterialesArquitectonicos (lib/rendering)
 *   - Solo contiene hooks R3F, montaje JSX, y runtime diagnostic de vidrio
 *
 * Ref: Three.js r170 — BufferGeometryUtils.mergeGeometries
 * Ref: Three.js r170 — MeshStandardMaterial (transparent, depthWrite)
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
import type { MaterialCategory } from '@/src/core/domain/ports/IBuiltinWallGeometryService';

const log = logger.child('BuiltinWallBatcher');

// ─── Singleton Use Case (module-level, stateless except cache) ──────────────
const geometryAdapter = new GeometriaProceduralParedesAdapter();
const mergeUseCase = new GenerarGeometriasMergeadasBuiltinUseCase(geometryAdapter);

// ─── Props ──────────────────────────────────────────────────────────────────

interface BuiltinWallBatcherProps {
  /** Objetos builtin (modelo_url starts with 'builtin:') */
  objetos: EspacioObjeto[];
}

// ─── Component (Presentation layer only) ────────────────────────────────────

export const BuiltinWallBatcher: React.FC<BuiltinWallBatcherProps> = ({ objetos }) => {

  // ── Merged geometries via Use Case ──
  const merged = useMemo(() => {
    const { merged: result } = mergeUseCase.ejecutar(objetos as never[]);
    return result;
  }, [objetos]);

  // ── Materials (shared across all merged groups) ──
  // vertexColors = true → 'color' attribute de la geometría mergeada
  // se MULTIPLICA con color_base del material.
  // Por eso usamos color_base: '#ffffff' como base neutra para opaque/metal.
  // Ref: https://threejs.org/docs/#api/en/materials/Material.vertexColors
  const materials = useMemo(() => {
    const perfil = resolverPerfilVisualArquitectonico('corporativo');

    const opaque = crearMaterialPBRArquitectonico({
      tipo_material: 'yeso',
      ancho: 4,
      alto: 3,
      repetir_textura: true,
      escala_textura: 1,
      color_base: '#ffffff',
      opacidad: 1,
      rugosidad: 0.7,
      metalicidad: 0.05,
      resaltar: false,
    });
    if (opaque?.material) opaque.material.vertexColors = true;

    // Glass: MeshStandardMaterial con opacity (sin transmission, sin double render pass).
    //
    // CRITICAL FIX (Fase 5B): After unmount/remount cycle (edit mode toggle), the
    // WebGPU renderer pipeline cache can stale-match the glass material to an opaque
    // pipeline. We force-assert all transparency properties AND bump material.version
    // to trigger WebGPU pipeline recompilation.
    //
    // Ref: https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
    // Ref: https://github.com/mrdoob/three.js/issues/25307 (transparent toggle fix)
    // Ref: https://github.com/mrdoob/three.js/issues/32570 (WebGPU transparent regression r182)
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

    // ── Glass material hardening ──
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
      gm.polygonOffset = true;
      gm.polygonOffsetFactor = 1;
      gm.polygonOffsetUnits = 1;
      gm.needsUpdate = true;
      gm.version++;
    }

    const metal = crearMaterialMarcoArquitectonico('vidrio', false);
    if (metal?.material) metal.material.vertexColors = true;

    return { opaque, glass, metal };
  }, []);

  // ── Cleanup: dispose materials + invalidate geometry cache on unmount ──
  //
  // CRITICAL FIX (Fase 5B): Do NOT dispose texture clones (texturas array).
  // Texture.clone() shares the same .source (canvas) with the module-level
  // base texture cache. Disposing a clone on WebGPU can corrupt the shared
  // source's GPU binding.
  // Ref: https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js
  useEffect(() => {
    return () => {
      materials.opaque?.material.dispose();
      materials.glass?.material.dispose();
      materials.metal?.material.dispose();
      mergeUseCase.invalidarCache();
      log.info('BuiltinWallBatcher unmounted — materials disposed, geometry cache invalidated');
    };
  }, [materials]);

  // ── Runtime glass material integrity monitor ──
  // Verifies glass material state on first frame post-mount.
  // If corruption is detected (WebGPU pipeline cache, R3F reconciler),
  // forces recovery by resetting all transparency properties.
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

    const isHealthy =
      mat.transparent === true &&
      mat.depthWrite === false &&
      mat.opacity < 1.0 &&
      mat.opacity > 0;

    if (!isHealthy) {
      log.warn('Glass material integrity check FAILED — forcing recovery', {
        transparent: mat.transparent,
        depthWrite: mat.depthWrite,
        opacity: mat.opacity,
        blending: mat.blending,
        side: mat.side,
        visible: mat.visible,
        version: mat.version,
      });
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = Math.min(mat.opacity || 0.35, 0.4);
      mat.side = THREE.DoubleSide;
      mat.blending = THREE.NormalBlending;
      mat.needsUpdate = true;
      mat.version++;
    } else {
      log.info('Glass material integrity check PASSED', {
        transparent: mat.transparent,
        opacity: mat.opacity,
        depthWrite: mat.depthWrite,
        renderOrder: mesh.renderOrder,
        frustumCulled: mesh.frustumCulled,
        visible: mesh.visible,
      });
    }
  });

  // ── Render ──

  if (!merged || merged.length === 0) return null;

  const getMaterial = (cat: MaterialCategory): THREE.Material => {
    if (cat === 'glass') return materials.glass?.material ?? new THREE.MeshBasicMaterial();
    if (cat === 'metal') return materials.metal?.material ?? new THREE.MeshBasicMaterial();
    return materials.opaque?.material ?? new THREE.MeshBasicMaterial();
  };

  return (
    <group name="BuiltinWallBatcher">
      {merged.map(({ geometry, category }) =>
        category === 'glass' ? (
          // Glass mesh: special rendering configuration
          // frustumCulled={false}: merged glass spans entire floor
          // renderOrder={10}: renders well after all opaque/metal (renderOrder=0)
          // Ref: https://threejs.org/docs/#api/en/core/Object3D.frustumCulled
          <mesh
            key={`glass-${category}`}
            ref={glassRef}
            geometry={geometry as THREE.BufferGeometry}
            material={getMaterial(category)}
            castShadow={false}
            receiveShadow
            frustumCulled={false}
            renderOrder={10}
          />
        ) : (
          <mesh
            key={category}
            geometry={geometry as THREE.BufferGeometry}
            material={getMaterial(category)}
            castShadow
            receiveShadow
            renderOrder={0}
          />
        ),
      )}
    </group>
  );
};
