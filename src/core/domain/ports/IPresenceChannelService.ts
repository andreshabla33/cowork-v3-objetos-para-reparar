/**
 * @module domain/ports/IPresenceChannelService
 * @description Port para operaciones sobre el `SupabaseClient` necesarias para
 * orquestar Supabase Realtime Presence channels: factory + cleanup + lookup.
 *
 * Diseño quirúrgico: encapsula SOLO los 3 métodos del client global que se
 * usan en orchestrators de presencia. El `RealtimeChannel` devuelto se opera
 * directamente en el hook con su API idiomática (`.on()`, `.subscribe()`,
 * `.track()`, `.untrack()`, `.presenceState()`).
 *
 * Refs:
 *  - Supabase Realtime subscribe: https://supabase.com/docs/reference/javascript/subscribe
 *  - Supabase Realtime presence:  https://supabase.com/docs/guides/realtime/presence
 *  - getChannels:                 https://supabase.com/docs/reference/javascript/getchannels
 *  - removeChannel:               https://supabase.com/docs/reference/javascript/removechannel
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceChannelConfig {
  /** Identidad del usuario dentro del canal de presencia. */
  presence: { key: string };
}

export interface IPresenceChannelService {
  /**
   * Factory: crea un `RealtimeChannel` listo para `.on('presence', ...).subscribe()`.
   *
   * El channel queda registrado en el client global hasta que se llame
   * `eliminarCanal(channel)`.
   */
  crearCanalPresence(name: string, config: PresenceChannelConfig): RealtimeChannel;

  /**
   * Cleanup: remueve el canal del client. NO incluye re-entrancy guard —
   * el consumer (hook) es responsable de prevenir re-entrancia desde sus
   * propios subscribe callbacks (status='CLOSED').
   *
   * Ref re-entrancy bug: https://github.com/orgs/supabase/discussions/27513
   */
  eliminarCanal(channel: RealtimeChannel): void;

  /**
   * Buscar canal activo en el client por nombre lógico.
   * Encapsula el detail interno del prefix de topic.
   */
  buscarCanalActivoPorNombre(name: string): RealtimeChannel | undefined;
}
