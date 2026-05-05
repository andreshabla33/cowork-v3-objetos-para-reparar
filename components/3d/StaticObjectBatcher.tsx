/**
 * @module components/3d/StaticObjectBatcher
 * @description Fase 4 — Multi-material BatchedMesh + TextureAtlas + LOD/Frustum Culling.
 *
 * Architecture:
 *   - Creates N BatchedMesh (one per material group) via MultiBatch service
 *   - Textured materials → textures packed into TextureAtlas → shared atlas material
 *   - Solid-color materials → individual BatchedMesh with correct color
 *   - Per-instance frustum culling via setVisibleAt (Fase 4C)
 *   - LOD: simplified geometry or hidden at distance (Fase 4C)
 *
 * Performance target (Fase 4):
 *   Before (Fase 3): ~50-60 draw calls (1 BatchedMesh, 1 material, colors only)
 *   After (Fase 4A-C): ~5-15 draw calls (N BatchedMesh, N materials with textures)
 *   After (Fase 4D): ~1-3 draw calls (DataTexture packs color+metalness+roughness per-instance)
 *   + frustum culling hides 30-60% of instances per frame
 *
 * Clean Architecture: Presentation layer — uses Application use cases via hook.
 * No direct adapter/infrastructure imports.
 *
 * Ref: Three.js r170 — BatchedMesh
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 * Ref: Three.js r170 — BatchedMesh.setVisibleAt()
 *   Per-instance visibility for frustum culling without removing instances.
 * Ref: gkjohnson/batched-material-properties-demo
 *   DataTexture + onBeforeCompile for per-instance PBR properties.
 * Ref: Mozilla Hubs — multi-batch + texture atlas pattern
 *   https://github.com/Hubs-Foundation/three-batch-manager
 */

'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { SceneOptimizationServices } from '@/hooks/space3d/useSceneOptimization';
import type { MultiBatchInstanceRef } from '@/src/core/domain/ports/IMultiBatchMeshService';
import { obtenerDimensionesObjetoRuntime } from '../space3d/objetosRuntime';
import { logger } from '@/lib/logger';

const log = logger.child('StaticObjectBatcher');

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Per-group capacity limits.
 *
 * CRITICAL: Must accommodate ALL color-only instances across ALL models.
 * Keyboard.glb alone contributes 21 objects × 67 meshes = 1407 instances.
 * With ~20 models, the color-only group needs ~2500+ slots.
 *
 * Ref: Three.js r170 — BatchedMesh constructor maxInstanceCount
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 * Ref: Three.js r170 added resize() for dynamic capacity expansion
 *   https://github.com/mrdoob/three.js/releases/tag/r170
 */
const GROUP_MAX_INSTANCES = 4096;
const GROUP_MAX_VERTICES = 500_000;
const GROUP_MAX_INDICES = 1_000_000;

/** LOD distance thresholds (Fase 4C) */
const LOD_HIDE_DISTANCE = 80; // Beyond this: hide small objects (keyboards, monitors)
const LOD_HIDE_VERTEX_THRESHOLD = 500; // Only hide objects with > this many vertices
const FRUSTUM_UPDATE_INTERVAL = 150; // ms between frustum cull passes

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaticObjectBatcherProps {
  gruposPorModelo: Map<string, EspacioObjeto[]>;
  services: SceneOptimizationServices;
  playerPosition: { x: number; z: number };
  onInteractuar?: (objeto: EspacioObjeto) => void;
}

interface BatchedGroupProps {
  modeloUrl: string;
  objetos: EspacioObjeto[];
  services: SceneOptimizationServices;
}

/** Tracked instance for frustum culling + LOD */
interface TrackedInstance {
  ref: MultiBatchInstanceRef;
  worldPos: THREE.Vector3;
  vertexCount: number;
  objetoId: string;
}

// ─── Shared tracking for frustum culling ─────────────────────────────────────

const _trackedInstances: TrackedInstance[] = [];

