/**
 * @module components/space3d/Terrain3D
 *
 * Render del terreno (montañas) — capa de presentación.
 *
 * Diseño actual: el terreno es el **horizonte lejano**, no el suelo del
 * avatar. Se posiciona DETRÁS del DistantSkyline (radio 120m default) y
 * sumido bajo el nivel del suelo, de modo que solo las cumbres asoman por
 * encima del skyline urbano. El centro del heightmap (donde está el cowork)
 * queda invisible bajo el suelo plano del espacio.
 *
 * Visual: 1 PlaneGeometry grande (escala 500×500m típica) con
 * `displacementMap` (vertex shader, GPU-only). 1 draw call total.
 *
 * Físico: NO se usa collider. El avatar nunca llega tan lejos (las paredes
 * perimetrales del cowork lo bloquean a ~10m del centro). Eliminar el
 * HeightfieldCollider ahorra el parseo del PNG en CPU.
 *
 * Si `terreno.tipo === 'flat'` retorna null.
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md (Fase 2 — ajuste post-test del usuario).
 */

import React, { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import { ClampToEdgeWrapping } from 'three';
import type { TerrenoEntity } from '@/src/core/domain/entities/espacio3d/TerrenoEntity';
import { logger } from '@/lib/logger';

const log = logger.child('Terrain3D');

interface Terrain3DProps {
  terreno: TerrenoEntity;
}

/**
 * Renderiza el terreno físico+visual cuando es heightfield. No renderiza
 * nada para `flat` (el suelo plano de Scene3D sigue activo).
 */
export function Terrain3D({ terreno }: Terrain3DProps): React.JSX.Element | null {
  if (terreno.tipo !== 'heightfield') return null;
  if (!terreno.heightmapUrl || terreno.nrows === null || terreno.ncols === null) {
    log.warn('Terreno heightfield sin heightmap_url/nrows/ncols — no se renderiza', {
      espacioId: terreno.espacioId,
    });
    return null;
  }

  return (
    <TerrainHeightfield
      espacioId={terreno.espacioId}
      url={terreno.heightmapUrl}
      nrows={terreno.nrows}
      ncols={terreno.ncols}
      escala={terreno.escala}
    />
  );
}

interface TerrainHeightfieldProps {
  espacioId: string;
  url: string;
  nrows: number;
  ncols: number;
  escala: TerrenoEntity['escala'];
}

function TerrainHeightfield({
  espacioId: _espacioId,
  url,
  nrows,
  ncols,
  escala,
}: TerrainHeightfieldProps): React.JSX.Element | null {
  const texture = useTexture(url);

  // ClampToEdge evita patrones repetidos artificiales en los bordes del terreno.
  useEffect(() => {
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  // El plano se sume bajo el suelo del cowork: solo los picos MÁS altos
  // asoman por encima del DistantSkyline (R=120m, edif. 8-28m alto).
  //
  // Sumir 92% del rango → solo el 8% superior visible.
  // Para escala.y=50 → cumbre máxima a Y=4 (asoman por detrás del skyline
  // sin tapar el cielo ni dominar la escena).
  //
  // El heightmap debe tener centro plano (R=0) en al menos rNorm < 0.65
  // para que el área del skyline (R<120m sobre 250m de radio = 0.48) NO
  // tenga cumbres dentro. Ver scripts/generate-test-heightmap.mjs.
  const sinkBelowGround = -escala.y * 0.92;

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, sinkBelowGround, 0]}
      receiveShadow={false}
      castShadow={false}
      frustumCulled={false}
    >
      <planeGeometry args={[escala.x, escala.z, ncols - 1, nrows - 1]} />
      <meshStandardMaterial
        color="#3d4a32"
        displacementMap={texture}
        displacementScale={escala.y}
        roughness={1.0}
        metalness={0.0}
      />
    </mesh>
  );
}
