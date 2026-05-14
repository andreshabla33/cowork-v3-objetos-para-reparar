/**
 * @module space3d/world/PaintFloorMode3D
 *
 * Capture-plane R3F que se activa cuando `isPaintingDecorativeFloor=true`.
 * Implementa dos modos según `decorativeFloorStencilId`:
 *  - **Stencil (preset)**: cursor muestra ghost del rectángulo predefinido;
 *    click coloca. Allow multiple placements hasta que el admin salga.
 *  - **Custom (drag)**: drag dibuja rectángulo libre; release coloca.
 *
 * Fix raycast (2026-05-14): el capture-plane se mueve via useFrame para
 * quedar justo debajo de la cámara (Y = camera.y - 0.5), garantizando que
 * sea el primer hit del raycaster sobre cualquier otra geometría
 * (escritorios, avatares, zonas) que estaría más lejos de la cámara.
 * Luego proyectamos el ray al plano Y=0 para obtener las coords del piso.
 *
 * Coordina con `SceneCamera.tsx` que libera el LEFT mouse de OrbitControls
 * en modo paint, garantizando que el drag/click llegue al plano R3F.
 *
 * Clean Architecture: presentation. Toda I/O via `usePisosDecorativos` hook;
 * lógica de stencils via Domain (`StencilsPiso`).
 *
 * Refs:
 *  - https://r3f.docs.pmnd.rs/tutorials/events-and-interaction
 *  - https://threejs.org/docs/#api/en/core/Raycaster
 *  - https://threejs.org/docs/#api/en/math/Ray.intersectPlane
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import { PISO_DECORATIVO_Y_OFFSET, pisoEnPunto } from '@/core/domain/entities/espacio3d/PisoDecorativo';
import {
  obtenerStencil,
  PISO_CUSTOM_TAMANO_MIN_M,
} from '@/core/domain/entities/espacio3d/StencilsPiso';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('paint-floor-mode-3d');

/** Tamaño del capture plane: cubre todo el world sin importar zoom. */
const CAPTURE_SIZE_M = 2000;
/** Distancia debajo de la cámara para colocar el capture plane (m). */
const CAPTURE_PLANE_CAMERA_OFFSET_M = 0.5;
/** Y mínimo del capture plane (clamp para casos extremos de zoom-in). */
const CAPTURE_PLANE_MIN_Y = 1.5;

interface PaintFloorMode3DProps {
  espacioId: string | null;
}

/**
 * Helper: proyecta el ray del evento al plano horizontal Y=0 para obtener
 * coords del piso (X, Z). Esto funciona independiente de dónde esté el
 * capture plane físicamente, lo importante es que el ray pase por el cursor.
 */
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function projectToGround(e: ThreeEvent<PointerEvent>): { x: number; z: number } | null {
  const target = new THREE.Vector3();
  if (!e.ray.intersectPlane(GROUND_PLANE, target)) return null;
  return { x: target.x, z: target.z };
}

