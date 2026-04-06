/**
 * @module hooks/meetings/useRecordingManager
 * @description Hook that extracts all Supabase direct access from RecordingManager.tsx
 * into a clean interface using application use cases.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access — all data flows through repository ports.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 * Pattern: Same as useBuildMode.ts — singleton use case instances instantiated at module level.
 */

import { useCallback } from 'react';
import { logger } from '@/lib/logger';
import type {
  IRecordingRepository,
  CrearGrabacionData,
  CompletarGrabacionData,
  ErrorGrabacionData,
  ConsentimientoGrabacionData,
  ParticipanteGrabacionRecord,
  TranscripcionRecord,
  AnalisisComportamientoRecord,
  GenerarResumenAIData,
  NotificacionAnalisisData,
} from '@/src/core/domain/ports/IRecordingRepository';

// Adapter (singleton instance)
import { recordingRepository } from '@/src/core/infrastructure/adapters/RecordingSupabaseRepository';

// Use cases
import { GestionarGrabacionUseCase } from '@/src/core/application/usecases/GestionarGrabacionUseCase';
import { ProcesarGrabacionUseCase } from '@/src/core/application/usecases/ProcesarGrabacionUseCase';

const log = logger.child('use-recording-manager');

// Singleton use case instances
const gestionarGrabacion = new GestionarGrabacionUseCase(recordingRepository);
const procesarGrabacion = new ProcesarGrabacionUseCase(recordingRepository);

/**
 * Parameters for creating a recording.
 */
export interface CrearGrabacionParams {
  grabacionId: string;
  espacioId: string;
  userId: string;
  tipo: string;
  formato: string;
  evaluadoId?: string | null;
  evaluadoNombre?: string | null;
  evaluadoEmail?: string | null;
}

/**
 * Parameters for registering a participant.
 */
export interface RegistrarParticipanteParams {
  grabacionId: string;
  userId: string;
  userName: string;
}

/**
 * Parameters for saving transcription.
 */
export interface GuardarTranscripcionParams {
  grabacionId: string;
  texto: string;
  duracion: number;
  userId: string;
  userName: string;
}

/**
 * Parameters for saving behavioral analysis.
 */
export interface GuardarAnalisisParams {
  grabacionId: string;
  frames: Array<{
    timestamp_segundos: number;
    emocion_dominante: string;
    engagement_score: number;
  }>;
  userId: string;
  userName: string;
}

/**
 * Parameters for generating AI summary.
 */
export interface GenerarResumenAIParams {
  grabacionId: string;
  espacioId: string;
  userId: string;
  transcripcion: string;
  emociones: Array<{
    timestamp_segundos: number;
    emocion_dominante: string;
    engagement_score: number;
  }>;
  duracion: number;
  participantes: string[];
  reunionTitulo?: string;
  tipoGrabacion: string | null;
  engagementPromedio: number;
  microexpresionesCount: number;
  totalFrames: number;
}

/**
 * Parameters for completing a recording.
 */
export interface CompletarGrabacionParams {
  grabacionId: string;
  duracion: number;
  archivoNombre: string;
}

/**
 * Parameters for creating a notification.
 */
export interface CrearNotificacionParams {
  userId: string;
  espacioId: string;
  titulo: string;
  mensaje: string;
  grabacionId: string;
}

/**
 * Return type for useRecordingManager hook.
 */
export interface UseRecordingManagerReturn {
  /**
   * Create recording record in DB and return grabacionId
   */
  crearGrabacion(params: CrearGrabacionParams): Promise<void>;

  /**
   * Request consent from evaluated user
   */
  solicitarConsentimiento(
    grabacionId: string,
    evaluadoId: string,
    tipo: string,
  ): Promise<void>;

  /**
   * Register the recorder as participant
   */
  registrarParticipante(params: RegistrarParticipanteParams): Promise<void>;

  /**
   * Save transcription to DB
   */
  guardarTranscripcion(params: GuardarTranscripcionParams): Promise<void>;

  /**
   * Save behavioral analysis records
   */
  guardarAnalisis(params: GuardarAnalisisParams): Promise<void>;

  /**
   * Generate AI summary via Edge Function
   */
  generarResumenAI(params: GenerarResumenAIParams): Promise<void>;

  /**
   * Mark recording as completed
   */
  completarGrabacion(params: CompletarGrabacionParams): Promise<void>;

  /**
   * Mark recording as error
   */
  marcarError(grabacionId: string, errorMensaje: string): Promise<void>;

  /**
   * Create notification for completed analysis
   */
  crearNotificacion(params: CrearNotificacionParams): Promise<void>;

  /**
   * Update consent response from evaluated user
   */
  actualizarConsentimiento(grabacionId: string, accepted: boolean): Promise<void>;
}

