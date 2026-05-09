/**
 * @module infrastructure/adapters/ReunionesProgramadasSupabaseRepository
 * @description Supabase adapter para `IReunionesProgramadasRepository`.
 *
 * Sub-adapter del split 2026-05-09 (ITEM 17 fase B). Maneja reuniones
 * programadas (calendario) + sus participantes + invitaciones externas.
 *
 * Tablas: `reuniones_programadas`, `reunion_participantes`, `invitaciones_reunion`.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { IReunionesProgramadasRepository } from '@/core/domain/ports/IReunionesProgramadasRepository';
import type {
  ReunionProgramadaData,
  ParticipanteReunionData,
  DatosCrearReunion,
  DatosAgregarParticipante,
  DatosCrearInvitacionExterna,
} from '@/core/domain/ports/IMeetingRepository';

const log = logger.child('reuniones-programadas-repo');

export class ReunionesProgramadasSupabaseRepository implements IReunionesProgramadasRepository {
  async obtenerReuniones(espacioId: string): Promise<ReunionProgramadaData[]> {
    try {
      const { data, error } = await supabase
        .from('reuniones_programadas')
        .select(
          '*, creador:usuarios!reuniones_programadas_creado_por_usuarios_fkey(id, nombre, email, avatar_url), sala:salas_reunion(id, nombre), participantes:reunion_participantes(id, reunion_id, usuario_id, estado, notificado, usuario:usuarios(id, nombre, email, avatar_url))'
        )
        .eq('espacio_id', espacioId)
        .order('fecha_inicio', { ascending: true });

      if (error) {
        log.warn('Failed to fetch meetings', { error: error.message, espacioId });
        return [];
      }
      return (data as ReunionProgramadaData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching meetings', { error: message, espacioId });
      return [];
    }
  }

  async crearReunion(datos: DatosCrearReunion): Promise<ReunionProgramadaData | null> {
    try {
      const { data, error } = await supabase
        .from('reuniones_programadas')
        .insert({
          espacio_id: datos.espacio_id,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          fecha_inicio: datos.fecha_inicio,
          fecha_fin: datos.fecha_fin,
          creado_por: datos.creado_por,
          tipo_reunion: datos.tipo_reunion,
          es_recurrente: datos.es_recurrente ?? false,
          recurrencia_regla: datos.recurrencia_regla,
          recordatorio_minutos: datos.recordatorio_minutos ?? 15,
          google_event_id: datos.google_event_id,
          meeting_link: datos.meeting_link,
        })
        .select(
          '*, creador:usuarios!reuniones_programadas_creado_por_usuarios_fkey(id, nombre, email, avatar_url), sala:salas_reunion(id, nombre)'
        )
        .single();

      if (error || !data) {
        log.warn('Failed to create meeting', { error: error?.message, titulo: datos.titulo });
        return null;
      }
      log.info('Meeting created', { reunionId: data.id, titulo: data.titulo });
      return data as ReunionProgramadaData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating meeting', { error: message });
      return null;
    }
  }

  async actualizarReunion(
    reunionId: string,
    datos: Partial<ReunionProgramadaData>,
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reuniones_programadas')
        .update({
          sala_id: datos.sala_id,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          fecha_inicio: datos.fecha_inicio,
          fecha_fin: datos.fecha_fin,
          meeting_link: datos.meeting_link,
          google_event_id: datos.google_event_id,
          tipo_reunion: datos.tipo_reunion,
          recordatorio_minutos: datos.recordatorio_minutos,
        })
        .eq('id', reunionId);

      if (error) {
        log.warn('Failed to update meeting', { error: error.message, reunionId });
        return false;
      }
      log.info('Meeting updated', { reunionId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating meeting', { error: message, reunionId });
      return false;
    }
  }

  async eliminarReunion(reunionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reuniones_programadas')
        .delete()
        .eq('id', reunionId);

      if (error) {
        log.warn('Failed to delete meeting', { error: error.message, reunionId });
        return false;
      }
      log.info('Meeting deleted', { reunionId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception deleting meeting', { error: message, reunionId });
      return false;
    }
  }

  async obtenerReunionPorId(reunionId: string): Promise<ReunionProgramadaData | null> {
    try {
      const { data, error } = await supabase
        .from('reuniones_programadas')
        .select(
          '*, creador:usuarios!reuniones_programadas_creado_por_usuarios_fkey(id, nombre, email, avatar_url), sala:salas_reunion(id, nombre), participantes:reunion_participantes(id, reunion_id, usuario_id, estado, notificado, usuario:usuarios(id, nombre, email, avatar_url))'
        )
        .eq('id', reunionId)
        .single();

      if (error) {
        log.warn('Failed to fetch meeting by ID', { error: error.message, reunionId });
        return null;
      }
      return (data as ReunionProgramadaData) || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching meeting by ID', { error: message, reunionId });
      return null;
    }
  }

  async agregarParticipanteReunion(
    datos: DatosAgregarParticipante,
  ): Promise<ParticipanteReunionData | null> {
    try {
      const { data, error } = await supabase
        .from('reunion_participantes')
        .insert({
          reunion_id: datos.reunion_id,
          usuario_id: datos.usuario_id,
          estado: datos.estado ?? 'pendiente',
          notificado: false,
        })
        .select('*, usuario:usuarios(id, nombre, email, avatar_url)')
        .single();

      if (error || !data) {
        log.warn('Failed to add meeting participant', {
          error: error?.message, reunionId: datos.reunion_id,
        });
        return null;
      }
      log.info('Meeting participant added', {
        reunionId: datos.reunion_id, usuarioId: datos.usuario_id,
      });
      return data as ParticipanteReunionData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding meeting participant', { error: message });
      return null;
    }
  }

  async agregarParticipantesReunion(
    reunionId: string,
    participantes: Array<{ usuario_id: string; estado?: string }>,
  ): Promise<boolean> {
    try {
      const datos = participantes.map((p) => ({
        reunion_id: reunionId,
        usuario_id: p.usuario_id,
        estado: p.estado ?? 'pendiente',
        notificado: false,
      }));
      const { error } = await supabase.from('reunion_participantes').insert(datos);

      if (error) {
        log.warn('Failed to add meeting participants', {
          error: error.message, reunionId, count: participantes.length,
        });
        return false;
      }
      log.info('Meeting participants added', { reunionId, count: participantes.length });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding meeting participants', { error: message, reunionId });
      return false;
    }
  }

  async actualizarRespuestaParticipante(
    reunionId: string,
    usuarioId: string,
    estado: 'aceptado' | 'rechazado' | 'tentativo',
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reunion_participantes')
        .update({ estado })
        .eq('reunion_id', reunionId)
        .eq('usuario_id', usuarioId);

      if (error) {
        log.warn('Failed to update participant response', {
          error: error.message, reunionId, usuarioId,
        });
        return false;
      }
      log.info('Participant response updated', { reunionId, usuarioId, estado });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating participant response', {
        error: message, reunionId, usuarioId,
      });
      return false;
    }
  }

  async actualizarParticipantesNotificados(reunionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reunion_participantes')
        .update({ notificado: true })
        .eq('reunion_id', reunionId)
        .eq('notificado', false);

      if (error) {
        log.warn('Failed to update participants notified', {
          error: error.message, reunionId,
        });
        return false;
      }
      log.info('Participants marked as notified', { reunionId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating participants notified', { error: message, reunionId });
      return false;
    }
  }

  async crearInvitacionExterna(
    datos: DatosCrearInvitacionExterna,
  ): Promise<{ id: string; token: string } | null> {
    try {
      const { data, error } = await supabase
        .from('invitaciones_reunion')
        .insert({
          sala_id: datos.sala_id,
          email: datos.email,
          nombre: datos.nombre,
          token: datos.token,
          token_hash: datos.token_hash,
          expira_en: datos.expira_en,
        })
        .select('id, token')
        .single();

      if (error || !data) {
        log.warn('Failed to create external invitation', {
          error: error?.message, salaId: datos.sala_id,
        });
        return null;
      }
      log.info('External invitation created', {
        salaId: datos.sala_id, invitacionId: data.id,
      });
      return { id: data.id, token: data.token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating external invitation', { error: message });
      return null;
    }
  }
}

export const reunionesProgramadasRepository: IReunionesProgramadasRepository =
  new ReunionesProgramadasSupabaseRepository();
