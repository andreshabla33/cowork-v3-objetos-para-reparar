/**
 * @module components/chat/ChatSidebarContent
 * @description Sidebar channel/DM list for the chat panel.
 * Pure presentational — receives all data and callbacks via props.
 *
 * Clean Architecture: Presentation layer component.
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

const STATUS_BG: Record<string, string> = {
  [PresenceStatus.AVAILABLE]: '#3DCB7E',
  [PresenceStatus.BUSY]: '#F26B6B',
  [PresenceStatus.AWAY]: '#F5B638',
  [PresenceStatus.DND]: '#A78BFA',
};

const getStatusBg = (status?: PresenceStatus) => STATUS_BG[status ?? ''] ?? '#B8C2D0';

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

// ─── Sub-components ──────────────────────────────────────────────────────────

const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; isArcade: boolean }> = ({ children, action, isArcade }) => (
  <div className="flex justify-between items-center px-3 pt-4 pb-1.5">
    <span className={`text-[9.5px] font-bold uppercase tracking-[0.12em] ${isArcade ? 'text-[#00ff41]/60' : 'text-slate-400'}`}>{children}</span>
    {action}
  </div>
);

const SidebarRow: React.FC<{
  active?: boolean;
  isArcade: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  muted?: boolean;
}> = ({ active, isArcade, onClick, children, muted }) => (
  <button
    onClick={onClick}
    className={`w-full text-left flex items-center gap-2 px-3 py-[6px] rounded-lg text-[11.5px] font-medium transition-all duration-100 ${
      isArcade
        ? active ? 'bg-[#00ff41]/15 text-[#00ff41]' : 'text-[#00ff41]/50 hover:bg-[#00ff41]/10 hover:text-[#00ff41]'
        : active
          ? 'bg-sky-100 text-sky-800 font-semibold'
          : muted
            ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
    }`}
  >
    {children}
  </button>
);

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
  const isArcade = theme === 'arcade';

  return (
    <div className={`h-full flex flex-col overflow-hidden transition-all duration-300 ${isArcade ? 'bg-black' : 'bg-white'}`}>
      {/* Workspace switcher */}
      <div className={`px-4 py-3 border-b flex items-center gap-3 ${isArcade ? 'border-[#00ff41]/20' : 'border-[#E3EAF2]'}`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${isArcade ? 'bg-[#00ff41] text-black' : 'bg-gradient-to-br from-sky-400 to-sky-600'}`}>
          {(activeWorkspace?.name || 'W').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[12px] font-bold truncate ${isArcade ? 'text-[#00ff41]' : 'text-slate-800'}`}>{activeWorkspace?.name || 'Workspace'}</div>
          <div className={`text-[9px] ${isArcade ? 'text-[#00ff41]/50' : 'text-slate-400'}`}>Spatial World</div>
        </div>
        <svg className={`w-3.5 h-3.5 shrink-0 ${isArcade ? 'text-[#00ff41]/50' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#E3EAF2 transparent' }}>

        {/* Meetings / Calendar */}
        <SectionTitle isArcade={isArcade}>Meetings</SectionTitle>
        <SidebarRow isArcade={isArcade} onClick={() => setActiveSubTab('calendar')}>
          <svg className={`w-[14px] h-[14px] shrink-0 ${isArcade ? 'text-[#00ff41]/60' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Calendar</span>
        </SidebarRow>
        <SidebarRow isArcade={isArcade} active={showMeetingRooms} onClick={() => setShowMeetingRooms(!showMeetingRooms)}>
          <svg className={`w-[14px] h-[14px] shrink-0 ${isArcade ? 'text-[#00ff41]/60' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="flex-1">{t('sidebar.meetings')}</span>
          <svg className={`w-3 h-3 transition-transform shrink-0 ${showMeetingRooms ? 'rotate-180' : ''} ${isArcade ? 'text-[#00ff41]/50' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </SidebarRow>
        {showMeetingRooms && <MeetingRooms />}

        {/* Divider */}
        <div className={`h-px mx-2 my-2 ${isArcade ? 'bg-[#00ff41]/10' : 'bg-[#E3EAF2]'}`} />

        {/* Channels */}
        <SectionTitle
          isArcade={isArcade}
          action={
            <button
              onClick={(e) => { e.stopPropagation(); setShowCreateModal(true); }}
              className={`w-5 h-5 rounded-md flex items-center justify-center text-lg leading-none transition-all ${isArcade ? 'bg-[#00ff41] text-black' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              title="Crear Canal"
            >＋</button>
          }
        >
          {t('sidebar.channels')}
        </SectionTitle>
        <div className="space-y-0.5">
          {grupos.filter(g => g.tipo !== 'directo').map(g => {
            const unread = unreadByChannel[g.id] || 0;
            return (
              <div key={g.id} className="group/ch relative flex items-center">
                <SidebarRow
                  isArcade={isArcade}
                  active={grupoActivo === g.id}
                  muted={unread === 0 && grupoActivo !== g.id}
                  onClick={() => handleChannelSelect(g.id)}
                >
                  <span className={`text-[11px] font-bold w-4 shrink-0 ${isArcade ? 'text-[#00ff41]/60' : grupoActivo === g.id ? 'text-sky-500' : 'text-slate-400'}`}>
                    {g.tipo === 'privado' ? '🔒' : '#'}
                  </span>
                  <span className="flex-1 truncate">{g.nombre}</span>
                  {unread > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </SidebarRow>
                {canDeleteChannel(g) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChannel(g.id, g.nombre); }}
                    className="absolute right-2 opacity-0 group-hover/ch:opacity-60 hover:!opacity-100 p-1 rounded-lg hover:bg-red-50 text-red-400 transition-all"
                    title="Eliminar canal"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className={`h-px mx-2 my-2 ${isArcade ? 'bg-[#00ff41]/10' : 'bg-[#E3EAF2]'}`} />

        {/* Direct Messages */}
        <SectionTitle isArcade={isArcade}>{t('sidebar.directMessages')}</SectionTitle>
        <div className="space-y-0.5">
          {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).map(g => {
            const unread = unreadByChannel[g.id] || 0;
            const otherUserId = g.nombre.split('|').find((id: string) => id !== currentUser.id);
            const otherUser = miembrosEspacio.find((m) => m.id === otherUserId);
            const onlineMatch = onlineUsers.find(ou => ou.id === otherUserId);
            const isOnline = !!onlineMatch;
            return (
              <SidebarRow
                key={g.id}
                isArcade={isArcade}
                active={grupoActivo === g.id}
                muted={unread === 0 && grupoActivo !== g.id}
                onClick={() => handleChannelSelect(g.id)}
              >
                <div className="relative shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${isArcade ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'bg-sky-100 text-sky-700'}`}>
                    {otherUser?.nombre?.charAt(0) || '?'}
                  </div>
                  <span
                    className="absolute -bottom-px -right-px w-2 h-2 rounded-full border-2 border-white"
                    style={{ background: isOnline ? getStatusBg(onlineMatch?.status) : '#B8C2D0' }}
                  />
                </div>
                <span className="flex-1 truncate">{otherUser?.nombre || 'Usuario'}</span>
                {unread > 0 && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </SidebarRow>
            );
          })}
          {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).length === 0 && (
            <p className={`px-3 py-2 text-[10px] italic ${isArcade ? 'text-[#00ff41]/30' : 'text-slate-400'}`}>Sin mensajes directos</p>
          )}
        </div>

        {/* Divider */}
        <div className={`h-px mx-2 my-2 ${isArcade ? 'bg-[#00ff41]/10' : 'bg-[#E3EAF2]'}`} />

        {/* In the world */}
        <SectionTitle isArcade={isArcade}>
          In the world · {onlineUsers.length}
        </SectionTitle>
        <div className="space-y-0.5">
          {miembrosEspacio.filter(u => u.id !== currentUser.id).map(u => {
            const onlineMatch = onlineUsers.find(ou => ou.id === u.id);
            const isOnline = !!onlineMatch;
            return (
              <SidebarRow key={u.id} isArcade={isArcade} muted={!isOnline} onClick={() => openDirectChat(u)}>
                <div className="relative shrink-0">
                  <UserAvatar name={u.nombre || ''} profilePhoto={u.avatar_url ?? undefined} size="xs" />
                  <span
                    className="absolute -bottom-px -right-px w-2 h-2 rounded-full border-2 border-white"
                    style={{ background: isOnline ? getStatusBg(onlineMatch?.status) : '#B8C2D0' }}
                  />
                </div>
                <span className="flex-1 truncate">{u.nombre}</span>
              </SidebarRow>
            );
          })}
          {miembrosEspacio.filter(u => u.id !== currentUser.id).length === 0 && (
            <p className={`px-3 py-2 text-[10px] italic ${isArcade ? 'text-[#00ff41]/30' : 'text-slate-400'}`}>No hay otros miembros</p>
          )}
        </div>

        {/* Invite button */}
        {userRoleInActiveWorkspace && !['member', 'miembro'].includes(userRoleInActiveWorkspace) && (
          <button
            onClick={() => setActiveSubTab('miembros')}
            className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-semibold mt-2 transition-all ${isArcade ? 'text-[#00ff41] hover:bg-[#00ff41]/10' : 'text-sky-600 hover:bg-sky-50'}`}
          >
            <span className={`w-5 h-5 flex items-center justify-center rounded-md text-sm ${isArcade ? 'bg-[#00ff41]/20' : 'bg-sky-100'}`}>+</span>
            {t('sidebar.invitePeople')}
          </button>
        )}
      </div>

      {showCreateModal && (
        <ModalCrearGrupo
          onClose={() => setShowCreateModal(false)}
          onCreate={async () => { await refetchGrupos(); setShowCreateModal(false); }}
        />
      )}

      {showNotifications && (
        <ChatToast notifications={toastNotifications} onDismiss={dismissToast} onOpen={handleChannelSelect} theme={theme} />
      )}
    </div>
  );
};
