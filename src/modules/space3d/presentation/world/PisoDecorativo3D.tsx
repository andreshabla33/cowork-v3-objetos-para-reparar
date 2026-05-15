/**
 * @module space3d/world/PisoDecorativo3D
 *
 * Componente R3F que renderiza un único piso decorativo (alfombra / parche
 * de material PBR) como un Plane plano sobre el suelo base.
 *
 * Modelo Gather-style — visual only, sin colisión ni nav.
 *
 * ## Estrategia anti z-fighting
 *
 * **NO clonar el material**: el factory `useFloorMaterial` retorna materiales
 * con un `onBeforeCompile` que inyecta GLSL procedural. Three.js `.clone()`
 * preserva la función pero NO deep-copia `userData.uniforms` que el callback
 * usa — el material clonado renderea blanco (todos los uniforms en 0).
 *
 * En vez de clonar:
 *  - **`renderOrder = 10 + orden`** (mesh-level, sin tocar el material):
 *    el piso renderea después del SueloPrincipal (renderOrder=0) y, entre
 *    pisos, los de mayor `orden` quedan on top. Determinístico, sin depender
 *    del orden de inserción en el array de Three.js.
 *  - **Y-step = 0.02m por orden** (1 cm pisos consecutivos): visible para
 *    stacks (cada piso ligeramente más alto) pero imperceptible al caminar.
 *    Suficiente para que el depth buffer 24-bit los distinga sin z-fight.
 *  - **Y base = 0.05m** sobre el suelo principal (PISO_DECORATIVO_Y_OFFSET):
 *    separación robusta del suelo (Y=0) en cualquier zoom/GPU.
 *
 * ## Mesh-local auto-fit (anti-moiré + bordes limpios)
 *
 * El shader leer un attribute `aPisoSize` (vec2) por geometry. Cuando es
 * distinto de cero, entra en modo **auto-fit**: tiles enteros encajan en
 * la dimensión del piso, eliminando tiles partidos en bordes y haciendo
 * que cada piso decorativo se sienta como un objeto self-contained
 * (estilo Gather/Sims).
 *
 * Pattern industrial (Sims 4, Roblox, Unreal): cellCount = round(pisoSize /
 * idealTile), actualTile = pisoSize / cellCount. Pequeña distorsión (~±15%)
 * vs el idealTile pero invisible al ojo.
 *
 * Refs:
 *  - https://threejs.org/docs/#api/en/core/Object3D.renderOrder
 *  - https://threejs.org/docs/#api/en/materials/Material.clone (caveat onBeforeCompile)
 *  - https://threejs.org/docs/#api/en/core/BufferAttribute
 *  - https://r3f.docs.pmnd.rs/ (mesh, primitive)
 */

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import {
  PISO_DECORATIVO_Y_OFFSET,
  type PisoDecorativo,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';

/** Y step (m) por cada nivel de `orden`. 5mm = sub-perceptible para
 *  el avatar pero suficiente margen para drivers AMD/ANGLE que tenían
 *  trouble con 3mm. renderOrder garantiza orden de pintado;
 *  Y-step suficiente para evitar z-fight entre pisos consecutivos. */
const Y_STEP_POR_ORDEN_M = 0.005;

/** Base renderOrder de pisos (mayor que SueloPrincipal3D que es 0). */
const PISO_RENDER_ORDER_BASE = 10;

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
  // Material compartido (singleton del factory). No clonamos — el shader
  // procedural se rompería al perder los uniforms en userData.
  const material = useFloorMaterial(piso.tipoSuelo);

  // Geometry custom con attribute `aPisoSize` para que el shader entre en
  // modo mesh-local auto-fit. PlaneGeometry default tiene 4 vértices.
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(piso.ancho, piso.profundidad);
    const vertexCount = geo.attributes.position.count;
    const pisoSizeArray = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertexCount; i++) {
      pisoSizeArray[i * 2] = piso.ancho;
      pisoSizeArray[i * 2 + 1] = piso.profundidad;
    }
    geo.setAttribute('aPisoSize', new THREE.BufferAttribute(pisoSizeArray, 2));
    return geo;
  }, [piso.ancho, piso.profundidad]);

  // Dispose geometry on unmount/regenerate
  useEffect(() => () => geometry.dispose(), [geometry]);

  const y = yBase + PISO_DECORATIVO_Y_OFFSET + piso.orden * Y_STEP_POR_ORDEN_M;

  return (
    <mesh
      position={[piso.centroX, y, piso.centroZ]}
      rotation={[-Math.PI / 2, 0, piso.rotacionY]}
      geometry={geometry}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(piso.id); } : undefined}
      renderOrder={PISO_RENDER_ORDER_BASE + piso.orden}
      receiveShadow
    >
      <primitive object={material} attach="material" />
    </mesh>
  );
});

PisoDecorativo3D.displayName = 'PisoDecorativo3D';
