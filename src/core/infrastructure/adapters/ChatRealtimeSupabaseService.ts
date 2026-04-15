/**
 * @module infrastructure/adapters/ChatRealtimeSupabaseService
 * @description Supabase Realtime implementation of IChatRealtimeService.
 * Encapsulates postgres_changes subscriptions and broadcast channels for chat.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase Realtime — channels, postgres_changes, broadcast.
 *
 * ## Shared channel pool with graceful teardown (2026-04-15)
 *
 * El lifecycle del WebSocket compartido de Supabase Realtime NO debe estar
 * atado al lifecycle de un componente React. Cuando un componente como
 * `ChatPanel` remonta (por route change, Strict Mode, lazy load, etc.), el
 * cleanup del useEffect desuscribe el canal, Supabase cierra la suscripción,
 * y el WebSocket entra en estado de reconnect. Eso propaga churn a TODOS los
 * demás canales que comparten el mismo WS (presence, empresa discovery, etc.)
 * y puede retrasar sus SUBSCRIBED callbacks varios minutos.
 *
 * Este adapter implementa un pool con reference-counting + graceful teardown:
 *
 * - Múltiples callers al mismo `channelName` comparten una sola suscripción
 *   Supabase. Solo existe UN canal en el WS por topic, con N handlers.
 * - Cuando el último caller se desuscribe, el canal NO se cierra inmediato —
 *   se agenda con `setTimeout(TEARDOWN_DELAY_MS)`. Si un nuevo subscriber
 *   llega dentro de esa ventana, se cancela el timer y se reusa el canal.
 * - Si nadie re-suscribe en la ventana, se ejecuta `supabase.removeChannel`.
 *
 * Patrón análogo al utilizado por LiveKit (`useLiveKitVideoBackground`,
 * commit 863620d del 2026-04-14) con deferred detach para React Strict Mode.
 *
 * Referencias:
 * - Supabase Realtime: https://supabase.com/docs/guides/realtime/getting_started
 *   "A channel can have multiple bindings. Subscribing to the same topic
 *    reuses the underlying transport when the client allows it."
 * - React 19: https://react.dev/reference/react/useEffect#connecting-to-an-external-system
 *   "If you're connecting to an external system, consider whether the
 *    connection should live outside the component tree."
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  IChatRealtimeService,
  ChatRealtimeSubscription,
  TypingPayload,
} from '../../domain/ports/IChatRealtimeService';
import type { MensajeChatRealtimePayload } from '../../domain/ports/IChatRepository';

const log = logger.child('chat-realtime');

/**
 * Graceful teardown delay (ms). Si el último subscriber desuscribe pero otro
 * llega en <TEARDOWN_DELAY_MS, el canal NO se cierra — se re-usa.
 *
 * Valores evaluados:
 * - `0-100ms`: cubre Strict Mode double-mount, no cubre lazy-load ni route.
 * - `500-1000ms`: cubre la mayoría de remounts, algunos route transitions no.
 * - `3000ms` (elegido): balance entre resiliencia al remount y no filtrar
 *   recursos. Si el usuario cierra la app, el canal queda vivo 3s extra.
 * - `>5000ms`: desperdicia bandwidth; el usuario percibe "fantasma" en chat.
 */
const TEARDOWN_DELAY_MS = 3000;

/**
 * Handler genérico que el pool re-emite al Set de callbacks registrados.
 */
type PayloadHandler<T> = (payload: T) => void;
type StatusHandler = (status: string) => void;

/**
 * Entry del pool: un canal Supabase compartido por múltiples subscribers.
 * El canal vive mientras haya ≥1 handler en el Set, más la ventana de
 * `TEARDOWN_DELAY_MS` tras quedar vacío.
 */
interface SharedChannelEntry {
  channel: RealtimeChannel;
  payloadHandlers: Set<PayloadHandler<unknown>>;
  statusHandlers: Set<StatusHandler>;
  pendingCloseTimer: ReturnType<typeof setTimeout> | null;
  /** Contador monotónico para diagnóstico; identifica recreaciones. */
  serial: number;
}

/**
 * Realtime service singleton implementation.
 * Manages subscriptions to message changes, global notifications, and typing broadcasts.
 *
 * El pool de canales compartidos es interno al adapter — los callers siguen
 * recibiendo un `ChatRealtimeSubscription` con un `unsubscribe` individual
 * que solo afecta a su handler, NO al canal.
 */