// ─── P1 PERFORMANCE FIX (2026-04-10) — Módulo-level registration cache ─────
// Rationale (auditoría rendimiento 2026-04-09):
//   El efecto de unmount invocaba multiBatch.limpiar() + materialProps.limpiar()
//   + textureAtlas.limpiar() en cada ciclo (StrictMode / edit-toggle), causando
//   un re-registro completo de ~3 000 instancias y un spike de 466 draw calls.
//
// Solución Clean Architecture-compliant (Presentation-layer):
//   - `_registration.signature` = firma estable (URLs de modelo + IDs de objetos)
//   - `_registration.services`  = referencia al servicio asociado (para detectar
//     cambios de espacio/DI container)
//   - `_registeredModels`        = mapa modelo→firma consultado por BatchedGroupLoader
//
//   Mientras la firma + services sean idénticos entre remounts, se omite el
//   trabajo pesado (merge + agregarGeometria + agregarInstancia). Si la firma
//   cambia (cambio de espacio, objetos actualizados), se ejecuta limpiar() y
//   se vuelve a registrar con la firma nueva.
//
// Ref: https://r3f.docs.pmnd.rs/api/objects  (manual lifecycle management)
// Ref: https://threejs.org/docs/#api/en/objects/BatchedMesh  (capacity is fixed)

interface RegistrationState {
  signature: string | null;
  services: SceneOptimizationServices | null;
}

const _registration: RegistrationState = {
  signature: null,
  services: null,
};

/** modeloUrl → firma de objetos ya registrada. Consultado por BatchedGroupLoader. */
const _registeredModels = new Map<string, string>();

/** Firma estable de un grupo de objetos. Solo depende de IDs ordenados. */
function computeObjetosSignature(objetos: EspacioObjeto[]): string {
  return objetos
    .map((o) => o.id)
    .sort()
    .join(',');
}

/** Firma global de todos los grupos (para detectar cambios de espacio). */
function computeGruposSignature(grupos: Map<string, EspacioObjeto[]>): string {
  const parts: string[] = [];
  for (const [url, objs] of grupos) {
    parts.push(`${url}::${computeObjetosSignature(objs)}`);
  }
  return parts.sort().join('|');
}

/** Full reset de todo el estado cacheado. Llamar SOLO cuando la firma cambia. */
function resetRegistrationCache(services: SceneOptimizationServices): void {
  if (services.isReady) {
    services.multiBatch.limpiar();
    services.materialProps.limpiar();
    services.textureAtlas.limpiar();
  }
  _trackedInstances.length = 0;
  limpiarGeometryNormCache();
  _registeredModels.clear();
  _registration.signature = null;
  _registration.services = null;
}

// ─── Material identity key ────────────────────────────────────────────────────

/**
 * Generate a stable key for material grouping.
 * Same key = same BatchedMesh = 1 draw call.
 *
 * CRITICAL OPTIMIZATION: Materials that only differ in color (no textures)
 * share the SAME group. Per-instance colors are applied via Fase 4D
 * DataTexture + onBeforeCompile shader injection (replaces setColorAt).
 * This collapses e.g. Keyboard.glb's 67 color-only meshes into 1 draw call
 * instead of 67 separate groups.
 *
 * Grouping strategy:
 *   - Textured materials: group by texture UUID (each unique texture = 1 group)
 *   - Color-only materials: group by shader type + transparency + side
 *   - Per-instance color+metalness+roughness: via DataTexture (Fase 4D)
 *
 * Ref: gkjohnson/batched-material-properties-demo
 * Ref: Three.js r170 — BatchedMesh, gl_DrawID in batching_pars_vertex.glsl
 */
function getMaterialKey(material: THREE.Material): string {
  if (material instanceof THREE.MeshStandardMaterial) {
    const hasMap = !!material.map;
    const hasNormal = !!material.normalMap;
    const alpha = material.transparent ? 'T' : 'O';

    if (hasMap || hasNormal) {
      // Textured: group by texture identity (preserves texture in material)
      const mapId = material.map?.uuid ?? 'no-map';
      const normalId = material.normalMap?.uuid ?? 'no-normal';
      return `std_tex_${mapId}_${normalId}_${alpha}_${material.side}`;
    }
    // Color-only: coalesce ALL colors into one group — setColorAt per-instance
    return `std_color_${alpha}_${material.side}`;
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    if (material.map) {
      return `basic_tex_${material.map.uuid}`;
    }
    return `basic_color_${material.transparent ? 'T' : 'O'}`;
  }
  return `mat_${material.uuid}`;
}

/** Check if a material has textures (grouping uses texture identity) */
function materialHasTextures(material: THREE.Material): boolean {
  if (material instanceof THREE.MeshStandardMaterial) {
    return !!(material.map || material.normalMap);
  }
  if (material instanceof THREE.MeshBasicMaterial) {
    return !!material.map;
  }
  return false;
}

