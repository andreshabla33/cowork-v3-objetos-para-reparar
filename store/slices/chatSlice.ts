/**
 * Chat Slice — Clean Architecture Domain Store
 *
 * Maneja: mensajes, conteo de no leídos, grupo activo.
 */
import type { StateCreator } from 'zustand';
import type { ChatMessage } from '../../types';

type NotificationType = 'info' | 'mention' | 'entry';

interface ChatSliceDependencies {
  currentUser: { name: string };
  addNotification: (message: string, type?: NotificationType) => void;
}

export interface ChatSlice {
  messages: ChatMessage[];
  unreadChatCount: number;
  activeChatGroupId: string | null;

  addMessage: (msg: ChatMessage) => void;
  incrementUnreadChat: () => void;
  clearUnreadChat: () => void;
  setActiveChatGroupId: (id: string | null) => void;
}

export const createChatSlice: StateCreator<ChatSliceDependencies & ChatSlice, [], [], ChatSlice> = (set, get) => ({
  messages: [],
  unreadChatCount: 0,
  activeChatGroupId: null,

  addMessage: (msg) => {
    const state = get();
    if (msg.contenido?.includes(`@${state.currentUser.name}`)) {
      state.addNotification(`Fuiste mencionado por ${msg.usuario?.nombre || 'alguien'}`, 'mention');
    }
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  incrementUnreadChat: () => set((state) => ({ unreadChatCount: state.unreadChatCount + 1 })),
  clearUnreadChat: () => set({ unreadChatCount: 0 }),
  setActiveChatGroupId: (id) => set({ activeChatGroupId: id }),
});