/**
 * Hook to manage recording operations via use cases.
 * Provides async methods that delegate to application layer use cases
 * without exposing Supabase directly.
 *
 * This is a PURE DATA hook — no UI state, no React state.
 * Just async methods that bridge the component to the use cases.
 *
 * @returns Methods for recording management operations
 *
 * @example
 * const recordingManager = useRecordingManager();
 * await recordingManager.crearGrabacion({
 *   grabacionId: 'uuid',
 *   espacioId: 'space-id',
 *   userId: 'user-id',
 *   tipo: 'rrhh_entrevista',
 *   formato: 'video/webm',
 * });
 */
export function useRecordingManager(): UseRecordingManagerReturn {
  /**
   * Create a new recording record in the database.
   */
  const crearGrabacion = useCallback(async (params: CrearGrabacionParams): Promise<void> => {
    try {
      log.debug('Creating recording', {
        grabacionId: params.grabacionId,
        espacioId: params.espacioId,
        tipo: params.tipo,
      });

      const createData: CrearGrabacionData = {
        id: params.grabacionId,
        espacio_id: params.espacioId,
        creado_por: params.userId,
        estado: 'grabando',
        inicio_grabacion: new Date().toISOString(),
        tipo: params.tipo,
        tiene_video: true,
        tiene_audio: true,
        formato: params.formato,
        evaluado_id: params.evaluadoId ?? null,
        evaluado_nombre: params.evaluadoNombre ?? null,
        evaluado_email: params.evaluadoEmail ?? null,
      };

      await gestionarGrabacion.crearGrabacion(createData);

      log.info('Recording created successfully', { grabacionId: params.grabacionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to create recording', {
        grabacionId: params.grabacionId,
        error: message,
      });
      throw err;
    }
  }, []);

  /**
   * Request consent from the evaluated user.
   */
  const solicitarConsentimiento = useCallback(
    async (grabacionId: string, evaluadoId: string, tipo: string): Promise<void> => {
      try {
        log.debug('Requesting consent from evaluated user', {
          grabacionId,
          evaluadoId,
          tipo,
        });

        await gestionarGrabacion.solicitarConsentimiento(grabacionId, evaluadoId, tipo);

        log.info('Consent request sent', { grabacionId, evaluadoId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to request consent', {
          grabacionId,
          evaluadoId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  /**
   * Register the recorder as a participant in the recording.
   */
  const registrarParticipante = useCallback(
    async (params: RegistrarParticipanteParams): Promise<void> => {
      try {
        log.debug('Registering participant', {
          grabacionId: params.grabacionId,
          userId: params.userId,
        });

        const participantData: ParticipanteGrabacionRecord = {
          grabacion_id: params.grabacionId,
          usuario_id: params.userId,
          nombre_mostrado: params.userName,
          es_evaluado: false,
          consentimiento_dado: true,
          consentimiento_fecha: new Date().toISOString(),
        };

        await gestionarGrabacion.registrarParticipante(participantData);

        log.info('Participant registered', {
          grabacionId: params.grabacionId,
          userId: params.userId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to register participant', {
          grabacionId: params.grabacionId,
          userId: params.userId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  /**
   * Save transcription to the database.
   */
  const guardarTranscripcion = useCallback(
    async (params: GuardarTranscripcionParams): Promise<void> => {
      try {
        log.debug('Saving transcription', {
          grabacionId: params.grabacionId,
          length: params.texto.length,
        });

        const transcripcionData: TranscripcionRecord = {
          grabacion_id: params.grabacionId,
          texto: params.texto,
          inicio_segundos: 0,
          fin_segundos: params.duracion,
          speaker_id: params.userId,
          speaker_nombre: params.userName,
          confianza: 0.9,
          idioma: 'es',
        };

        await procesarGrabacion.guardarTranscripcion(transcripcionData);

        log.info('Transcription saved', {
          grabacionId: params.grabacionId,
          length: params.texto.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to save transcription', {
          grabacionId: params.grabacionId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  /**
   * Save behavioral analysis records (sampled).
   * Samples every 2nd frame and maps to AnalisisComportamientoRecord.
   */
  const guardarAnalisis = useCallback(async (params: GuardarAnalisisParams): Promise<void> => {
    try {
      log.debug('Saving behavioral analysis', {
        grabacionId: params.grabacionId,
        frameCount: params.frames.length,
      });

      // Sample every 2nd frame for better resolution
      const sampledFrames = params.frames.filter((_, i) => i % 2 === 0);

      const analisisRecords: AnalisisComportamientoRecord[] = sampledFrames.map(
        (frame) => ({
          id: crypto.randomUUID(),
          grabacion_id: params.grabacionId,
          timestamp_segundos: frame.timestamp_segundos,
          emocion_dominante: frame.emocion_dominante,
          engagement_score: frame.engagement_score,
          participante_id: params.userId,
          participante_nombre: params.userName,
        }),
      );

      await procesarGrabacion.guardarAnalisis(analisisRecords);

      log.info('Behavioral analysis saved', {
        grabacionId: params.grabacionId,
        recordCount: analisisRecords.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to save behavioral analysis', {
        grabacionId: params.grabacionId,
        error: message,
      });
      throw err;
    }
  }, []);

  /**
   * Generate AI summary via Edge Function.
   * Samples max 100 frames uniformly before calling.
   */
  const generarResumenAI = useCallback(async (params: GenerarResumenAIParams): Promise<void> => {
    try {
      log.debug('Generating AI summary', {
        grabacionId: params.grabacionId,
        emotionFrameCount: params.emociones.length,
      });

      // Sample max 100 frames uniformly
      const maxEmotionFrames = 100;
      const sampledEmociones =
        params.emociones.length <= maxEmotionFrames
          ? params.emociones
          : params.emociones.filter(
              (_, i) => i % Math.ceil(params.emociones.length / maxEmotionFrames) === 0,
            );

      const resumenData: GenerarResumenAIData = {
        grabacion_id: params.grabacionId,
        espacio_id: params.espacioId,
        creador_id: params.userId,
        transcripcion: params.transcripcion,
        emociones: sampledEmociones,
        duracion_segundos: params.duracion,
        participantes: params.participantes,
        reunion_titulo: params.reunionTitulo,
        tipo_grabacion: params.tipoGrabacion,
        metricas_adicionales: {
          engagement_promedio: params.engagementPromedio,
          microexpresiones_detectadas: params.microexpresionesCount,
          tipo_analisis: params.tipoGrabacion,
          total_emotion_frames: params.totalFrames,
        },
      };

      await procesarGrabacion.generarResumenAI(resumenData);

      log.info('AI summary generated', { grabacionId: params.grabacionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to generate AI summary', {
        grabacionId: params.grabacionId,
        error: message,
      });
      throw err;
    }
  }, []);

  /**
   * Mark a recording as completed.
   */
  const completarGrabacion = useCallback(
    async (params: CompletarGrabacionParams): Promise<void> => {
      try {
        log.debug('Completing recording', {
          grabacionId: params.grabacionId,
          duracion: params.duracion,
        });

        const completarData: CompletarGrabacionData = {
          estado: 'completado',
          duracion_segundos: params.duracion,
          fin_grabacion: new Date().toISOString(),
          archivo_nombre: params.archivoNombre,
        };

        await gestionarGrabacion.completarGrabacion(params.grabacionId, completarData);

        log.info('Recording completed', {
          grabacionId: params.grabacionId,
          duracion: params.duracion,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to complete recording', {
          grabacionId: params.grabacionId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  /**
   * Mark a recording as error.
   */
  const marcarError = useCallback(async (grabacionId: string, errorMensaje: string): Promise<void> => {
    try {
      log.warn('Marking recording as error', { grabacionId, errorMensaje });

      const errorData: ErrorGrabacionData = {
        estado: 'error',
        error_mensaje: errorMensaje,
      };

      await gestionarGrabacion.marcarError(grabacionId, errorData);

      log.warn('Recording marked as error', { grabacionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to mark recording as error', {
        grabacionId,
        error: message,
      });
      throw err;
    }
  }, []);

  /**
   * Create a notification for completed analysis.
   */
  const crearNotificacion = useCallback(
    async (params: CrearNotificacionParams): Promise<void> => {
      try {
        log.debug('Creating analysis notification', {
          userId: params.userId,
          grabacionId: params.grabacionId,
        });

        const notificacionData: NotificacionAnalisisData = {
          usuario_id: params.userId,
          espacio_id: params.espacioId,
          tipo: 'analisis_listo',
          titulo: params.titulo,
          mensaje: params.mensaje,
          entidad_tipo: 'grabacion',
          entidad_id: params.grabacionId,
        };

        await procesarGrabacion.crearNotificacion(notificacionData);

        log.info('Analysis notification created', {
          userId: params.userId,
          grabacionId: params.grabacionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to create notification', {
          userId: params.userId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  /**
   * Update consent response from the evaluated user.
   */
  const actualizarConsentimiento = useCallback(
    async (grabacionId: string, accepted: boolean): Promise<void> => {
      try {
        log.debug('Updating consent response', { grabacionId, accepted });

        const consentData: ConsentimientoGrabacionData = {
          consentimiento_evaluado: accepted,
          consentimiento_evaluado_fecha: new Date().toISOString(),
        };

        await gestionarGrabacion.actualizarConsentimiento(grabacionId, consentData);

        log.info('Consent updated', { grabacionId, accepted });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to update consent', {
          grabacionId,
          error: message,
        });
        throw err;
      }
    },
    [],
  );

  return {
    crearGrabacion,
    solicitarConsentimiento,
    registrarParticipante,
    guardarTranscripcion,
    guardarAnalisis,
    generarResumenAI,
    completarGrabacion,
    marcarError,
    crearNotificacion,
    actualizarConsentimiento,
  };
}
