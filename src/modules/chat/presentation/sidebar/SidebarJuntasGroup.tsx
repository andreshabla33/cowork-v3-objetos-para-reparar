'use client';
/**
 * @module chat/presentation/sidebar/SidebarJuntasGroup
 *
 * Sección "Juntas" del sidebar lateral — patrón Gather Town inline-only.
 *
 * Estructura (top-to-bottom):
 *   1. Toggle "Juntas" con chevron rotativo + counter (expand/collapse).
 *   2. 🟢 "En vivo · tu sala" — card destacada si el avatar local
 *      está en una meeting zone (`currentMeetingZoneId`).
 *   3. 💜 "Proximidad" — stream activo de proximidad (`usersInCallIds`
 *      del store) con avatar stack horizontal.
 *   4. 🟡 "Salas (N)" — todas las salas_reunion con participantes,
 *      cada una con su avatar stack + click-to-join.
 *   5. Empty state — copy amigable cuando no hay actividad.
 *
 * 100% inline. NO abre modal NI navega a otra subtab. El panel central
 * de "Juntas" (JuntasPanel.tsx) fue eliminado del filesystem el 2026-05-15
 * tras feedback del user de que insistía en abrirse — garantía total.
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

  const { usersInCallIds, currentMeetingZoneId, onlineUsers } = useStore(
    useShallow((s) => ({
      usersInCallIds: s.usersInCallIds,
      currentMeetingZoneId: s.currentMeetingZoneId,
      onlineUsers: s.onlineUsers,
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

      {/* Contenido expandible — inline preview estilo Gather */}
      {expanded && (
        <div className="px-2 pb-3 space-y-2.5">
          {/* ── 🟢 Estás en una sala (meeting zone activo) ───────────────── */}
          {currentMeetingZoneId && (
            <div className="mx-1 px-2.5 py-2 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-300/60 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-700">
                  En vivo · tu sala
                </span>
              </div>
              <p className="text-[11px] text-emerald-900/90 font-medium truncate">
                Conversación de proximidad activa
              </p>
            </div>
          )}

          {/* ── 💜 Stream de proximidad ──────────────────────────────────── */}
          {usersInProximity.length > 0 && (
            <div className="mx-1 px-2.5 py-2 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50/40 border border-indigo-200/60">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-700">
                    Proximidad
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-indigo-600">
                  {usersInProximity.length}
                </span>
              </div>
              <AvatarStack users={usersInProximity} max={6} size={28} borderColor="white" />
            </div>
          )}

          {/* ── 🟡 Salas activas en el espacio 3D ────────────────────────── */}
          {salasConGente.length > 0 && (
            <div className="px-1">
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
                  Salas ({salasConGente.length})
                </span>
              </div>
              <ul className="space-y-1.5">
                {salasConGente.map((sala) => {
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
                    <li key={sala.id}>
                      <button
                        type="button"
                        onClick={() => joinRoom(sala.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-zinc-200/70 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer group text-left"
                        title={`Unirse a ${sala.nombre}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-zinc-800 truncate">
                            {sala.nombre}
                          </p>
                          <div className="mt-1">
                            <AvatarStack users={participantUsers} max={4} size={22} borderColor="white" />
                          </div>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          Unirse
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Empty state — nada activo */}
          {!currentMeetingZoneId
            && usersInProximity.length === 0
            && salasConGente.length === 0 && (
            <p className="mx-1 px-2 py-3 text-[10px] text-zinc-400 italic leading-relaxed text-center">
              Sin actividad ahora.
              <br />
              Las reuniones aparecerán aquí.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

SidebarJuntasGroup.displayName = 'SidebarJuntasGroup';
