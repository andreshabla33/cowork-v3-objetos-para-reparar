'use client';
/**
 * @module space3d/world/DeskAreaOverlay
 *
 * Renderiza un single `AreaEscritorio` en la escena 3D como rectángulo plano
 * en Y=0.02 (apenas sobre el piso), con borde color-coded según estado vs
 * usuario actual, label flotante con el nombre del desk + nombre del
 * ocupante, y tooltip + botón "Reclamar/Liberar" cuando el avatar local
 * está cerca.
 *
 * Performance: el playerPos viene como `MutableRefObject` (actualizado por
 * Player3D in-place sin re-render). Usamos `useFrame` para sample la
 * distancia y solo dispara setState cuando el flag de proximidad cambia
 * (edge-triggered), evitando re-renders por frame.
 *
 * Refs:
 *  - https://drei.docs.pmnd.rs/misc/html
 *  - https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  evaluarEstadoAreaEscritorio,
  type AreaEscritorio,
  type EstadoAreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';

// ─── Color palette por estado ───────────────────────────────────────────────

interface PaletaEstado {
  borde: string;
  relleno: string;
  rellenoOpacidad: number;
  label: string;
  glow: boolean;
}

const PALETAS: Record<EstadoAreaEscritorio, PaletaEstado> = {
  disponible: {
    borde: '#22c55e',
    relleno: '#22c55e',
    rellenoOpacidad: 0.08,
    label: '#22c55e',
    glow: true,
  },
  'pre-asignada-mia': {
    borde: '#fbbf24',
    relleno: '#fbbf24',
    rellenoOpacidad: 0.12,
    label: '#fbbf24',
    glow: true,
  },
  mia: {
    borde: '#06b6d4',
    relleno: '#06b6d4',
    rellenoOpacidad: 0.1,
    label: '#06b6d4',
    glow: false,
  },
  'ocupada-otro': {
    borde: '#94a3b8',
    relleno: '#94a3b8',
    rellenoOpacidad: 0.06,
    label: '#cbd5e1',
    glow: false,
  },
  'pre-asignada-otro': {
    borde: '#64748b',
    relleno: '#64748b',
    rellenoOpacidad: 0.04,
    label: '#94a3b8',
    glow: false,
  },
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface DeskAreaOverlayProps {
  area: AreaEscritorio;
  /** Ref del avatar local (actualizado in-place cada frame por Player3D). */
  playerPosRef: React.MutableRefObject<{ x: number; z: number }>;
  /** ID del usuario actual (null si anónimo). */
  miUsuarioId: string | null;
  /** Nombre legible del ocupante actual (resuelto por el parent). */
  ocupanteNombre?: string | null;
  /** Radio (m) a partir del cual aparece el tooltip al acercarse. */
  radioTooltip?: number;
  /** Acción reclamar. */
  onReclamar?: () => void;
  /** Acción liberar (solo si es mía). */
  onLiberar?: () => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────

const PROXIMIDAD_SAMPLE_FRAMES = 6; // ~10Hz a 60fps — suficiente para tooltip UX

