/**
 * @module space3d/world/PisoDecorativo3D
 *
 * Componente R3F que renderiza un único piso decorativo (alfombra / parche
 * de material PBR) como un Plane plano a Y≈0.01 sobre el suelo base.
 *
 * Modelo Gather-style — visual only, sin colisión ni nav. El material lo
 * resuelve `useFloorMaterial` (reusa el factory PBR procedural existente).
 *
 * Refs:
 *  - https://r3f.docs.pmnd.rs/ (mesh, primitive)
 *  - https://threejs.org/docs/#api/en/geometries/PlaneGeometry
 *  - https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.polygonOffset
 */

import React from 'react';
import * as THREE from 'three';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import {
  PISO_DECORATIVO_Y_OFFSET,
  type PisoDecorativo,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';

interface PisoDecorativo3DProps {
  piso: PisoDecorativo;
  /** Y base donde está el piso al que se superpone (default 0 = suelo principal). */
  yBase?: number;
  /** Click → callback con id del piso (usado en modo admin para borrar). */
  onClick?: (pisoId: string) => void;
}

export const PisoDecorativo3D: React.FC<PisoDecorativo3DProps> = React.memo(({
  piso,
  yBase = 0,
  onClick,
}) => {
  const material = useFloorMaterial(piso.tipoSuelo);

  return (
    <mesh
      position={[piso.centroX, yBase + PISO_DECORATIVO_Y_OFFSET + piso.orden * 0.001, piso.centroZ]}
      rotation={[-Math.PI / 2, 0, piso.rotacionY]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(piso.id); } : undefined}
      receiveShadow
    >
      <planeGeometry args={[piso.ancho, piso.profundidad]} />
      <primitive
        object={material}
        attach="material"
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
});

PisoDecorativo3D.displayName = 'PisoDecorativo3D';
