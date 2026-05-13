'use client';
/**
 * @module space3d/world/SueloPrincipal3D
 *
 * Renderiza el suelo "background" del espacio — el PlaneGeometry global
 * que cubre todo el área donde no hay zonas. Lee `terreno.tipoSueloPrincipal`
 * y aplica el material PBR procedural via `useFloorMaterial`.
 *
 * Z-order:
 *   - Y = -0.005 (debajo de las zonas activas que están en Y=0..0.02)
 *   - renderOrder = -10 (se dibuja antes que cualquier otra cosa)
 *
 * Tamaño: 200×200m por default (suficiente para cubrir cualquier espacio
 * razonable; el Terrain3D distante cubre desde ~250m hacia afuera).
 *
 * No interactivo: `raycast=null` para que clicks pasen al
 * `geoSueloRaycast` que ya hay en Scene3D para teleport/dibujo.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/geometries/PlaneGeometry
 *   https://r3f.docs.pmnd.rs/api/objects (primitive pattern)
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';

export interface SueloPrincipal3DProps {
  tipoSueloPrincipal: string;
  /** Tamaño del plano en metros. Default 200×200. */
  tamanoMetros?: number;
}

export const SueloPrincipal3D: React.FC<SueloPrincipal3DProps> = ({
  tipoSueloPrincipal,
  tamanoMetros = 200,
}) => {
  const material = useFloorMaterial(tipoSueloPrincipal);

  // Geometría memoizada por tamaño — evita re-crearla cada render.
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(tamanoMetros, tamanoMetros),
    [tamanoMetros],
  );

  // No interactivo: no consume clicks (los maneja el catch-plane invisible).
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.005, 0]}
      geometry={geometry}
      receiveShadow
      renderOrder={-10}
      raycast={() => null}
    >
      <primitive object={material} attach="material" />
    </mesh>
  );
};

SueloPrincipal3D.displayName = 'SueloPrincipal3D';
