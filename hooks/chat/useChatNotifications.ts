/**
 * @module hooks/chat/useChatNotifications
 * @description Sub-hook for chat notifications.
 * Handles global realtime notification subscription, toast management,
 * unread counts, and notification sound.
 *
 * Clean Architecture: Presentation layer — delegates to Application use cases.
 * F4 refactor: extracted from useChatPanel monolith.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import { getSettingsSection } from '@/lib/userSettings';
import { audioManager } from '@/services/audioManager';
import type { ToastNotification } from '@/components/ChatToast';
import type { ChatRealtimeSubscription } from '@/src/core/domain/ports/IChatRealtimeService';

import { chatRepository } from '@/src/core/infrastructure/adapters/ChatSupabaseRepository';
import { chatRealtimeService } from '@/src/core/infrastructure/adapters/ChatRealtimeSupabaseService';
import { ProcesarNotificacionChatUseCase } from '@/src/core/application/usecases/ProcesarNotificacionChatUseCase';

const log = logger.child('chat-notifications');

const procesarNotificacion = new ProcesarNotificacionChatUseCase(chatRepository);

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseChatNotificationsReturn {
  unreadByChannel: Record<string, number>;
  toastNotifications: ToastNotification[];

  clearUnreadForChannel: (channelId: string) => void;
  addToastNotification: (
    userName: string,
    message: string,
    groupId: string,
    channelName?: string,
    isDirect?: boolean,
  ) => void;
  dismissToast: (id: string) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatNotifications({
  showNotifications,
}: {
  showNotifications: boolean;
}): UseChatNotificationsReturn {
  const { activeWorkspace, currentUser, incrementUnreadChat } = useStore();

  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const globalNotifChannelRef = useRef<ChatRealtimeSubscription | null>(null);

  // ── Notification sound init ────────────────────────────────────────────────

  useEffect(() => {
    const settings = getSettingsSection('notifications');
    if (settings.newMessageSound) {
      log.debug('Notification sound enabled');
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    audioManager.playChatNotification().catch(() => {
      log.warn('Failed to play notification sound');
    });
  }, []);

  // ── Toast management ───────────────────────────────────────────────────────

  const addToastNotification = useCallback(
    (
      userName: string,
      message: string,
      groupId: string,
      channelName?: string,
      isDirect?: boolean,
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
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToastNotifications((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearUnreadForChannel = useCallback((channelId: string) => {
    setUnreadByChannel((prev) => ({ ...prev, [channelId]: 0 }));
  }, []);

  // ── Global notification subscription ───────────────────────────────────────

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
          const nuevoMensaje = payload.new;
          if (nuevoMensaje.usuario_id === currentUser.id) return;

          incrementUnreadChat();
          const grupoId = nuevoMensaje.grupo_id;
          setUnreadByChannel((prev) => ({
            ...prev,
            [grupoId]: (prev[grupoId] || 0) + 1,
          }));

          try {
            const resultado = await procesarNotificacion.ejecutar(
              {
                usuarioId: nuevoMensaje.usuario_id,
                grupoId,
                contenido: nuevoMensaje.contenido,
                menciones: nuevoMensaje.menciones,
              },
              currentUser.id,
            );

            if (resultado) {
              // Proximity gate for group messages: if the sender is out of
              // audio range AND this isn't a DM or @mention, suppress both
              // sound and toast — the metaphor of the virtual space is that
              // you only "hear" people near you. DMs and mentions always
              // notify because they are explicitly addressed to the user.
              // Read from store.getState() to avoid stale closure over
              // usersInAudioRangeIds (subscription effect runs once).
              const inRange = useStore
                .getState()
                .usersInAudioRangeIds.has(nuevoMensaje.usuario_id);
              const shouldAlert = resultado.isDirect || resultado.isMentioned || inRange;
              log.debug('Notification decision', {
                sender: resultado.senderName,
                isMentioned: resultado.isMentioned,
                isDirect: resultado.isDirect,
                inRange,
                shouldAlert,
              });

              if (shouldAlert) {
                playNotificationSound();
                addToastNotification(
                  resultado.senderName,
                  resultado.isMentioned
                    ? `📢 Te mencionó: ${resultado.contenido}`
                    : resultado.contenido,
                  grupoId,
                  resultado.isDirect ? undefined : resultado.channelName,
                  resultado.isDirect,
                );
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn('Failed to process notification', { error: message });
          }
        },
        (status) => {
          log.debug('Global notification subscription status', { status });
        },
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
  }, [activeWorkspace?.id, currentUser.id, showNotifications, incrementUnreadChat, playNotificationSound, addToastNotification]);

  return {
    unreadByChannel,
    toastNotifications,
    clearUnreadForChannel,
    addToastNotification,
    dismissToast,
  };
}
