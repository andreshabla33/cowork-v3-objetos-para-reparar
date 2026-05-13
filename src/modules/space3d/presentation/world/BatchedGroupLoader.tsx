'use client';
/**
 * @module space3d/world/BatchedGroupLoader
 *
 * Procesa UN modelo GLTF y registra todas sus instancias en el
 * `MultiBatch` service. Por cada material único del GLTF crea un grupo
 * `BatchedMesh`; por cada `EspacioObjeto` que usa el modelo, agrega una
 * instancia con su world transform.
 *
 * Fast-path: si el modelo ya fue registrado con la misma firma de objetos,
 * skip (cache module-level en `registrationCache.ts`). Tras un reset, el
 * cache se limpia y se re-registra.
 *
 * Llama `onMeshesChanged` al final de cada ciclo (registro o cache-hit)
 * para que el padre re-fetche `obtenerTodosMeshes()` y actualice los
 * `<primitive>` declarativos.
 *
 * Refs:
 *   https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 */

import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { logger } from '@/core/infrastructure/observability/logger';
import {
  GROUP_MAX_INSTANCES,
  GROUP_MAX_VERTICES,
  GROUP_MAX_INDICES,
} from './batcher/batcherConstants';
import type { BatchedGroupProps } from './batcher/batcherTypes';
import {
  _registeredModels,
  _trackedInstances,
  computeObjetosSignature,
} from './batcher/registrationCache';
import {
  getMaterialKey,
  materialHasTextures,
  cloneMaterialForBatch,
} from './batcher/materialHelpers';
import {
  ensureConsistentAttributes,
  remapUVsForAtlas,
} from './batcher/geometryHelpers';
import { computeTransform } from './batcher/transformHelpers';

const log = logger.child('BatchedGroupLoader');