/**
 * Clone a Three.js material for use in BatchedMesh.
 * Each BatchedMesh group gets its own material instance to avoid shared state.
 *
 * CRITICAL: For color-only groups (no textures), the material base color
 * MUST be white (0xffffff). Fase 4D DataTexture shader injection REPLACES
 * diffuseColor entirely in the fragment shader, but Three.js internal
 * batching still runs color_vertex.glsl which MULTIPLIES vColor with
 * batchingColor. White base ensures no color corruption from the
 * built-in batching pipeline before our override runs.
 *
 * Ref: Three.js r170 — color_vertex.glsl.js, color_fragment.glsl.js
 * Ref: gkjohnson/batched-material-properties-demo
 *
 * @param material   Source material to clone
 * @param forColorGroup  If true, forces base color to white for DataTexture compatibility
 */
function cloneMaterialForBatch(material: THREE.Material, forColorGroup: boolean): THREE.Material {
  const cloned = material.clone();
  cloned.shadowSide = THREE.FrontSide;

  if (forColorGroup) {
    // Force white base for color-only groups so setColorAt works correctly
    if (cloned instanceof THREE.MeshStandardMaterial) {
      cloned.color.set(0xffffff);
    } else if (cloned instanceof THREE.MeshBasicMaterial) {
      cloned.color.set(0xffffff);
    }
  }

  return cloned;
}

// ─── Geometry attribute normalization ─────────────────────────────────────────

/**
 * Cache de geometrías normalizadas por UUID original.
 *
 * Problema: ensureConsistentAttributes() clonaba cada geometría en cada llamada,
 * generando ~570 geometrías/segundo durante movimiento (4,724 en 8s de exploración).
 * Aunque se disponen después, el "geometry churn" presiona el GPU memory allocator.
 *
 * Solución: Cache keyed por UUID del BufferGeometry original.
 * Si la geometría ya fue normalizada, retorna el clon cacheado.
 * Reduce el churn a ~0 para geometrías ya procesadas (solo clona la primera vez).
 *
 * Ref: https://threejs.org/docs/#api/en/core/BufferGeometry (uuid property)
 * Ref: Object pooling pattern — https://discoverthreejs.com/tips-and-tricks/
 */
const _geometryNormCache = new Map<string, THREE.BufferGeometry>();

/**
 * Ensure geometry has position, normal, and uv attributes.
 * Required by BatchedMesh r170 — all geometries in same batch must match.
 *
 * Uses a cache to avoid re-cloning the same geometry multiple times.
 * The cache is keyed by the original geometry's UUID (stable across renders).
 */
