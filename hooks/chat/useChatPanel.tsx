/**
 * @module hooks/chat/useChatPanel
 * @description Hook that bridges ChatPanel UI with Clean Architecture use cases.
 * Manages all chat state and delegates business logic to application layer use cases.
 * Replaces all direct Supabase access in ChatPanel.tsx.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access — all data flows through repository ports.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import { getSettingsSection } from '@/lib/userSettings';
import { audioManager } from '@/services/audioManager';
import type { ChatGroup, ChatMessage } from '@/types';
import type { ToastNotification } from '@/components/ChatToast';
import type {
  MiembroChatData,
  MiembroCanal,
  MensajeChatData,
} from '@/src/core/domain/ports/IChatRepository';

// Adapters (singleton instances per Dependency Injection pattern)
import { chatRepository } from '@/src/core/infrastructure/adapters/ChatSupabaseRepository';
import { chatRealtimeService } from '@/src/core/infrastructure/adapters/ChatRealtimeSupabaseService';

// Use cases
import { CargarGruposChatUseCase } from '@/src/core/application/usecases/CargarGruposChatUseCase';
import { EnviarMensajeChatUseCase } from '@/src/core/application/usecases/EnviarMensajeChatUseCase';
import { GestionarCanalesChatUseCase } from '@/src/core/application/usecases/GestionarCanalesChatUseCase';
import { CargarMensajesChatUseCase } from '@/src/core/application/usecases/CargarMensajesChatUseCase';
import { GestionarChatDirectoUseCase } from '@/src/core/application/usecases/GestionarChatDirectoUseCase';
import { SubirArchivoChatUseCase } from '@/src/core/application/usecases/SubirArchivoChatUseCase';
import { CargarHiloMensajeUseCase } from '@/src/core/application/usecases/CargarHiloMensajeUseCase';

const log = logger.child('chat-panel');

// Singleton use case instances
const cargarGrupos = new CargarGruposChatUseCase(chatRepository);
const enviarMensaje = new EnviarMensajeChatUseCase(chatRepository);
const gestionarCanales = new GestionarCanalesChatUseCase(chatRepository);
const cargarMensajes = new CargarMensajesChatUseCase(chatRepository);
const gestionarChatDirecto = new GestionarChatDirectoUseCase(chatRepository);
const subirArchivo = new SubirArchivoChatUseCase(chatRepository);
const cargarHilo = new CargarHiloMensajeUseCase(chatRepository);

/**
 * Props for useChatPanel hook.
 */
export interface UseChatPanelProps {
  sidebarOnly?: boolean;
  chatOnly?: boolean;
  showNotifications?: boolean;
  onChannelSelect?: () => void;
}

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
  // React 19: useRef<T>(null) devuelve RefObject<T | null>. Fix P0 — plan 34919757.
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
    isDirect?: boolean
  ) => void;
  dismissToast: (id: string) => void;
  insertMention: (user: MiembroChatData) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  detectMentions: (text: string) => string[];
  // React 19 deja de exportar el namespace JSX global sin `@types/react`
  // vieja compatibilidad. Usamos `React.ReactNode` que cubre strings, elements,
  // fragments, etc. — apropiado para render de mensajes chat.
  renderMessageContent: (content: string) => React.ReactNode[];
}

/**
 * Custom hook for ChatPanel.
 * Manages all state and business logic, delegating to Clean Architecture use cases.
 * Provides zero-Supabase interface for the component layer.
 */
