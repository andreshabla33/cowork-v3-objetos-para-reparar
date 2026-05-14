'use client';
/**
 * @module space3d/world/DeskAreasInstancedFill
 *
 * Render INSTANCED de los rellenos de las áreas reclamables.
 *
 * Optimización (2026-05-14): antes cada `<DeskAreaOverlay>` renderizaba 1
 * mesh individual (planeGeometry) → 60 áreas = 60 draw calls. Ahora 1
 * `THREE.InstancedMesh` con N instancias = **1 draw call** para todos los
 * rellenos juntos.
 *
 * API oficial validada:
 *  - Three.js r183 InstancedMesh.setMatrixAt + setColorAt
 *    Ref: https://threejs.org/docs/#api/en/objects/InstancedMesh
 *  - Per-instance opacity NO es soportada nativamente — se usa opacidad
 *    UNIFORME (las diferencias 0.04-0.12 entre estados son visualmente
 *    despreciables; el COLOR ya distingue cada estado).
 *  - `material.vertexColors = true` requerido para que setColorAt aplique.
 *
 * Sigue separado del componente DeskAreaOverlay (que renderiza el borde
 * lineLoop, label HTML, tooltip HTML, y maneja hover) — la decisión de
 * batchear el borde se deja para una próxima iteración.
 *
 * Performance:
 *  - 60 DCs → 1 DC.
 *  - useEffect re-aplica colores solo cuando areas/miUsuarioId/onlineUsers
 *    cambian (no en cada frame). Cero allocations en hot path.
 *
 * Hardware target: Intel Iris Xe + ANGLE D3D11 + escala 60-500 áreas.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  evaluarEstadoAreaEscritorio,
  type AreaEscritorio,
  type EstadoAreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';

// ─── Paleta de rellenos (sincronizada con DeskAreaOverlay) ──────────────────
// Colores idénticos a `PALETAS[estado].relleno` en DeskAreaOverlay.tsx.
// Si se modifican allá, actualizar acá también (deuda menor — 5 strings).
const COLOR_RELLENO: Record<EstadoAreaEscritorio, string> = {
  disponible: '#22c55e',
  'pre-asignada-mia': '#fbbf24',
  mia: '#06b6d4',
  'ocupada-otro': '#94a3b8',
  'pre-asignada-otro': '#64748b',
};

// Opacidad UNIFORME para todas las instancias (InstancedMesh r183 no
// soporta opacidad per-instance nativamente). Las diferencias originales
// 0.04-0.12 entre estados se mantienen perceptualmente vía el color.
const OPACIDAD_UNIFORME = 0.10;

// ─── Props ──────────────────────────────────────────────────────────────────

export interface DeskAreasInstancedFillProps {
  areas: AreaEscritorio[];
  miUsuarioId: string | null;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export const DeskAreasInstancedFill: React.FC<DeskAreasInstancedFillProps> = ({
  areas,
  miUsuarioId,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Geometría 1x1 — se escala por instance via setMatrixAt (ancho × alto).
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Material compartido por todas las instancias. vertexColors=true es
  // OBLIGATORIO para que setColorAt() tenga efecto visual.
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      name: 'desk-area-fill',
      transparent: true,
      opacity: OPACIDAD_UNIFORME,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
    [],
  );

  // Cleanup al unmount (R3F maneja el InstancedMesh, pero geometry+material
  // son memoized aquí, no auto-disposed por R3F).
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Recalcular matrices + colores cuando cambian las áreas o el estado.
  // useEffect (no useLayoutEffect) — esto NO afecta layout React, solo
  // GPU buffers. La invalidación de Three.js los re-uploadea antes del
  // próximo frame.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Allocations fuera del loop — refs reutilizados (zero GC pressure).
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, 0), // plane horizontal sobre el piso
    );
    const tempColor = new THREE.Color();

    const n = areas.length;
    for (let i = 0; i < n; i++) {
      const area = areas[i];
      const { centroX, centroZ, ancho, alto } = area.bbox;

      // Matrix: position (centroX, 0.02, centroZ) + rotation horizontal + scale (ancho × alto)
      tempPosition.set(centroX, 0.02, centroZ);
      tempScale.set(ancho, alto, 1);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      mesh.setMatrixAt(i, tempMatrix);

      // Color por estado actual
      const estado = evaluarEstadoAreaEscritorio(area, miUsuarioId);
      tempColor.set(COLOR_RELLENO[estado]);
      mesh.setColorAt(i, tempColor);
    }

    mesh.count = n; // por si el array de áreas creció/decreció
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [areas, miUsuarioId]);

  // No renderizar el mesh si no hay áreas (evita un InstancedMesh count=0
  // que algunos drivers reportan como warning).
  if (areas.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, areas.length]}
      userData={{ batchCategory: 'desk-area-overlay-fill' }}
      // No frustum culling — el bounding box implícito es 1x1 en origen,
      // no representa la extensión real de las instancias. Si está fuera
      // del frustum, Three.js descartaría TODAS — peor que rendering siempre.
      frustumCulled={false}
    />
  );
};

DeskAreasInstancedFill.displayName = 'DeskAreasInstancedFill';