export class ChatRealtimeSupabaseService implements IChatRealtimeService {
  private readonly sharedChannels = new Map<string, SharedChannelEntry>();
  private serialCounter = 0;

  /**
   * Obtiene o crea un canal Supabase compartido por `channelName`.
   *
   * Si el canal ya existe y tiene un `pendingCloseTimer`, cancela el timer
   * (evita el removeChannel). Si no existe, invoca `createChannel` para
   * construir el canal con sus bindings y suscribirlo.
   *
   * @param channelName Topic name único en Supabase Realtime
   * @param createChannel Factory que crea el canal Supabase + bindings.
   *   Recibe el entry para poder re-emitir a los handlers del Set.
   */
  private acquireSharedChannel(
    channelName: string,
    createChannel: (entry: SharedChannelEntry) => RealtimeChannel
  ): SharedChannelEntry {
    const existing = this.sharedChannels.get(channelName);
    if (existing) {
      // Cancelar teardown pendiente — llegó un nuevo subscriber.
      if (existing.pendingCloseTimer) {
        clearTimeout(existing.pendingCloseTimer);
        existing.pendingCloseTimer = null;
        log.debug('Cancelled pending teardown — channel reused', {
          channelName,
          serial: existing.serial,
        });
      }
      return existing;
    }

    const serial = ++this.serialCounter;
    const entry: SharedChannelEntry = {
      channel: null as unknown as RealtimeChannel, // set abajo
      payloadHandlers: new Set(),
      statusHandlers: new Set(),
      pendingCloseTimer: null,
      serial,
    };
    entry.channel = createChannel(entry);
    this.sharedChannels.set(channelName, entry);
    log.debug('Shared channel created', { channelName, serial });
    return entry;
  }

  /**
   * Quita un handler del entry. Si el Set queda vacío, agenda el teardown
   * con `setTimeout(TEARDOWN_DELAY_MS)`. Si llega un nuevo subscribe antes
   * del disparo, `acquireSharedChannel` cancela el timer.
   *
   * Idempotente: si el handler ya no está, no hace nada.
   */
  private releaseSharedChannel(
    channelName: string,
    payloadHandler: PayloadHandler<unknown> | null,
    statusHandler: StatusHandler | null
  ): void {
    const entry = this.sharedChannels.get(channelName);
    if (!entry) return;

    if (payloadHandler) entry.payloadHandlers.delete(payloadHandler);
    if (statusHandler) entry.statusHandlers.delete(statusHandler);

    if (entry.payloadHandlers.size > 0) {
      // Todavía hay otros subscribers vivos — no cerrar.
      return;
    }

    // Último subscriber liberado. Agendar cierre con graceful delay.
    if (entry.pendingCloseTimer) return; // Ya agendado.

    entry.pendingCloseTimer = setTimeout(() => {
      // Re-verificar al disparar — por si `acquireSharedChannel` llegó justo
      // después de agendar pero antes de disparar (defensa contra races).
      const current = this.sharedChannels.get(channelName);
      if (!current || current.serial !== entry.serial) return;
      if (current.payloadHandlers.size > 0) {
        current.pendingCloseTimer = null;
        return;
      }

      supabase.removeChannel(current.channel);
      this.sharedChannels.delete(channelName);
      log.debug('Shared channel torn down', {
        channelName,
        serial: current.serial,
      });
    }, TEARDOWN_DELAY_MS);
  }

