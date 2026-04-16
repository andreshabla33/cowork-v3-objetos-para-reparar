/**
 * @module components/chat/ChatSidebarContent
 * @description Sidebar channel/DM list for the chat panel.
 * Pure presentational — receives all data and callbacks via props.
 *
 * Clean Architecture: Presentation layer component.
 * F5 refactor: extracted from ChatPanel monolith.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/useStore';
import { ModalCrearGrupo } from './ModalCrearGrupo';
import { ChatToast } from '../ChatToast';
import { MeetingRooms } from '../MeetingRooms';
import { UserAvatar } from '../UserAvatar';
import { PresenceStatus } from '@/types';
import type { ChatGroup } from '@/types';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';
import type { ToastNotification } from '@/components/ChatToast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getStatusColor = (status?: PresenceStatus) => {
  switch (status) {
    case PresenceStatus.AVAILABLE: return 'bg-green-500';
    case PresenceStatus.BUSY: return 'bg-red-500';
    case PresenceStatus.AWAY: return 'bg-yellow-500';
    case PresenceStatus.DND: return 'bg-purple-500';
    default: return 'bg-zinc-500';
  }
};

// ─── Props ───────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export const ChatSidebarContent: React.FC<ChatSidebarContentProps> = ({
  grupos,
  miembrosEspacio,
  unreadByChannel,
  grupoActivo,
  showCreateModal,
  showMeetingRooms,
  toastNotifications,
  showNotifications,
  setShowCreateModal,
  setShowMeetingRooms,
  handleChannelSelect,
  handleDeleteChannel,
  canDeleteChannel,
  openDirectChat,
  refetchGrupos,
  dismissToast,
}) => {
  const { t } = useTranslation();
  const { activeWorkspace, currentUser, setActiveSubTab, theme, onlineUsers, userRoleInActiveWorkspace } = useStore();

  const s = { activeItem: 'bg-indigo-500/20 text-indigo-400 opacity-100', sidebarBg: 'bg-[#0d0d15]' };

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all duration-500 ${s.sidebarBg}`}>
      {/* Workspace Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors group">
        <h2 className={`font-black text-xs uppercase tracking-tight truncate ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{activeWorkspace?.name || 'Workspace'}</h2>
        <svg className="w-4 h-4 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Navigation: Meetings, Calendar */}
        <div className="px-2 py-4 space-y-0.5">
          <button
            onClick={() => setShowMeetingRooms(!showMeetingRooms)}
            className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${showMeetingRooms ? s.activeItem : 'hover:bg-white/5'}`}
          >
            <span className="w-4 text-center opacity-60">🎧</span>
            <span className="truncate">{t('sidebar.meetings')}</span>
            <svg className={`w-3 h-3 ml-auto opacity-50 transition-transform ${showMeetingRooms ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMeetingRooms && <MeetingRooms />}
          <button
            onClick={() => setActiveSubTab('calendar')}
            className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${true ? s.activeItem : 'hover:bg-white/5'}`}
          >
            <span className="w-4 text-center opacity-60">📅</span>
            <span className="truncate">{t('sidebar.calendar')}</span>
            <svg className="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-white/5 mx-4 my-2" />

        {/* Channels */}
        <div className="px-2 py-4">
          <div className="px-3 mb-2 group flex items-center justify-between">
            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{t('sidebar.channels')}</h3>
            <button
              onClick={(e) => { e.stopPropagation(); setShowCreateModal(true); }}
              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${theme === 'arcade' ? 'bg-[#00ff41] text-black shadow-[0_0_10px_#00ff41]' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              title="Crear Canal"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
          <div className="space-y-0.5">
            {grupos.filter(g => g.tipo !== 'directo').map(g => {
              const unreadCount = unreadByChannel[g.id] || 0;
              return (
              <div key={g.id} className="group/channel relative flex items-center">
                <button
                  onClick={() => handleChannelSelect(g.id)}
                  className={`w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${grupoActivo === g.id ? s.activeItem : (unreadCount > 0 ? 'opacity-100 bg-white/5' : 'opacity-50 hover:opacity-100 hover:bg-white/5')}`}
                >
                  <span className="opacity-40">{g.tipo === 'privado' ? '🔒' : '#'}</span>
                  <span className="truncate flex-1">{g.nombre}</span>
                  {unreadCount > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {canDeleteChannel(g) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChannel(g.id, g.nombre); }}
                    className="absolute right-2 opacity-0 group-hover/channel:opacity-60 hover:!opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
                    title="Eliminar canal"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                )}
              </div>
            );})}
          </div>
        </div>

        <div className="h-px bg-white/5 mx-4 my-2" />

        {/* Direct Messages */}
        <div className="px-2 py-4">
          <div className="px-3 mb-2">
            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{t('sidebar.directMessages')}</h3>
          </div>
          <div className="space-y-0.5">
            {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).map(g => {
              const unreadCount = unreadByChannel[g.id] || 0;
              const otherUserId = g.nombre.split('|').find((id: string) => id !== currentUser.id);
              const otherUser = miembrosEspacio.find((m) => m.id === otherUserId);
              const isOnline = onlineUsers.some(ou => ou.id === otherUserId);
              return (
              <button
                key={g.id}
                onClick={() => handleChannelSelect(g.id)}
                className={`w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${grupoActivo === g.id ? s.activeItem : (unreadCount > 0 ? 'opacity-100 bg-white/5' : 'opacity-50 hover:opacity-100 hover:bg-white/5')}`}
              >
                <div className="relative">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[8px] font-black">{otherUser?.nombre?.charAt(0) || '?'}</div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#19171d] ${isOnline ? getStatusColor(onlineUsers.find(ou => ou.id === otherUserId)?.status) : 'bg-zinc-500'}`} />
                </div>
                <span className="truncate flex-1">{otherUser?.nombre || 'Usuario'}</span>
                {unreadCount > 0 && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            );})}
            {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).length === 0 && (
              <p className="px-4 py-2 text-[9px] opacity-30 italic font-bold">Sin mensajes directos</p>
            )}
          </div>
        </div>

        <div className="h-px bg-white/5 mx-4 my-2" />

        {/* Online Members */}
        <div className="px-2 py-4">
          <div className="px-3 mb-2">
            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>CONECTADOS ({onlineUsers.length})</h3>
          </div>
          <div className="space-y-0.5">
            {miembrosEspacio.filter((u) => u.id !== currentUser.id).length > 0 ? miembrosEspacio.filter((u) => u.id !== currentUser.id).map((u) => {
              const isOnline = onlineUsers.some(ou => ou.id === u.id);
              return (
              <button
                key={u.id}
                onClick={() => { openDirectChat(u); }}
                className="w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-white/5 transition-all flex items-center gap-3 cursor-pointer opacity-50 hover:opacity-100"
              >
                <UserAvatar
                  name={u.nombre || ''}
                  profilePhoto={u.avatar_url ?? undefined}
                  size="xs"
                  showStatus
                  status={isOnline ? onlineUsers.find(ou => ou.id === u.id)?.status : undefined}
                />
                <span className="truncate flex-1">{u.nombre}</span>
              </button>
            );}) : (
               <p className="px-4 py-2 text-[9px] opacity-30 italic font-bold">No hay otros miembros</p>
            )}
            {userRoleInActiveWorkspace && !['member', 'miembro'].includes(userRoleInActiveWorkspace) && (
              <button
                onClick={() => setActiveSubTab('miembros')}
                className="w-full text-left px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-3 mt-2"
              >
                <span className="w-5 h-5 flex items-center justify-center bg-indigo-500/20 rounded-lg text-lg">+</span>
                {t('sidebar.invitePeople')}
              </button>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && <ModalCrearGrupo
        onClose={() => setShowCreateModal(false)}
        onCreate={async () => {
          await refetchGrupos();
          setShowCreateModal(false);
        }}
      />}

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
