/**
 * @module infrastructure/adapters/ChatRealtimeSupabaseService
 * @description Supabase Realtime implementation of IChatRealtimeService.
 * Encapsulates postgres_changes subscriptions and broadcast channels for chat.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase Realtime — channels, postgres_changes, broadcast.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IChatRealtimeService,
  ChatRealtimeSubscription,
  TypingPayload,
} from '../../domain/ports/IChatRealtimeService';

const log = logger.child('chat-realtime');

/**
 * Realtime service singleton implementation.
 * Manages subscriptions to message changes, global notifications, and typing broadcasts.
 */
export class ChatRealtimeSupabaseService implements IChatRealtimeService {
  /**
   * Subscribe to new messages in a channel via postgres_changes.
   * Automatically unsubscribes when component unmounts.
   */
  suscribirMensajesCanal(
    grupoId: string,
    onMensaje: (payload: Record<string, unknown>) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription {
    try {
      const channelName = `chat_realtime_${grupoId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat',
            filter: `grupo_id=eq.${grupoId}`,
          },
          (payload: Record<string, unknown>) => {
            log.debug('Message received', { grupoId });
            onMensaje(payload);
          }
        )
        .subscribe((status: any) => {
          log.debug('Channel status', { status, grupoId });
          onStatus(status);
        });

      log.info('Subscribed to channel messages', { grupoId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from channel messages', { grupoId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to channel messages', {
        error: message,
        grupoId,
      });
      return {
        unsubscribe: () => {
          // no-op
        },
      };
    }
  }

  /**
   * Subscribe to global chat notifications across the workspace.
   * Fires for any message INSERT in mensajes_chat for this space.
   */
  suscribirNotificacionesGlobales(
    espacioId: string,
    userId: string,
    onMensaje: (payload: Record<string, unknown>) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription {
    try {
      const channelName = `global_notif_${espacioId}_${userId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes_chat',
          },
          (payload: Record<string, unknown>) => {
            log.debug('Global notification received', { espacioId });
            onMensaje(payload);
          }
        )
        .subscribe((status: any) => {
          log.debug('Global notification channel status', {
            status,
            espacioId,
          });
          onStatus(status);
        });

      log.info('Subscribed to global notifications', { espacioId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from global notifications', { espacioId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to global notifications', {
        error: message,
        espacioId,
      });
      return {
        unsubscribe: () => {
          // no-op
        },
      };
    }
  }

  /**
   * Subscribe to typing indicators in a channel via broadcast.
   */
  suscribirTyping(
    grupoId: string,
    onTyping: (payload: TypingPayload) => void
  ): ChatRealtimeSubscription {
    try {
      const channelName = `typing_${grupoId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'broadcast',
          { event: 'typing' },
          (payload: Record<string, unknown>) => {
            log.debug('Typing event received', { grupoId });
            onTyping({
              user_id: (payload as any)?.user_id || '',
              user_name: (payload as any)?.user_name || '',
            });
          }
        )
        .subscribe();

      log.info('Subscribed to typing indicators', { grupoId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from typing indicators', { grupoId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to typing', {
        error: message,
        grupoId,
      });
      return {
        unsubscribe: () => {
          // no-op
        },
      };
    }
  }

  /**
   * Broadcast a typing indicator to a channel.
   */
  enviarTyping(grupoId: string, userId: string, userName: string): void {
    try {
      const channelName = `typing_${grupoId}`;

      supabase.channel(channelName).send('broadcast' as any, {
        event: 'typing',
        payload: {
          user_id: userId,
          user_name: userName,
        },
      });

      log.debug('Typing indicator sent', { grupoId, userId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to send typing indicator', {
        error: message,
        grupoId,
      });
    }
  }
}

/**
 * Singleton instance of the chat realtime service.
 * Export this for use in use cases and components via dependency injection.
 */
export const chatRealtimeService = new ChatRealtimeSupabaseService();
