'use client';
/**
 * @module components/3d/DistantSkyline
 *
 * Clean Architecture — Presentation layer (R3F puro, sin lógica de negocio).
 *
 * Silueta de ciudad lejana procedural. Genera un anillo de cubos low-poly
 * alrededor del terreno para matar el efecto "isla flotando en el vacío".
 * NO tiene physics, NO interactúa con el avatar — solo visual.
 *
 * Diseño:
 *  - InstancedMesh único con BoxGeometry base (1 drawcall total).
 *  - Posiciones + escalas generadas con seeded PRNG → determinístico por render.
 *  - Color oscuro neutro para que no compita con la escena principal.
 *  - Gated por `gpuRenderConfig.useSky` (tier ≥ 2) — en hardware bajo se oculta.
 *
 * Patrón: es el equivalente al "matte painting / billboard skyline" de juegos
 * open-world (GTA V, Forza, Assassin's Creed). Low-poly suficiente para
 * sugerir una ciudad sin gastar VRAM ni drawcalls.
 *
 * Ref: https://discourse.threejs.org/t/3d-open-world-game-engine-based-on-three-js/45369
 * Ref: Three.js InstancedMesh — https://threejs.org/docs/#api/en/objects/InstancedMesh
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DistantSkylineProps {
  /** Radio del anillo desde el centro del terreno. Debe ser > fog.far / 2. */
  radius?: number;
  /** Cantidad de edificios en el anillo. Más = más denso, más drawcalls dentro del instance. */
  buildingCount?: number;
  /** Centro del terreno en world coords (para posicionar el anillo). */
  centerX?: number;
  centerZ?: number;
  /** Altura Y base (suelo del skyline). */
  baseY?: number;
  /** Rango de alturas [min, max] — da variedad visual. */
  heightRange?: [number, number];
  /** Color base de los edificios. Default: gris-azulado oscuro. */
  color?: string;
  /** Semilla para el PRNG (misma = mismo skyline). */
  seed?: number;
  /** Si es false, no renderiza nada (útil para gate por tier). */
  enabled?: boolean;
}

// ─── PRNG determinístico (mulberry32) ─────────────────────────────────────────
// Pequeño, rápido y suficientemente bueno para placement procedural.
// Ref: https://stackoverflow.com/a/47593316 — mulberry32 implementation.
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

const DUMMY_OBJECT = new THREE.Object3D();

export const DistantSkyline: React.FC<DistantSkylineProps> = ({
  radius = 120,
  buildingCount = 80,
  centerX = 0,
  centerZ = 0,
  baseY = 0,
  heightRange = [8, 28],
  color = '#2a3242',
  seed = 42,
  enabled = true,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Generar posiciones + escalas una vez (memoizado por seed + radius + count).
  const instances = useMemo(() => {
    if (!enabled) return [];
    const rng = mulberry32(seed);
    const list: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number }> = [];
    const [minH, maxH] = heightRange;
    for (let i = 0; i < buildingCount; i++) {
      // Ángulo con jitter para evitar anillo perfecto (más orgánico).
      const angle = (i / buildingCount) * Math.PI * 2 + (rng() - 0.5) * 0.08;
      const r = radius + (rng() - 0.5) * radius * 0.1; // jitter radial ±5%
      const x = centerX + Math.cos(angle) * r;
      const z = centerZ + Math.sin(angle) * r;
      const sy = minH + rng() * (maxH - minH);
      const sx = 3 + rng() * 6;
      const sz = 3 + rng() * 6;
      list.push({ x, y: baseY + sy / 2, z, sx, sy, sz, rotY: angle + Math.PI / 2 });
    }
    return list;
  }, [enabled, buildingCount, radius, centerX, centerZ, baseY, heightRange, seed]);

  // Aplicar matrices al InstancedMesh una vez.
  useEffect(() => {
    if (!meshRef.current || instances.length === 0) return;
    instances.forEach((inst, idx) => {
      DUMMY_OBJECT.position.set(inst.x, inst.y, inst.z);
      DUMMY_OBJECT.rotation.set(0, inst.rotY, 0);
      DUMMY_OBJECT.scale.set(inst.sx, inst.sy, inst.sz);
      DUMMY_OBJECT.updateMatrix();
      meshRef.current!.setMatrixAt(idx, DUMMY_OBJECT.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [instances]);

  if (!enabled || instances.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instances.length]}
      frustumCulled={false} // anillo completo siempre visible (está lejos)
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/*
        Material simple: color sólido con un toque de metalness/roughness para
        que reaccione al lighting y al fog pero no robe atención.
        Ref: Three.js MeshStandardMaterial.
      */}
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.9} />
    </instancedMesh>
  );
};

DistantSkyline.displayName = 'DistantSkyline';
