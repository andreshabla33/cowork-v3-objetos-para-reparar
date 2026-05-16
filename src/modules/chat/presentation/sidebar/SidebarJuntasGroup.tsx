'use client';
/**
 * @module chat/presentation/sidebar/SidebarJuntasGroup
 *
 * Sección "Juntas" del sidebar lateral — patrón Gather Town.
 *
 * Estructura (top-to-bottom):
 *   1. Toggle "Juntas" con chevron rotativo (expand/collapse).
 *   2. ▾ Tu sala actual (sólo si está en meeting zone) — destacada.
 *   3. ▾ En proximidad — stream activo de proximidad (`usersInCallIds` del store).
 *      Avatar stack horizontal estilo Gather.
 *   4. ▾ Salas activas — todas las `salas_reunion` con participantes,
 *      avatar stack + nombre + botón "Unirse".
 *   5. Link "Ver detalle" → abre el panel central `JuntasPanel` (subtab).
 *
 * NO abre modal. Todo inline en el sidebar, exactamente como Gather.
 *
 * Refs:
 *   - Gather Participants Panel — https://support.gather.town/hc/en-us/articles/23149472282004
 *   - Atlassian Avatar Group — https://atlassian.design/components/avatar-group
 *   - Zustand v5 useShallow — https://github.com/pmndrs/zustand
 *
 * Clean Architecture:
 *   - Presentation puro. Consume hooks (`useMeetingRooms`) + slice (`usersInCallIds`).
 *   - Cero acceso a Supabase directo. Cero domain logic.
 *   - El stream de proximidad se publica desde useProximity al store
 *     (usersSlice.usersInCallIds + currentMeetingZoneId) para evitar
 *     re-instanciar la lógica de proximidad fuera del 3D scene.
 */

import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { useMeetingRooms } from '@/modules/meetings/presentation/hooks/useMeetingRooms';
import { AvatarStack } from './AvatarStack';

const IconCamera: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7l-7 5 7 5V7zM14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z" />
  </svg>
);

const IconChevron: React.FC<{ rotated?: boolean }> = ({ rotated }) => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transition: 'transform 180ms ease',
      transform: rotated ? 'rotate(0deg)' : 'rotate(-90deg)',
    }}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const SidebarJuntasGroup: React.FC = () => {
  const [expanded, setExpanded] = useState(true);

  const { usersInCallIds, currentMeetingZoneId, onlineUsers, setActiveSubTab } = useStore(
    useShallow((s) => ({
      usersInCallIds: s.usersInCallIds,
      currentMeetingZoneId: s.currentMeetingZoneId,
      onlineUsers: s.onlineUsers,
      setActiveSubTab: s.setActiveSubTab,
    })),
  );

  const { rooms, joinRoom } = useMeetingRooms();

  // Usuarios en stream de proximidad activo (cluster en conversación).
  // Map del shape `User` al contrato de AvatarStack (`imageUrl` genérico).
  const usersInProximity = useMemo(
    () =>
      onlineUsers
        .filter((u) => usersInCallIds.has(u.id))
        .map((u) => ({
          id: u.id,
          name: u.name,
          imageUrl: u.profilePhoto || u.avatar || null,
        })),
    [onlineUsers, usersInCallIds],
  );

  // Salas activas con al menos una persona dentro.
  const salasConGente = useMemo(
    () => rooms.filter((r) => (r.participantes?.length ?? 0) > 0),
    [rooms],
  );

  const totalEnReunion = usersInProximity.length
    + salasConGente.reduce((sum, s) => sum + (s.participantes?.length ?? 0), 0);

  return (
    <div className="ag-side__group">
      {/* Toggle de la sección Juntas */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="ag-side__item"
        aria-expanded={expanded}
        title="Reuniones activas en este espacio"
      >
        <span className="ag-side__item-icon" aria-hidden="true"><IconCamera /></span>
        <span className="ag-side__item-label">Juntas</span>
        <span className="ag-side__item-meta">
          {totalEnReunion > 0 && (
            <span className="text-[10px] font-bold text-emerald-500 mr-1">
              {totalEnReunion}
            </span>
          )}
          <IconChevron rotated={expanded} />
        </span>
      </button>

      {/* Contenido expandible */}
      {expanded && (
        <div className="pl-4 pr-2 pb-2 space-y-2">
          {/* ── Tu sala actual (si está en meeting zone) ─────────────────── */}
          {currentMeetingZoneId && (
            <div className="px-2 py-1.5 rounded-lg bg-emerald-50/60 border border-emerald-200/50">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">
                  Estás en una sala
                </span>
              </div>
              <p className="text-[11px] text-emerald-900/80 truncate">
                Conversación de proximidad activa
              </p>
            </div>
          )}

          {/* ── En proximidad (stream activo) ────────────────────────────── */}
          {usersInProximity.length > 0 ? (
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  En proximidad ({usersInProximity.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <AvatarStack users={usersInProximity} max={5} size={26} />
              </div>
            </div>
          ) : (
            !currentMeetingZoneId && (
              <p className="px-2 py-1 text-[10px] text-zinc-400 italic">
                Nadie en proximidad ahora.
              </p>
            )
          )}

          {/* ── Salas activas ────────────────────────────────────────────── */}
          {salasConGente.length > 0 && (
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  Salas activas ({salasConGente.length})
                </span>
              </div>
              <ul className="space-y-1.5">
                {salasConGente.map((sala) => {
                  // Map ParticipanteSalaData → AvatarStackItem
                  const participantUsers = (sala.participantes ?? [])
                    .map((p) => {
                      const u = p.usuario;
                      if (!u) return null;
                      return {
                        id: u.id,
                        name: u.nombre,
                        imageUrl: u.avatar_url ?? null,
                      };
                    })
                    .filter((u): u is NonNullable<typeof u> => u !== null);
                  return (
                    <li
                      key={sala.id}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-zinc-100/60 cursor-pointer group"
                      onClick={() => joinRoom(sala.id)}
                      title={`Unirse a ${sala.nombre}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-700 truncate">
                          {sala.nombre}
                        </p>
                        <div className="mt-1">
                          <AvatarStack users={participantUsers} max={4} size={20} />
                        </div>
                      </div>
                      <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 font-bold uppercase tracking-wider">
                        Unirse →
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Link a vista expandida ───────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setActiveSubTab('juntas')}
            className="block w-full text-left px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-indigo-500 hover:text-indigo-700"
          >
            Ver todas las juntas →
          </button>
        </div>
      )}
    </div>
  );
};

SidebarJuntasGroup.displayName = 'SidebarJuntasGroup';
