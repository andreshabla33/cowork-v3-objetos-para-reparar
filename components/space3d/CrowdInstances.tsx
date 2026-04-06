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
const SPHERE_RADIUS = 0.28;
const SPHERE_SEGMENTS = 10;

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
    () => new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
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
      _dummy.position.set(e.x, SPHERE_RADIUS, e.z);
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
