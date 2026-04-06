/**
 * @module domain/ports/IChatRealtimeService
 * @description Port interface for chat realtime subscriptions (Postgres changes, broadcasts).
 * Decouples realtime logic from Supabase Realtime infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase channels.
 *
 * Ref: Supabase Realtime — postgres_changes, broadcast channels.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Subscription handle for unsubscribing from realtime events.
 */
export interface ChatRealtimeSubscription {
  unsubscribe: () => void;
}

/**
 * Typing broadcast payload.
 */
export interface TypingPayload {
  user_id: string;
  user_name: string;
}

/**
 * Realtime service contract for chat subscriptions.
 */
export interface IChatRealtimeService {
  /**
   * Subscribe to messages in a channel via postgres_changes.
   * Fires when a new message is inserted in mensajes_chat for this group.
   *
   * @param grupoId Channel ID to listen to
   * @param onMensaje Callback when a new message arrives
   * @param onStatus Callback for subscription status changes (connected, subscribed, error)
   * @returns Subscription handle for cleanup
   */
  suscribirMensajesCanal(
    grupoId: string,
    onMensaje: (payload: Record<string, unknown>) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription;

  /**
   * Subscribe to global chat notifications across the workspace.
   * Fires when any message is sent in any channel of this space.
   *
   * @param espacioId Workspace ID for filtering
   * @param userId Current user ID
   * @param onMensaje Callback when a message arrives in any channel
   * @param onStatus Callback for subscription status changes
   * @returns Subscription handle for cleanup
   */
  suscribirNotificacionesGlobales(
    espacioId: string,
    userId: string,
    onMensaje: (payload: Record<string, unknown>) => void,
    onStatus: (status: string) => void
  ): ChatRealtimeSubscription;

  /**
   * Subscribe to typing indicators in a channel via broadcast.
   * Receives when other users type messages in this group.
   *
   * @param grupoId Channel ID
   * @param onTyping Callback when typing event received
   * @returns Subscription handle for cleanup
   */
  suscribirTyping(
    grupoId: string,
    onTyping: (payload: TypingPayload) => void
  ): ChatRealtimeSubscription;

  /**
   * Broadcast a typing indicator to a channel.
   * Called to notify others that this user is currently typing.
   *
   * @param grupoId Channel ID
   * @param userId Current user ID
   * @param userName Current user name
   */
  enviarTyping(grupoId: string, userId: string, userName: string): void;
}
