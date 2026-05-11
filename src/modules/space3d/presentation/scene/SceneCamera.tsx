/**
 * @module components/space3d/SceneCamera
 *
 * Sub-componente extraído de Scene3D.tsx (CLEAN-ARCH-F4).
 * Responsabilidad única: controles de cámara y configuración de perspectiva.
 *
 * Extraído del render de Scene3D (líneas 715–728).
 */

import React from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import { DRAWING_MAX_ORBIT_DISTANCE } from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneCameraProps {
  orbitControlsRef: React.MutableRefObject<OrbitControlsType | null>;
  /** 'free' | 'fixed' | 'follow' */
  cameraMode?: string;
  cameraSensitivity?: number;
  invertYAxis?: boolean;
  /** Desactiva pan durante arrastre de plantilla */
  isDrawingZone?: boolean;
  isDraggingPlantillaZona?: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Controla la cámara del espacio 3D.
 *
 * Usa OrbitControls de Drei (no CameraControls de yomotsu) para evitar
 * el lag de frame que introducía el lerp de yomotsu.
 *
 * Ref: https://docs.pmnd.rs/react-three-fiber — OrbitControls makeDefault
 */
export const SceneCamera: React.FC<SceneCameraProps> = ({
  orbitControlsRef,
  cameraMode = 'free',
  cameraSensitivity = 5,
  invertYAxis = false,
  isDrawingZone = false,
  isDraggingPlantillaZona = false,
}) => {
  return (
    <OrbitControls
      ref={orbitControlsRef}
      makeDefault
      minDistance={1.1}
      // En drawing mode, maxDistance se expande para permitir zoom-out hasta
      // ver todo el grid de 50×50m (WORLD_SIZE_PX/16). Valor desde Domain.
      maxDistance={isDrawingZone ? DRAWING_MAX_ORBIT_DISTANCE : 50}
      maxPolarAngle={Math.PI / 2 - 0.1}
      minPolarAngle={isDrawingZone ? 0.05 : Math.PI / 6}
      enablePan={cameraMode === 'free' && !isDraggingPlantillaZona}
      enableRotate={cameraMode !== 'fixed' && !isDrawingZone && !isDraggingPlantillaZona}
      rotateSpeed={cameraSensitivity / 10}
      zoomSpeed={0.8}
      enableDamping={true}
      dampingFactor={0.05}
    />
  );
};

SceneCamera.displayName = 'SceneCamera';
