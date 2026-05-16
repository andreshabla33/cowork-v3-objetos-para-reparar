'use client';
/**
 * @module chat/presentation/sidebar/SidebarJuntasGroup
 *
 * Sección "Juntas" del sidebar — patrón Gather Town "Active Areas".
 *
 * Diseño passive-visible (NO toggle, NO click para ver):
 *   - Renderiza headers de sección estilo "MENSAJES DIRECTOS" (uppercase,
 *     tracking widest) seguido del contenido vivo en realtime.
 *   - Áreas Activas: salas_reunion con participantes apilados (avatar
 *     stack). Click en una sala = join (LiveKit moveParticipant).
 *   - Proximidad: cluster activo en stream (usersInCallIds del store).
 *   - Tu sala actual: highlight si currentMeetingZoneId.
 *   - Empty state: oculto cuando no hay nada activo (sin ruido visual).
 *
 * Sin estado interno (sin useState). 100% derivado del store + hooks.
 *
 * El user es claro: "no se debe hacer click en Juntas, ya deben verse
 * cuando las personas estén en esas zonas privadas y en stream de
 * proximidad". Iter v2 — 2026-05-15.
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

import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { useMeetingRooms } from '@/modules/meetings/presentation/hooks/useMeetingRooms';
import { AvatarStack } from './AvatarStack';

export const SidebarJuntasGroup: React.FC = () => {
  const { usersInCallIds, currentMeetingZoneId, onlineUsers } = useStore(
    useShallow((s) => ({
      usersInCallIds: s.usersInCallIds,
      currentMeetingZoneId: s.currentMeetingZoneId,
      onlineUsers: s.onlineUsers,
    })),
  );

  const { rooms, joinRoom } = useMeetingRooms();

  // Stream de proximidad activo (cluster en conversación).
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

  // Áreas Activas — salas con al menos una persona dentro.
  const areasActivas = useMemo(
    () => rooms.filter((r) => (r.participantes?.length ?? 0) > 0),
    [rooms],
  );

  const hasNoActivity = !currentMeetingZoneId
    && usersInProximity.length === 0
    && areasActivas.length === 0;

  // Si NO hay actividad, no renderizamos nada — cero ruido en el sidebar
  // hasta que algo ocurra (matches el comportamiento de Gather "Active Areas"
  // que solo aparece cuando hay áreas con gente).
  if (hasNoActivity) return null;

  return (
    <>
      {/* ── Tu sala actual (highlight si está en meeting zone) ─────────── */}
      {currentMeetingZoneId && (
        <div className="ag-side__section">
          <h3 className="ag-side__section-title">En vivo</h3>
        </div>
      )}
      {currentMeetingZoneId && (
        <div className="mx-3 mb-1 px-3 py-2 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-300/60 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="text-[11px] font-bold text-emerald-800">
              Estás en una sala
            </span>
          </div>
        </div>
      )}

      {/* ── Áreas Activas (salas con gente) — patrón Gather ────────────── */}
      {areasActivas.length > 0 && (
        <>
          <div className="ag-side__section">
            <h3 className="ag-side__section-title">Áreas activas</h3>
          </div>
          <ul className="px-2 space-y-1.5 mb-2">
            {areasActivas.map((sala) => {
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
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-100/70 transition-colors cursor-pointer group text-left"
                    title={`Unirse a ${sala.nombre}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-zinc-800 truncate mb-1">
                        {sala.nombre}
                      </p>
                      <AvatarStack users={participantUsers} max={5} size={22} borderColor="white" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Unirse
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ── Proximidad — cluster activo en conversación ─────────────────── */}
      {usersInProximity.length > 0 && (
        <>
          <div className="ag-side__section">
            <h3 className="ag-side__section-title">Proximidad</h3>
          </div>
          <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50/40 border border-indigo-200/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] text-indigo-700 font-medium">
                  En conversación
                </span>
              </span>
              <span className="text-[10px] font-mono font-bold text-indigo-600">
                {usersInProximity.length}
              </span>
            </div>
            <AvatarStack users={usersInProximity} max={6} size={26} borderColor="white" />
          </div>
        </>
      )}
    </>
  );
};

SidebarJuntasGroup.displayName = 'SidebarJuntasGroup';
