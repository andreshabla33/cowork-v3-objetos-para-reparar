'use client';
/**
 * @module chat/presentation/sidebar/SidebarJuntasGroup
 *
 * Sección "Áreas Activas" del sidebar — patrón Gather Town Participants Panel.
 *
 * Muestra TODAS las conversaciones activas del workspace, no solo las
 * del local user. Cluster discovery client-side via `ProximityClusterer`
 * (Domain) — sin polling, sin endpoint server.
 *
 * Tipos de cluster mostrados:
 *   - 🟢 `meeting-zone`: avatares en la misma sala nombrada (ej. "Sala Ventas").
 *   - 🟣 `private-area`: avatares en private huddle area.
 *   - 💜 `open-proximity`: avatares hablando en mapa abierto (ad-hoc).
 *
 * UX (matching Gather):
 *   - Cero click necesario para ver — secciones aparecen pasivamente.
 *   - Si no hay actividad, no se renderiza nada (cero ruido).
 *   - El cluster que contiene al local user se destaca visualmente
 *     (border emerald + label "tu sala/grupo").
 *   - Click en un cluster: si es `meeting-zone` con `useMeetingRooms` que
 *     lo expone, join via LiveKit; si no, no-op (read-only).
 *
 * Clean Architecture:
 *   - Presentation puro. Consume `proximityClusters` del store
 *     (`usersSlice.proximityClusters` publicado por `useProximity`).
 *   - Renombrado el "meeting zone match" via `useMeetingRooms.rooms` para
 *     obtener nombres human-readable de salas.
 *
 * Refs:
 *   - Gather Participants Panel — https://support.gather.town/hc/en-us/articles/23149472282004
 *   - Atlassian AvatarGroup — https://atlassian.design/components/avatar-group
 *   - Zustand v5 useShallow — https://github.com/pmndrs/zustand
 */

import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { useMeetingRooms } from '@/modules/meetings/presentation/hooks/useMeetingRooms';
import { AvatarStack, type AvatarStackItem } from './AvatarStack';
import type { ProximityCluster } from '@/src/core/domain/services/ProximityClusterer';
import type { User } from '@/types';

interface RenderableCluster {
  id: string;
  label: string;
  kind: ProximityCluster['kind'];
  members: AvatarStackItem[];
  /** True si el current user está en este cluster — UI destaca. */
  isMine: boolean;
  /** Sala asociada si `kind === 'meeting-zone'` para join action. */
  salaId: string | null;
}

const mapUserToAvatarItem = (u: User | undefined): AvatarStackItem | null => {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    imageUrl: u.profilePhoto || u.avatar || null,
  };
};

export const SidebarJuntasGroup: React.FC = () => {
  const { proximityClusters, onlineUsers, currentUser } = useStore(
    useShallow((s) => ({
      proximityClusters: s.proximityClusters,
      onlineUsers: s.onlineUsers,
      currentUser: s.currentUser,
    })),
  );

  const currentUserId = currentUser?.id ?? null;

  const { rooms, joinRoom } = useMeetingRooms();

  // Index O(1) de users — incluye el LOCAL user (no siempre está en
  // `onlineUsers` que es solo remote presence). Sin esto, clusters
  // mixtos local+remote quedan con un solo avatar resuelto y se
  // descartan por el filtro `members.length < 2`.
  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of onlineUsers) m.set(u.id, u);
    if (currentUser?.id) m.set(currentUser.id, currentUser as User);
    return m;
  }, [onlineUsers, currentUser]);

  const salaById = useMemo(() => {
    const m = new Map<string, (typeof rooms)[number]>();
    for (const r of rooms) m.set(r.id, r);
    return m;
  }, [rooms]);

  // Resolver clusters → shape renderable.
  const renderable = useMemo<RenderableCluster[]>(() => {
    return proximityClusters
      .map((c): RenderableCluster | null => {
        const members = c.memberIds
          .map((id) => mapUserToAvatarItem(userById.get(id)))
          .filter((u): u is AvatarStackItem => u !== null);
        if (members.length < 2) return null; // hidratación parcial

        const isMine = currentUserId !== null && c.memberIds.includes(currentUserId);

        let label: string;
        let salaId: string | null = null;

        if (c.kind === 'meeting-zone' && c.anchorId) {
          const sala = salaById.get(c.anchorId);
          label = sala?.nombre ?? 'Sala';
          salaId = sala?.id ?? null;
        } else if (c.kind === 'private-area') {
          label = 'Huddle privado';
        } else {
          label = `${members.length} conversando`;
        }

        return { id: c.id, label, kind: c.kind, members, isMine, salaId };
      })
      .filter((c): c is RenderableCluster => c !== null);
  }, [proximityClusters, userById, salaById, currentUserId]);

  if (renderable.length === 0) return null;

  return (
    <>
      <div className="ag-side__section">
        <h3 className="ag-side__section-title">Áreas activas</h3>
      </div>
      <ul className="px-2 space-y-1 mb-2">
        {renderable.map((c) => {
          const colorDot = c.kind === 'meeting-zone'
            ? 'bg-amber-500'
            : c.kind === 'private-area'
              ? 'bg-purple-500'
              : 'bg-indigo-500';

          const clickHandler = c.salaId
            ? () => joinRoom(c.salaId!)
            : undefined;

          const isClickable = !!clickHandler;

          return (
            <li key={c.id}>
              <div
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={clickHandler}
                onKeyDown={isClickable
                  ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      clickHandler();
                    }
                  }
                  : undefined}
                className={[
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors group',
                  isClickable ? 'cursor-pointer hover:bg-zinc-100/70' : 'cursor-default',
                  c.isMine
                    ? 'bg-emerald-50/60 border border-emerald-300/60 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
                    : 'bg-transparent',
                ].join(' ')}
                title={isClickable ? `Unirse a ${c.label}` : c.label}
              >
                <span
                  className={`w-2 h-2 rounded-full ${colorDot} ${c.isMine ? 'animate-pulse' : ''} flex-shrink-0`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-zinc-800 truncate flex items-center gap-1.5">
                    {c.label}
                    {c.isMine && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                        · tú
                      </span>
                    )}
                  </p>
                  <div className="mt-1">
                    <AvatarStack users={c.members} max={5} size={22} borderColor="white" />
                  </div>
                </div>
                {isClickable && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    Unirse
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
};

SidebarJuntasGroup.displayName = 'SidebarJuntasGroup';