function ensureConsistentAttributes(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = _geometryNormCache.get(geometry.uuid);
  if (cached) return cached.clone();

  const normalized = geometry.clone();
  const vertexCount = normalized.getAttribute('position')?.count ?? 0;

  if (!normalized.getAttribute('normal')) {
    normalized.computeVertexNormals();
  }

  if (!normalized.getAttribute('uv')) {
    const uvArray = new Float32Array(vertexCount * 2);
    normalized.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  // Guardar la versión normalizada en cache (la "plantilla").
  // Cada consumidor recibe un .clone() de esta plantilla.
  _geometryNormCache.set(geometry.uuid, normalized);

  return normalized.clone();
}

/**
 * Limpia el cache de geometrías normalizadas.
 * Llamar cuando se desmonte el batcher o cambien los objetos.
 */
function limpiarGeometryNormCache(): void {
  for (const geo of _geometryNormCache.values()) {
    geo.dispose();
  }
  _geometryNormCache.clear();
}

// ─── UV remapping for texture atlas (Fase 4B) ───────────────────────────────

/**
 * Remap UV coordinates of a geometry to fit within an atlas region.
 * Original UVs [0,1] → mapped to [offsetX, offsetX + scaleX] etc.
 */
function remapUVsForAtlas(
  geometry: THREE.BufferGeometry,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): void {
  const uvAttr = geometry.getAttribute('uv');
  if (!uvAttr) return;

  const uvArray = uvAttr.array as Float32Array;
  for (let i = 0; i < uvArray.length; i += 2) {
    // Clamp original UV to [0,1] then remap
    const u = Math.max(0, Math.min(1, uvArray[i]));
    const v = Math.max(0, Math.min(1, uvArray[i + 1]));
    uvArray[i] = offsetX + u * scaleX;
    uvArray[i + 1] = offsetY + v * scaleY;
  }
  uvAttr.needsUpdate = true;
}

// ─── Transform helpers ──────────────────────────────────────────────────────

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _meshLocal = new THREE.Matrix4();

function computeTransform(
  gltfScene: THREE.Object3D,
  obj: EspacioObjeto,
): THREE.Matrix4 {
  const dims = obtenerDimensionesObjetoRuntime(obj);
  const w = Math.max(dims.ancho, 0.05);
  const h = Math.max(dims.alto, 0.05);
  const d = Math.max(dims.profundidad, 0.05);

  _box.setFromObject(gltfScene);
  _box.getSize(_size);
  _box.getCenter(_center);

  const factors = [
    w / Math.max(_size.x, 0.001),
    h / Math.max(_size.y, 0.001),
    d / Math.max(_size.z, 0.001),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const uniformScale = factors.length > 0 ? Math.min(...factors) : 1;
  const offsetY = -_box.min.y * uniformScale - h / 2;
  // FIX 2026-05-05: XZ centering consistente con ObjetoEscena3D.calcular-
  // TransformacionUniformeGLTF. Sin esto, GLBs cuyo pivot no coincida con
  // el centro del bbox se renderizaban en posiciones distintas en
  // construcción (selected) vs normal (BatchedMesh) → "el objeto se movió
  // al salir de construcción". Anchor unificado: bbox center en XZ,
  // bbox.min en Y (suelo).
  const offsetX = -_center.x * uniformScale;
  const offsetZ = -_center.z * uniformScale;

  _pos.set(
    obj.posicion_x + offsetX,
    obj.posicion_y + offsetY,
    obj.posicion_z + offsetZ,
  );
  _euler.set(obj.rotacion_x ?? 0, obj.rotacion_y ?? 0, obj.rotacion_z ?? 0);
  _quat.setFromEuler(_euler);
  _scale.setScalar(uniformScale);

  return _matrix.compose(_pos, _quat, _scale).clone();
}

// ─── BatchedGroupLoader — processes one GLTF model's objects ────────────────

const BatchedGroupLoader: React.FC<BatchedGroupProps> = ({
  modeloUrl,
  objetos,
  services,
}) => {
  const { scene: gltfScene } = useGLTF(modeloUrl);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!services.isReady || registeredRef.current || objetos.length === 0) return;

    // P1 FAST-PATH: si este modelo ya fue registrado con la MISMA firma de
    // objetos, omitir todo el trabajo pesado. El cache vive a nivel módulo
    // y sobrevive unmount/remount (StrictMode, edit-toggle).
    const currentSignature = computeObjetosSignature(objetos);
    const cachedSignature = _registeredModels.get(modeloUrl);
    if (cachedSignature === currentSignature) {
      registeredRef.current = true;
      log.debug('BatchedGroupLoader cache hit — skipping registration', {
        modeloUrl,
        signature: currentSignature,
      });
      return;
    }

    const { multiBatch, textureAtlas, materialProps } = services;
    gltfScene.updateMatrixWorld(true);

    let meshCount = 0;
    let instanceCount = 0;
    let atlasTextureCount = 0;
    let colorGroupsCreatedHere = 0;

    gltfScene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      materials.forEach((mat) => {
        const matKey = getMaterialKey(mat);
        const geoKey = `${modeloUrl}::${mesh.name || mesh.uuid}::${matKey}`;

        // ─── Fase 4A: Create material group if needed ───────────────
        if (!multiBatch.tieneGrupo(matKey)) {
          let groupMaterial: THREE.Material;

          // ─── Fase 4B: Texture atlas for textured materials ────────
          if (
            mat instanceof THREE.MeshStandardMaterial &&
            mat.map &&
            mat.map.image
          ) {
            const texKey = `tex_${mat.map.uuid}`;

            // Add texture to atlas if not already there
            if (!textureAtlas.tieneTextura(texKey)) {
              try {
                textureAtlas.agregarTextura(texKey, mat.map.image);
                atlasTextureCount++;
              } catch {
                // Atlas full — fall back to individual texture
              }
            }

            // Clone textured material — keep original color (texture dominates)
            groupMaterial = cloneMaterialForBatch(mat, false);
          } else {
            // Color-only group: white base + Fase 4D DataTexture shader injection
            // DataTexture REPLACES diffuseColor entirely (not multiplicative like setColorAt)
            groupMaterial = cloneMaterialForBatch(mat, true);
          }

          multiBatch.crearGrupoMaterial({
            materialKey: matKey,
            material: groupMaterial,
            maxInstances: GROUP_MAX_INSTANCES,
            maxVertices: GROUP_MAX_VERTICES,
            maxIndices: GROUP_MAX_INDICES,
          });

          // ─── Fase 4D: Initialize DataTexture + shader injection for color-only groups ──
          if (!materialHasTextures(mat)) {
            materialProps.inicializarGrupo(matKey, GROUP_MAX_INSTANCES);
            materialProps.aplicarAMaterial(matKey, groupMaterial);
            colorGroupsCreatedHere++;
          }
        }

        // ─── Register geometry ───────────────────────────────────────
        let geoId = multiBatch.obtenerIdGeometria(matKey, geoKey);
        if (!geoId) {
          try {
            const normalizedGeo = ensureConsistentAttributes(mesh.geometry);

            // ─── Fase 4B: Remap UVs for atlas ───────────────────────
            if (
              mat instanceof THREE.MeshStandardMaterial &&
              mat.map
            ) {
              const texKey = `tex_${mat.map.uuid}`;
              const uvTransform = textureAtlas.obtenerTransformacionUV(texKey);
              if (uvTransform) {
                remapUVsForAtlas(
                  normalizedGeo,
                  uvTransform.offsetX,
                  uvTransform.offsetY,
                  uvTransform.scaleX,
                  uvTransform.scaleY,
                );
              }
            }

            geoId = multiBatch.agregarGeometria(matKey, geoKey, normalizedGeo);

            // Dispose the cloned geometry — BatchedMesh.addGeometry() copies
            // buffer data internally. Keeping the clone leaks GPU memory.
            // Ref: https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
            normalizedGeo.dispose();

            meshCount++;
          } catch (err) {
            log.warn('MultiBatch geometry capacity exceeded', {
              geoKey,
              error: (err as Error).message,
            });
            return;
          }
        }

        // ─── Create instances per object ─────────────────────────────
        const vertexCount = mesh.geometry.getAttribute('position')?.count ?? 0;

        for (const obj of objetos) {
          try {
            const worldMatrix = computeTransform(gltfScene, obj);
            _meshLocal.copy(mesh.matrixWorld);
            worldMatrix.multiply(_meshLocal);

            const flatMatrix = new Float32Array(16);
            worldMatrix.toArray(flatMatrix);

            const instanceRef = multiBatch.agregarInstancia(matKey, geoId, flatMatrix);

            // ─── Fase 4D: Per-instance PBR properties via DataTexture ────
            // Uses materialProps.tieneGrupo() (global service check) instead of
            // a local Set — ensures ALL models that share a color-only group
            // get their per-instance properties set, not just the first model.
            //
            // instanceId is BatchInstanceId (string) — parse to integer index
            // for the DataTexture row (gl_DrawID = integer in GLSL).
            //
            // Ref: gkjohnson/batched-material-properties-demo
            // Ref: Three.js r170 — gl_DrawID in batching_pars_vertex.glsl
            if (materialProps.tieneGrupo(matKey) && 'color' in mat) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              const c = stdMat.color;
              if (c) {
                materialProps.establecerPropiedades(
                  matKey,
                  parseInt(instanceRef.instanceId, 10),
                  {
                    r: c.r,
                    g: c.g,
                    b: c.b,
                    // Clamp metalness/roughness para evitar Fresnel white-out:
                    // GLTF importados pueden traer metalness > 0 en objetos no-metálicos
                    // (madera, tela, plástico). Combinado con toneMappingExposure > 1,
                    // produce reflejos blancos en ángulos rasantes (efecto Fresnel).
                    // Ref: https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.metalness
                    metalness: Math.min(stdMat.metalness ?? 0, 0.15),
                    roughness: Math.max(Math.min(stdMat.roughness ?? 0.5, 1), 0.3),
                  },
                );
              }
            }

            // ─── Fase 4C: Track instance for frustum culling ─────────
            _trackedInstances.push({
              ref: instanceRef,
              worldPos: new THREE.Vector3(obj.posicion_x, obj.posicion_y, obj.posicion_z),
              vertexCount,
              objetoId: obj.id,
            });

            instanceCount++;
          } catch (err) {
            // Log capacity overflow per-instance — don't silently break.
            // `break` would skip ALL remaining objects for this mesh,
            // but other material groups may still have capacity.
            log.warn('Instance capacity exceeded', {
              matKey,
              modeloUrl,
              objetoId: obj.id,
              error: (err as Error).message,
            });
            continue;
          }
        }
      });
    });

    // ─── Fase 4B: Pack atlas after all textures are added ──────────────
    if (atlasTextureCount > 0) {
      textureAtlas.empaquetar();
      log.info('TextureAtlas packed', {
        textures: atlasTextureCount,
        stats: textureAtlas.obtenerEstadisticas(),
      });
    }

    // ─── Fase 4D: Flush all DataTexture changes to GPU ──────────────
    // Always flush — even if this loader didn't CREATE the color group,
    // it may have SET properties on instances in an existing group.
    const matPropsStats = materialProps.obtenerEstadisticas();
    if (matPropsStats.groupCount > 0) {
      materialProps.sincronizarGPU();
      log.info('Fase 4D DataTexture flushed', {
        colorGroupsTotal: matPropsStats.groupCount,
        colorGroupsCreatedHere,
      });
    }

    registeredRef.current = true;
    _registeredModels.set(modeloUrl, currentSignature);

    log.info('MultiBatch registered', {
      modeloUrl,
      objetos: objetos.length,
      meshes: meshCount,
      instances: instanceCount,
      atlasTextures: atlasTextureCount,
      dataTextureGroups: colorGroupsCreatedHere,
    });
  }, [services.isReady, gltfScene, modeloUrl, objetos, services]);

  return null;
};

