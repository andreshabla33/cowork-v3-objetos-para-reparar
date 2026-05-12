'use client';
/**
 * @module space3d/scene/TeleportEffect
 *
 * R3F effect que renderiza el anillo + flash de teletransporte durante 350ms.
 * `phase='out'` expande + fade-out (origen); `phase='in'` contrae + fade-in
 * con pulso (destino). Extraído de `Avatar3DScene.tsx` (ITEM 15 P1-07).
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { teleportRingGeometry } from '@/modules/space3d/presentation/world/sharedGeometries';

export const TeleportEffect: React.FC<{
  position: [number, number, number];
  phase: 'out' | 'in';
}> = ({ position, phase }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startTime = useRef(Date.now());

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    const elapsed = (Date.now() - startTime.current) / 1000;
    const t = Math.min(elapsed / 0.35, 1);

    if (phase === 'out') {
      meshRef.current.scale.setScalar(1 + t * 3);
      materialRef.current.opacity = 0.8 * (1 - t);
    } else {
      meshRef.current.scale.setScalar(4 - t * 3);
      materialRef.current.opacity = 0.8 * t * (1 - t * 0.5);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} geometry={teleportRingGeometry}>
        <meshBasicMaterial ref={materialRef} color="#818cf8" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#818cf8" intensity={phase === 'out' ? 5 : 8} distance={6} />
    </group>
  );
};

TeleportEffect.displayName = 'TeleportEffect';
