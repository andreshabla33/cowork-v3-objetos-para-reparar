/**
 * @module components/space3d/Terrain3D
 *
 * Render del terreno (montañas) — capa de presentación.
 *
 * Visual: 1 PlaneGeometry con `displacementMap` (vertex shader, GPU-only).
 * Físico: 1 HeightfieldCollider de Rapier (one-shot lookup, 0 coste por frame).
 *
 * Si `terreno.tipo === 'flat'` retorna null (el suelo flat default de Scene3D
 * sigue aplicándose). Solo activa render extra cuando hay un heightmap real.
 *
 * Coste objetivo: < 1 ms GPU, ~0 ms CPU (más allá del fetch inicial del PNG).
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md (Fase 2.1 + 2.3).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTexture } from '@react-three/drei';
import { HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { ClampToEdgeWrapping } from 'three';
import {
  extractHeightsFromTexture,
  HeightmapInvalidoError,
} from '@/lib/rendering/extractHeightsFromTexture';
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
  espacioId,
  url,
  nrows,
  ncols,
  escala,
}: TerrainHeightfieldProps): React.JSX.Element | null {
  const texture = useTexture(url);
  const [heights, setHeights] = useState<Float32Array | null>(null);

  // ClampToEdge evita patrones repetidos artificiales en los bordes del
  // terreno (queremos un solo "rectángulo" cubriendo el espacio, no un tile).
  useEffect(() => {
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  // Extrae heights del PNG (one-shot, memoizado por url+dims)
  useEffect(() => {
    let cancelado = false;
    extractHeightsFromTexture({ url, nrows, ncols })
      .then((arr) => {
        if (!cancelado) setHeights(arr);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        const msg = err instanceof HeightmapInvalidoError ? err.message : String(err);
        log.error('No se pudo extraer heights del heightmap', { espacioId, url, msg });
      });
    return () => {
      cancelado = true;
    };
  }, [espacioId, url, nrows, ncols]);

  // Convertir Float32Array → number[] para HeightfieldArgs (Rapier exige number[])
  const heightsArray = useMemo<number[] | null>(
    () => (heights ? Array.from(heights) : null),
    [heights],
  );

  // El heightmap empuja vértices solo hacia arriba (rango [0, escala.y]).
  // Para que el "valle" (R=0) quede al nivel del suelo (Y=0) y las cumbres
  // crezcan hacia arriba, mantenemos position Y=0 y displacementBias=0.
  // Si el centro del PNG no es exactamente 0, displacementBias permite ajustar.
  const positionY = 0;

  return (
    <>
      {/* VISUAL — 1 draw call, displacement en GPU.
          NO usamos el heightmap como `map` (sería grayscale feo); solo como
          `displacementMap`. El color base es verde tierra por defecto. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, positionY, 0]} receiveShadow>
        <planeGeometry args={[escala.x, escala.z, ncols - 1, nrows - 1]} />
        <meshStandardMaterial
          color="#6e8b50"
          displacementMap={texture}
          displacementScale={escala.y}
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>

      {/* FÍSICO — solo cuando heights estén listos. RigidBody fixed = no se mueve.
          El HeightfieldCollider usa el mismo Y=0 que la mesh, así que la
          colisión está alineada con el visual displacement. */}
      {heightsArray && (
        <RigidBody type="fixed" colliders={false} position={[0, positionY, 0]}>
          <HeightfieldCollider args={[nrows - 1, ncols - 1, heightsArray, escala]} />
        </RigidBody>
      )}
    </>
  );
}