// ─── FrustumCuller — per-instance visibility + LOD ──────────────────────────

/**
 * Fase 4C — Runs frustum culling and LOD distance checks every FRUSTUM_UPDATE_INTERVAL ms.
 * Uses setVisibleAt() to hide instances outside the camera frustum or beyond LOD distance.
 * This avoids GPU processing for invisible instances while keeping them in the batch.
 *
 * Ref: Three.js r170 — BatchedMesh.setVisibleAt(instanceId, boolean)
 */
const FrustumCuller: React.FC<{
  services: SceneOptimizationServices;
  playerPosition: { x: number; z: number };
}> = ({ services, playerPosition }) => {
  const { camera } = useThree();
  const frustumRef = useRef(new THREE.Frustum());
  const projScreenMatrixRef = useRef(new THREE.Matrix4());
  const lastCullTimeRef = useRef(0);
  const _sphereTest = useMemo(() => new THREE.Sphere(), []);

  // DEBT-003 (2026-04-10) — Idle-guard refs.
  // Con la escena estable (cámara quieta, avatar quieto, instancias inmutables)
  // el cull-pass produce exactamente el mismo resultado que el ciclo anterior.
  // Guardamos el estado mínimo que afecta al resultado: matriz de mundo de la
  // cámara, posición del avatar (afecta LOD distance) y cantidad de tracked
  // instances. Si nada cambió, saltamos todo el pase — cero iteraciones,
  // cero llamadas a establecerVisibilidad() y, lo más importante, cero churn
  // sobre el buffer de visibilidad del BatchedMesh cuando la escena está idle.
  const lastCullMatrixRef = useRef(new THREE.Matrix4());
  const lastCullPlayerRef = useRef({ x: Number.NaN, z: Number.NaN });
  const lastCullInstanceCountRef = useRef(-1);

  useFrame(() => {
    if (!services.isReady || _trackedInstances.length === 0) return;

    const now = performance.now();
    if (now - lastCullTimeRef.current < FRUSTUM_UPDATE_INTERVAL) return;
    lastCullTimeRef.current = now;

    // ── Idle-guard ────────────────────────────────────────────────────────
    // Ref R3F docs: "Mutate in useFrame, don't setState" — pero también
    // "skip work when nothing changed" (pitfalls oficiales). Combinamos
    // ambos: sólo recalculamos el frustum cuando hay un cambio real.
    const cameraMoved = !camera.matrixWorld.equals(lastCullMatrixRef.current);
    const playerMoved =
      playerPosition.x !== lastCullPlayerRef.current.x ||
      playerPosition.z !== lastCullPlayerRef.current.z;
    const instancesChanged =
      _trackedInstances.length !== lastCullInstanceCountRef.current;

    if (!cameraMoved && !playerMoved && !instancesChanged) {
      return;
    }

    lastCullMatrixRef.current.copy(camera.matrixWorld);
    lastCullPlayerRef.current.x = playerPosition.x;
    lastCullPlayerRef.current.z = playerPosition.z;
    lastCullInstanceCountRef.current = _trackedInstances.length;

    // Update frustum from camera
    projScreenMatrixRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustumRef.current.setFromProjectionMatrix(projScreenMatrixRef.current);

    const { multiBatch } = services;
    let visibleCount = 0;
    let culledCount = 0;

    for (const tracked of _trackedInstances) {
      // Frustum test: use a bounding sphere around the object position
      _sphereTest.center.copy(tracked.worldPos);
      _sphereTest.radius = 2; // ~2m radius covers most office furniture

      const inFrustum = frustumRef.current.intersectsSphere(_sphereTest);

      // LOD distance test: hide small objects (high vertex count detail) at distance
      const dx = playerPosition.x - tracked.worldPos.x;
      const dz = playerPosition.z - tracked.worldPos.z;
      const distSq = dx * dx + dz * dz;
      const distThreshSq = LOD_HIDE_DISTANCE * LOD_HIDE_DISTANCE;
      const tooFarForDetail =
        tracked.vertexCount > LOD_HIDE_VERTEX_THRESHOLD && distSq > distThreshSq;

      const shouldBeVisible = inFrustum && !tooFarForDetail;

      try {
        multiBatch.establecerVisibilidad(tracked.ref, shouldBeVisible);
      } catch {
        // Instance may have been removed
      }

      if (shouldBeVisible) visibleCount++;
      else culledCount++;
    }

    // Log occasionally for monitoring (every 5s)
    if (Math.floor(now / 5000) !== Math.floor((now - FRUSTUM_UPDATE_INTERVAL) / 5000)) {
      log.info('Frustum cull pass', {
        total: _trackedInstances.length,
        visible: visibleCount,
        culled: culledCount,
        cullRate: `${((culledCount / _trackedInstances.length) * 100).toFixed(0)}%`,
      });
    }
  });

  return null;
};

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * MeshAttacher — Imperatively adds/removes BatchedMesh objects to the R3F scene.
 *
 * R3F best practice (official docs): "primitives will NOT dispose of the object
 * they carry on unmount — you are responsible for disposing of it."
 *
 * Instead of useState + setTimeout (anti-pattern in R3F), we use useFrame with
 * direct mutation to detect when new groups appear and attach them to the scene.
 *
 * Ref: https://r3f.docs.pmnd.rs/api/objects — "Primitives"
 * Ref: https://r3f.docs.pmnd.rs/advanced/pitfalls — "Mutate in useFrame, don't setState"
 */
