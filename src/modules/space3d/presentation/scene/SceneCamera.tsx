/**
 * @module space3d/scene/SceneCamera
 *
 * Componente único de OrbitControls del espacio 3D. Encapsula las decisiones
 * de cámara según `cameraMode` + flags de modo construcción:
 *
 *  - `isometric` (default 2026-05-12): pan + zoom permitidos, rotate bloqueado,
 *    ángulo polar fijo. Vista Lords Mobile / Clash of Clans. Optimizado para
 *    usuarios no-técnicos — elimina friction de rotación accidental.
 *  - `free` (legacy): rotate 360° + pan + zoom. Comportamiento pre-isometric.
 *  - `fixed`: bloquea rotate y pan. Solo zoom.
 *
 * Cuando el admin entra en `isDrawingZone` / `isDraggingPlantillaZona`, la
 * cámara permite zoom extendido y polar mínimo relajado (para que el
 * bird's-eye automatizado por `CameraFollow` funcione sin que OrbitControls
 * clampe el ángulo).
 *
 * Clean Architecture: Presentation infra. Lee constantes del Domain
 * (`CameraFramingPolicy`) — no decide framings, solo aplica límites de
 * input. Las transiciones de posición/target viven en CameraFollow.
 *
 * Refs:
 *  - https://drei.docs.pmnd.rs/controls/orbit-controls
 *  - https://threejs.org/docs/#examples/en/controls/OrbitControls
 */

import React from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import {
  DRAWING_MAX_ORBIT_DISTANCE,
  ISOMETRIC_POLAR_ANGLE,
  ISOMETRIC_MIN_ZOOM,
  ISOMETRIC_MAX_ZOOM,
  type CameraMode,
} from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneCameraProps {
  orbitControlsRef: React.MutableRefObject<OrbitControlsType | null>;
  cameraMode: CameraMode;
  cameraSensitivity?: number;
  /** Admin dibujando una zona con drag (lápiz). */
  isDrawingZone?: boolean;
  /** Admin arrastrando una plantilla de zona pre-existente. */
  isDraggingPlantillaZona?: boolean;
  /**
   * Admin en modo "decorar piso" — el LEFT mouse button queda liberado
   * (no rotate) para que el capture-plane R3F lo intercepte. Pan via
   * RIGHT button + zoom siguen disponibles para navegar.
   */
  isPaintingDecorativeFloor?: boolean;
  /** Disparado al iniciar input manual (mouse down sobre la cámara). */
  onStart?: () => void;
  /** Disparado al soltar input manual. */
  onEnd?: () => void;
}

// ─── Helpers de configuración por modo ──────────────────────────────────────

interface OrbitLimits {
  enablePan: boolean;
  enableRotate: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
}

function resolveOrbitLimits(
  mode: CameraMode,
  isDrawingZone: boolean,
  isDraggingPlantillaZona: boolean,
): OrbitLimits {
  // Drawing mode: bird's-eye automático en CameraFollow. Aquí ampliamos los
  // rangos de input para que el admin pueda zoom-out y picar más vertical
  // sin que el clamp de OrbitControls lo bloquee.
  if (isDrawingZone || isDraggingPlantillaZona) {
    return {
      enablePan: !isDraggingPlantillaZona,
      enableRotate: !isDraggingPlantillaZona,
      minDistance: 1.1,
      maxDistance: DRAWING_MAX_ORBIT_DISTANCE,
      minPolarAngle: 0.05,
      maxPolarAngle: Math.PI / 2 - 0.1,
    };
  }

  switch (mode) {
    case 'isometric':
      // Vista picada fija. Polar min === max bloquea el tilt; rotate desactivado
      // bloquea la azimuth. Pan + zoom permitidos para que el usuario explore.
      return {
        enablePan: true,
        enableRotate: false,
        minDistance: ISOMETRIC_MIN_ZOOM,
        maxDistance: ISOMETRIC_MAX_ZOOM,
        minPolarAngle: ISOMETRIC_POLAR_ANGLE,
        maxPolarAngle: ISOMETRIC_POLAR_ANGLE,
      };
    case 'free':
    default:
      return {
        enablePan: true,
        enableRotate: true,
        minDistance: 1.1,
        maxDistance: 50,
        minPolarAngle: Math.PI / 6,
        maxPolarAngle: Math.PI / 2 - 0.1,
      };
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const SceneCamera: React.FC<SceneCameraProps> = ({
  orbitControlsRef,
  cameraMode,
  cameraSensitivity = 5,
  isDrawingZone = false,
  isDraggingPlantillaZona = false,
  isPaintingDecorativeFloor = false,
  onStart,
  onEnd,
}) => {
  // Paint mode reusa el bird's-eye framing del drawing mode para que el admin
  // vea el espacio completo de arriba mientras pinta.
  const limits = resolveOrbitLimits(
    cameraMode,
    isDrawingZone || isPaintingDecorativeFloor,
    isDraggingPlantillaZona,
  );

  return (
    <OrbitControls
      ref={orbitControlsRef}
      makeDefault
      minDistance={limits.minDistance}
      maxDistance={limits.maxDistance}
      minPolarAngle={limits.minPolarAngle}
      maxPolarAngle={limits.maxPolarAngle}
      enablePan={limits.enablePan}
      enableRotate={isPaintingDecorativeFloor ? false : limits.enableRotate}
      rotateSpeed={cameraSensitivity / 10}
      zoomSpeed={0.8}
      enableDamping={true}
      dampingFactor={0.05}
      onStart={onStart}
      onEnd={onEnd}
    />
  );
};

SceneCamera.displayName = 'SceneCamera';