export function useChatPanel({
  sidebarOnly = false,
  chatOnly = false,
  showNotifications = false,
  onChannelSelect,
}: UseChatPanelProps): UseChatPanelReturn {
  const {
    activeWorkspace,
    currentUser,
    setActiveSubTab,
    userRoleInActiveWorkspace,
    incrementUnreadChat,
    activeChatGroupId,
    setActiveChatGroupId,
  } = useStore();

  // State
  const [grupos, setGrupos] = useState<ChatGroup[]>([]);
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [miembrosEspacio, setMiembrosEspacio] = useState<MiembroChatData[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});
  const [showMeetingRooms, setShowMeetingRooms] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [channelMembers, setChannelMembers] = useState<MiembroCanal[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const globalNotifChannelRef = useRef<any>(null);
  const chatRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grupoActivo = activeChatGroupId;
  const setGrupoActivo = setActiveChatGroupId;

  // Initialize notification sound
  useEffect(() => {
    const settings = getSettingsSection('notifications');
    if (settings.newMessageSound) {
      // Audio will be played via audioManager
      log.debug('Notification sound enabled');
    }
  }, []);

  /**
   * Play notification sound via audioManager.
   */
  const playNotificationSound = useCallback(() => {
    audioManager.playChatNotification().catch(() => {
      log.warn('Failed to play notification sound');
    });
  }, []);

  /**
   * Refetch groups from repository (use case).
   */
  const refetchGrupos = useCallback(async (): Promise<ChatGroup[] | undefined> => {
    if (!activeWorkspace) {
      log.warn('No active workspace, skipping group fetch');
      return;
    }

    try {
      log.debug('Fetching groups', { espacioId: activeWorkspace.id });
      const data = await cargarGrupos.ejecutar(activeWorkspace.id);
      setGrupos(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to fetch groups', { error: message });
      return undefined;
    }
  }, [activeWorkspace]);

  /**
   * Load groups on workspace change and select default group.
   */
  useEffect(() => {
    if (!activeWorkspace) return;

    const cargarYSeleccionar = async () => {
      setLoading(true);
      const data = await refetchGrupos();
      if (data && data.length > 0 && !grupoActivo) {
        const canales = data.filter((g) => g.tipo !== 'directo');
        const general = canales.find((g) => g.nombre.toLowerCase() === 'general');
        setGrupoActivo(general ? general.id : canales[0]?.id || data[0].id);
        log.debug('Selected default channel', {
          channelId: general?.id || canales[0]?.id,
        });
      }
      setLoading(false);
    };

    cargarYSeleccionar();
  }, [activeWorkspace, refetchGrupos, grupoActivo, setGrupoActivo]);

  /**
   * Load space members via use case.
   */
  useEffect(() => {
    if (!activeWorkspace || !currentUser.id) return;

    const cargarMiembros = async () => {
      try {
        log.debug('Fetching space members', { espacioId: activeWorkspace.id });
        const miembros = await gestionarCanales.obtenerMiembrosEspacioDisponibles(
          activeWorkspace.id,
          currentUser.id
        );
        setMiembrosEspacio(miembros);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to fetch space members', { error: message });
      }
    };

    cargarMiembros();
  }, [activeWorkspace, currentUser.id]);

  /**
   * Refetch groups when grupoActivo changes but is not in local state.
   */
  useEffect(() => {
    if (grupoActivo && activeWorkspace && !grupos.find((g) => g.id === grupoActivo)) {
      log.debug('Channel not in local state, refetching', { grupoActivo });
      refetchGrupos();
    }
  }, [grupoActivo, activeWorkspace, grupos, refetchGrupos]);

  /**
   * Load channel members via use case.
   */
  useEffect(() => {
    if (!grupoActivo) return;

    const cargarMiembrosCanal = async () => {
      try {
        log.debug('Fetching channel members', { grupoId: grupoActivo });
        const miembros = await gestionarCanales.obtenerMiembrosCanal(grupoActivo);
        setChannelMembers(miembros);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to fetch channel members', { error: message });
      }
    };

    cargarMiembrosCanal();
  }, [grupoActivo]);

  /**
   * Global notification subscription (if showNotifications is true).
   */
  useEffect(() => {
    if (!activeWorkspace || !currentUser.id || !showNotifications) {
      if (globalNotifChannelRef.current) {
        globalNotifChannelRef.current.unsubscribe();
        globalNotifChannelRef.current = null;
      }
      return;
    }

    try {
      log.debug('Subscribing to global notifications', { espacioId: activeWorkspace.id });

      const subscription = chatRealtimeService.suscribirNotificacionesGlobales(
        activeWorkspace.id,
        currentUser.id,
        async (payload) => {
          // Skip own messages
          const nuevoMensaje = payload.new;
          if (nuevoMensaje.usuario_id === currentUser.id) return;

          // Increment unread count
          incrementUnreadChat();
          const grupoId = nuevoMensaje.grupo_id;
          setUnreadByChannel((prev) => ({
            ...prev,
            [grupoId]: (prev[grupoId] || 0) + 1,
          }));

          // Get sender name
          try {
            const senderData = await chatRepository.obtenerNombreUsuario(nuevoMensaje.usuario_id);
            const grupoInfo = await chatRepository.obtenerInfoGrupo(grupoId);

            if (senderData && grupoInfo) {
              const isDirect = grupoInfo.tipo === 'directo';
              const menciones = nuevoMensaje.menciones ?? [];
              const isMentioned = menciones.includes(currentUser.id);
              const senderName = `${senderData.nombre}${senderData.apellido ? ' ' + senderData.apellido : ''}`;

              log.debug('Toast notification triggered', {
                sender: senderName,
                isMentioned,
              });

              playNotificationSound();
              addToastNotification(
                senderName,
                isMentioned
                  ? `📢 Te mencionó: ${nuevoMensaje.contenido}`
                  : nuevoMensaje.contenido,
                grupoId,
                isDirect ? undefined : grupoInfo.nombre,
                isDirect
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn('Failed to process notification', { error: message });
          }
        },
        (status) => {
          log.debug('Global notification subscription status', { status });
        }
      );

      globalNotifChannelRef.current = subscription;

      return () => {
        if (globalNotifChannelRef.current) {
          globalNotifChannelRef.current.unsubscribe();
          globalNotifChannelRef.current = null;
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to subscribe to notifications', { error: message });
    }
  }, [activeWorkspace?.id, currentUser.id, showNotifications]);

  /**
   * Load messages and setup realtime subscriptions for active channel.
   */
  useEffect(() => {
    if (!grupoActivo) return;
    if (sidebarOnly) return; // Skip if sidebar-only mode

    if (chatRetryTimeoutRef.current) {
      clearTimeout(chatRetryTimeoutRef.current);
      chatRetryTimeoutRef.current = null;
    }

    const currentGrupo = grupoActivo;

    const cargarMensajesYContar = async () => {
      try {
        log.debug('Loading messages', { grupoId: currentGrupo });
        const resultado = await cargarMensajes.ejecutar(currentGrupo);
        setMensajes(resultado.mensajes as unknown as ChatMessage[]);
        setThreadCounts(resultado.conteoReplicas);
        scrollToBottom();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to load messages', { error: message, grupoId: currentGrupo });
      }
    };

    cargarMensajesYContar();

    // Setup message subscription
    try {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      log.debug('Subscribing to message channel', { grupoId: currentGrupo });

      const messageSubscription = chatRealtimeService.suscribirMensajesCanal(
        currentGrupo,
        async () => {
          // Reload messages on new message
          const resultado = await cargarMensajes.ejecutar(currentGrupo);
          setMensajes(resultado.mensajes as unknown as ChatMessage[]);
          setThreadCounts(resultado.conteoReplicas);
          scrollToBottom();
        },
        (status) => {
          log.debug('Message channel subscription status', { status, grupoId: currentGrupo });
          if (status === 'CHANNEL_ERROR' && !chatRetryTimeoutRef.current) {
            chatRetryTimeoutRef.current = setTimeout(() => {
              log.debug('Retrying message subscription', { grupoId: currentGrupo });
              chatRetryTimeoutRef.current = null;
            }, 2000);
          }
        }
      );

      channelRef.current = messageSubscription;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to subscribe to messages', { error: message });
    }

    // Setup typing subscription
    try {
      if (typingChannelRef.current) {
        typingChannelRef.current.unsubscribe();
      }

      log.debug('Subscribing to typing channel', { grupoId: currentGrupo });

      const typingSubscription = chatRealtimeService.suscribirTyping(
        currentGrupo,
        ({ user_name }) => {
          if (user_name !== currentUser.name) {
            setTypingUsers((prev) => {
              if (!prev.includes(user_name)) {
                return [...prev, user_name];
              }
              return prev;
            });

            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u !== user_name));
            }, 3000);
          }
        }
      );

      typingChannelRef.current = typingSubscription;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to subscribe to typing', { error: message });
    }

    return () => {
      if (chatRetryTimeoutRef.current) {
        clearTimeout(chatRetryTimeoutRef.current);
        chatRetryTimeoutRef.current = null;
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (typingChannelRef.current) {
        typingChannelRef.current.unsubscribe();
        typingChannelRef.current = null;
      }
    };
  }, [grupoActivo, sidebarOnly, currentUser.name]);

  /**
   * Broadcast typing indicator.
   */
  const handleTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      if (grupoActivo) {
        chatRealtimeService.enviarTyping(grupoActivo, currentUser.id, currentUser.name);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to broadcast typing', { error: message });
    }

    typingTimeoutRef.current = setTimeout(() => {}, 2000);
  }, [grupoActivo, currentUser.id, currentUser.name]);

  /**
   * Scroll message container to bottom.
   */
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (mensajesRef.current) {
        mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
      }
    }, 150);
  }, []);

  /**
   * Detect mentions in message text.
   */
  const detectMentions = useCallback(
    (text: string): string[] => {
      const mentionRegex = /@(\w+)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        const userName = match[1].toLowerCase();
        const user = miembrosEspacio.find((m) =>
          m.nombre?.toLowerCase().includes(userName)
        );
        if (user) mentions.push(user.id);
      }
      return [...new Set(mentions)];
    },
    [miembrosEspacio]
  );

  /**
   * Handle input change with mention detection.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setNuevoMensaje(value);

      // Detect if typing a mention
      const textBeforeCursor = value.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setShowMentionPicker(true);
        setMentionFilter(atMatch[1].toLowerCase());
        setMentionCursorPos(cursorPos - atMatch[0].length);
      } else {
        setShowMentionPicker(false);
      }

      handleTyping();
    },
    [handleTyping]
  );

  /**
   * Insert selected mention.
   */
  const insertMention = useCallback((user: MiembroChatData) => {
    setNuevoMensaje((prev) => {
      const beforeMention = prev.substring(0, mentionCursorPos);
      const afterMention = prev.substring(mentionCursorPos).replace(/@\w*/, '');
      return `${beforeMention}@${user.nombre} ${afterMention}`;
    });
    setShowMentionPicker(false);
    inputRef.current?.focus();
  }, [mentionCursorPos]);

  /**
   * Send message via use case.
   */
  const enviarMensajeHandler = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nuevoMensaje.trim() || !grupoActivo || !currentUser.id) return;

      const content = nuevoMensaje.trim();
      const menciones = detectMentions(content);

      setNuevoMensaje('');
      setShowMentionPicker(false);

      try {
        log.debug('Sending message', { grupoId: grupoActivo, mentions: menciones.length });

        const resultado = await enviarMensaje.ejecutar({
          grupoId: grupoActivo,
          usuarioId: currentUser.id,
          contenido: content,
          tipo: 'texto',
          menciones: menciones.length > 0 ? menciones : null,
          respuestaA: activeThread || null,
        });

        if (resultado) {
          // Add locally immediately
          if (activeThread) {
            setThreadMessages((prev) => [...prev, resultado as unknown as ChatMessage]);
          } else {
            setMensajes((prev) => [...prev, resultado as unknown as ChatMessage]);
          }
          scrollToBottom();
        } else {
          log.error('Message send returned null');
          setNuevoMensaje(content);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to send message', { error: message });
        setNuevoMensaje(content);
      }
    },
    [nuevoMensaje, grupoActivo, currentUser.id, detectMentions, activeThread, scrollToBottom]
  );

  /**
   * Open thread for message.
   */
  const openThread = useCallback(async (messageId: string) => {
    setActiveThread(messageId);
    try {
      log.debug('Loading thread', { messageId });
      const threadData = await cargarHilo.ejecutar(messageId);
      setThreadMessages(threadData as unknown as ChatMessage[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load thread', { error: message });
    }
  }, []);

  /**
   * Close thread.
   */
  const closeThread = useCallback(() => {
    setActiveThread(null);
    setThreadMessages([]);
  }, []);

  /**
   * Delete channel via use case.
   */
  const handleDeleteChannel = useCallback(
    async (grupoId: string, nombre: string) => {
      const confirmado = window.confirm(
        `¿Estás seguro de eliminar el canal "${nombre}"? Se eliminarán todos los mensajes.`
      );
      if (!confirmado) return;

      try {
        log.debug('Deleting channel', { grupoId });
        const success = await gestionarCanales.eliminarCanal(grupoId);

        if (success) {
          setGrupos((prev) => prev.filter((g) => g.id !== grupoId));

          if (grupoActivo === grupoId) {
            const restantes = grupos.filter(
              (g) => g.id !== grupoId && g.tipo !== 'directo'
            );
            if (restantes.length > 0) {
              setGrupoActivo(restantes[0].id);
            } else {
              setGrupoActivo('');
            }
          }

          log.info('Channel deleted successfully', { grupoId });
        } else {
          log.error('Channel deletion returned false');
          window.alert('Error al eliminar el canal');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to delete channel', { error: message });
        window.alert(`Error al eliminar el canal: ${message}`);
      }
    },
    [grupoActivo, grupos, setGrupoActivo]
  );

  /**
   * Check if user can delete channel.
   */
  const canDeleteChannel = useCallback(
    (grupo: ChatGroup): boolean => {
      if (!userRoleInActiveWorkspace) return false;
      const isAdmin = ['admin', 'super_admin'].includes(userRoleInActiveWorkspace);
      const isCreator = grupo.creado_por === currentUser.id;
      return isAdmin || isCreator;
    },
    [userRoleInActiveWorkspace, currentUser.id]
  );

  /**
   * Select channel and clear unread count.
   */
  const handleChannelSelect = useCallback(
    (id: string) => {
      setGrupoActivo(id);
      setUnreadByChannel((prev) => ({ ...prev, [id]: 0 }));
      setActiveSubTab('chat' as any);
      if (onChannelSelect) onChannelSelect();
    },
    [setActiveSubTab, onChannelSelect, setGrupoActivo]
  );

  /**
   * Open or create direct chat with user via use case.
   */
  const openDirectChat = useCallback(
    async (targetUser: MiembroChatData) => {
      if (!activeWorkspace || !currentUser.id) {
        log.warn('Missing workspace or currentUser for DM');
        return;
      }

      if (targetUser.id === currentUser.id) {
        log.warn('Cannot DM yourself');
        return;
      }

      try {
        const privacyS = getSettingsSection('privacy');
        if (!privacyS.allowDirectMessages) {
          window.alert('Has desactivado los mensajes directos en tu configuración de privacidad.');
          return;
        }

        log.debug('Opening direct chat', { targetUserId: targetUser.id });

        const resultado = await gestionarChatDirecto.ejecutar(
          activeWorkspace.id,
          currentUser.id,
          targetUser.id
        );

        if (resultado) {
          // Reload groups to include new DM
          const gruposActualizados = await refetchGrupos();
          if (gruposActualizados) {
            setGrupos(gruposActualizados);
          }

          setGrupoActivo(resultado.grupoId);
          setActiveSubTab('chat');
          log.debug('Direct chat opened', { grupoId: resultado.grupoId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to open direct chat', { error: message });
      }
    },
    [activeWorkspace, currentUser.id, setGrupoActivo, setActiveSubTab, refetchGrupos]
  );

  /**
   * Add toast notification.
   */
  const addToastNotification = useCallback(
    (
      userName: string,
      message: string,
      groupId: string,
      channelName?: string,
      isDirect?: boolean
    ) => {
      const newToast: ToastNotification = {
        id: `toast_${Date.now()}`,
        userName,
        userInitial: userName.charAt(0).toUpperCase(),
        message,
        channelName,
        isDirect,
        groupId,
        timestamp: new Date(),
      };

      setToastNotifications((prev) => {
        const updated = [...prev.slice(-4), newToast];
        log.debug('Toast added', { toastId: newToast.id, totalToasts: updated.length });
        return updated;
      });
    },
    []
  );

  /**
   * Dismiss toast notification.
   */
  const dismissToast = useCallback((id: string) => {
    setToastNotifications((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Handle file attachment via use case.
   */
  const handleFileAttach = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !grupoActivo || !activeWorkspace) return;

      try {
        log.debug('Uploading file', { fileName: file.name, fileSize: file.size });

        const resultado = await subirArchivo.ejecutar({
          grupoId: grupoActivo,
          usuarioId: currentUser.id,
          archivo: file,
          espacioId: activeWorkspace.id,
        });

        if (resultado) {
          // Reload messages to show new file message
          const resultadoMensajes = await cargarMensajes.ejecutar(grupoActivo);
          setMensajes(resultadoMensajes.mensajes as unknown as ChatMessage[]);
          scrollToBottom();
          log.debug('File uploaded successfully', { fileSize: file.size });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to upload file', { error: message, fileName: file.name });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [grupoActivo, activeWorkspace, currentUser.id, scrollToBottom]
  );

  /**
   * Render message content with mentions highlighted.
   */
  const renderMessageContent = useCallback(
    (content: string) => {
      const parts = content.split(/(@\w+)/g);
      return parts.map((part, i) => {
        if (part.startsWith('@')) {
          const userName = part.substring(1).toLowerCase();
          const isMentioningMe = miembrosEspacio.find(
            (m) => m.nombre?.toLowerCase() === userName && m.id === currentUser.id
          );
          return (
            <span
              key={i}
              className={`px-1 rounded ${
                isMentioningMe
                  ? 'bg-yellow-500/30 text-yellow-300 font-bold'
                  : 'bg-indigo-500/30 text-indigo-300'
              }`}
            >
              {part}
            </span>
          );
        }
        return part;
      });
    },
    [miembrosEspacio, currentUser.id]
  );

  return {
    // State
    grupos,
    mensajes,
    nuevoMensaje,
    loading,
    showCreateModal,
    showAddMembers,
    miembrosEspacio,
    unreadByChannel,
    typingUsers,
    showEmojiPicker,
    toastNotifications,
    showMentionPicker,
    mentionFilter,
    activeThread,
    threadMessages,
    threadCounts,
    showMeetingRooms,
    showMembersPanel,
    channelMembers,

    // Refs
    fileInputRef,
    inputRef,
    mensajesRef,

    // State setters
    setNuevoMensaje,
    setShowCreateModal,
    setShowAddMembers,
    setShowEmojiPicker,
    setShowMeetingRooms,
    setShowMembersPanel,
    setMentionFilter,

    // Actions
    refetchGrupos,
    handleChannelSelect,
    enviarMensaje: enviarMensajeHandler,
    handleTyping,
    openThread,
    closeThread,
    handleDeleteChannel,
    canDeleteChannel,
    openDirectChat,
    handleFileAttach,
    addToastNotification,
    dismissToast,
    insertMention,
    handleInputChange,
    detectMentions,
    renderMessageContent,
  };
}
