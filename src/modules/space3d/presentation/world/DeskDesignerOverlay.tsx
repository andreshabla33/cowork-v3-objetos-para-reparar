'use client';
/**
 * @module space3d/world/DeskDesignerOverlay
 *
 * Preview 3D del rectángulo que el admin está dibujando para designar un
 * nuevo desk. Renderiza relleno + borde animado mientras el drag está
 * activo. Color naranja (≠ verde/cyan del DeskAreaOverlay para no
 * confundir con desks ya designados).
 *
 * Consume `bboxResuelto` del hook `useDeskDesigner` (centro + dims). Es
 * un overlay puro, sin lógica de input.
 */

import React, { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export interface DeskDesignerOverlayProps {
  bbox: { centroX: number; centroZ: number; ancho: number; alto: number } | null;
  /** Si `true`, se ve más opaco (dragging activo); si `false`, semitransparente
   *  (estado "naming" mientras el modal está abierto). */
  enArrastre: boolean;
}

const COLOR = '#fb923c'; // orange-400

export const DeskDesignerOverlay: React.FC<DeskDesignerOverlayProps> = ({ bbox, enArrastre }) => {
  const lineGeo = useMemo(() => {
    if (!bbox) return null;
    const halfW = bbox.ancho / 2;
    const halfH = bbox.alto / 2;
    const pts: number[] = [
      -halfW, 0, -halfH,
      halfW, 0, -halfH,
      halfW, 0, halfH,
      -halfW, 0, halfH,
      -halfW, 0, -halfH,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [bbox]);

  useEffect(() => {
    return () => { lineGeo?.dispose(); };
  }, [lineGeo]);

  if (!bbox || !lineGeo) return null;

  return (
    <group position={[bbox.centroX, 0.03, bbox.centroZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bbox.ancho, bbox.alto]} />
        <meshBasicMaterial
          color={COLOR}
          transparent
          opacity={enArrastre ? 0.18 : 0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop geometry={lineGeo}>
        <lineBasicMaterial color={COLOR} transparent opacity={enArrastre ? 1 : 0.7} />
      </lineLoop>
      <Html
        position={[0, 0.5, 0]}
        center
        distanceFactor={9}
        zIndexRange={[260, 0]}
        pointerEvents="none"
      >
        <div
          className="select-none px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap shadow"
          style={{ background: 'rgba(15, 23, 42, 0.85)', color: COLOR, border: `1px solid ${COLOR}` }}
        >
          {bbox.ancho.toFixed(1)}m × {bbox.alto.toFixed(1)}m
        </div>
      </Html>
    </group>
  );
};

DeskDesignerOverlay.displayName = 'DeskDesignerOverlay';
