/**
 * PR-9: InstancedAvatarRenderer — 1 componente React = 500 avatares
 *
 * Renderiza avatares remotos del MISMO modelo usando InstancedMesh
 * con el shader de instanced skinning (PR-8 / AnimationBaker).
 *
 * Arquitectura:
 *   Avatar3DScene agrupa fullEntities por modelo_url →
 *     1 InstancedAvatarRenderer por modelo único →
 *       1 InstancedMesh + baked animation DataTexture →
 *         1 draw call por modelo (máx 512 instancias)
 *
 * Filtrado:
 *   Recibe `allowedUserIds` — solo renderiza instancias de esos userIds.
 *   Esto permite que Avatar3DScene controle qué entidades usan instancing
 *   (full-tier, no ghost, no current user) y cuáles mantienen el pipeline
 *   individual con GLTFAvatar (para overlays de video/chat/nombre).
 *
 * Clean Architecture:
 *   - Presentation layer: lee datos del ECS (avatarStore), no tiene estado propio
 *   - Escribe en InstancedMesh — imperativo, no React state
 *   - React solo se usa para montar/desmontar el componente
 *
 * Ref: Three.js r170 — InstancedMesh
 *   https://threejs.org/docs/#api/en/objects/InstancedMesh
 * Ref: R3F useFrame — https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

'use client';
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { logger } from '@/lib/logger';
import { avatarStore } from '@/lib/ecs/AvatarECS';
import {
  createInstanceAnimationAttributes,
  updateInstanceAnimation,
  createInstancedSkinningMaterial,
} from '@/lib/gpu/instancedSkinningShader';
import { getOrBakeAnimations } from '@/lib/gpu/AnimationBaker';

// ─── Constantes ──────────────────────────────────────────────────────────────

const log = logger.child('InstancedAvatarRenderer');

const MAX_INSTANCES = 512;

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface InstancedAvatarRendererProps {
  /** URL del modelo GLTF base de los avatares */
  modelUrl: string;
  /**
   * Set de userIds permitidos para este renderer.
   * Solo estos avatares se renderizan como instancias.
   * Permite a Avatar3DScene controlar el filtrado (full-tier, no ghost).
   */
  allowedUserIds: ReadonlySet<string>;
  /** Callback cuando se hace click en un avatar instanciado */
  onClickAvatar?: (userId: string) => void;
  /**
   * Callback fired when the model cannot be rendered via instancing
   * (e.g. no embedded animations or no SkinnedMesh found).
   * Avatar3DScene uses this to fall back to GLTFAvatar for these models.
   */
  onModelUnsupported?: (modelUrl: string) => void;
  /**
   * Callback fired when the model has been successfully loaded, baked,
   * and is ready to render via instancing.
   * Avatar3DScene uses this to switch users from GLTFAvatar → instanced.
   * Without this confirmation, Avatar keeps rendering GLTFAvatar as fallback
   * to avoid the "green triangle" gap during model loading.
   */
  onModelReady?: (modelUrl: string) => void;
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
  allowedUserIds,
  onClickAvatar,
  onModelUnsupported,
  onModelReady,
}) => {
  const { scene, animations } = useGLTF(modelUrl);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const reportedUnsupportedRef = useRef(false);
  const reportedReadyRef = useRef(false);
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

    return getOrBakeAnimations(modelUrl, skinnedMesh, animations, 30, scene);
  }, [scene, animations, modelUrl]);

  // ── Report unsupported model (no embedded animations) to parent ──
  // Uses useEffect to avoid calling setState during render.
  // reportedUnsupportedRef prevents duplicate calls on re-renders.
  React.useEffect(() => {
    if (!bakedSet && onModelUnsupported && !reportedUnsupportedRef.current) {
      reportedUnsupportedRef.current = true;
      log.info('Model has no embedded animations, reporting unsupported', { modelUrl });
      onModelUnsupported(modelUrl);
    }
  }, [bakedSet, modelUrl, onModelUnsupported]);

  // ── Report model ready (has baked animations, will render) ──
  // Fires AFTER onModelUnsupported check — only for models that pass.
  // Avatar3DScene uses this to switch users from GLTFAvatar → instanced rendering.
  React.useEffect(() => {
    if (bakedSet && onModelReady && !reportedReadyRef.current) {
      reportedReadyRef.current = true;
      log.info('Model baked and ready for instancing', { modelUrl });
      onModelReady(modelUrl);
    }
  }, [bakedSet, modelUrl, onModelReady]);

  // ── Zero out the instance slot of a removed avatar in the same frame ──
  // Without this, the last written matrix lingers until mesh.count shrinks
  // past that slot, which can produce a one-frame flicker of a stale pose
  // at the previous position before useFrame recomputes the layout.
  React.useEffect(() => {
    const unsub = avatarStore.onRemove((userId: string) => {
      const mesh = instancedMeshRef.current;
      if (!mesh) return;
      const entityMap = entityMapRef.current;
      for (const [idx, id] of entityMap) {
        if (id === userId) {
          dummyObject.position.set(0, -10_000, 0);
          dummyObject.scale.set(0, 0, 0);
          dummyObject.updateMatrix();
          mesh.setMatrixAt(idx, dummyObject.matrix);
          mesh.instanceMatrix.needsUpdate = true;
          entityMap.delete(idx);
          log.info('Avatar instance slot cleared', { userId, slot: idx });
          break;
        }
      }
    });
    return unsub;
  }, [dummyObject]);

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

  // ── Dispose GPU resources when the renderer unmounts ──────────────────
  // InstancedMesh, geometry, material and textures hold GPU buffers that
  // JavaScript GC cannot free. Without explicit dispose(), remounting the
  // 3D scene (modal open/close, navigation) leaks ~15–20 MB per avatar model.
  // Ref: https://threejs.org/docs/#api/en/objects/InstancedMesh
  React.useEffect(() => {
    return () => {
      const mesh = instancedMeshRef.current;
      if (mesh) mesh.dispose();
      if (geometry) geometry.dispose();
      if (material) {
        for (const value of Object.values(material)) {
          if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
        }
        material.dispose();
      }
    };
  }, [geometry, material]);

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

  // ── Ángulos de dirección (calculados una vez, fuera del loop) ──
  const dirAngles: Record<string, number> = useMemo(() => ({
    south: 0,
    west: Math.PI / 2,
    north: Math.PI,
    east: -Math.PI / 2,
    southeast: -Math.PI / 4,
    southwest: Math.PI / 4,
    northeast: -3 * Math.PI / 4,
    northwest: 3 * Math.PI / 4,
  }), []);

  // ── Update loop: actualizar matrices y animaciones ──
  useFrame(() => {
    if (!instancedMeshRef.current || !bakedSet) return;

    const mesh = instancedMeshRef.current;
    const entities = avatarStore.getAllVisible();
    const entityMap = entityMapRef.current;
    entityMap.clear();

    let instanceCount = 0;

    for (let i = 0; i < entities.length && instanceCount < MAX_INSTANCES; i++) {
      const entity = entities[i];

      // Solo renderizar avatares incluidos en allowedUserIds
      // (filtrado por Avatar3DScene: full-tier, no ghost, no current user)
      if (!allowedUserIds.has(entity.userId)) continue;

      // Posición y rotación
      dummyObject.position.set(entity.currentX, 0, entity.currentZ);
      dummyObject.rotation.y = dirAngles[entity.direction] || 0;
      dummyObject.updateMatrix();
      mesh.setMatrixAt(instanceCount, dummyObject.matrix);

      // Animación: leer estado del ECS y mapear a baked animation index
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
