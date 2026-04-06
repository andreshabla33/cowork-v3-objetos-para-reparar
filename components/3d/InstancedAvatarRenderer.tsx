/**
 * PR-9: InstancedAvatarRenderer — 1 componente React = 500 avatares
 *
 * Renderiza TODOS los avatares remotos visibles usando InstancedMesh
 * con el shader de instanced skinning (PR-8).
 *
 * Arquitectura:
 *   avatarStore (ECS) → InstancedAvatarRenderer → InstancedMesh
 *                            ↓
 *                   1 useFrame: actualiza matrices de instancia
 *                   1 draw call: GPU renderiza todo
 *
 * Fallback: Si no hay animaciones horneadas para un modelo,
 * usa el sistema anterior (Avatar individual) para ese avatar.
 *
 * Clean Architecture:
 *   - Lee datos del ECS (avatarStore) — no tiene estado propio
 *   - Escribe en InstancedMesh — imperativo, no React
 *   - React solo se usa para montar/desmontar el componente
 */

'use client';
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { logger } from '@/lib/logger';
import { avatarStore, type AvatarEntity } from '@/lib/ecs/AvatarECS';
import {
  createInstanceAnimationAttributes,
  updateInstanceAnimation,
  createInstancedSkinningMaterial,
} from '@/lib/gpu/instancedSkinningShader';
import { getOrBakeAnimations, type BakedAnimationSet } from '@/lib/gpu/AnimationBaker';

// ─── Constantes ──────────────────────────────────────────────────────────────

const log = logger.child('InstancedAvatarRenderer');

const MAX_INSTANCES = 512;
const ANIMATION_NAMES = ['idle', 'walk', 'run', 'sit'] as const;

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface InstancedAvatarRendererProps {
  /** URL del modelo GLTF base de los avatares */
  modelUrl: string;
  /** Callback cuando se hace click en un avatar instanciado */
  onClickAvatar?: (userId: string) => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────

/**
 * Renderiza hasta 512 avatares del mismo modelo en 1 draw call.
 *
 * Ciclo de vida:
 * 1. Carga el GLTF y hornea las animaciones (una vez)
 * 2. Crea InstancedMesh con geometría + shader custom
 * 3. En useFrame: lee avatarStore, actualiza matrices y atributos de animación
 */
export const InstancedAvatarRenderer: React.FC<InstancedAvatarRendererProps> = ({
  modelUrl,
  onClickAvatar,
}) => {
  const { scene, animations } = useGLTF(modelUrl);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const entityMapRef = useRef<Map<number, string>>(new Map()); // instanceIndex → userId

  // ── Encontrar el SkinnedMesh y hornear animaciones ──
  const bakedSet = useMemo(() => {
    let skinnedMesh: THREE.SkinnedMesh | null = null;

    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh && !skinnedMesh) {
        skinnedMesh = child as THREE.SkinnedMesh;
      }
    });

    if (!skinnedMesh || animations.length === 0) {
      log.warn('No SkinnedMesh or animations found', { modelUrl });
      return null;
    }

    return getOrBakeAnimations(modelUrl, skinnedMesh, animations, 30);
  }, [scene, animations, modelUrl]);

  // ── Crear atributos de instancia para animación ──
  const animAttributes = useMemo(() => {
    return createInstanceAnimationAttributes(MAX_INSTANCES);
  }, []);

  // ── Mapa de nombre de animación → índice ──
  const animNameToIndex = useMemo(() => {
    if (!bakedSet) return new Map<string, number>();
    const map = new Map<string, number>();
    let idx = 0;
    for (const name of bakedSet.animations.keys()) {
      map.set(name, idx++);
    }
    return map;
  }, [bakedSet]);

  // ── Material con shader de instanced skinning ──
  const material = useMemo(() => {
    if (!bakedSet) return null;

    // Usar la primera animación como textura por defecto
    const firstAnim = bakedSet.animations.values().next().value;
    if (!firstAnim) return null;

    // Buscar textura diffuse del material original
    let diffuseMap: THREE.Texture | null = null;
    const baseMat = Array.isArray(bakedSet.baseMaterial)
      ? bakedSet.baseMaterial[0]
      : bakedSet.baseMaterial;

    if ((baseMat as THREE.MeshStandardMaterial).map) {
      diffuseMap = (baseMat as THREE.MeshStandardMaterial).map;
    }

    return createInstancedSkinningMaterial(
      firstAnim.boneTexture,
      firstAnim.numBones,
      firstAnim.numFrames,
      diffuseMap
    );
  }, [bakedSet]);

  // ── Geometría del SkinnedMesh ──
  // Reutilizamos la geometría original y le asignamos atributos de instancia.
  // No clonamos para evitar duplicar buffers en GPU (~15-20MB por modelo).
  const geometry = useMemo(() => {
    if (!bakedSet) return null;
    const geo = bakedSet.geometry;
    // Asignar atributos de instancia idempotentemente
    if (!geo.getAttribute('animIndex')) {
      geo.setAttribute('animIndex', animAttributes.animIndex);
    }
    if (!geo.getAttribute('animTime')) {
      geo.setAttribute('animTime', animAttributes.animTime);
    }
    return geo;
  }, [bakedSet, animAttributes]);

  // ── Click handler con raycasting por instanceId ──
  const handleClick = useMemo(() => {
    if (!onClickAvatar) return undefined;
    return (event: { stopPropagation: () => void; instanceId?: number }) => {
      event.stopPropagation();
      const instanceId = event.instanceId;
      if (instanceId !== undefined) {
        const userId = entityMapRef.current.get(instanceId);
        if (userId) {
          onClickAvatar(userId);
        }
      }
    };
  }, [onClickAvatar]);

  // ── Update loop: actualizar matrices y animaciones ──
  useFrame((_, delta) => {
    if (!instancedMeshRef.current || !bakedSet) return;

    const mesh = instancedMeshRef.current;
    const entities = avatarStore.getAllVisible();
    const entityMap = entityMapRef.current;
    entityMap.clear();

    let instanceCount = 0;

    for (let i = 0; i < entities.length && i < MAX_INSTANCES; i++) {
      const entity = entities[i];

      // Solo renderizar avatares que usan este modelo
      // (en el futuro: filtrar por avatar3DConfig.modelo_url === modelUrl)
      if (entity.esFantasma) continue;

      // Posición y rotación
      dummyObject.position.set(entity.currentX, 0, entity.currentZ);

      // Rotación basada en dirección
      const dirAngles: Record<string, number> = {
        south: 0,
        west: Math.PI / 2,
        north: Math.PI,
        east: -Math.PI / 2,
        southeast: -Math.PI / 4,
        southwest: Math.PI / 4,
        northeast: -3 * Math.PI / 4,
        northwest: 3 * Math.PI / 4,
      };
      dummyObject.rotation.y = dirAngles[entity.direction] || 0;
      dummyObject.updateMatrix();
      mesh.setMatrixAt(instanceCount, dummyObject.matrix);

      // Animación
      const animName = entity.animState || 'idle';
      const animIdx = animNameToIndex.get(animName) ?? 0;
      const animData = bakedSet.animations.get(animName);
      const duration = animData?.duration ?? 1;
      const normalizedTime = ((performance.now() / 1000) % duration) / duration;

      updateInstanceAnimation(animAttributes, instanceCount, animIdx, normalizedTime);

      entityMap.set(instanceCount, entity.userId);
      instanceCount++;
    }

    mesh.count = instanceCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (!geometry || !material) {
    // Fallback: sin animaciones horneadas, no renderizar instancias
    return null;
  }

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
      onClick={handleClick}
    />
  );
};
