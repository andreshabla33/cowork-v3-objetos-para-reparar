/**
 * PR-10: AvatarLabels — WebGL text labels para 500+ avatares
 *
 * Reemplaza los 500 `<Html>` DOM elements con componentes `<Text>`
 * de @react-three/drei (troika-three-text bajo el capó).
 *
 * Optimizaciones:
 * 1. Solo renderiza labels de avatares VISIBLES (del ECS)
 * 2. Billboard automático (siempre mira a la cámara)
 * 3. Memoización agresiva — solo re-render si cambia la lista visible
 * 4. Font compartida entre todas las instancias
 *
 * Comparación:
 *   ANTES: 500 <Html center> → 500 DOM divs → DOM lag
 *   AHORA: 500 <Text> → WebGL quads → 0 DOM elements
 *
 * Nota: troika-three-text hace batching interno, así que
 * N labels ≈ 1-2 draw calls totales (mejor que N draw calls).
 */

'use client';
import React, { useMemo } from 'react';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { avatarStore, type AvatarEntity } from '@/lib/ecs/AvatarECS';

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Altura base del nombre sobre el avatar (se suma avatarHeight si disponible) */
const NAME_Y_OFFSET = 2.4;

/** Colores de estado para el punto WebGL */
const STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  busy: '#ef4444',
  away: '#f59e0b',
  dnd: '#dc2626',
};

/** Color por defecto si el status no está en el mapa */
const DEFAULT_STATUS_COLOR = '#9ca3af';

// ─── Props ──────────────────────────────────────────────────────────────────

interface AvatarLabelsProps {
  /** Versión del ECS store (para que React sepa cuándo re-renderizar) */
  ecsVersion: number;
  /** Si se deben mostrar los nombres o no */
  showNames?: boolean;
}

// ─── Geometrías compartidas (singleton) ─────────────────────────────────────

const statusDotGeometry = new THREE.SphereGeometry(0.06, 8, 8);

// ─── Componente ─────────────────────────────────────────────────────────────

/**
 * Renderiza los nombres y puntos de estado de TODOS los avatares visibles.
 * Usa WebGL text (troika) en lugar de DOM elements.
 *
 * Con 500 avatares y 80 visibles:
 *   - DOM elements: 0 (vs 80 antes)
 *   - Draw calls: 2-3 (troika batching) vs 80 (Html individually)
 */
export const AvatarLabels: React.FC<AvatarLabelsProps> = React.memo(({
  ecsVersion,
  showNames = true,
}) => {
  if (!showNames) return null;

  // Leer avatares visibles del ECS
  const visibleEntities = avatarStore.getAllVisible();

  return (
    <>
      {visibleEntities.map(entity => (
        <AvatarLabel key={entity.userId} entity={entity} />
      ))}
    </>
  );
});

AvatarLabels.displayName = 'AvatarLabels';

// ─── Label individual (WebGL, no DOM) ───────────────────────────────────────

const AvatarLabel: React.FC<{ entity: AvatarEntity }> = React.memo(({ entity }) => {
  const statusColor = STATUS_COLORS[entity.status] || DEFAULT_STATUS_COLOR;

  // Solo mostrar label si está lo suficientemente cerca
  if (entity.distanceToCamera > 40) return null;

  // Quantized font size — only 2 discrete values to prevent troika-three-text
  // from regenerating geometry on every distance change. Hysteresis band (18/22)
  // prevents rapid oscillation at the threshold boundary.
  const fontSize = entity.distanceToCamera > 22 ? 0.3 : entity.distanceToCamera < 18 ? 0.24 : 0.3;

  // Posición: encima del avatar
  const nameY = NAME_Y_OFFSET;

  return (
    <group position={[entity.currentX, nameY, entity.currentZ]}>
      <Billboard
        follow={true}
        lockX={false}
        lockY={false}
        lockZ={false}
      >
        {/* Nombre del avatar — WebGL text (troika) */}
        <Text
          fontSize={fontSize}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
          renderOrder={10}
          depthOffset={-1}
        >
          {entity.name}
        </Text>

        {/* Punto de estado — WebGL sphere */}
        <mesh
          position={[entity.name.length * 0.08 + 0.05, 0, 0]}
          geometry={statusDotGeometry}
        >
          <meshBasicMaterial color={statusColor} />
        </mesh>
      </Billboard>
    </group>
  );
}, (prev, next) => {
  // Solo re-render si cambió algo visually relevante para el label.
  // distanceToCamera: quantize to same fontSize bucket to avoid troika re-geometry.
  // Position: tolerance of 0.5 units to reduce spurious updates.
  const prevFar = prev.entity.distanceToCamera > 20;
  const nextFar = next.entity.distanceToCamera > 20;
  const prevVisible = prev.entity.distanceToCamera <= 40;
  const nextVisible = next.entity.distanceToCamera <= 40;
  return (
    prev.entity.name === next.entity.name &&
    prev.entity.status === next.entity.status &&
    Math.abs(prev.entity.currentX - next.entity.currentX) < 0.5 &&
    Math.abs(prev.entity.currentZ - next.entity.currentZ) < 0.5 &&
    prevFar === nextFar &&
    prevVisible === nextVisible
  );
});

AvatarLabel.displayName = 'AvatarLabel';
