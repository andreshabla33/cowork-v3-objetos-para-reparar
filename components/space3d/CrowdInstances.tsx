/**
 * CrowdInstances — single-draw-call renderer for distant LOD2+ avatars.
 *
 * Replaces N individual <mesh> CrowdAvatarMarker components with one
 * THREE.InstancedMesh, reducing draw calls from N → 1 for the crowd layer.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PresenceStatus } from '@/types';
import { statusColors } from './spaceTypes';

export interface CrowdEntity {
  userId: string;
  x: number;
  z: number;
  status: PresenceStatus;
}

const MAX_CROWD = 512;
// Far-LOD silueta humana (estilo Genshin/Fortnite impostor barato).
// Antes era SphereGeometry(0.28, 10, 10) — a >60u se percibía como
// "cuadro verde" por aliasing. Capsule con silueta humanoide resuelve
// el problema manteniendo 1 draw call y geometría low-poly.
// Ref: `MidLodInstances.tsx` usa el mismo patrón con capsule más gruesa.
const CAPSULE_RADIUS = 0.14;
const CAPSULE_HEIGHT = 1.0; // cilindro central; altura total = H + 2R = 1.28m
const CAP_SEGMENTS = 4;
const RADIAL_SEGMENTS = 6;
const CAPSULE_Y_OFFSET = (CAPSULE_HEIGHT + 2 * CAPSULE_RADIUS) / 2; // 0.64 — centra la capsule sobre el suelo

const STATUS_COLOR_CACHE = new Map<string, THREE.Color>();
function getStatusColor(status: PresenceStatus): THREE.Color {
  const hex = statusColors[status] ?? '#888888';
  let col = STATUS_COLOR_CACHE.get(hex);
  if (!col) {
    col = new THREE.Color(hex);
    STATUS_COLOR_CACHE.set(hex, col);
  }
  return col;
}

const _dummy = new THREE.Object3D();

export const CrowdInstances: React.FC<{
  entities: CrowdEntity[];
  onClick?: (userId: string) => void;
}> = ({ entities, onClick }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const entityMapRef = useRef<CrowdEntity[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HEIGHT, CAP_SEGMENTS, RADIAL_SEGMENTS),
    [],
  );
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false }),
    [],
  );

  // Sync instance transforms + colors whenever entities change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = Math.min(entities.length, MAX_CROWD);
    mesh.count = count;
    entityMapRef.current = entities.slice(0, count);

    for (let i = 0; i < count; i++) {
      const e = entities[i];
      _dummy.position.set(e.x, CAPSULE_Y_OFFSET, e.z);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, getStatusColor(e.status));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Recompute bounding sphere para que frustum culling funcione con InstancedMesh
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [entities]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_CROWD]}
      frustumCulled={true}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        const idx = e.instanceId;
        if (idx !== undefined && idx < entityMapRef.current.length) {
          onClick(entityMapRef.current[idx].userId);
        }
      }}
    />
  );
};
