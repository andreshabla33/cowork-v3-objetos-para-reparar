/**
 * @module infrastructure/adapters/SalasReunionSupabaseRepository
 * @description Supabase adapter para `ISalasReunionRepository`.
 *
 * Sub-adapter del split 2026-05-09 (ITEM 17 fase B). Maneja salas de reunión
 * (`salas_reunion`) y sus participantes (`participantes_sala`).
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { ISalasReunionRepository } from '@/core/domain/ports/ISalasReunionRepository';
import type {
  SalaReunionData,
  ParticipanteSalaData,
  DatosCrearSala,
  DatosAgregarParticipanteSala,
} from '@/core/domain/ports/IMeetingRepository';

const log = logger.child('salas-reunion-repo');

export class SalasReunionSupabaseRepository implements ISalasReunionRepository {
  async obtenerSalas(espacioId: string): Promise<SalaReunionData[]> {
    try {
      const { data, error } = await supabase
        .from('salas_reunion')
        .select(
          '*, creador:usuarios!salas_reunion_creador_id_fkey(id, nombre, email, avatar_url), participantes:participantes_sala(id, sala_id, usuario_id, es_externo, nombre_externo, email_externo, mic_activo, cam_activa, ultima_actividad, usuario:usuarios(id, nombre, email, avatar_url))'
        )
        .eq('espacio_id', espacioId)
        .eq('activa', true)
        .order('creada_en', { ascending: false });

      if (error) {
        log.warn('Failed to fetch rooms', { error: error.message, espacioId });
        return [];
      }
      return (data as SalaReunionData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching rooms', { error: message, espacioId });
      return [];
    }
  }

  async crearSala(datos: DatosCrearSala): Promise<SalaReunionData | null> {
    try {
      const { data, error } = await supabase
        .from('salas_reunion')
        .insert({
          espacio_id: datos.espacio_id,
          nombre: datos.nombre,
          tipo: datos.tipo,
          creador_id: datos.creador_id,
          descripcion: datos.descripcion,
          max_participantes: datos.max_participantes,
          es_privada: datos.es_privada ?? false,
          password_hash: datos.password_hash,
          activa: true,
        })
        .select(
          '*, creador:usuarios!salas_reunion_creador_id_fkey(id, nombre, email, avatar_url)'
        )
        .single();

      if (error || !data) {
        log.warn('Failed to create room', { error: error?.message, nombre: datos.nombre });
        return null;
      }
      log.info('Room created', { salaId: data.id, nombre: data.nombre });
      return data as SalaReunionData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating room', { error: message });
      return null;
    }
  }

  async eliminarSala(salaId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('salas_reunion').delete().eq('id', salaId);
      if (error) {
        log.warn('Failed to delete room', { error: error.message, salaId });
        return false;
      }
      log.info('Room deleted', { salaId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception deleting room', { error: message, salaId });
      return false;
    }
  }

  async actualizarSalaActiva(salaId: string, activa: boolean): Promise<boolean> {
    try {
      const update: Record<string, unknown> = { activa };
      if (!activa) {
        update.finalizado_en = new Date().toISOString();
      }
      const { error } = await supabase.from('salas_reunion').update(update).eq('id', salaId);
      if (error) {
        log.warn('Failed to update room active status', { error: error.message, salaId });
        return false;
      }
      log.info('Room active status updated', { salaId, activa });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating room active status', { error: message, salaId });
      return false;
    }
  }

  async obtenerSalaPorId(salaId: string): Promise<SalaReunionData | null> {
    try {
      const { data, error } = await supabase
        .from('salas_reunion')
        .select(
          '*, creador:usuarios!salas_reunion_creador_id_fkey(id, nombre, email, avatar_url), participantes:participantes_sala(id, sala_id, usuario_id, es_externo, nombre_externo, email_externo, mic_activo, cam_activa, ultima_actividad, usuario:usuarios(id, nombre, email, avatar_url))'
        )
        .eq('id', salaId)
        .single();

      if (error) {
        log.warn('Failed to fetch room by ID', { error: error.message, salaId });
        return null;
      }
      return (data as SalaReunionData) || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching room by ID', { error: message, salaId });
      return null;
    }
  }

  async obtenerParticipantesSala(salaId: string): Promise<ParticipanteSalaData[]> {
    try {
      const { data, error } = await supabase
        .from('participantes_sala')
        .select(
          '*, usuario:usuarios!participantes_sala_usuario_id_fkey(id, nombre, email, avatar_url)'
        )
        .eq('sala_id', salaId);

      if (error) {
        log.warn('Failed to fetch room participants', { error: error.message, salaId });
        return [];
      }
      return (data as ParticipanteSalaData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching room participants', { error: message, salaId });
      return [];
    }
  }

  async agregarParticipanteSala(
    datos: DatosAgregarParticipanteSala,
  ): Promise<ParticipanteSalaData | null> {
    try {
      const { data, error } = await supabase
        .from('participantes_sala')
        .insert({
          sala_id: datos.sala_id,
          usuario_id: datos.usuario_id,
          es_externo: datos.es_externo,
          nombre_externo: datos.nombre_externo,
          email_externo: datos.email_externo,
          mic_activo: datos.mic_activo ?? true,
          cam_activa: datos.cam_activa ?? false,
          ultima_actividad: new Date().toISOString(),
        })
        .select(
          '*, usuario:usuarios!participantes_sala_usuario_id_fkey(id, nombre, email, avatar_url)'
        )
        .single();

      if (error || !data) {
        log.warn('Failed to add room participant', {
          error: error?.message, salaId: datos.sala_id,
        });
        return null;
      }
      log.info('Room participant added', {
        salaId: datos.sala_id, usuarioId: datos.usuario_id,
      });
      return data as ParticipanteSalaData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding room participant', { error: message });
      return null;
    }
  }

  async eliminarParticipanteSala(salaId: string, usuarioId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('participantes_sala')
        .delete()
        .eq('sala_id', salaId)
        .eq('usuario_id', usuarioId);

      if (error) {
        log.warn('Failed to remove room participant', {
          error: error.message, salaId, usuarioId,
        });
        return false;
      }
      log.info('Room participant removed', { salaId, usuarioId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception removing room participant', {
        error: message, salaId, usuarioId,
      });
      return false;
    }
  }
}

export const salasReunionRepository: ISalasReunionRepository = new SalasReunionSupabaseRepository();
