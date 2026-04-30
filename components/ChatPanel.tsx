/**
 * @module components/ChatPanel
 * @description Orchestrator component for the chat system.
 * Composes sub-components: ChatSidebarContent, ChatThreadPanel,
 * ChatMembersPanel, and the inline message area.
 *
 * Clean Architecture: Presentation layer — composition only.
 * F5 refactor: reduced from 677-line monolith to thin orchestrator.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useChatPanel } from '../hooks/chat/useChatPanel';
import { ChatSidebarContent } from './chat/ChatSidebarContent';
import { ChatThreadPanel } from './chat/ChatThreadPanel';
import { ChatMembersPanel } from './chat/ChatMembersPanel';
import { MessageContent } from './chat/MessageContent';
import { AgregarMiembros } from './chat/AgregarMiembros';
import { ChatToast } from './ChatToast';
import { UserAvatar } from './UserAvatar';
import type { ChatGroup } from '../types';
import { useStore } from '../store/useStore';

// ─── Constants ───────────────────────────────────────────────────────────────

const chatStyles = {
  chatBg: 'bg-[var(--cw-page-bg)]',
  input: 'bg-white/70 border-[var(--cw-glass-border)]',
  btn: 'bg-[var(--cw-blue-500)] hover:bg-[var(--cw-blue-600)] text-white',
};

const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '✨', '😍', '🤔', '😎', '🚀', '💯'];

// ─── Props ───────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  sidebarOnly?: boolean;
  chatOnly?: boolean;
  onChannelSelect?: () => void;
  showNotifications?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ChatPanel: React.FC<ChatPanelProps> = ({
  sidebarOnly = false,
  chatOnly = false,
  onChannelSelect,
  showNotifications = false,
}) => {
  const { t } = useTranslation();
  const { activeWorkspace, currentUser, theme, onlineUsers } = useStore();

  const hook = useChatPanel({ sidebarOnly, chatOnly, showNotifications, onChannelSelect });

  const grupoActivo = hook.grupoActivo;
  const grupoActivoData = hook.grupos.find((g: ChatGroup) => g.id === grupoActivo);

  const filteredMentionUsers = hook.miembrosEspacio.filter(
    (u) => u.id !== currentUser.id && u.nombre?.toLowerCase().includes(hook.mentionFilter),
  );

  const s = chatStyles;

  // ── Sidebar-only mode ──────────────────────────────────────────────────

  if (sidebarOnly) {
    return (
      <ChatSidebarContent
        grupos={hook.grupos}
        miembrosEspacio={hook.miembrosEspacio}
        unreadByChannel={hook.unreadByChannel}
        grupoActivo={grupoActivo ?? null}
        showCreateModal={hook.showCreateModal}
        showMeetingRooms={hook.showMeetingRooms}
        toastNotifications={hook.toastNotifications}
        showNotifications={showNotifications}
        setShowCreateModal={hook.setShowCreateModal}
        setShowMeetingRooms={hook.setShowMeetingRooms}
        handleChannelSelect={hook.handleChannelSelect}
        handleDeleteChannel={hook.handleDeleteChannel}
        canDeleteChannel={hook.canDeleteChannel}
        openDirectChat={hook.openDirectChat}
        refetchGrupos={hook.refetchGrupos}
        dismissToast={hook.dismissToast}
      />
    );
  }

  // ── Full chat mode ─────────────────────────────────────────────────────

  return (
    <div className={`h-full flex flex-col transition-all duration-500 overflow-hidden ${s.chatBg}`}>
      {/* Channel header */}
      <div className="px-6 py-4 border-b border-[var(--cw-glass-border)] flex items-center justify-between shrink-0 bg-white/60 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xl opacity-60">
            {grupoActivoData?.tipo === 'directo' ? '💬' : (grupoActivoData?.tipo === 'privado' ? '🔒' : '#')}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-[var(--cw-ink-900)] truncate">
              {grupoActivoData?.tipo === 'directo'
                ? hook.miembrosEspacio.find((m) => grupoActivoData?.nombre.includes(m.id) && m.id !== currentUser.id)?.nombre || 'Chat Directo'
                : (grupoActivoData?.nombre || 'General')
              }
            </h3>
            <p className="text-[10px] text-[var(--cw-ink-400)]">
              {grupoActivoData?.tipo === 'directo'
                ? t('chat.directMessage')
                : grupoActivoData?.tipo === 'privado'
                  ? `Canal privado · ${hook.channelMembers.length} miembro${hook.channelMembers.length !== 1 ? 's' : ''}`
                  : `Canal · ${hook.channelMembers.length} miembro${hook.channelMembers.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {grupoActivoData?.tipo !== 'directo' && (
            <button
              onClick={() => hook.setShowMembersPanel(!hook.showMembersPanel)}
              className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 ${hook.showMembersPanel ? 'bg-blue-50 text-[var(--cw-blue-600)]' : 'bg-white/60 hover:bg-blue-50 text-[var(--cw-ink-500)]'}`}
              title="Ver miembros"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              <span className="text-[10px] font-bold">{hook.channelMembers.length}</span>
            </button>
          )}
          <button
            onClick={() => hook.setShowAddMembers(true)}
            className="p-2.5 rounded-xl transition-all flex items-center gap-1.5 group bg-[var(--cw-blue-500)] text-white hover:bg-[var(--cw-blue-600)]"
            title="Agregar miembros"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={hook.mensajesRef} className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        {hook.mensajes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
            <span className="text-6xl mb-4">💬</span>
            <p className="font-black uppercase tracking-[0.3em] text-[10px]">{t('chat.noMessages')}</p>
          </div>
        ) : hook.mensajes.map((m, idx) => {
          const prevMsg = hook.mensajes[idx - 1];
          const sameUser = prevMsg?.usuario_id === m.usuario_id;
          const timeDiff = prevMsg ? (new Date(m.creado_en).getTime() - new Date(prevMsg.creado_en).getTime()) / 60000 : Infinity;
          const showHeader = !sameUser || timeDiff > 5;

          return (
            <div key={m.id} className={`group hover:bg-blue-50/50 px-4 py-1 -mx-4 rounded-lg transition-colors ${showHeader ? 'mt-4' : 'mt-0.5'}`}>
              <div className="flex gap-3">
                {showHeader ? (
                  <div className="shrink-0">
                    <UserAvatar
                      name={m.usuario?.nombre || ''}
                      profilePhoto={(m.usuario_id === currentUser.id ? currentUser.profilePhoto : hook.miembrosEspacio.find((u) => u.id === m.usuario_id)?.avatar_url) ?? undefined}
                      size="sm"
                    />
                  </div>
                ) : (
                  <div className="w-9 shrink-0 flex items-center justify-center">
                    <span className="text-[9px] opacity-0 group-hover:opacity-50 text-[var(--cw-ink-400)] font-mono transition-opacity">
                      {new Date(m.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className={`text-[13px] font-bold ${m.usuario_id === currentUser.id ? 'text-[var(--cw-blue-600)]' : 'text-[var(--cw-ink-900)]'}`}>
                        {m.usuario?.nombre}
                      </span>
                      <span className="text-[10px] text-[var(--cw-ink-400)]">
                        {new Date(m.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  {m.tipo === 'archivo' && m.contenido.includes('](') ? (() => {
                    const match = m.contenido.match(/📎 \[(.+?)\]\((.+?)\)/);
                    if (match) {
                      const [, fileName, fileUrl] = match;
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                      return (
                        <div className="mt-1">
                          {isImage ? (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={fileUrl} alt={fileName} className="max-w-[300px] max-h-[200px] rounded-lg border border-[var(--cw-glass-border)] hover:border-[var(--cw-blue-400)] transition-colors cursor-pointer" />
                              <span className="text-[11px] text-[var(--cw-ink-400)] mt-1 block">{fileName}</span>
                            </a>
                          ) : (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg bg-white/70 border border-[var(--cw-glass-border)] hover:border-[var(--cw-blue-400)] hover:bg-blue-50/50 transition-all group max-w-[300px]">
                              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-[var(--cw-blue-500)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-[var(--cw-ink-700)] truncate group-hover:text-[var(--cw-blue-600)] transition-colors">{fileName}</p>
                                <p className="text-[10px] text-[var(--cw-ink-400)]">Clic para descargar</p>
                              </div>
                            </a>
                          )}
                        </div>
                      );
                    }
                    return <MessageContent content={m.contenido} currentUserId={currentUser.id} miembrosEspacio={hook.miembrosEspacio} />;
                  })() : (
                    <MessageContent content={m.contenido} currentUserId={currentUser.id} miembrosEspacio={hook.miembrosEspacio} />
                  )}

                  {/* Thread button */}
                  <button
                    onClick={() => hook.openThread(m.id)}
                    className={`mt-2 flex items-center gap-1 text-[10px] transition-opacity ${hook.threadCounts[m.id] ? 'opacity-80 text-indigo-400' : 'opacity-40 hover:opacity-100'}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    <span>{hook.threadCounts[m.id] ? `${hook.threadCounts[m.id]} ${hook.threadCounts[m.id] === 1 ? 'respuesta' : 'respuestas'}` : 'Responder en hilo'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input area */}
      <div className="px-6 pb-6 pt-2 shrink-0">
        {hook.typingUsers.length > 0 && (
          <div className="px-2 py-1 mb-2 text-[11px] opacity-50 italic flex items-center gap-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>{hook.typingUsers.join(', ')} {hook.typingUsers.length === 1 ? t('state.typingSingular') : t('state.typingPlural')}</span>
          </div>
        )}

        {hook.showMentionPicker && filteredMentionUsers.length > 0 && (
          <div className="mb-2 p-2 rounded-xl bg-white/90 border border-[var(--cw-glass-border)] backdrop-blur-xl max-h-40 overflow-y-auto shadow-lg">
            <p className="text-[9px] uppercase tracking-widest text-[var(--cw-ink-400)] px-2 mb-2">{t('chat.mention')}</p>
            {filteredMentionUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => hook.insertMention(user)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-3"
              >
                <UserAvatar name={user.nombre || ''} profilePhoto={user.avatar_url ?? undefined} size="xs" />
                <span className="text-[13px] font-medium text-[var(--cw-ink-700)]">@{user.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {hook.activeThread && (
          <div className="mb-2 p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
              <span className="text-[12px] text-indigo-300">{t('chat.replyingInThread')}</span>
            </div>
            <button onClick={hook.closeThread} className="text-[10px] opacity-60 hover:opacity-100">✕ {t('action.close')}</button>
          </div>
        )}

        {hook.showEmojiPicker && (
          <div className="mb-2 p-2 rounded-xl bg-white/90 border border-[var(--cw-glass-border)] backdrop-blur-lg flex flex-wrap gap-1 shadow-lg">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { hook.setNuevoMensaje((prev) => prev + emoji); hook.setShowEmojiPicker(false); }}
                className="w-8 h-8 hover:bg-blue-50 rounded-lg transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={hook.enviarMensaje} className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all focus-within:border-[var(--cw-blue-400)] focus-within:ring-2 focus-within:ring-blue-100 ${s.input}`}>
          <input type="file" ref={hook.fileInputRef} onChange={hook.handleFileAttach} className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" />
          <button type="button" onClick={() => hook.fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-blue-50 transition-colors text-[var(--cw-ink-400)] hover:text-[var(--cw-blue-500)]" title="Adjuntar archivo">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          </button>
          <input
            ref={hook.inputRef}
            type="text"
            value={hook.nuevoMensaje}
            onChange={hook.handleInputChange}
            placeholder={hook.activeThread
              ? t('chat.replyInThread')
              : (grupoActivoData?.tipo === 'directo'
                ? `${t('chat.messageTo')} ${hook.miembrosEspacio.find((m) => grupoActivoData?.nombre.includes(m.id) && m.id !== currentUser.id)?.nombre || t('chat.user')}`
                : `${t('chat.messageIn')} #${grupoActivoData?.nombre || t('chat.channel')}`)}
            className="flex-1 bg-transparent border-none text-[14px] text-[var(--cw-ink-700)] focus:outline-none py-2 placeholder:text-[var(--cw-ink-400)]"
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => hook.setShowEmojiPicker(!hook.showEmojiPicker)} className={`p-2 rounded-lg hover:bg-blue-50 transition-colors ${hook.showEmojiPicker ? 'text-[var(--cw-blue-500)] bg-blue-50' : 'text-[var(--cw-ink-400)]'}`} title="Emojis">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
            <button
              type="submit"
              disabled={!hook.nuevoMensaje.trim()}
              className={`p-2 rounded-lg disabled:opacity-20 transition-all ${hook.nuevoMensaje.trim() ? s.btn : 'opacity-30'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
          </div>
        </form>
      </div>

      {/* Add members modal */}
      {hook.showAddMembers && grupoActivo && (
        <AgregarMiembros
          grupoId={grupoActivo}
          espacioId={activeWorkspace!.id}
          onClose={() => {
            hook.setShowAddMembers(false);
            hook.refetchGrupos();
          }}
        />
      )}

      {/* Members panel */}
      <ChatMembersPanel
        showMembersPanel={hook.showMembersPanel}
        channelMembers={hook.channelMembers}
        setShowMembersPanel={hook.setShowMembersPanel}
        setShowAddMembers={hook.setShowAddMembers}
      />

      {/* Thread panel */}
      <ChatThreadPanel
        activeThread={hook.activeThread}
        threadMessages={hook.threadMessages}
        nuevoMensaje={hook.nuevoMensaje}
        currentUserId={currentUser.id}
        miembrosEspacio={hook.miembrosEspacio}
        inputRef={hook.inputRef}
        closeThread={hook.closeThread}
        enviarMensaje={hook.enviarMensaje}
        handleInputChange={hook.handleInputChange}
      />

      {/* Toast Notifications */}
      {showNotifications && (
        <ChatToast
          notifications={hook.toastNotifications}
          onDismiss={hook.dismissToast}
          onOpen={hook.handleChannelSelect}
          theme={theme}
        />
      )}
    </div>
  );
};