export const BatchedGroupLoader: React.FC<BatchedGroupProps> = ({
  modeloUrl,
  objetos,
  services,
  onMeshesChanged,
}) => {
  const { scene: gltfScene } = useGLTF(modeloUrl);

  useEffect(() => {
    if (!services.isReady || objetos.length === 0) return;

    // P1 FAST-PATH: si este modelo ya fue registrado con la MISMA firma de
    // objetos, omitir todo el trabajo pesado. El cache vive a nivel módulo
    // y sobrevive unmount/remount (StrictMode, edit-toggle).
    //
    // FIX 2026-05-13: antes había una guarda extra `registeredRef.current`
    // early-bail. Tras `resetRegistrationCache` (cambio de firma global),
    // el módulo-level cache se limpia pero el ref persistía como `true`
    // por componente, bloqueando la re-registración. El check signature-
    // based de abajo cubre todos los casos correctamente.
    const currentSignature = computeObjetosSignature(objetos);
    const cachedSignature = _registeredModels.get(modeloUrl);
    if (cachedSignature === currentSignature) {
      log.debug('BatchedGroupLoader cache hit — skipping registration', {
        modeloUrl,
        signature: currentSignature,
      });
      onMeshesChanged?.();
      return;
    }

    const { multiBatch, textureAtlas, materialProps } = services;
    gltfScene.updateMatrixWorld(true);

    const meshLocalMatrix = new THREE.Matrix4();
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

        // ─── Fase 4A: crear grupo de material si no existe ───────────
        if (!multiBatch.tieneGrupo(matKey)) {
          let groupMaterial: THREE.Material;

          // ─── Fase 4B: texture atlas para materiales texturados ─────
          if (
            mat instanceof THREE.MeshStandardMaterial &&
            mat.map &&
            mat.map.image
          ) {
            const texKey = `tex_${mat.map.uuid}`;
            if (!textureAtlas.tieneTextura(texKey)) {
              try {
                textureAtlas.agregarTextura(texKey, mat.map.image);
                atlasTextureCount++;
              } catch {
                // Atlas full — fall back to individual texture
              }
            }
            groupMaterial = cloneMaterialForBatch(mat, false);
          } else {
            // Color-only group: white base + Fase 4D shader injection
            groupMaterial = cloneMaterialForBatch(mat, true);
          }

          multiBatch.crearGrupoMaterial({
            materialKey: matKey,
            material: groupMaterial,
            maxInstances: GROUP_MAX_INSTANCES,
            maxVertices: GROUP_MAX_VERTICES,
            maxIndices: GROUP_MAX_INDICES,
          });

          // ─── Fase 4D: init DataTexture + shader injection ────────
          if (!materialHasTextures(mat)) {
            materialProps.inicializarGrupo(matKey, GROUP_MAX_INSTANCES);
            materialProps.aplicarAMaterial(matKey, groupMaterial);
            colorGroupsCreatedHere++;
          }
        }

        // ─── Registrar geometría ─────────────────────────────────────
        let geoId = multiBatch.obtenerIdGeometria(matKey, geoKey);
        if (!geoId) {
          try {
            const normalizedGeo = ensureConsistentAttributes(mesh.geometry);

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

            // Dispose el clon: BatchedMesh.addGeometry() copia internamente.
            // Mantener el clon leakea GPU memory.
            // Ref: https://threejs.org/docs/#api/en/core/BufferGeometry.dispose
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

        // ─── Crear instancias por objeto ─────────────────────────────
        const vertexCount = mesh.geometry.getAttribute('position')?.count ?? 0;

        for (const obj of objetos) {
          try {
            const worldMatrix = computeTransform(gltfScene, obj);
            meshLocalMatrix.copy(mesh.matrixWorld);
            worldMatrix.multiply(meshLocalMatrix);

            const flatMatrix = new Float32Array(16);
            worldMatrix.toArray(flatMatrix);

            const instanceRef = multiBatch.agregarInstancia(matKey, geoId, flatMatrix);

            // ─── Fase 4D: PBR per-instance via DataTexture ─────────
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
                    // Clamp metalness/roughness para evitar Fresnel white-out
                    // en ángulos rasantes (GLTFs con metalness > 0 espurio).
                    // Ref: https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.metalness
                    metalness: Math.min(stdMat.metalness ?? 0, 0.15),
                    roughness: Math.max(Math.min(stdMat.roughness ?? 0.5, 1), 0.3),
                  },
                );
              }
            }

            // ─── Fase 4C: track para frustum culling ──────────────
            _trackedInstances.push({
              ref: instanceRef,
              worldPos: new THREE.Vector3(obj.posicion_x, obj.posicion_y, obj.posicion_z),
              vertexCount,
              objetoId: obj.id,
            });

            instanceCount++;
          } catch (err) {
            // Log capacity overflow por-instance — no `break` porque otros
            // material groups pueden seguir teniendo capacidad.
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

    // ─── Fase 4B: pack atlas tras agregar todas las texturas ──────────
    if (atlasTextureCount > 0) {
      textureAtlas.empaquetar();
      log.info('TextureAtlas packed', {
        textures: atlasTextureCount,
        stats: textureAtlas.obtenerEstadisticas(),
      });
    }

    // ─── Fase 4D: flush DataTexture al GPU ─────────────────────────
    const matPropsStats = materialProps.obtenerEstadisticas();
    if (matPropsStats.groupCount > 0) {
      materialProps.sincronizarGPU();
      log.info('Fase 4D DataTexture flushed', {
        colorGroupsTotal: matPropsStats.groupCount,
        colorGroupsCreatedHere,
      });
    }

    _registeredModels.set(modeloUrl, currentSignature);

    log.info('MultiBatch registered', {
      modeloUrl,
      objetos: objetos.length,
      meshes: meshCount,
      instances: instanceCount,
      atlasTextures: atlasTextureCount,
      dataTextureGroups: colorGroupsCreatedHere,
    });

    onMeshesChanged?.();
  }, [services.isReady, gltfScene, modeloUrl, objetos, services, onMeshesChanged]);

  return null;
};

BatchedGroupLoader.displayName = 'BatchedGroupLoader';
