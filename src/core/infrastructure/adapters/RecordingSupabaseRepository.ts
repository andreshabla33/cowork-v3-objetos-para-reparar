/**
 * @module infrastructure/adapters/RecordingSupabaseRepository
 * @description Supabase implementation of IRecordingRepository port.
 * Handles all database operations for recording data: metadata, transcriptions,
 * behavioral analysis, AI summaries, and related entities.
 *
 * Clean Architecture: Infrastructure layer adapter that implements domain port.
 * Dependency Inversion: Domain depends on interface, not on Supabase directly.
 *
 * Key practices:
 * - No `any` types; use `unknown` with type guards
 * - Structured logging via logger.child()
 * - Error handling with descriptive messages
 * - Batch processing for large datasets (50 records per batch)
 * - Type-safe cargo extraction from joins
 *
 * @see IRecordingRepository — Domain port interface
 * @see Supabase JS v2 — .maybeSingle(), .in(), .eq(), etc.
 */

import type {
  AnalisisComportamientoRecord,
  CargoYRolUsuario,
  CompletarGrabacionData,
  ConsentimientoGrabacionData,
  CrearGrabacionData,
  ErrorGrabacionData,
  GrabacionRecord,
  GenerarResumenAIData,
  IRecordingRepository,
  NotificacionAnalisisData,
  ParticipanteGrabacionRecord,
  ResumenAIRecord,
  TranscripcionRecord,
} from '@/core/domain/ports/IRecordingRepository';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const log = logger.child('recording-repository');

/**
 * Type guard for cargo reference join result.
 * Safely extracts cargo.clave from Supabase join without `as any`.
 */
interface CargoRefJoin {
  clave?: string;
}

/**
 * Supabase implementation of IRecordingRepository.
 * All methods follow Supabase JS v2 patterns:
 * - `.maybeSingle()` for optional single rows
 * - `.in()` for array filters
 * - Batch inserts for large datasets
 * - Auth token injection for Edge Functions
 *
 * Error strategy: Log full error, re-throw with descriptive message.
 */