const MeshAttacher: React.FC<{
  services: SceneOptimizationServices;
}> = ({ services }) => {
  const groupRef = useRef<THREE.Group>(null);
  const attachedCountRef = useRef(0);
  const lastCheckRef = useRef(0);

  useFrame(() => {
    if (!services.isReady || !groupRef.current) return;

    // Check every 500ms if new groups were added (avoids per-frame overhead)
    const now = performance.now();
    if (now - lastCheckRef.current < 500) return;
    lastCheckRef.current = now;

    const meshes = services.multiBatch.obtenerTodosMeshes() as THREE.Object3D[];
    if (meshes.length === attachedCountRef.current) return;

    // Remove old children that are no longer in the mesh list
    const meshSet = new Set(meshes);
    const toRemove: THREE.Object3D[] = [];
    for (const child of groupRef.current.children) {
      if (!meshSet.has(child)) toRemove.push(child);
    }
    for (const child of toRemove) {
      groupRef.current.remove(child);
    }

    // Add new meshes
    for (const mesh of meshes) {
      if (!groupRef.current.children.includes(mesh)) {
        groupRef.current.add(mesh);
      }
    }

    attachedCountRef.current = meshes.length;

    const stats = services.multiBatch.obtenerEstadisticas();
    log.info('MultiBatch meshes attached', {
      groups: stats.groupCount,
      totalInstances: stats.totalInstances,
      drawCalls: stats.groupCount,
    });
  });

  // Manual disposal on unmount — R3F <primitive> does NOT auto-dispose
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        // Detach all children but DON'T dispose — MultiBatch adapter owns disposal
        while (groupRef.current.children.length > 0) {
          groupRef.current.remove(groupRef.current.children[0]);
        }
      }
    };
  }, []);

  return <group ref={groupRef} />;
};

