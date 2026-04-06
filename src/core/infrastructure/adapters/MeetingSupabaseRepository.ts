/**
 * @module infrastructure/adapters/MeetingSupabaseRepository
 * @description Supabase implementation of IMeetingRepository.
 * Encapsulates all Supabase PostgREST calls for meeting operations.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase JS v2 — from, select, insert, update, delete.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IMeetingRepository,
  ReunionProgramadaData,
  SalaReunionData,
  ParticipanteSalaData,
  ParticipanteReunionData,
  MiembroBasicoData,
  DatosCrearReunion,
  DatosCrearSala,
  DatosAgregarParticipante,
  DatosAgregarParticipanteSala,
  DatosCrearInvitacionExterna,
} from '../../domain/ports/IMeetingRepository';

const log = logger.child('meeting-repo');

/**
 * Meeting repository singleton implementation.
 * All methods handle errors gracefully and log at appropriate levels.
 */
export class MeetingSupabaseRepository implements IMeetingRepository {
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
        log.warn('Failed to fetch meetings', {
          error: error.message,
          espacioId,
        });
        return [];
      }

      return (data as ReunionProgramadaData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching meetings', {
        error: message,
        espacioId,
      });
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
        log.warn('Failed to create meeting', {
          error: error?.message,
          titulo: datos.titulo,
        });
        return null;
      }

      log.info('Meeting created', {
        reunionId: data.id,
        titulo: data.titulo,
      });
      return data as ReunionProgramadaData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating meeting', { error: message });
      return null;
    }
  }

  async actualizarReunion(
    reunionId: string,
    datos: Partial<ReunionProgramadaData>
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
        log.warn('Failed to update meeting', {
          error: error.message,
          reunionId,
        });
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
        log.warn('Failed to delete meeting', {
          error: error.message,
          reunionId,
        });
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
        log.warn('Failed to create room', {
          error: error?.message,
          nombre: datos.nombre,
        });
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
      const { error } = await supabase
        .from('salas_reunion')
        .delete()
        .eq('id', salaId);

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

  async obtenerParticipantesSala(salaId: string): Promise<ParticipanteSalaData[]> {
    try {
      const { data, error } = await supabase
        .from('participantes_sala')
        .select(
          '*, usuario:usuarios!participantes_sala_usuario_id_fkey(id, nombre, email, avatar_url)'
        )
        .eq('sala_id', salaId);

      if (error) {
        log.warn('Failed to fetch room participants', {
          error: error.message,
          salaId,
        });
        return [];
      }

      return (data as ParticipanteSalaData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching room participants', {
        error: message,
        salaId,
      });
      return [];
    }
  }

  async agregarParticipanteSala(
    datos: DatosAgregarParticipanteSala
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
          error: error?.message,
          salaId: datos.sala_id,
        });
        return null;
      }

      log.info('Room participant added', {
        salaId: datos.sala_id,
        usuarioId: datos.usuario_id,
      });
      return data as ParticipanteSalaData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding room participant', { error: message });
      return null;
    }
  }

  async eliminarParticipanteSala(
    salaId: string,
    usuarioId: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('participantes_sala')
        .delete()
        .eq('sala_id', salaId)
        .eq('usuario_id', usuarioId);

      if (error) {
        log.warn('Failed to remove room participant', {
          error: error.message,
          salaId,
          usuarioId,
        });
        return false;
      }

      log.info('Room participant removed', { salaId, usuarioId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception removing room participant', {
        error: message,
        salaId,
        usuarioId,
      });
      return false;
    }
  }

  async agregarParticipanteReunion(
    datos: DatosAgregarParticipante
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
        .select(
          '*, usuario:usuarios(id, nombre, email, avatar_url)'
        )
        .single();

      if (error || !data) {
        log.warn('Failed to add meeting participant', {
          error: error?.message,
          reunionId: datos.reunion_id,
        });
        return null;
      }

      log.info('Meeting participant added', {
        reunionId: datos.reunion_id,
        usuarioId: datos.usuario_id,
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
    participantes: Array<{ usuario_id: string; estado?: string }>
  ): Promise<boolean> {
    try {
      const datos = participantes.map((p) => ({
        reunion_id: reunionId,
        usuario_id: p.usuario_id,
        estado: p.estado ?? 'pendiente',
        notificado: false,
      }));

      const { error } = await supabase
        .from('reunion_participantes')
        .insert(datos);

      if (error) {
        log.warn('Failed to add meeting participants', {
          error: error.message,
          reunionId,
          count: participantes.length,
        });
        return false;
      }

      log.info('Meeting participants added', {
        reunionId,
        count: participantes.length,
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding meeting participants', {
        error: message,
        reunionId,
      });
      return false;
    }
  }

  async actualizarRespuestaParticipante(
    reunionId: string,
    usuarioId: string,
    estado: 'aceptado' | 'rechazado' | 'tentativo'
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reunion_participantes')
        .update({ estado: estado })
        .eq('reunion_id', reunionId)
        .eq('usuario_id', usuarioId);

      if (error) {
        log.warn('Failed to update participant response', {
          error: error.message,
          reunionId,
          usuarioId,
        });
        return false;
      }

      log.info('Participant response updated', {
        reunionId,
        usuarioId,
        estado,
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating participant response', {
        error: message,
        reunionId,
        usuarioId,
      });
      return false;
    }
  }

  async actualizarParticipantesNotificados(
    reunionId: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('reunion_participantes')
        .update({
          notificado: true,
        })
        .eq('reunion_id', reunionId)
        .eq('notificado', false);

      if (error) {
        log.warn('Failed to update participants notified', {
          error: error.message,
          reunionId,
        });
        return false;
      }

      log.info('Participants marked as notified', { reunionId });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating participants notified', {
        error: message,
        reunionId,
      });
      return false;
    }
  }

  async crearInvitacionExterna(
    datos: DatosCrearInvitacionExterna
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
          error: error?.message,
          salaId: datos.sala_id,
        });
        return null;
      }

      log.info('External invitation created', {
        salaId: datos.sala_id,
        invitacionId: data.id,
      });
      return { id: data.id, token: data.token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating external invitation', { error: message });
      return null;
    }
  }

  async obtenerMiembrosEspacio(espacioId: string): Promise<MiembroBasicoData[]> {
    try {
      const { data: miembroData, error: miembroError } = await supabase
        .from('miembros_espacio')
        .select('usuario_id')
        .eq('espacio_id', espacioId)
        .eq('aceptado', true);

      if (miembroError) {
        log.warn('Failed to fetch workspace members', {
          error: miembroError.message,
          espacioId,
        });
        return [];
      }

      if (!miembroData || miembroData.length === 0) {
        return [];
      }

      const userIds = miembroData.map((m: any) => m.usuario_id);

      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuarios')
        .select('id, nombre, email, avatar_url')
        .in('id', userIds);

      if (usuariosError) {
        log.warn('Failed to fetch user details', {
          error: usuariosError.message,
          espacioId,
        });
        return [];
      }

      return (usuarios as MiembroBasicoData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching workspace members', {
        error: message,
        espacioId,
      });
      return [];
    }
  }

  async obtenerInfoUsuarios(userIds: string[]): Promise<MiembroBasicoData[]> {
    try {
      if (userIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, avatar_url')
        .in('id', userIds);

      if (error) {
        log.warn('Failed to fetch user info', {
          error: error.message,
          count: userIds.length,
        });
        return [];
      }

      return (data as MiembroBasicoData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching user info', { error: message });
      return [];
    }
  }

  async obtenerCargoUsuario(
    espacioId: string,
    usuarioId: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('miembros_espacio')
        .select('cargo_ref:cargos_laborales(clave)')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

      if (error) {
        log.warn('Failed to fetch user role', {
          error: error.message,
          espacioId,
          usuarioId,
        });
        return null;
      }

      const clave = (data?.cargo_ref as any)?.clave;
      return clave || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching user role', {
        error: message,
        espacioId,
        usuarioId,
      });
      return null;
    }
  }

  async actualizarSalaActiva(salaId: string, activa: boolean): Promise<boolean> {
    try {
      const update: any = { activa };
      if (!activa) {
        update.finalizado_en = new Date().toISOString();
      }

      const { error } = await supabase
        .from('salas_reunion')
        .update(update)
        .eq('id', salaId);

      if (error) {
        log.warn('Failed to update room active status', {
          error: error.message,
          salaId,
        });
        return false;
      }

      log.info('Room active status updated', { salaId, activa });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating room active status', {
        error: message,
        salaId,
      });
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
        log.warn('Failed to fetch meeting by ID', {
          error: error.message,
          reunionId,
        });
        return null;
      }

      return (data as ReunionProgramadaData) || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching meeting by ID', {
        error: message,
        reunionId,
      });
      return null;
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
        log.warn('Failed to fetch room by ID', {
          error: error.message,
          salaId,
        });
        return null;
      }

      return (data as SalaReunionData) || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching room by ID', {
        error: message,
        salaId,
      });
      return null;
    }
  }
}

/**
 * Singleton instance of the meeting repository.
 * Export this for use in use cases via dependency injection.
 */
export const meetingRepository = new MeetingSupabaseRepository();
