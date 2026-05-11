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
import { MessageContent } from './MessageContent';
import type { ChatMessage } from '@/types';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';

// ─── Props ───────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

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

  return (
    <>
      <div className={`fixed top-0 right-0 h-full w-[400px] bg-white/95 backdrop-blur-xl border-l border-[var(--cw-glass-border)] shadow-2xl z-50 transform transition-transform duration-300 ease-out ${activeThread ? 'translate-x-0' : 'translate-x-full'}`}>
        {activeThread && (
          <div className="h-full flex flex-col">
            {/* Thread header */}
            <div className="p-4 border-b border-[var(--cw-glass-border)] flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[var(--cw-blue-500)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                </div>
                <div>
                  <h3 className="font-bold text-[12px] text-[var(--cw-ink-900)]">{t('chat.thread')}</h3>
                  <p className="text-[9px] text-[var(--cw-ink-400)]">{threadMessages.length} {threadMessages.length === 1 ? t('chat.message') : t('chat.messages')}</p>
                </div>
              </div>
              <button onClick={closeThread} className="p-2 hover:bg-blue-50 rounded-xl transition-all text-[var(--cw-ink-400)] hover:text-[var(--cw-ink-700)]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[var(--cw-page-bg)]">
              {threadMessages.map((tm, idx) => (
                <div key={tm.id} className={`group ${idx === 0 ? 'pb-4 mb-4 border-b border-[var(--cw-glass-border)]' : ''}`}>
                  <div className="flex gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0 ${idx === 0 ? 'bg-blue-100 text-[var(--cw-blue-600)] ring-2 ring-blue-200' : 'bg-white text-[var(--cw-ink-500)] border border-[var(--cw-glass-border)]'}`}>
                      {tm.usuario?.nombre?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[12px] text-[var(--cw-ink-900)]">{tm.usuario?.nombre || 'Usuario'}</span>
                        <span className="text-[9px] text-[var(--cw-ink-400)]">{new Date(tm.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {idx === 0 && <span className="text-[8px] px-2 py-0.5 bg-blue-100 text-[var(--cw-blue-600)] rounded-full font-medium">{t('chat.original')}</span>}
                      </div>
                      <MessageContent content={tm.contenido} currentUserId={currentUserId} miembrosEspacio={miembrosEspacio} className="text-[13px] leading-relaxed break-words text-[var(--cw-ink-700)]" />
                    </div>
                  </div>
                </div>
              ))}

              {threadMessages.length === 1 && (
                <div className="text-center py-8 text-[var(--cw-ink-400)]">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  <p className="text-[11px] font-medium">{t('chat.beFirstToReply')}</p>
                </div>
              )}
            </div>

            {/* Thread input */}
            <div className="p-4 border-t border-[var(--cw-glass-border)] bg-white/70">
              <form onSubmit={enviarMensaje}>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={nuevoMensaje}
                    onChange={handleInputChange}
                    placeholder={t('chat.replyInThread')}
                    className="flex-1 bg-white/80 border border-[var(--cw-glass-border)] rounded-xl px-4 py-3 text-[13px] text-[var(--cw-ink-700)] focus:outline-none focus:border-[var(--cw-blue-400)] focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-[var(--cw-ink-400)]"
                  />
                  <button
                    type="submit"
                    disabled={!nuevoMensaje.trim()}
                    className="px-5 py-3 bg-[var(--cw-blue-500)] hover:bg-[var(--cw-blue-600)] text-white rounded-xl text-[11px] font-bold disabled:opacity-20 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Overlay to close thread */}
      {activeThread && (
        <div className="fixed inset-0 bg-[var(--cw-ink-900)]/20 backdrop-blur-sm z-40" onClick={closeThread} />
      )}
    </>
  );
};
