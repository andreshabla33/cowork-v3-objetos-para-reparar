/**
 * @module components/chat/ChatSidebarContent
 * @description Sidebar — listado de canales, DMs y meetings. Aurora GLASS.
 *
 * Diseño calm:
 *   - Cabecera de espacio (cinta aurora + nombre del espacio)
 *   - Búsqueda con shortcut ⌘K
 *   - Secciones MEETINGS · CANALES · MENSAJES DIRECTOS
 *   - Item activo con indicador azul a la izquierda + badge unread rojo
 *   - Status dots calm (active/paused/busy/offline)
 *
 * Estilos 100% en `aurora-glass.css` (.ag-side*). Sin colores hardcoded.
 * Toda la lógica vive en `useChatPanel` — este componente es presentacional.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { ModalCrearGrupo } from './ModalCrearGrupo';
import { ChatToast } from '../ChatToast';
import { PresenceStatus } from '@/types';
import type { ChatGroup } from '@/types';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';
import type { ToastNotification } from '@/components/ChatToast';

/* ────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

type StatusVariant = 'active' | 'paused' | 'busy' | 'offline';

const presenceToVariant = (status?: PresenceStatus, isOnline = false): StatusVariant => {
  if (!isOnline) return 'offline';
  switch (status) {
    case PresenceStatus.AVAILABLE: return 'active';
    case PresenceStatus.AWAY:      return 'paused';
    case PresenceStatus.BUSY:
    case PresenceStatus.DND:       return 'busy';
    default:                       return 'active';
  }
};

const initial = (name?: string | null) => (name?.trim().charAt(0) || '?').toLowerCase();

const AVATAR_COLORS = [
  '#4f46e5', '#7c3aed', '#c026d3', '#db2777',
  '#e11d48', '#dc2626', '#ea580c', '#d97706',
  '#059669', '#0d9488', '#0891b2', '#0284c7',
];

function getAvatarColor(name?: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ────────────────────────────────────────────────────────────────────────
   Iconos calm (line, 1.6 stroke)
   ──────────────────────────────────────────────────────────────────────── */

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const IconSearch    = () => <Icon size={14} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />;
const IconCalendar  = () => <Icon d="M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />;
const IconCamera    = () => <Icon d="M23 7l-7 5 7 5V7zM14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z" />;
const IconChevron   = () => <Icon size={14} d="M6 9l6 6 6-6" />;
const IconPlus      = () => <Icon size={14} d="M12 5v14M5 12h14" />;

/* ────────────────────────────────────────────────────────────────────────
   Props
   ──────────────────────────────────────────────────────────────────────── */

export interface ChatSidebarContentProps {
  grupos: ChatGroup[];
  miembrosEspacio: MiembroChatData[];
  unreadByChannel: Record<string, number>;
  grupoActivo: string | null;
  showCreateModal: boolean;
  showMeetingRooms: boolean;
  toastNotifications: ToastNotification[];
  showNotifications: boolean;

  setShowCreateModal: (show: boolean) => void;
  setShowMeetingRooms: (show: boolean) => void;
  handleChannelSelect: (id: string) => void;
  handleDeleteChannel: (grupoId: string, nombre: string) => Promise<void>;
  canDeleteChannel: (grupo: ChatGroup) => boolean;
  openDirectChat: (targetUser: MiembroChatData) => Promise<void>;
  refetchGrupos: () => Promise<ChatGroup[] | undefined>;
  dismissToast: (id: string) => void;
}

/* ────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────── */

