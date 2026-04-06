/**
 * @module infrastructure/adapters/MeetingRealtimeSupabaseService
 * @description Supabase Realtime implementation of IMeetingRealtimeService.
 * Encapsulates postgres_changes subscriptions for meeting operations.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase Realtime — channels, postgres_changes.
 * Ref: Official docs — removeChannel() cleanup in unsubscribe.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IMeetingRealtimeService,
  MeetingRealtimeSubscription,
} from '../../domain/ports/IMeetingRealtimeService';

const log = logger.child('meeting-realtime');

/**
 * Realtime service singleton implementation.
 * Manages subscriptions to meeting changes via postgres_changes.
 */
export class MeetingRealtimeSupabaseService implements IMeetingRealtimeService {
  /**
   * Subscribe to changes in scheduled meetings for a workspace.
   * Fires on INSERT, UPDATE, DELETE for reuniones_programadas filtered by espacio_id.
   */
  suscribirReuniones(
    espacioId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription {
    try {
      const channelName = `meetings_${espacioId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reuniones_programadas',
            filter: `espacio_id=eq.${espacioId}`,
          },
          () => {
            log.debug('Meeting change detected', { espacioId });
            onChange();
          }
        )
        .subscribe((status: any) => {
          log.debug('Meeting channel status', { status, espacioId });
        });

      log.info('Subscribed to meetings', { espacioId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from meetings', { espacioId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to meetings', {
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
   * Subscribe to changes in meeting rooms for a workspace.
   * Fires on INSERT, UPDATE, DELETE for salas_reunion filtered by espacio_id.
   */
  suscribirSalas(
    espacioId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription {
    try {
      const channelName = `rooms_${espacioId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'salas_reunion',
            filter: `espacio_id=eq.${espacioId}`,
          },
          () => {
            log.debug('Room change detected', { espacioId });
            onChange();
          }
        )
        .subscribe((status: any) => {
          log.debug('Room channel status', { status, espacioId });
        });

      log.info('Subscribed to rooms', { espacioId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from rooms', { espacioId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to rooms', {
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
   * Subscribe to changes in room participants.
   * Fires on INSERT, UPDATE, DELETE for participantes_sala filtered by sala_id.
   */
  suscribirParticipantesSala(
    salaId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription {
    try {
      const channelName = `room_participants_${salaId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'participantes_sala',
            filter: `sala_id=eq.${salaId}`,
          },
          () => {
            log.debug('Room participant change detected', { salaId });
            onChange();
          }
        )
        .subscribe((status: any) => {
          log.debug('Room participant channel status', {
            status,
            salaId,
          });
        });

      log.info('Subscribed to room participants', { salaId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from room participants', { salaId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to room participants', {
        error: message,
        salaId,
      });
      return {
        unsubscribe: () => {
          // no-op
        },
      };
    }
  }

  /**
   * Subscribe to changes in meeting participants.
   * Fires on INSERT, UPDATE, DELETE for reunion_participantes filtered by reunion_id.
   */
  suscribirParticipantesReunion(
    reunionId: string,
    onChange: () => void
  ): MeetingRealtimeSubscription {
    try {
      const channelName = `meeting_participants_${reunionId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reunion_participantes',
            filter: `reunion_id=eq.${reunionId}`,
          },
          () => {
            log.debug('Meeting participant change detected', { reunionId });
            onChange();
          }
        )
        .subscribe((status: any) => {
          log.debug('Meeting participant channel status', {
            status,
            reunionId,
          });
        });

      log.info('Subscribed to meeting participants', { reunionId });

      return {
        unsubscribe: () => {
          supabase.removeChannel(channel);
          log.info('Unsubscribed from meeting participants', { reunionId });
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to meeting participants', {
        error: message,
        reunionId,
      });
      return {
        unsubscribe: () => {
          // no-op
        },
      };
    }
  }
}

/**
 * Singleton instance of the meeting realtime service.
 * Export this for use in use cases via dependency injection.
 */
export const meetingRealtimeService = new MeetingRealtimeSupabaseService();
