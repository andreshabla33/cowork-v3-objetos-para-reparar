/**
 * @module components/chat/ChatThreadPanel
 * @description Sliding thread panel for viewing and replying to message threads.
 * Pure presentational component — receives data and callbacks via props.
 *
 * Clean Architecture: Presentation layer component.
 * F5 refactor: extracted from ChatPanel monolith.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/useStore';
import { getThemeStyles } from '@/lib/theme';
import { MessageContent } from './MessageContent';
import type { ChatMessage } from '@/types';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';

export interface ChatThreadPanelProps {
  activeThread: string | null;
  threadMessages: ChatMessage[];
  nuevoMensaje: string;
  currentUserId: string;
  miembrosEspacio: MiembroChatData[];
  inputRef: React.RefObject<HTMLInputElement | null>;

  closeThread: () => void;
  enviarMensaje: (e: React.FormEvent) => Promise<void>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ChatThreadPanel: React.FC<ChatThreadPanelProps> = ({
  activeThread,
  threadMessages,
  nuevoMensaje,
  currentUserId,
  miembrosEspacio,
  inputRef,
  closeThread,
  enviarMensaje,
  handleInputChange,
}) => {
  const { t } = useTranslation();
  const { theme } = useStore();
  const s = getThemeStyles(theme);

  return (
    <>
      <div className={`fixed top-0 right-0 h-full w-[400px] backdrop-blur-xl border-l shadow-2xl z-50 transform transition-transform duration-300 ease-out ${s.surface} ${s.border} ${activeThread ? 'translate-x-0' : 'translate-x-full'}`}>
        {activeThread && (
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className={`p-4 border-b flex items-center justify-between ${s.borderSubtle} ${s.surfaceMuted}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accentSurface}`}>
                  <svg className={`w-4 h-4 ${s.accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                </div>
                <div>
                  <h3 className={`font-black text-[11px] uppercase tracking-widest ${s.text}`}>{t('chat.thread')}</h3>
                  <p className={`text-[9px] ${s.textSubtle}`}>{threadMessages.length} {threadMessages.length === 1 ? t('chat.message') : t('chat.messages')}</p>
                </div>
              </div>
              <button onClick={closeThread} className={`p-2 rounded-xl transition-all hover:rotate-90 duration-200 ${s.btnGhost}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {threadMessages.map((tm, idx) => (
                <div key={tm.id} className={`group ${idx === 0 ? `pb-4 mb-4 border-b ${s.borderSubtle}` : ''}`}>
                  <div className="flex gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0 ${idx === 0 ? `${s.accentSurface} ${s.accent} ring-2 ${s.accentBorder}` : `${s.surfaceMuted} ${s.textMuted}`}`}>
                      {tm.usuario?.nombre?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-bold text-[12px] ${s.text}`}>{tm.usuario?.nombre || 'Usuario'}</span>
                        <span className={`text-[9px] ${s.textSubtle}`}>{new Date(tm.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {idx === 0 && <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider ${s.accentSurface} ${s.accent}`}>{t('chat.original')}</span>}
                      </div>
                      <MessageContent content={tm.contenido} currentUserId={currentUserId} miembrosEspacio={miembrosEspacio} className={`text-[13px] leading-relaxed break-words ${s.text}`} />
                    </div>
                  </div>
                </div>
              ))}

              {threadMessages.length === 1 && (
                <div className={`text-center py-8 ${s.textSubtle}`}>
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  <p className="text-[11px] font-medium">{t('chat.beFirstToReply')}</p>
                </div>
              )}
            </div>

            {/* Input */}
            <div className={`p-4 border-t ${s.borderSubtle} ${s.surfaceMuted}`}>
              <form onSubmit={enviarMensaje}>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={nuevoMensaje}
                    onChange={handleInputChange}
                    placeholder={t('chat.replyInThread')}
                    className={`flex-1 rounded-xl px-4 py-3 text-[13px] transition-all ${s.input}`}
                  />
                  <button
                    type="submit"
                    disabled={!nuevoMensaje.trim()}
                    className={`px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-30 transition-all ${s.accentBg}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {activeThread && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={closeThread} />
      )}
    </>
  );
};