export const ChatSidebarContent: React.FC<ChatSidebarContentProps> = ({
  grupos,
  miembrosEspacio,
  unreadByChannel,
  grupoActivo,
  showCreateModal,
  toastNotifications,
  showNotifications,
  setShowCreateModal,
  handleChannelSelect,
  handleDeleteChannel,
  canDeleteChannel,
  openDirectChat,
  refetchGrupos,
  dismissToast,
}) => {
  const { t } = useTranslation();
  const {
    currentUser,
    activeWorkspace,
    setActiveSubTab,
    theme,
    onlineUsers,
    userRoleInActiveWorkspace,
  } = useStore(useShallow(s => ({
    currentUser: s.currentUser,
    activeWorkspace: s.activeWorkspace,
    setActiveSubTab: s.setActiveSubTab,
    theme: s.theme,
    onlineUsers: s.onlineUsers,
    userRoleInActiveWorkspace: s.userRoleInActiveWorkspace,
  })));

  const [searchQuery, setSearchQuery] = useState('');

  // ── Datos derivados ──────────────────────────────────────────────────
  const canales = useMemo(
    () => grupos.filter(g => g.tipo !== 'directo'),
    [grupos],
  );

  const directos = useMemo(
    () => grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)),
    [grupos, currentUser.id],
  );

  const filteredCanales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return canales;
    return canales.filter(g => g.nombre.toLowerCase().includes(q));
  }, [canales, searchQuery]);

  const filteredDirectos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return directos;
    return directos.filter(g => {
      const otherId = g.nombre.split('|').find(id => id !== currentUser.id);
      const other = miembrosEspacio.find(m => m.id === otherId);
      return other?.nombre?.toLowerCase().includes(q);
    });
  }, [directos, searchQuery, miembrosEspacio, currentUser.id]);

  // ── Render ───────────────────────────────────────────────────────────
  const workspaceTitle =
    activeWorkspace?.name?.trim() || t('settings.category.workspace');

  return (
    <div className="ag-side h-full">
      <div
        className="ag-side__head ag-side__head--lite is-static"
        role="banner"
        aria-label={workspaceTitle}
      >
        <span className="ag-side__head-orbit" aria-hidden="true" />
        <div className="ag-side__head-ribbon" aria-hidden="true" />
        <div className="ag-side__head-meta">
          <div className="ag-side__head-title">{workspaceTitle}</div>
        </div>
      </div>

      {/* Búsqueda calm */}
      <div className="ag-side__search">
        <span className="ag-side__search-icon" aria-hidden="true"><IconSearch /></span>
        <input
          type="search"
          className="ag-side__search-input"
          placeholder="Buscar personas, canales..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Buscar"
        />
        <span className="ag-side__search-shortcut" aria-hidden="true">⌘K</span>
      </div>

      {/* Body scrollable */}
      <div className="ag-side__body">
        {/* MEETINGS */}
        <div className="ag-side__section">
          <h3 className="ag-side__section-title">Meetings</h3>
        </div>

        <button
          type="button"
          onClick={() => setActiveSubTab('calendar')}
          className="ag-side__item"
        >
          <span className="ag-side__item-icon" aria-hidden="true"><IconCalendar /></span>
          <span className="ag-side__item-label">Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('grabaciones')}
          className="ag-side__item"
        >
          <span className="ag-side__item-icon" aria-hidden="true"><IconCamera /></span>
          <span className="ag-side__item-label">Juntas</span>
          <span className="ag-side__item-meta">
            <span>3 hoy</span>
            <IconChevron />
          </span>
        </button>

        {/* CANALES */}
        <div className="ag-side__section">
          <h3 className="ag-side__section-title">Canales</h3>
          <button
            type="button"
            className="ag-side__section-add"
            onClick={(e) => { e.stopPropagation(); setShowCreateModal(true); }}
            title="Crear canal"
            aria-label="Crear canal"
          >
            <IconPlus />
          </button>
        </div>

        {filteredCanales.length === 0 ? (
          <p className="ag-side__empty">Sin canales</p>
        ) : (
          filteredCanales.map(g => {
            const unread = unreadByChannel[g.id] || 0;
            const active = grupoActivo === g.id;
            const muted = !active && unread === 0;
            return (
              <div key={g.id} className="group/channel relative">
                <button
                  type="button"
                  onClick={() => handleChannelSelect(g.id)}
                  className={`ag-side__item${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}`}
                >
                  <span className="ag-side__hash" aria-hidden="true">
                    {g.tipo === 'privado' ? '🔒' : '#'}
                  </span>
                  <span className="ag-side__item-label">{g.nombre}</span>
                  {unread > 0 && (
                    <span className="ag-side__badge" aria-label={`${unread} sin leer`}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
                {canDeleteChannel(g) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteChannel(g.id, g.nombre); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/channel:opacity-70 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--cw-error)' }}
                    title="Eliminar canal"
                    aria-label="Eliminar canal"
                  >
                    <Icon size={13} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* MENSAJES DIRECTOS */}
        <div className="ag-side__section">
          <h3 className="ag-side__section-title">Mensajes directos</h3>
        </div>

        {filteredDirectos.length === 0 && filteredCanales.length === 0 ? null : null}

        {/* Existing direct chats */}
        {filteredDirectos.map(g => {
          const unread = unreadByChannel[g.id] || 0;
          const otherId = g.nombre.split('|').find(id => id !== currentUser.id);
          const other = miembrosEspacio.find(m => m.id === otherId);
          const presence = onlineUsers.find(ou => ou.id === otherId);
          const isOnline = !!presence;
          const variant = presenceToVariant(presence?.status, isOnline);
          const active = grupoActivo === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => handleChannelSelect(g.id)}
              className={`ag-side__item${active ? ' is-active' : ''}${unread === 0 && !active ? ' is-muted' : ''}`}
            >
              <span
                className="ag-side__dm"
                aria-hidden="true"
                style={!other?.avatar_url ? { background: getAvatarColor(other?.nombre) } : undefined}
              >
                {other?.avatar_url ? (
                  <img src={other.avatar_url} alt="" className="ag-side__dm-img" />
                ) : (
                  initial(other?.nombre)
                )}
                <span className={`ag-side__dm-status is-${variant}`} />
              </span>
              <span className="ag-side__item-label">{other?.nombre || 'Usuario'}</span>
              {unread > 0 && (
                <span className="ag-side__badge" aria-label={`${unread} sin leer`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}

        {/* Otros miembros disponibles para iniciar DM */}
        {miembrosEspacio
          .filter(u => u.id !== currentUser.id)
          .filter(u => {
            const q = searchQuery.trim().toLowerCase();
            if (!q) return true;
            return u.nombre?.toLowerCase().includes(q);
          })
          .filter(u => !filteredDirectos.some(g => g.nombre.includes(u.id)))
          .map(u => {
            const presence = onlineUsers.find(ou => ou.id === u.id);
            const isOnline = !!presence;
            const variant = presenceToVariant(presence?.status, isOnline);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => openDirectChat(u)}
                className="ag-side__item is-muted"
              >
                <span
                  className="ag-side__dm"
                  aria-hidden="true"
                  style={!u.avatar_url ? { background: getAvatarColor(u.nombre) } : undefined}
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="ag-side__dm-img" />
                  ) : (
                    initial(u.nombre)
                  )}
                  <span className={`ag-side__dm-status is-${variant}`} />
                </span>
                <span className="ag-side__item-label">{u.nombre}</span>
              </button>
            );
          })}

        {filteredDirectos.length === 0 &&
          miembrosEspacio.filter(u => u.id !== currentUser.id).length === 0 && (
            <p className="ag-side__empty">No hay miembros disponibles</p>
          )}

        {/* Acción admin: invitar */}
        {userRoleInActiveWorkspace && !['member', 'miembro'].includes(userRoleInActiveWorkspace) && (
          <button
            type="button"
            onClick={() => setActiveSubTab('miembros')}
            className="ag-side__item"
            style={{ color: 'var(--cw-blue-600)', marginTop: 8 }}
          >
            <span className="ag-side__item-icon" aria-hidden="true"><IconPlus /></span>
            <span className="ag-side__item-label">{t('sidebar.invitePeople')}</span>
          </button>
        )}
      </div>

      {/* Modales / toasts */}
      {showCreateModal && (
        <ModalCrearGrupo
          onClose={() => setShowCreateModal(false)}
          onCreate={async () => {
            await refetchGrupos();
            setShowCreateModal(false);
          }}
        />
      )}

      {showNotifications && (
        <ChatToast
          notifications={toastNotifications}
          onDismiss={dismissToast}
          onOpen={handleChannelSelect}
          theme={theme}
        />
      )}
    </div>
  );
};