export const PaintFloorMode3D: React.FC<PaintFloorMode3DProps> = ({ espacioId }) => {
  const { isActive, paintFloorType, zonaId, stencilId } = useStore(useShallow((s) => ({
    isActive: s.isPaintingDecorativeFloor,
    paintFloorType: s.paintFloorType,
    zonaId: s.decorativeFloorZonaId,
    stencilId: s.decorativeFloorStencilId,
  })));
  const { pisos, crear, eliminar } = usePisosDecorativos(espacioId);
  const previewMaterial = useFloorMaterial(paintFloorType);
  const { gl } = useThree();

  const captureMeshRef = useRef<THREE.Mesh>(null);
  const stencil = useMemo(() => obtenerStencil(stencilId), [stencilId]);
  const isCustomMode = stencil.id === 'custom';
  const isEraserMode = stencil.id === 'eraser';

  // ── State del cursor + drag ──────────────────────────────────────────────
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; z: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; z: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // ── useFrame: mantener el capture plane justo debajo de la cámara ────────
  // Garantiza que sea el primer hit del raycaster sobre cualquier otra
  // geometría (que queda más lejos de la cámara). El plano sigue siendo
  // horizontal — sólo cambia su Y.
  useFrame(({ camera }) => {
    if (!isActive || !captureMeshRef.current) return;
    const desiredY = Math.max(camera.position.y - CAPTURE_PLANE_CAMERA_OFFSET_M, CAPTURE_PLANE_MIN_Y);
    if (captureMeshRef.current.position.y !== desiredY) {
      captureMeshRef.current.position.y = desiredY;
    }
  });

  // ── Cálculo del rectángulo final según el modo ───────────────────────────

  /** Stencil mode: rectángulo centrado en el cursor con dimensiones predefinidas. */
  const rectFromStencil = useMemo(() => {
    if (!cursor || isCustomMode || isEraserMode || stencil.ancho === null || stencil.profundidad === null) return null;
    return {
      centroX: cursor.x,
      centroZ: cursor.z,
      ancho: stencil.ancho,
      profundidad: stencil.profundidad,
    };
  }, [cursor, isCustomMode, isEraserMode, stencil]);

  /** Custom mode: rectángulo del drag (start → current). */
  const rectFromDrag = useMemo(() => {
    if (!dragStart || !dragCurrent || !isCustomMode) return null;
    return {
      centroX: (dragStart.x + dragCurrent.x) / 2,
      centroZ: (dragStart.z + dragCurrent.z) / 2,
      ancho: Math.abs(dragCurrent.x - dragStart.x),
      profundidad: Math.abs(dragCurrent.z - dragStart.z),
    };
  }, [dragStart, dragCurrent, isCustomMode]);

  const previewRect = isCustomMode ? rectFromDrag : rectFromStencil;

  // ── Persistencia del piso (común a ambos modos) ──────────────────────────
  const persistir = useCallback(async (rect: { centroX: number; centroZ: number; ancho: number; profundidad: number }) => {
    const resultado = await crear({
      zonaId,
      tipoSuelo: paintFloorType,
      centroX: rect.centroX,
      centroZ: rect.centroZ,
      ancho: rect.ancho,
      profundidad: rect.profundidad,
    });
    if (!resultado.ok) {
      log.warn('Error creando piso decorativo', { motivo: resultado.motivo });
    }
    // NO salimos del modo tras placement — admin puede colocar varios.
    // Sale cuando hace click en "Cancelar decoración".
  }, [crear, paintFloorType, zonaId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isActive) return;
    const p = projectToGround(e);
    if (!p) return;
    setCursor(p);
    if (isCustomMode && dragStart) {
      setDragCurrent(p);
    }
  }, [isActive, isCustomMode, dragStart]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isActive) return;
    e.stopPropagation();
    const p = projectToGround(e);
    if (!p) return;

    if (isCustomMode) {
      // Drag start: capturamos el pointer para no perder eventos al salirse del plano.
      pointerIdRef.current = e.nativeEvent.pointerId;
      try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
      setDragStart(p);
      setDragCurrent(p);
    }
    // Stencil + eraser modes: la acción se confirma en pointerUp (un click).
  }, [isActive, isCustomMode, gl]);

  const handlePointerUp = useCallback(async (e: ThreeEvent<PointerEvent>) => {
    if (!isActive) return;
    e.stopPropagation();

    if (isEraserMode) {
      // Eraser: encontrar piso bajo el cursor y eliminarlo. Sin confirm porque
      // la intención es explícita (el admin eligió el stencil borrador).
      const p = projectToGround(e);
      if (!p) return;
      const piso = pisoEnPunto(p.x, p.z, pisos);
      if (!piso) return;
      const resultado = await eliminar(piso.id);
      if (!resultado.ok) {
        log.warn('Error eliminando piso decorativo', { motivo: resultado.motivo, pisoId: piso.id });
      }
      return;
    }

    if (isCustomMode) {
      // Finalizar drag
      if (!dragStart) return;
      const end = projectToGround(e) ?? dragCurrent;
      if (!end) return;
      const ancho = Math.abs(end.x - dragStart.x);
      const profundidad = Math.abs(end.z - dragStart.z);
      setDragStart(null);
      setDragCurrent(null);
      pointerIdRef.current = null;
      if (ancho < PISO_CUSTOM_TAMANO_MIN_M || profundidad < PISO_CUSTOM_TAMANO_MIN_M) return;
      await persistir({
        centroX: (dragStart.x + end.x) / 2,
        centroZ: (dragStart.z + end.z) / 2,
        ancho,
        profundidad,
      });
    } else {
      // Stencil click-to-place: confirmamos en pointerUp para evitar placement
      // accidental durante drag de cámara con right-click.
      if (!rectFromStencil) return;
      await persistir(rectFromStencil);
    }
  }, [isActive, isCustomMode, isEraserMode, dragStart, dragCurrent, rectFromStencil, persistir, pisos, eliminar]);

  if (!isActive) return null;

  return (
    <group>
      {/* Capture plane: invisible, dinámicamente posicionado justo debajo de
          la cámara (via useFrame) para garantizar primer hit del raycaster. */}
      <mesh
        ref={captureMeshRef}
        position={[0, CAPTURE_PLANE_MIN_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[CAPTURE_SIZE_M, CAPTURE_SIZE_M]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Preview translúcido del rectángulo a crear. Y=0.005 más alto que
          PISO_DECORATIVO_Y_OFFSET para no z-fightear contra pisos ya colocados. */}
      {previewRect && previewRect.ancho > 0.05 && previewRect.profundidad > 0.05 && (
        <mesh
          position={[previewRect.centroX, PISO_DECORATIVO_Y_OFFSET + 0.02, previewRect.centroZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[previewRect.ancho, previewRect.profundidad]} />
          <primitive
            object={previewMaterial}
            attach="material"
            transparent
            opacity={0.65}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
    </group>
  );
};
