/**
 * @module domain/ports/IMeetingRealtimeService
 * @description Port interface for meeting realtime operations.
 * Decouples meeting realtime logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase Realtime.
 *
 * Ref: Supabase Realtime — postgres_changes.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Subscription handle for realtime changes.
 * Provides an unsubscribe method for cleanup.
 */
export interface MeetingRealtimeSubscription {
  /**
   * Unsubscribe from the channel and clean up resources.
   * Safe to call multiple times.
   */
  unsubscribe: () => void;
}

/**
 * Realtime service contract for meeting operations.
 */
export interface IMeetingRealtimeService {
  /**
   * Subscribe to changes in scheduled meetings for a workspace.
   * Fires on INSERT, UPDATE, DELETE for reuniones_programadas filtered by espacio_id.
   *
   * @param espacioId Workspace ID
   * @param onChange Callback fired when any change occurs
   * @returns Subscription handle with unsubscribe method
   */
  suscribirReuniones(
    espacioId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription;

  /**
   * Subscribe to changes in meeting rooms for a workspace.
   * Fires on INSERT, UPDATE, DELETE for salas_reunion filtered by espacio_id.
   *
   * @param espacioId Workspace ID
   * @param onChange Callback fired when any change occurs
   * @returns Subscription handle with unsubscribe method
   */
  suscribirSalas(
    espacioId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription;

  /**
   * Subscribe to changes in room participants.
   * Fires on INSERT, UPDATE, DELETE for participantes_sala filtered by sala_id.
   *
   * @param salaId Room ID
   * @param onChange Callback fired when any change occurs
   * @returns Subscription handle with unsubscribe method
   */
  suscribirParticipantesSala(
    salaId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription;

  /**
   * Subscribe to changes in meeting participants.
   * Fires on INSERT, UPDATE, DELETE for reunion_participantes filtered by reunion_id.
   *
   * @param reunionId Meeting ID
   * @param onChange Callback fired when any change occurs
   * @returns Subscription handle with unsubscribe method
   */
  suscribirParticipantesReunion(
    reunionId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription;
}