  /**
   * Subscribe to new messages in a channel via postgres_changes.
   * Multiple callers for the same `grupoId` share a single underlying channel.
   */
  suscribirMensajesCanal(
    grupoId: string,
    onMensaje: (payload: MensajeChatRealtimePayload) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription {
    const channelName = `chat_realtime_${grupoId}`;

    try {
      const entry = this.acquireSharedChannel(channelName, (createdEntry) =>
        supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'mensajes_chat',
              filter: `grupo_id=eq.${grupoId}`,
            },
            (payload) => {
              const typedPayload = payload as unknown as MensajeChatRealtimePayload;
              log.debug('Message received', { grupoId });
              createdEntry.payloadHandlers.forEach((h) =>
                (h as PayloadHandler<MensajeChatRealtimePayload>)(typedPayload)
              );
            }
          )
          .subscribe((status: string) => {
            log.debug('Channel status', { status, grupoId });
            createdEntry.statusHandlers.forEach((h) => h(status));
          })
      );

      const payloadHandler = onMensaje as PayloadHandler<unknown>;
      entry.payloadHandlers.add(payloadHandler);
      entry.statusHandlers.add(onStatus);
      log.info('Subscribed to channel messages', { grupoId });

      return {
        unsubscribe: () => {
          this.releaseSharedChannel(channelName, payloadHandler, onStatus);
          log.info('Unsubscribed from channel messages', { grupoId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to channel messages', {
        error: message,
        grupoId,
      });
      return { unsubscribe: () => {} };
    }
  }

  /**
   * Subscribe to global chat notifications across the workspace.
   * Fires for any message INSERT in mensajes_chat for this space.
   * Multiple callers share a single underlying channel.
   */
  suscribirNotificacionesGlobales(
    espacioId: string,
    userId: string,
    onMensaje: (payload: MensajeChatRealtimePayload) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription {
    const channelName = `global_notif_${espacioId}_${userId}`;

    try {
      const entry = this.acquireSharedChannel(channelName, (createdEntry) =>
        supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'mensajes_chat',
            },
            (payload) => {
              const typedPayload = payload as unknown as MensajeChatRealtimePayload;
              log.debug('Global notification received', { espacioId });
              createdEntry.payloadHandlers.forEach((h) =>
                (h as PayloadHandler<MensajeChatRealtimePayload>)(typedPayload)
              );
            }
          )
          .subscribe((status: string) => {
            log.debug('Global notification channel status', {
              status,
              espacioId,
            });
            createdEntry.statusHandlers.forEach((h) => h(status));
          })
      );

      const payloadHandler = onMensaje as PayloadHandler<unknown>;
      entry.payloadHandlers.add(payloadHandler);
      entry.statusHandlers.add(onStatus);
      log.info('Subscribed to global notifications', { espacioId });

      return {
        unsubscribe: () => {
          this.releaseSharedChannel(channelName, payloadHandler, onStatus);
          log.info('Unsubscribed from global notifications', { espacioId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to global notifications', {
        error: message,
        espacioId,
      });
      return { unsubscribe: () => {} };
    }
  }

  /**
   * Subscribe to typing indicators in a channel via broadcast.
   * Multiple callers share a single underlying channel.
   */
  suscribirTyping(
    grupoId: string,
    onTyping: (payload: TypingPayload) => void
  ): ChatRealtimeSubscription {
    const channelName = `typing_${grupoId}`;

    try {
      const entry = this.acquireSharedChannel(channelName, (createdEntry) =>
        supabase
          .channel(channelName)
          .on(
            'broadcast',
            { event: 'typing' },
            (payload) => {
              log.debug('Typing event received', { grupoId });
              const typingPayload: TypingPayload = {
                user_id: (payload as { user_id?: string })?.user_id ?? '',
                user_name: (payload as { user_name?: string })?.user_name ?? '',
              };
              createdEntry.payloadHandlers.forEach((h) =>
                (h as PayloadHandler<TypingPayload>)(typingPayload)
              );
            }
          )
          .subscribe()
      );

      const payloadHandler = onTyping as PayloadHandler<unknown>;
      entry.payloadHandlers.add(payloadHandler);
      log.info('Subscribed to typing indicators', { grupoId });

      return {
        unsubscribe: () => {
          this.releaseSharedChannel(channelName, payloadHandler, null);
          log.info('Unsubscribed from typing indicators', { grupoId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to typing', {
        error: message,
        grupoId,
      });
      return { unsubscribe: () => {} };
    }
  }

  /**
   * Broadcast a typing indicator to a channel.
   * No comparte pool — el `send` es fire-and-forget y el canal se cierra
   * implícitamente cuando el GC lo recoge. No afecta al pool de suscripciones.
   */
  enviarTyping(grupoId: string, userId: string, userName: string): void {
    try {
      const channelName = `typing_${grupoId}`;

      // Supabase Realtime `send` API oficial: un único argumento objeto
      // con `{ type, event, payload }`. Ref:
      // https://supabase.com/docs/reference/javascript/subscribe
      supabase.channel(channelName).send({
        type: 'broadcast',
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