export const DeskAreaOverlay: React.FC<DeskAreaOverlayProps> = ({
  area,
  playerPosRef,
  miUsuarioId,
  ocupanteNombre,
  radioTooltip = 2.5,
  onReclamar,
  onLiberar,
}) => {
  const estado = useMemo(
    () => evaluarEstadoAreaEscritorio(area, miUsuarioId),
    [area, miUsuarioId],
  );
  const paleta = PALETAS[estado];

  const { centroX, centroZ, ancho, alto } = area.bbox;

  // ─── Proximity sampling via useFrame (edge-triggered setState) ─────────
  const [mostrarTooltip, setMostrarTooltip] = useState(false);
  const frameCounterRef = useRef(0);
  const tooltipActualRef = useRef(false);

  useFrame(() => {
    frameCounterRef.current = (frameCounterRef.current + 1) % PROXIMIDAD_SAMPLE_FRAMES;
    if (frameCounterRef.current !== 0) return;

    const pp = playerPosRef.current;
    const halfW = ancho / 2;
    const halfH = alto / 2;
    const dx = Math.max(Math.abs(pp.x - centroX) - halfW, 0);
    const dz = Math.max(Math.abs(pp.z - centroZ) - halfH, 0);
    const dist = Math.hypot(dx, dz);

    const proxNueva = dist <= radioTooltip;
    if (proxNueva !== tooltipActualRef.current) {
      tooltipActualRef.current = proxNueva;
      setMostrarTooltip(proxNueva);
    }
  });

  // ─── Geometría memoizada (line loop del borde) ─────────────────────────
  // planeArgs eliminado: el relleno ya no se renderiza acá (DeskAreasInstancedFill).
  const lineGeo = useMemo(() => {
    const halfW = ancho / 2;
    const halfH = alto / 2;
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
  }, [ancho, alto]);

  useEffect(() => {
    return () => { lineGeo.dispose(); };
  }, [lineGeo]);

  return (
    <group position={[centroX, 0.02, centroZ]}>
      {/* El RELLENO ahora es renderizado por DeskAreasInstancedFill
          (1 InstancedMesh para todas las áreas → 1 draw call total).
          Este overlay mantiene SOLO borde + labels HTML + tooltip.
          Ver src/modules/space3d/presentation/world/DeskAreasInstancedFill.tsx */}

      {/* Borde del rectángulo (line loop) */}
      <lineLoop geometry={lineGeo}>
        <lineBasicMaterial
          color={paleta.borde}
          transparent
          opacity={paleta.glow ? 0.95 : 0.6}
        />
      </lineLoop>

      {/* Label superior con nombre + ocupante */}
      <Html
        position={[0, 1.1, 0]}
        center
        distanceFactor={10}
        zIndexRange={[150, 0]}
        pointerEvents="none"
      >
        <div
          className="select-none px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap shadow-sm backdrop-blur-sm"
          style={{
            color: paleta.label,
            background: 'rgba(15, 23, 42, 0.55)',
            border: `1px solid ${paleta.borde}88`,
          }}
        >
          {area.nombre}
          {ocupanteNombre && (estado === 'ocupada-otro' || estado === 'mia') && (
            <span className="opacity-70"> · {ocupanteNombre}</span>
          )}
        </div>
      </Html>

      {/* Tooltip + botón cuando el avatar está cerca */}
      {mostrarTooltip && (
        <Html
          position={[0, 0.5, 0]}
          center
          distanceFactor={8}
          zIndexRange={[260, 0]}
        >
          <div className="select-none pointer-events-auto">
            {estado === 'disponible' && onReclamar && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReclamar(); }}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white shadow-lg hover:scale-105 transition-transform"
                style={{ background: paleta.borde }}
                title="Reclamar este escritorio"
              >
                Reclamar
              </button>
            )}
            {estado === 'pre-asignada-mia' && onReclamar && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReclamar(); }}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-zinc-900 shadow-lg hover:scale-105 transition-transform"
                style={{ background: paleta.borde }}
                title="Te asignaron este escritorio"
              >
                Tu escritorio · Reclamar
              </button>
            )}
            {estado === 'mia' && onLiberar && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onLiberar(); }}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white shadow-lg hover:scale-105 transition-transform"
                style={{ background: '#0891b2' }}
                title="Liberar tu escritorio"
              >
                Liberar
              </button>
            )}
            {estado === 'ocupada-otro' && (
              <div
                className="px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-200 shadow-md whitespace-nowrap"
                style={{ background: 'rgba(15, 23, 42, 0.8)' }}
              >
                Ocupado{ocupanteNombre ? ` por ${ocupanteNombre}` : ''}
              </div>
            )}
            {estado === 'pre-asignada-otro' && (
              <div
                className="px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-300 shadow-md whitespace-nowrap"
                style={{ background: 'rgba(15, 23, 42, 0.7)' }}
              >
                Reservado{ocupanteNombre ? ` para ${ocupanteNombre}` : ''}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

DeskAreaOverlay.displayName = 'DeskAreaOverlay';
