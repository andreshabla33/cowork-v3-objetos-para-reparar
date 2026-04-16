/**
 * @module hooks/chat/useChatPanel
 * @description Orchestrator hook that composes focused sub-hooks for the ChatPanel.
 * This is the single entry point for all chat state and actions in the Presentation layer.
 *
 * Clean Architecture: Presentation layer — composition root for chat hooks.
 * Zero business logic here — all logic lives in sub-hooks or Application use cases.
 *
 * F4 refactor: reduced from 900-line monolith to thin orchestrator.
 * Sub-hooks: useChatChannels, useChatMessages, useChatNotifications, useChatTyping, useChatMentions.
 */

import { useState, useCallback } from 'react';
import type { ChatGroup, ChatMessage } from '@/types';
import type {
  MiembroChatData,
  MiembroCanal,
} from '@/src/core/domain/ports/IChatRepository';
import type { ToastNotification } from '@/components/ChatToast';

import { useChatChannels } from './useChatChannels';
import { useChatMessages } from './useChatMessages';
import { useChatNotifications } from './useChatNotifications';
import { useChatTyping } from './useChatTyping';
import { useChatMentions } from './useChatMentions';

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Props for useChatPanel hook.
 */
export interface UseChatPanelProps {
  sidebarOnly?: boolean;
  chatOnly?: boolean;
  showNotifications?: boolean;
  onChannelSelect?: () => void;
}

// ─── Return type ─────────────────────────────────────────────────────────────

/**
 * Return type for useChatPanel hook.
 */
export interface UseChatPanelReturn {
  // State
  grupos: ChatGroup[];
  mensajes: ChatMessage[];
  nuevoMensaje: string;
  loading: boolean;
  showCreateModal: boolean;
  showAddMembers: boolean;
  miembrosEspacio: MiembroChatData[];
  unreadByChannel: Record<string, number>;
  typingUsers: string[];
  showEmojiPicker: boolean;
  toastNotifications: ToastNotification[];
  showMentionPicker: boolean;
  mentionFilter: string;
  activeThread: string | null;
  threadMessages: ChatMessage[];
  threadCounts: Record<string, number>;
  showMeetingRooms: boolean;
  showMembersPanel: boolean;
  channelMembers: MiembroCanal[];

  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  mensajesRef: React.RefObject<HTMLDivElement | null>;

  // State setters
  setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>;
  setShowCreateModal: (show: boolean) => void;
  setShowAddMembers: (show: boolean) => void;
  setShowEmojiPicker: (show: boolean) => void;
  setShowMeetingRooms: (show: boolean) => void;
  setShowMembersPanel: (show: boolean) => void;
  setMentionFilter: (filter: string) => void;

  // Actions
  refetchGrupos: () => Promise<ChatGroup[] | undefined>;
  handleChannelSelect: (id: string) => void;
  enviarMensaje: (e: React.FormEvent) => Promise<void>;
  handleTyping: () => void;
  openThread: (messageId: string) => Promise<void>;
  closeThread: () => void;
  handleDeleteChannel: (grupoId: string, nombre: string) => Promise<void>;
  canDeleteChannel: (grupo: ChatGroup) => boolean;
  openDirectChat: (targetUser: MiembroChatData) => Promise<void>;
  handleFileAttach: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  addToastNotification: (
    userName: string,
    message: string,
    groupId: string,
    channelName?: string,
    isDirect?: boolean,
  ) => void;
  dismissToast: (id: string) => void;
  insertMention: (user: MiembroChatData) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  detectMentions: (text: string) => string[];
}

// ─── Orchestrator Hook ───────────────────────────────────────────────────────

/**
 * Orchestrator hook for ChatPanel.
 * Composes focused sub-hooks and provides a unified interface to the component layer.
 */
