/**
 * MidLodInstances — single-draw-call renderer for mid-distance avatars.
 *
 * Sits between full GLTF avatars (near) and CrowdInstances spheres (far).
 * Renders a capsule silhouette per avatar with status colour, giving a
 * recognisable human-like shape at moderate distances.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PresenceStatus } from '@/types';
import { statusColors } from './spaceTypes';

export interface MidLodEntity {
  userId: string;
  x: number;
  z: number;
  status: PresenceStatus;
}

const MAX_MID = 256;
const CAPSULE_RADIUS = 0.18;
const CAPSULE_HEIGHT = 1.2; // visible body height
const CAP_SEGMENTS = 6;
const RADIAL_SEGMENTS = 8;

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

export const MidLodInstances: React.FC<{
  entities: MidLodEntity[];
  onClick?: (userId: string) => void;
}> = ({ entities, onClick }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const entityMapRef = useRef<MidLodEntity[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HEIGHT, CAP_SEGMENTS, RADIAL_SEGMENTS),
    [],
  );
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false }),
    [],
  );

  // Disposal en unmount: estos recursos viven en GPU y deben liberarse
  // explícitamente cuando el componente se desmonta (ej. al cambiar de espacio).
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = Math.min(entities.length, MAX_MID);
    mesh.count = count;
    entityMapRef.current = entities.slice(0, count);

    for (let i = 0; i < count; i++) {
      const e = entities[i];
      // Position capsule so its base sits on the ground plane
      _dummy.position.set(e.x, CAPSULE_HEIGHT / 2 + CAPSULE_RADIUS, e.z);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, getStatusColor(e.status));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Recompute bounding para frustum culling con InstancedMesh
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [entities]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_MID]}
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
