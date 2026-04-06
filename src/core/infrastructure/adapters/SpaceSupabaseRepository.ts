/**
 * @module infrastructure/adapters/SpaceSupabaseRepository
 * @description Supabase implementation of ISpaceRepository.
 * Encapsulates all Supabase PostgREST and Realtime calls for 3D space operations.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase JS v2 — from, select, channel broadcast.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  ISpaceRepository,
  CatalogoObjeto3D,
  MensajeSeñalizacionWebRTC,
} from '../../domain/ports/ISpaceRepository';

const log = logger.child('space-repo');

/**
 * Space repository singleton implementation.
 * All methods handle errors gracefully and log at appropriate levels.
 */
class SpaceSupabaseRepository implements ISpaceRepository {
  async obtenerCatalogo3D(): Promise<CatalogoObjeto3D[]> {
    try {
      const { data, error } = await supabase
        .from('catalogo_objetos_3d')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) {
        log.warn('Failed to fetch 3D catalog', { error: error.message });
        return [];
      }

      return data || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching 3D catalog', { error: message });
      return [];
    }
  }

  async suscribirCanalWebRTC(
    espacioId: string,
    onOffer: (payload: any) => void,
    onAnswer: (payload: any) => void,
    onIceCandidate: (payload: any) => void
  ): Promise<() => void> {
    try {
      const channel = supabase.channel(`webrtc:${espacioId}`);

      channel
        .on('broadcast', { event: 'offer' }, ({ payload }) => {
          onOffer(payload);
        })
        .on('broadcast', { event: 'answer' }, ({ payload }) => {
          onAnswer(payload);
        })
        .on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
          onIceCandidate(payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            log.info('Subscribed to WebRTC channel', { espacioId });
          } else if (status === 'CHANNEL_ERROR') {
            log.error('WebRTC channel error', { espacioId });
          }
        });

      return () => {
        supabase.removeChannel(channel);
        log.info('Unsubscribed from WebRTC channel', { espacioId });
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception subscribing to WebRTC channel', {
        error: message,
        espacioId,
      });
      return () => {};
    }
  }

  async enviarMensajeWebRTC(
    espacioId: string,
    mensaje: MensajeSeñalizacionWebRTC
  ): Promise<void> {
    try {
      const channel = supabase.channel(`webrtc:${espacioId}`);
      channel.send(mensaje);
      log.debug('WebRTC message sent', {
        espacioId,
        event: mensaje.event,
        to: mensaje.payload.to,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception sending WebRTC message', {
        error: message,
        espacioId,
      });
    }
  }
}

/**
 * Singleton instance exported for dependency injection.
 */
export const spaceRepository = new SpaceSupabaseRepository();
