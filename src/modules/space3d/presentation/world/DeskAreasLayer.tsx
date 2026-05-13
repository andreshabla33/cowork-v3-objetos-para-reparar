'use client';
/**
 * @module space3d/world/DeskAreasLayer
 *
 * Renderer top-level de todas las `AreaEscritorio` del espacio. Resuelve
 * los nombres de los ocupantes (lookup en `onlineUsers`) y hace passthrough
 * de acciones al hook `useAreasEscritorio`.
 *
 * Es un componente delgado: cada AreaEscritorio se renderiza vía
 * `<DeskAreaOverlay>`. Lookups O(1) via Map memo-izada.
 */

import React, { useMemo } from 'react';
import { DeskAreaOverlay } from './DeskAreaOverlay';
import type { AreaEscritorio } from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import type { ResultadoMutacionAreaEscritorio } from '@/src/core/domain/ports/IAreaEscritorioRepository';
import type { User } from '@/types';

export interface DeskAreasLayerProps {
  areas: AreaEscritorio[];
  /** Ref del avatar local (actualizado in-place por Player3D cada frame). */
  playerPosRef: React.MutableRefObject<{ x: number; z: number }>;
  /** ID del usuario actual. */
  miUsuarioId: string | null;
  /** Catálogo de usuarios online para resolver nombre del ocupante. */
  onlineUsers: User[];
  onReclamar: (area: AreaEscritorio) => Promise<ResultadoMutacionAreaEscritorio>;
  onLiberar: (area: AreaEscritorio) => Promise<ResultadoMutacionAreaEscritorio>;
  /** Callback opcional para mostrar notificaciones de error. */
  onMutacionResult?: (area: AreaEscritorio, resultado: ResultadoMutacionAreaEscritorio) => void;
}

export const DeskAreasLayer: React.FC<DeskAreasLayerProps> = ({
  areas,
  playerPosRef,
  miUsuarioId,
  onlineUsers,
  onReclamar,
  onLiberar,
  onMutacionResult,
}) => {
  // Lookup O(1) por userId para resolver nombre del ocupante.
  const usuariosPorId = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of onlineUsers) map.set(u.id, u);
    return map;
  }, [onlineUsers]);

  return (
    <>
      {areas.map((area) => {
        const ocupanteId = area.reclamado_por_usuario_id ?? area.asignado_a_usuario_id;
        const ocupante = ocupanteId ? usuariosPorId.get(ocupanteId) : null;
        const ocupanteNombre = ocupante?.name ?? null;

        return (
          <DeskAreaOverlay
            key={area.id}
            area={area}
            playerPosRef={playerPosRef}
            miUsuarioId={miUsuarioId}
            ocupanteNombre={ocupanteNombre}
            onReclamar={async () => {
              const r = await onReclamar(area);
              onMutacionResult?.(area, r);
            }}
            onLiberar={async () => {
              const r = await onLiberar(area);
              onMutacionResult?.(area, r);
            }}
          />
        );
      })}
    </>
  );
};

DeskAreasLayer.displayName = 'DeskAreasLayer';
