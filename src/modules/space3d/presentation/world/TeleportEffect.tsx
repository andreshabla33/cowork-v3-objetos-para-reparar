'use client';
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import { teleportCylinderGeometry } from './sharedGeometries';

interface TeleportEffectProps {
  position: [number, number, number];
  phase: 'out' | 'in';
}

/**
 * Efecto visual de teleport (partículas + flash).
 * Fase "out": partículas suben y se desvanecen.
 * Fase "in": partículas bajan y aparecen.
 */
export const TeleportEffect: React.FC<TeleportEffectProps> = ({ position, phase }) => {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const startTime = useMemo(() => performance.now(), []);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const duration = phase === 'out' ? 0.3 : 0.4;
    const t = Math.min(elapsed / duration, 1);

    if (phase === 'out') {
      // Escalar hacia arriba y desvanecer
      meshRef.current.scale.setScalar(1 + t * 2);
      materialRef.current.opacity = 1 - t;
    } else {
      // Escalar desde grande y aparecer
      meshRef.current.scale.setScalar(3 - t * 2);
      materialRef.current.opacity = t;
    }
  });

  return (
    <mesh ref={meshRef} position={position} geometry={teleportCylinderGeometry}>
      <meshBasicMaterial
        ref={materialRef}
        color={phase === 'out' ? '#8b5cf6' : '#6366f1'}
        transparent
        opacity={phase === 'out' ? 1 : 0}
        depthWrite={false}
      />
    </mesh>
  );
};
