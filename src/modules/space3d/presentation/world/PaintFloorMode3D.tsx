/**
 * @module space3d/world/PaintFloorMode3D
 *
 * Capture-plane R3F que se activa cuando `isPaintingDecorativeFloor=true`.
 * Maneja drag-to-draw para crear un piso decorativo. Mientras hay drag activo,
 * renderiza un preview translúcido del rectángulo final.
 *
 * No interfiere con el resto de pointer events del scene porque sólo monta
 * el Plane invisible mientras el modo está activo (R3F unmount = no raycast).
 *
 * Clean Architecture: presentation. Toda I/O via `usePisosDecorativos` hook.
 * Refs:
 *  - https://r3f.docs.pmnd.rs/tutorials/events-and-interaction
 *  - https://threejs.org/docs/#api/en/core/Raycaster
 */

import React, { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import { PISO_DECORATIVO_Y_OFFSET } from '@/core/domain/entities/espacio3d/PisoDecorativo';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('paint-floor-mode-3d');

const MIN_TAMANO_M = 0.5;
/** Plano capture: cubre todo el world. Suficientemente grande para cualquier espacio. */
const CAPTURE_SIZE_M = 2000;

interface PaintFloorMode3DProps {
  espacioId: string | null;
}

export const PaintFloorMode3D: React.FC<PaintFloorMode3DProps> = ({ espacioId }) => {
  const { isActive, paintFloorType, zonaId } = useStore(useShallow((s) => ({
    isActive: s.isPaintingDecorativeFloor,
    paintFloorType: s.paintFloorType,
    zonaId: s.decorativeFloorZonaId,
  })));
  const setIsPaintingDecorativeFloor = useStore((s) => s.setIsPaintingDecorativeFloor);
  const { crear } = usePisosDecorativos(espacioId);
  const previewMaterial = useFloorMaterial(paintFloorType);
  const { gl } = useThree();

  const [dragStart, setDragStart] = useState<{ x: number; z: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; z: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const obtenerPunto = (e: ThreeEvent<PointerEvent>): { x: number; z: number } => ({
    x: e.point.x,
    z: e.point.z,
  });

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isActive) return;
    e.stopPropagation();
    pointerIdRef.current = e.nativeEvent.pointerId;
    try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
    const p = obtenerPunto(e);
    setDragStart(p);
    setDragCurrent(p);
  }, [isActive, gl]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isActive || !dragStart) return;
    setDragCurrent(obtenerPunto(e));
  }, [isActive, dragStart]);

  const handlePointerUp = useCallback(async (e: ThreeEvent<PointerEvent>) => {
    if (!isActive || !dragStart) return;
    e.stopPropagation();
    const end = obtenerPunto(e);
    const minX = Math.min(dragStart.x, end.x);
    const maxX = Math.max(dragStart.x, end.x);
    const minZ = Math.min(dragStart.z, end.z);
    const maxZ = Math.max(dragStart.z, end.z);
    const ancho = Math.abs(maxX - minX);
    const profundidad = Math.abs(maxZ - minZ);

    setDragStart(null);
    setDragCurrent(null);
    pointerIdRef.current = null;

    if (ancho < MIN_TAMANO_M || profundidad < MIN_TAMANO_M) return;

    const centroX = minX + ancho / 2;
    const centroZ = minZ + profundidad / 2;

    const resultado = await crear({
      zonaId,
      tipoSuelo: paintFloorType,
      centroX,
      centroZ,
      ancho,
      profundidad,
    });

    if (!resultado.ok) {
      log.warn('Error creando piso decorativo', { motivo: resultado.motivo });
    }
    // Salir del modo tras crear uno (admin re-activa si quiere otro).
    setIsPaintingDecorativeFloor(false);
  }, [crear, dragStart, isActive, paintFloorType, setIsPaintingDecorativeFloor, zonaId]);

  if (!isActive) return null;

  const previewRect = dragStart && dragCurrent
    ? {
        centroX: (dragStart.x + dragCurrent.x) / 2,
        centroZ: (dragStart.z + dragCurrent.z) / 2,
        ancho: Math.abs(dragCurrent.x - dragStart.x),
        profundidad: Math.abs(dragCurrent.z - dragStart.z),
      }
    : null;

  return (
    <group>
      {/* Capture plane — invisible pero recibe pointer events. */}
      <mesh
        position={[0, PISO_DECORATIVO_Y_OFFSET, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[CAPTURE_SIZE_M, CAPTURE_SIZE_M]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Preview translúcido del rectángulo a crear. */}
      {previewRect && previewRect.ancho > 0.05 && previewRect.profundidad > 0.05 && (
        <mesh
          position={[previewRect.centroX, PISO_DECORATIVO_Y_OFFSET + 0.005, previewRect.centroZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[previewRect.ancho, previewRect.profundidad]} />
          <primitive object={previewMaterial} attach="material" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
};
