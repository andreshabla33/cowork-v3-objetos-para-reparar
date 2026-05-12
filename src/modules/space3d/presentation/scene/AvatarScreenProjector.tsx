'use client';
/**
 * @module space3d/scene/AvatarScreenProjector
 *
 * R3F headless component que proyecta la posición 3D de un avatar a coords
 * 2D del canvas (`screenPosRef`). Lo consume el HUD que dibuja el menú
 * radial sobre un avatar seleccionado. Extraído de `Avatar3DScene.tsx`
 * (ITEM 15 P1-07).
 *
 * Resuelve la posición preferida del ECS (fresca < 3s) y cae al
 * `onlineUsers` payload si está stale. Sin re-renders — toda la I/O va a un
 * `screenPosRef` mutable que el HUD consume vía rAF.
 */

import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { User } from '@/types';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/core/infrastructure/r3f/ecs/espacioEcs';

export const AvatarScreenProjector: React.FC<{
  selectedUserId: string | null;
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  screenPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onlineUsers: User[];
}> = ({ selectedUserId, ecsStateRef, screenPosRef, onlineUsers }) => {
  const { camera, gl } = useThree();
  const vec3 = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!selectedUserId) { screenPosRef.current = null; return; }
    const ecsData = obtenerEstadoUsuarioEcs(ecsStateRef.current, selectedUserId);
    let wx: number, wz: number;
    if (ecsData && Date.now() - (ecsData.timestamp ?? 0) <= 3000) {
      wx = ecsData.x; wz = ecsData.z;
    } else {
      const u = onlineUsers.find(u => u.id === selectedUserId);
      if (!u) { screenPosRef.current = null; return; }
      wx = u.x / 16; wz = u.y / 16;
    }
    vec3.set(wx, 3.5, wz);
    vec3.project(camera);
    const canvas = gl.domElement;
    screenPosRef.current = {
      x: (vec3.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-vec3.y * 0.5 + 0.5) * canvas.clientHeight,
    };
  });

  return null;
};

AvatarScreenProjector.displayName = 'AvatarScreenProjector';
