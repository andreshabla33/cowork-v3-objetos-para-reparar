/**
 * @module components/chat/ChatMembersPanel
 * @description Sliding panel showing channel members.
 * Pure presentational component — receives data and callbacks via props.
 *
 * Clean Architecture: Presentation layer component.
 * F5 refactor: extracted from ChatPanel monolith.
 */

import React from 'react';
import { useStore } from '@/store/useStore';
import { getThemeStyles } from '@/lib/theme';
import type { MiembroCanal } from '@/src/core/domain/ports/IChatRepository';

export interface ChatMembersPanelProps {
  showMembersPanel: boolean;
  channelMembers: MiembroCanal[];

  setShowMembersPanel: (show: boolean) => void;
  setShowAddMembers: (show: boolean) => void;
}

export const ChatMembersPanel: React.FC<ChatMembersPanelProps> = ({
  showMembersPanel,
  channelMembers,
  setShowMembersPanel,
  setShowAddMembers,
}) => {
  const { currentUser, theme, onlineUsers } = useStore();
  const s = getThemeStyles(theme);

  return (
    <div className={`fixed top-0 right-0 h-full w-[320px] backdrop-blur-xl border-l shadow-2xl z-50 transform transition-transform duration-300 ease-out ${s.surface} ${s.border} ${showMembersPanel ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${s.borderSubtle} ${s.surfaceMuted}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accentSurface}`}>
              <svg className={`w-4 h-4 ${s.accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </div>
            <div>
              <h3 className={`font-black text-[11px] uppercase tracking-widest ${s.text}`}>Miembros</h3>
              <p className={`text-[9px] ${s.textSubtle}`}>{channelMembers.length} en este canal</p>
            </div>
          </div>
          <button onClick={() => setShowMembersPanel(false)} className={`p-2 rounded-xl transition-all hover:rotate-90 duration-200 ${s.btnGhost}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {channelMembers.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-32 ${s.textSubtle}`}>
              <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              <p className="text-[10px] font-bold uppercase tracking-widest">Sin miembros</p>
            </div>
          ) : channelMembers.map((member) => {
            const isOnline = onlineUsers.some(ou => ou.id === member.usuario_id);
            const isMe = member.usuario_id === currentUser.id;
            return (
              <div key={member.usuario_id} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all group ${s.surfaceHover}`}>
                <div className="relative shrink-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black ${isMe ? `${s.accentSurface} ${s.accent}` : `${s.surfaceMuted} ${s.textMuted}`}`}>
                    {member.usuario?.nombre?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${theme === 'arcade' ? 'border-black' : 'border-white'} ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-bold truncate ${s.text}`}>{member.usuario?.nombre || 'Usuario'}</span>
                    {isMe && <span className={`text-[8px] font-bold uppercase ${s.textSubtle}`}>(tu)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.rol === 'admin' && (
                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${s.accentSurface} ${s.accent}`}>Admin</span>
                    )}
                    <span className={`text-[9px] ${isOnline ? s.success : s.textSubtle}`}>{isOnline ? 'En linea' : 'Desconectado'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t ${s.borderSubtle}`}>
          <button
            onClick={() => { setShowMembersPanel(false); setShowAddMembers(true); }}
            className={`w-full p-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${s.accentSurface} ${s.accent} ${s.accentBorder} hover:opacity-80`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            Agregar miembro
          </button>
        </div>
      </div>
    </div>
  );
};
