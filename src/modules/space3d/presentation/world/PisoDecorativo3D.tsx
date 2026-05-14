/**
 * @module space3d/world/PisoDecorativo3D
 *
 * Componente R3F que renderiza un único piso decorativo (alfombra / parche
 * de material PBR) como un Plane plano sobre el suelo base.
 *
 * Modelo Gather-style — visual only, sin colisión ni nav.
 *
 * ## Fix definitivo z-fighting (2026-05-14)
 * 1. **Material clonado por piso**: `useFloorMaterial` retorna un singleton
 *    compartido con SueloPrincipal3D. Mutar `depthWrite/polygonOffset` en él
 *    afectaría también al suelo base. Clonamos vía useMemo — clone() preserva
 *    `onBeforeCompile` así que el shader procedural sigue funcionando.
 * 2. **`depthWrite=false`**: el piso no escribe al z-buffer. Múltiples pisos
 *    apilados no compiten en depth (causa raíz del flicker/ruido).
 * 3. **`renderOrder=10+orden`**: control determinista del orden visual.
 *    SueloPrincipal renderea con renderOrder=0 (default) → pisos siempre
 *    encima. Entre pisos, mayor `orden` = renderea después = on top.
 * 4. **Y-step = 0.02m** por orden (antes 0.001m): defensa adicional contra
 *    z-fight si algún driver ignora depthWrite=false.
 *
 * El avatar / muebles renderean con `depthWrite=true` y se ven correctamente
 * encima — los pisos NO los ocultan porque no escriben depth, y el avatar/
 * muebles ganan por estar más cerca de la cámara cuando aplica.
 *
 * Refs:
 *  - https://threejs.org/docs/#api/en/materials/Material.depthWrite
 *  - https://threejs.org/docs/#api/en/core/Object3D.renderOrder
 *  - https://threejs.org/docs/#api/en/materials/Material.polygonOffset
 *  - https://r3f.docs.pmnd.rs/ (mesh, primitive)
 */

import React, { useMemo } from 'react';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import {
  PISO_DECORATIVO_Y_OFFSET,
  type PisoDecorativo,
} from '@/core/domain/entities/espacio3d/PisoDecorativo';

/** Y step (m) por cada nivel de `orden`. 2cm = visible para stacks pero
 *  imperceptible para el avatar al caminar. */
const Y_STEP_POR_ORDEN_M = 0.02;

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
  const sharedMaterial = useFloorMaterial(piso.tipoSuelo);

  // Material clonado por piso para no contaminar el singleton usado por
  // SueloPrincipal3D. clone() preserva onBeforeCompile (función refs) →
  // el shader procedural PBR sigue idéntico, pero depthWrite/polygonOffset
  // son independientes.
  const material = useMemo(() => {
    const m = sharedMaterial.clone();
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }, [sharedMaterial]);

  const y = yBase + PISO_DECORATIVO_Y_OFFSET + piso.orden * Y_STEP_POR_ORDEN_M;

  return (
    <mesh
      position={[piso.centroX, y, piso.centroZ]}
      rotation={[-Math.PI / 2, 0, piso.rotacionY]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(piso.id); } : undefined}
      renderOrder={PISO_RENDER_ORDER_BASE + piso.orden}
      receiveShadow
    >
      <planeGeometry args={[piso.ancho, piso.profundidad]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
});

PisoDecorativo3D.displayName = 'PisoDecorativo3D';