export function useChatPanel({
  sidebarOnly = false,
  chatOnly = false,
  showNotifications = false,
  onChannelSelect,
}: UseChatPanelProps): UseChatPanelReturn {
  // ── Sub-hooks ────────────────────────────────────────────────────────────

  const channels = useChatChannels({ onChannelSelect });

  const mentions = useChatMentions({ miembrosEspacio: channels.miembrosEspacio });

  const messages = useChatMessages({
    grupoActivo: channels.grupoActivo,
    sidebarOnly,
    detectMentions: mentions.detectMentions,
  });

  const notifications = useChatNotifications({ showNotifications });

  const typing = useChatTyping({
    grupoActivo: channels.grupoActivo,
    sidebarOnly,
  });

  // ── Local UI state (emoji picker — presentation only) ──────────────────

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ── Wrapped callbacks that bridge sub-hooks ────────────────────────────

  /**
   * Channel selection clears unread count for the channel.
   */
  const handleChannelSelect = useCallback(
    (id: string) => {
      channels.handleChannelSelect(id);
      notifications.clearUnreadForChannel(id);
    },
    [channels.handleChannelSelect, notifications.clearUnreadForChannel],
  );

  /**
   * Wrap mention insertMention to bind refs from messages hook.
   */
  const insertMention = useCallback(
    (user: MiembroChatData) => {
      mentions.insertMention(user, messages.setNuevoMensaje, messages.inputRef);
    },
    [mentions.insertMention, messages.setNuevoMensaje, messages.inputRef],
  );

  /**
   * Wrap handleInputChange to bind state setter and typing handler.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      mentions.handleInputChange(e, messages.setNuevoMensaje, typing.handleTyping);
    },
    [mentions.handleInputChange, messages.setNuevoMensaje, typing.handleTyping],
  );

  // ── Unified return ─────────────────────────────────────────────────────

  return {
    // State — channels
    grupos: channels.grupos,
    loading: channels.loading,
    showCreateModal: channels.showCreateModal,
    showAddMembers: channels.showAddMembers,
    miembrosEspacio: channels.miembrosEspacio,
    showMeetingRooms: channels.showMeetingRooms,
    showMembersPanel: channels.showMembersPanel,
    channelMembers: channels.channelMembers,

    // State — messages
    mensajes: messages.mensajes,
    nuevoMensaje: messages.nuevoMensaje,
    activeThread: messages.activeThread,
    threadMessages: messages.threadMessages,
    threadCounts: messages.threadCounts,

    // State — notifications
    unreadByChannel: notifications.unreadByChannel,
    toastNotifications: notifications.toastNotifications,

    // State — typing
    typingUsers: typing.typingUsers,

    // State — mentions
    showMentionPicker: mentions.showMentionPicker,
    mentionFilter: mentions.mentionFilter,

    // State — local UI
    showEmojiPicker,

    // Refs
    fileInputRef: messages.fileInputRef,
    inputRef: messages.inputRef,
    mensajesRef: messages.mensajesRef,

    // State setters
    setNuevoMensaje: messages.setNuevoMensaje,
    setShowCreateModal: channels.setShowCreateModal,
    setShowAddMembers: channels.setShowAddMembers,
    setShowEmojiPicker,
    setShowMeetingRooms: channels.setShowMeetingRooms,
    setShowMembersPanel: channels.setShowMembersPanel,
    setMentionFilter: mentions.setMentionFilter,

    // Actions
    refetchGrupos: channels.refetchGrupos,
    handleChannelSelect,
    enviarMensaje: messages.enviarMensaje,
    handleTyping: typing.handleTyping,
    openThread: messages.openThread,
    closeThread: messages.closeThread,
    handleDeleteChannel: channels.handleDeleteChannel,
    canDeleteChannel: channels.canDeleteChannel,
    openDirectChat: channels.openDirectChat,
    handleFileAttach: messages.handleFileAttach,
    addToastNotification: notifications.addToastNotification,
    dismissToast: notifications.dismissToast,
    insertMention,
    handleInputChange,
    detectMentions: mentions.detectMentions,
  };
}