class RecordingSupabaseRepository implements IRecordingRepository {
  /**
   * Create a new recording record.
   * Initializes a recording session in 'grabando' state.
   */
  async crearGrabacion(data: CrearGrabacionData): Promise<void> {
    try {
      log.debug('Creating recording', { grabacionId: data.id, espacioId: data.espacio_id });

      const { error } = await supabase
        .from('grabaciones')
        .insert([data]);

      if (error) {
        log.error('Failed to create recording', { error: error.message, grabacionId: data.id });
        throw new Error(`Failed to create recording ${data.id}: ${error.message}`);
      }

      log.info('Recording created', { grabacionId: data.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in crearGrabacion', { message });
      throw err;
    }
  }

  /**
   * Update recording status to completed.
   * Finalizes a recording with duration and file metadata.
   */
  async completarGrabacion(
    grabacionId: string,
    data: CompletarGrabacionData,
  ): Promise<void> {
    try {
      log.debug('Completing recording', {
        grabacionId,
        duracion_segundos: data.duracion_segundos,
      });

      const { error } = await supabase
        .from('grabaciones')
        .update(data)
        .eq('id', grabacionId);

      if (error) {
        log.error('Failed to complete recording', {
          error: error.message,
          grabacionId,
        });
        throw new Error(`Failed to complete recording ${grabacionId}: ${error.message}`);
      }

      log.info('Recording completed', { grabacionId, duracion_segundos: data.duracion_segundos });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in completarGrabacion', { message, grabacionId });
      throw err;
    }
  }

  /**
   * Update recording status to error.
   * Marks a recording as failed with error message.
   */
  async marcarGrabacionError(
    grabacionId: string,
    data: ErrorGrabacionData,
  ): Promise<void> {
    try {
      log.debug('Marking recording as error', { grabacionId, errorMsg: data.error_mensaje });

      const { error } = await supabase
        .from('grabaciones')
        .update(data)
        .eq('id', grabacionId);

      if (error) {
        log.error('Failed to mark recording as error', {
          error: error.message,
          grabacionId,
        });
        throw new Error(`Failed to mark recording as error ${grabacionId}: ${error.message}`);
      }

      log.warn('Recording marked as error', { grabacionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in marcarGrabacionError', { message, grabacionId });
      throw err;
    }
  }

  /**
   * Update consent status on a recording.
   * Records when an evaluated user grants/denies recording consent.
   */
  async actualizarConsentimiento(
    grabacionId: string,
    data: ConsentimientoGrabacionData,
  ): Promise<void> {
    try {
      log.debug('Updating consent status', { grabacionId });

      const { error } = await supabase
        .from('grabaciones')
        .update(data)
        .eq('id', grabacionId);

      if (error) {
        log.error('Failed to update consent', { error: error.message, grabacionId });
        throw new Error(`Failed to update consent for recording ${grabacionId}: ${error.message}`);
      }

      log.info('Consent status updated', { grabacionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in actualizarConsentimiento', { message, grabacionId });
      throw err;
    }
  }

  /**
   * Request consent from evaluated user via RPC.
   * Invokes backend procedure to initiate consent request flow.
   */
  async solicitarConsentimientoGrabacion(
    grabacionId: string,
    evaluadoId: string,
    tipoGrabacion: string,
  ): Promise<void> {
    try {
      log.debug('Requesting consent via RPC', {
        grabacionId,
        evaluadoId,
        tipoGrabacion,
      });

      const { error } = await supabase.rpc('solicitar_consentimiento_grabacion', {
        p_grabacion_id: grabacionId,
        p_evaluado_id: evaluadoId,
        p_tipo_grabacion: tipoGrabacion,
      });

      if (error) {
        log.error('RPC failed for consent request', {
          error: error.message,
          grabacionId,
          evaluadoId,
        });
        throw new Error(
          `Failed to request consent for recording ${grabacionId}: ${error.message}`,
        );
      }

      log.info('Consent requested via RPC', { grabacionId, evaluadoId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in solicitarConsentimientoGrabacion', { message, grabacionId });
      throw err;
    }
  }

  /**
   * Register a participant in a recording.
   * Links a user to a recording session with consent metadata.
   */
  async registrarParticipante(data: ParticipanteGrabacionRecord): Promise<void> {
    try {
      log.debug('Registering participant', {
        grabacionId: data.grabacion_id,
        usuarioId: data.usuario_id,
      });

      const { error } = await supabase
        .from('participantes_grabacion')
        .insert([data]);

      if (error) {
        log.error('Failed to register participant', {
          error: error.message,
          grabacionId: data.grabacion_id,
          usuarioId: data.usuario_id,
        });
        throw new Error(`Failed to register participant: ${error.message}`);
      }

      log.info('Participant registered', {
        grabacionId: data.grabacion_id,
        usuarioId: data.usuario_id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in registrarParticipante', { message });
      throw err;
    }
  }

  /**
   * Save transcription record.
   * Stores a single transcription segment (timestamped text).
   */
  async guardarTranscripcion(data: TranscripcionRecord): Promise<void> {
    try {
      log.debug('Saving transcription', {
        grabacionId: data.grabacion_id,
        inicio: data.inicio_segundos,
        fin: data.fin_segundos,
      });

      const { error } = await supabase
        .from('transcripciones')
        .insert([data]);

      if (error) {
        log.error('Failed to save transcription', {
          error: error.message,
          grabacionId: data.grabacion_id,
        });
        throw new Error(`Failed to save transcription: ${error.message}`);
      }

      log.debug('Transcription saved', { grabacionId: data.grabacion_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in guardarTranscripcion', { message });
      throw err;
    }
  }

  /**
   * Save behavioral analysis records in batches.
   * Efficiently stores multiple emotion/engagement data points.
   * Processes in batches of 50 records to avoid payload limits.
   */
  async guardarAnalisisComportamiento(records: AnalisisComportamientoRecord[]): Promise<void> {
    try {
      if (records.length === 0) {
        log.debug('No analysis records to save');
        return;
      }

      log.debug('Saving behavioral analysis records', { count: records.length });

      const BATCH_SIZE = 50;
      const batches: AnalisisComportamientoRecord[][] = [];

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        batches.push(records.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        log.debug('Inserting batch', {
          batchIndex: batchIndex + 1,
          batchTotal: batches.length,
          recordCount: batch.length,
        });

        const { error } = await supabase
          .from('analisis_comportamiento')
          .insert(batch);

        if (error) {
          log.error('Failed to insert batch', {
            error: error.message,
            batchIndex: batchIndex + 1,
          });
          throw new Error(`Failed to insert batch ${batchIndex + 1}: ${error.message}`);
        }
      }

      log.info('All analysis records saved', {
        totalRecords: records.length,
        batchCount: batches.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in guardarAnalisisComportamiento', { message, recordCount: records.length });
      throw err;
    }
  }

  /**
   * Generate AI summary via Edge Function.
   * Invokes cloud function to process recording and create summaries.
   * Uses session auth token and 60-second timeout.
   */
  async generarResumenAI(data: GenerarResumenAIData): Promise<void> {
    try {
      log.debug('Generating AI summary', { grabacionId: data.grabacion_id });

      // Get session auth token for Edge Function authorization
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        log.error('No auth token available for Edge Function', {
          grabacionId: data.grabacion_id,
        });
        throw new Error('No authentication token available for AI summary generation');
      }

      // Invoke Edge Function with 60-second timeout via Promise.race
      const invokePromise = supabase.functions.invoke('generar-resumen-ai', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: data,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Edge Function call timed out after 60 seconds')), 60000);
      });

      const { data: result, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (error) {
        log.error('Edge Function failed', {
          error: error.message,
          grabacionId: data.grabacion_id,
        });
        throw new Error(
          `Failed to generate AI summary for recording ${data.grabacion_id}: ${error.message}`,
        );
      }

      log.info('AI summary generated', {
        grabacionId: data.grabacion_id,
        result: result !== null && typeof result === 'object' ? 'completed' : 'no result',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in generarResumenAI', { message, grabacionId: data.grabacion_id });
      throw err;
    }
  }

  /**
   * Create notification for completed analysis.
   * Notifies user when recording analysis finishes.
   */
  async crearNotificacionAnalisis(data: NotificacionAnalisisData): Promise<void> {
    try {
      log.debug('Creating analysis notification', {
        usuarioId: data.usuario_id,
        grabacionId: data.entidad_id,
      });

      const { error } = await supabase
        .from('notificaciones')
        .insert([data]);

      if (error) {
        log.error('Failed to create notification', {
          error: error.message,
          usuarioId: data.usuario_id,
        });
        throw new Error(`Failed to create notification: ${error.message}`);
      }

      log.info('Analysis notification created', {
        usuarioId: data.usuario_id,
        grabacionId: data.entidad_id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in crearNotificacionAnalisis', { message });
      throw err;
    }
  }

  /**
   * Fetch recordings created by user in a workspace.
   * Returns all recordings where user is the creator.
   * Orders by creation date, newest first.
   */
  async obtenerGrabacionesCreador(
    espacioId: string,
    userId: string,
  ): Promise<GrabacionRecord[]> {
    try {
      log.debug('Fetching recordings created by user', { espacioId, userId });

      const { data, error } = await supabase
        .from('grabaciones')
        .select('*')
        .eq('espacio_id', espacioId)
        .eq('creado_por', userId)
        .order('creado_en', { ascending: false });

      if (error) {
        log.error('Failed to fetch creator recordings', {
          error: error.message,
          espacioId,
          userId,
        });
        throw new Error(`Failed to fetch recordings: ${error.message}`);
      }

      log.debug('Creator recordings fetched', { count: data?.length ?? 0 });
      return data ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in obtenerGrabacionesCreador', { message, espacioId, userId });
      throw err;
    }
  }

  /**
   * Fetch recording IDs where user is a participant.
   * Returns IDs of all recordings the user participated in.
   */
  async obtenerGrabacionesParticipante(userId: string): Promise<string[]> {
    try {
      log.debug('Fetching participant recording IDs', { userId });

      const { data, error } = await supabase
        .from('participantes_grabacion')
        .select('grabacion_id')
        .eq('usuario_id', userId);

      if (error) {
        log.error('Failed to fetch participant recordings', {
          error: error.message,
          userId,
        });
        throw new Error(`Failed to fetch participant recordings: ${error.message}`);
      }

      const recordingIds = (data ?? []).map((row) => {
        const row_unknown = row as unknown;
        if (row_unknown !== null && typeof row_unknown === 'object' && 'grabacion_id' in row_unknown) {
          return (row_unknown as { grabacion_id: unknown }).grabacion_id;
        }
        return undefined;
      }).filter((id): id is string => typeof id === 'string');

      log.debug('Participant recording IDs fetched', { count: recordingIds.length });
      return recordingIds;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in obtenerGrabacionesParticipante', { message, userId });
      throw err;
    }
  }

  /**
   * Fetch recordings by IDs (excluding creator's) in a workspace.
   * Returns specified recordings, filtering out creator's own recordings.
   * Orders by creation date, newest first.
   */
  async obtenerGrabacionesPorIds(
    espacioId: string,
    ids: string[],
    excludeCreadorId: string,
  ): Promise<GrabacionRecord[]> {
    try {
      log.debug('Fetching recordings by IDs', {
        espacioId,
        idCount: ids.length,
        excludeCreadorId,
      });

      if (ids.length === 0) {
        log.debug('No recording IDs provided, returning empty array');
        return [];
      }

      const { data, error } = await supabase
        .from('grabaciones')
        .select('*')
        .eq('espacio_id', espacioId)
        .in('id', ids)
        .neq('creado_por', excludeCreadorId)
        .order('creado_en', { ascending: false });

      if (error) {
        log.error('Failed to fetch recordings by IDs', {
          error: error.message,
          espacioId,
          idCount: ids.length,
        });
        throw new Error(`Failed to fetch recordings: ${error.message}`);
      }

      log.debug('Recordings by IDs fetched', { count: data?.length ?? 0 });
      return data ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in obtenerGrabacionesPorIds', {
        message,
        espacioId,
        idCount: ids.length,
      });
      throw err;
    }
  }

  /**
   * Fetch related data (transcriptions, analysis, summaries) for a recording.
   * Loads all dependent data for a single recording.
   * Optionally includes behavioral analysis records (limited to 100).
   */
  async obtenerDatosRelacionados(
    grabacionId: string,
    incluirAnalisis: boolean,
  ): Promise<{
    transcripciones: TranscripcionRecord[];
    analisis_comportamiento: AnalisisComportamientoRecord[];
    resumenes_ai: ResumenAIRecord[];
  }> {
    try {
      log.debug('Fetching related data for recording', {
        grabacionId,
        incluirAnalisis,
      });

      // Fetch transcriptions
      const { data: transcripciones, error: transcripcionError } = await supabase
        .from('transcripciones')
        .select('*')
        .eq('grabacion_id', grabacionId);

      if (transcripcionError) {
        log.error('Failed to fetch transcriptions', {
          error: transcripcionError.message,
          grabacionId,
        });
        throw new Error(`Failed to fetch transcriptions: ${transcripcionError.message}`);
      }

      // Fetch AI summaries
      const { data: resumenes_ai, error: resumenError } = await supabase
        .from('resumenes_ai')
        .select('*')
        .eq('grabacion_id', grabacionId);

      if (resumenError) {
        log.error('Failed to fetch AI summaries', {
          error: resumenError.message,
          grabacionId,
        });
        throw new Error(`Failed to fetch summaries: ${resumenError.message}`);
      }

      // Conditionally fetch behavioral analysis (limit 100)
      let analisis_comportamiento: AnalisisComportamientoRecord[] = [];

      if (incluirAnalisis) {
        const { data: analisisData, error: analisisError } = await supabase
          .from('analisis_comportamiento')
          .select('*')
          .eq('grabacion_id', grabacionId)
          .limit(100);

        if (analisisError) {
          log.error('Failed to fetch behavioral analysis', {
            error: analisisError.message,
            grabacionId,
          });
          throw new Error(`Failed to fetch analysis: ${analisisError.message}`);
        }

        analisis_comportamiento = analisisData ?? [];
      }

      log.debug('Related data fetched', {
        grabacionId,
        transcripcionCount: transcripciones?.length ?? 0,
        analisisCount: analisis_comportamiento.length,
        resumenCount: resumenes_ai?.length ?? 0,
      });

      return {
        transcripciones: transcripciones ?? [],
        analisis_comportamiento,
        resumenes_ai: resumenes_ai ?? [],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in obtenerDatosRelacionados', {
        message,
        grabacionId,
        incluirAnalisis,
      });
      throw err;
    }
  }

  /**
   * Get user cargo and rol from miembros_espacio.
   * Retrieves user's position and role in a workspace.
   * Safely extracts cargo.clave from join without `as any`.
   */
  async obtenerCargoYRol(
    userId: string,
    espacioId: string,
  ): Promise<CargoYRolUsuario> {
    try {
      log.debug('Fetching cargo and rol for user', { userId, espacioId });

      const { data, error } = await supabase
        .from('miembros_espacio')
        .select('cargo_id, rol, cargo_ref:cargos!cargo_id(clave)')
        .eq('usuario_id', userId)
        .eq('espacio_id', espacioId)
        .maybeSingle();

      if (error) {
        log.error('Failed to fetch cargo and rol', {
          error: error.message,
          userId,
          espacioId,
        });
        throw new Error(`Failed to fetch user cargo and rol: ${error.message}`);
      }

      if (!data) {
        log.debug('No membership found for user', { userId, espacioId });
        return { cargo: null, rol: null };
      }

      // Type-safe cargo extraction from join
      const cargoRef = data.cargo_ref as CargoRefJoin | null;
      const cargo = cargoRef?.clave ?? null;

      // Extract rol safely
      const rol = data !== null && typeof data === 'object' && 'rol' in data
        ? (data as { rol: unknown }).rol
        : null;

      const result: CargoYRolUsuario = {
        cargo,
        rol: typeof rol === 'string' ? rol : null,
      };

      log.debug('Cargo and rol fetched', { userId, cargo: result.cargo, rol: result.rol });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error in obtenerCargoYRol', { message, userId, espacioId });
      throw err;
    }
  }
}

/**
 * Singleton instance of RecordingSupabaseRepository.
 * Use this instance across the application for consistency.
 * Dependency injection is not required; this is the single point of access.
 */
export const recordingRepository = new RecordingSupabaseRepository();
