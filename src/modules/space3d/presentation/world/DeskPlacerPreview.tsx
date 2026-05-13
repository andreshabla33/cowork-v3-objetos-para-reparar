'use client';
/**
 * @module space3d/world/DeskPlacerPreview
 *
 * Preview 3D del preset desk que sigue al cursor mientras el admin está en
 * modo "previewing". Muestra el footprint (rectángulo naranja) del preset
 * + dimensiones flotantes. No requiere re-render por frame: lee el ref del
 * cursor world vía `useFrame` y muta `group.position` directo.
 *
 * Performance: 1 plane + 1 lineLoop + 1 Html label = 3 draw calls fijos
 * (no escala con N — solo se renderiza durante el preview).
 *
 * Ref: drei `<Html>` para tooltip, R3F `useFrame` para hover-follow.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PresetDesk } from '@/src/core/domain/entities/espacio3d/PresetDesk';
import { pisoMundoPlano, ajustarAGrilla } from '@/modules/space3d/presentation/scene/sceneHelpers';

const COLOR = '#fb923c'; // orange-400

export interface DeskPlacerPreviewProps {
  preset: PresetDesk;
}

export const DeskPlacerPreview: React.FC<DeskPlacerPreviewProps> = ({ preset }) => {
  const { gl, camera, raycaster, pointer } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const visibleRef = useRef(false);
  const targetPosRef = useRef(new THREE.Vector3());

  // Geometría memoizada del borde line-loop (recrea solo si preset cambia).
  const lineGeo = useMemo(() => {
    const halfW = preset.bbox.ancho / 2;
    const halfH = preset.bbox.alto / 2;
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
  }, [preset]);

  useEffect(() => () => { lineGeo.dispose(); }, [lineGeo]);

  // Sample world pointer 1× por frame via raycaster contra pisoMundoPlano.
  // R3F provee `pointer` (NDC) y `raycaster` ya wired a la cámara; usamos
  // intersectPlane para obtener el world point del cursor sobre Y=0.
  useFrame(() => {
    if (!groupRef.current) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectPlane(pisoMundoPlano, targetPosRef.current);
    if (hit) {
      groupRef.current.position.set(
        ajustarAGrilla(targetPosRef.current.x),
        0.04,
        ajustarAGrilla(targetPosRef.current.z),
      );
      visibleRef.current = true;
      groupRef.current.visible = true;
    } else {
      visibleRef.current = false;
      groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[preset.bbox.ancho, preset.bbox.alto]} />
        <meshBasicMaterial
          color={COLOR}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop geometry={lineGeo}>
        <lineBasicMaterial color={COLOR} transparent opacity={0.95} />
      </lineLoop>
      <Html
        position={[0, 0.6, 0]}
        center
        distanceFactor={9}
        zIndexRange={[260, 0]}
        pointerEvents="none"
      >
        <div
          className="select-none px-3 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap shadow-lg"
          style={{ background: 'rgba(15, 23, 42, 0.9)', color: COLOR, border: `1px solid ${COLOR}` }}
        >
          📐 Click para colocar · {preset.bbox.ancho}×{preset.bbox.alto}m
        </div>
      </Html>
    </group>
  );
};

DeskPlacerPreview.displayName = 'DeskPlacerPreview';