export const StaticObjectBatcher: React.FC<StaticObjectBatcherProps> = ({
  gruposPorModelo,
  services,
  playerPosition,
}) => {
  // P1 PERFORMANCE FIX (2026-04-10) — firma-aware signature cache.
  //
  // Antes (bug): `limpiar()` en cada unmount → full re-register en remount,
  // causando un spike de ~17 s / 466 draw calls (auditoría rendimiento).
  //
  // Ahora: solo limpiamos cuando la firma de `gruposPorModelo` CAMBIA
  // (cambio real de espacio/objetos). Mientras permanezca igual, los
  // BatchedMesh groups, DataTextures y TextureAtlas sobreviven a cualquier
  // remount (StrictMode, edit-toggle, etc.) y los BatchedGroupLoader toman
  // el fast-path (cache hit) en <1 ms.
  //
  // El duplicate-instance bug queda cubierto porque BatchedGroupLoader ahora
  // consulta `_registeredModels` antes de registrar — si ya está cacheado
  // para esta firma, omite todo el trabajo.
  //
  // Ref: Three.js r170 — BatchedMesh capacity fija en constructor
  //   https://threejs.org/docs/#api/en/objects/BatchedMesh
  const currentSignature = useMemo(
    () => computeGruposSignature(gruposPorModelo),
    [gruposPorModelo],
  );

  // ─── P1 HOTFIX (2026-04-10) — Render-phase signature detection ──────────
  //
  // BUG previo: la detección de firma vivía en un `useEffect`, que corre
  // DESPUÉS de los effects de los hijos (React ejecuta effects bottom-up).
  // Flujo defectuoso en el primer render con datos:
  //   1. Render 1 (gruposPorModelo vacío): currentSignature = ""
  //      → efecto del padre deja `_registration.signature = ""`.
  //   2. Render 2 (datos cargados): currentSignature = "<firma real>"
  //      → hijos `BatchedGroupLoader` registran ~3043 instancias.
  //      → luego el efecto del padre detecta "" !== "<firma real>"
  //      → llama a `resetRegistrationCache(services)` → `multiBatch.limpiar()`
  //      → DESTRUYE todo lo que los hijos acaban de registrar.
  //   Resultado visible: solo se ven muros/cubículos, los GLB (sillas,
  //   escritorios, monitores, etc.) desaparecen visualmente.
  //
  // Fix: mover la detección + reset a la fase de render del padre. El
  // padre renderiza ANTES que los hijos, así que cuando los effects de
  // los hijos corran ya encontrarán los servicios limpios/estables.
  //
  // Llamar side-effects en render es aceptable aquí porque:
  //   - Solo actualiza estado a nivel módulo (no props, no state React).
  //   - Es idempotente: cualquier re-invocación del render encuentra la
  //     firma ya actualizada y no hace nada.
  //   - No dispara renders adicionales (no toca setState).
  //
  // Adicionalmente tratamos `""` como "sin data previa" (igual que `null`),
  // evitando que un primer render con datos vacíos marque como "previous"
  // y dispare un reset espúreo.
  //
  // Ref oficial React 19 — "You Might Not Need an Effect · Adjusting state
  // when a prop changes":
  //   https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  if (services.isReady && _registration.signature !== currentSignature) {
    const hadPreviousData =
      _registration.signature !== null && _registration.signature !== '';
    const servicesChanged =
      _registration.services !== null && _registration.services !== services;

    if (hadPreviousData || servicesChanged) {
      log.info('Signature changed — reset completo del cache de batcher', {
        prevSignature: _registration.signature,
        nextSignature: currentSignature,
        servicesChanged,
      });
      resetRegistrationCache(_registration.services ?? services);
    }

    _registration.signature = currentSignature;
    _registration.services = services;
  }

  // NO efecto de unmount destructivo: el cache vive a nivel módulo y
  // sobrevive remounts. Solo se invalida cuando cambia la firma (detección
  // en render-phase arriba) o cuando la página se descarga (GC del navegador).

  if (!services.isReady) return null;

  return (
    <>
      {/* Load all GLTF models and register in MultiBatch by material group */}
      {Array.from(gruposPorModelo.entries()).map(([modeloUrl, objetos]) => (
        <BatchedGroupLoader
          key={modeloUrl}
          modeloUrl={modeloUrl}
          objetos={objetos}
          services={services}
        />
      ))}

      {/* Fase 4C — Per-instance frustum culling + LOD distance */}
      <FrustumCuller services={services} playerPosition={playerPosition} />

      {/* Render BatchedMesh groups via imperative scene attachment (R3F best practice) */}
      <MeshAttacher services={services} />
    </>
  );
};
