/**
 * @module domain/ports/IRecordingRepository
 * @description Port interface for recording data operations.
 * Decouples recording logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * @see Supabase JS v2 — Storage, PostgREST, Edge Functions.
 * @see Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Recording record from 'grabaciones' table.
 * Represents a single recording session in a workspace.
 */
export interface GrabacionRecord {
  id: string;
  espacio_id: string;
  creado_por: string;
  estado: 'grabando' | 'procesando' | 'completado' | 'error';
  inicio_grabacion: string;
  fin_grabacion?: string | null;
  tipo: string;
  tiene_video: boolean;
  tiene_audio: boolean;
  formato: string;
  duracion_segundos?: number | null;
  archivo_nombre?: string | null;
  error_mensaje?: string | null;
  evaluado_id?: string | null;
  evaluado_nombre?: string | null;
  evaluado_email?: string | null;
  consentimiento_evaluado?: boolean | null;
  consentimiento_evaluado_fecha?: string | null;
  creado_en: string;
}

/**
 * Extended recording with related data for history view.
 * Includes computed flags and related records (transcriptions, analysis, summaries).
 */
export interface GrabacionConDatos extends GrabacionRecord {
  esCreador: boolean;
  esParticipante: boolean;
  usuario?: { nombre: string; apellido: string } | null;
  transcripciones?: TranscripcionRecord[];
  analisis_comportamiento?: AnalisisComportamientoRecord[];
  resumenes_ai?: ResumenAIRecord[];
}

/**
 * Transcription record from 'transcripciones' table.
 * Represents a segment of transcribed text from a recording.
 */
export interface TranscripcionRecord {
  id?: string;
  grabacion_id: string;
  texto: string;
  inicio_segundos: number;
  fin_segundos: number;
  speaker_id?: string | null;
  speaker_nombre?: string | null;
  confianza?: number;
  idioma?: string;
}

/**
 * Behavioral analysis record from 'analisis_comportamiento' table.
 * Represents emotion and engagement metrics at a specific timestamp.
 */
export interface AnalisisComportamientoRecord {
  id: string;
  grabacion_id: string;
  timestamp_segundos: number;
  emocion_dominante: string;
  engagement_score: number;
  participante_id?: string | null;
  participante_nombre?: string | null;
  emociones_detalle?: Record<string, number>;
}

/**
 * AI summary record from 'resumenes_ai' table.
 * Represents AI-generated summary data for a recording.
 */
export interface ResumenAIRecord {
  id?: string;
  grabacion_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: unknown;
}

/**
 * Participant in a recording from 'participantes_grabacion' table.
 * Links users to recordings and tracks consent status.
 */
export interface ParticipanteGrabacionRecord {
  grabacion_id: string;
  usuario_id: string;
  nombre_mostrado: string;
  es_evaluado: boolean;
  consentimiento_dado: boolean;
  consentimiento_fecha?: string | null;
}

/**
 * Data for creating a new recording.
 * Used when initializing a recording session.
 */
export interface CrearGrabacionData {
  id: string;
  espacio_id: string;
  creado_por: string;
  estado: 'grabando';
  inicio_grabacion: string;
  tipo: string;
  tiene_video: boolean;
  tiene_audio: boolean;
  formato: string;
  evaluado_id?: string | null;
  evaluado_nombre?: string | null;
  evaluado_email?: string | null;
}

/**
 * Data for completing a recording.
 * Used when transitioning from 'grabando' to 'completado'.
 */
export interface CompletarGrabacionData {
  estado: 'completado';
  duracion_segundos: number;
  fin_grabacion: string;
  archivo_nombre: string;
}

/**
 * Data for marking a recording as error.
 * Used when a recording encounters processing failure.
 */
export interface ErrorGrabacionData {
  estado: 'error';
  error_mensaje: string;
}

/**
 * Data for consent update.
 * Used when updating consent status for an evaluated user.
 */
export interface ConsentimientoGrabacionData {
  consentimiento_evaluado: boolean;
  consentimiento_evaluado_fecha: string;
}

/**
 * Data for generating AI summary via Edge Function.
 * Comprehensive input for summary generation with context.
 */
export interface GenerarResumenAIData {
  grabacion_id: string;
  espacio_id: string;
  creador_id: string;
  transcripcion: string;
  emociones: Array<{
    timestamp_segundos: number;
    emocion_dominante: string;
    engagement_score: number;
  }>;
  duracion_segundos: number;
  participantes: string[];
  reunion_titulo?: string;
  tipo_grabacion: string | null;
  metricas_adicionales: Record<string, unknown>;
}

/**
 * Notification for completed analysis.
 * Data for creating a notification when analysis is complete.
 */
export interface NotificacionAnalisisData {
  usuario_id: string;
  espacio_id: string;
  tipo: 'analisis_listo';
  titulo: string;
  mensaje: string;
  entidad_tipo: 'grabacion';
  entidad_id: string;
}

/**
 * User role/cargo info from 'miembros_espacio'.
 * Represents user's position and role in a workspace.
 */
export interface CargoYRolUsuario {
  cargo: string | null;
  rol: string | null;
}

/**
 * Repository contract for recording operations.
 * Implements the Dependency Inversion Principle:
 * Domain logic depends on this interface, not on Supabase directly.
 *
 * Infrastructure layer provides Supabase-specific implementation.
 */
export interface IRecordingRepository {
  /**
   * Create a new recording record.
   * Initializes a recording session in 'grabacion' state.
   *
   * @param data - Recording creation parameters
   * @throws Error if database insert fails
   */
  crearGrabacion(data: CrearGrabacionData): Promise<void>;

  /**
   * Update recording status to completed.
   * Finalizes a recording with duration and file metadata.
   *
   * @param grabacionId - Recording ID
   * @param data - Completion parameters (estado, duracion_segundos, etc.)
   * @throws Error if update fails or recording not found
   */
  completarGrabacion(grabacionId: string, data: CompletarGrabacionData): Promise<void>;

  /**
   * Update recording status to error.
   * Marks a recording as failed with error message.
   *
   * @param grabacionId - Recording ID
   * @param data - Error parameters (estado, error_mensaje)
   * @throws Error if update fails or recording not found
   */
  marcarGrabacionError(grabacionId: string, data: ErrorGrabacionData): Promise<void>;

  /**
   * Update consent status on a recording.
   * Records when an evaluated user grants/denies recording consent.
   *
   * @param grabacionId - Recording ID
   * @param data - Consent parameters (consentimiento_evaluado, fecha)
   * @throws Error if update fails or recording not found
   */
  actualizarConsentimiento(grabacionId: string, data: ConsentimientoGrabacionData): Promise<void>;

  /**
   * Request consent from evaluated user via RPC.
   * Invokes backend procedure to initiate consent request flow.
   *
   * @param grabacionId - Recording ID
   * @param evaluadoId - User ID of evaluated person
   * @param tipoGrabacion - Recording type identifier
   * @throws Error if RPC call fails or user not found
   */
  solicitarConsentimientoGrabacion(
    grabacionId: string,
    evaluadoId: string,
    tipoGrabacion: string,
  ): Promise<void>;

  /**
   * Register a participant in a recording.
   * Links a user to a recording session with consent metadata.
   *
   * @param data - Participant registration parameters
   * @throws Error if insert fails or foreign key constraint violated
   */
  registrarParticipante(data: ParticipanteGrabacionRecord): Promise<void>;

  /**
   * Save transcription record.
   * Stores a single transcription segment (timestamped text).
   *
   * @param data - Transcription parameters
   * @throws Error if insert fails or recording not found
   */
  guardarTranscripcion(data: TranscripcionRecord): Promise<void>;

  /**
   * Save behavioral analysis records in batches.
   * Efficiently stores multiple emotion/engagement data points.
   *
   * @param records - Array of analysis records
   * @throws Error if batch insert fails
   */
  guardarAnalisisComportamiento(records: AnalisisComportamientoRecord[]): Promise<void>;

  /**
   * Generate AI summary via Edge Function.
   * Invokes cloud function to process recording and create summaries.
   *
   * @param data - Input data for summary generation (transcription, emotions, etc.)
   * @throws Error if Edge Function call fails
   */
  generarResumenAI(data: GenerarResumenAIData): Promise<void>;

  /**
   * Create notification for completed analysis.
   * Notifies user when recording analysis finishes.
   *
   * @param data - Notification parameters (usuario_id, tipo, mensaje, etc.)
   * @throws Error if insert fails or user not found
   */
  crearNotificacionAnalisis(data: NotificacionAnalisisData): Promise<void>;

  /**
   * Fetch recordings created by user in a workspace.
   * Returns all recordings where user is the creator.
   *
   * @param espacioId - Workspace ID
   * @param userId - User ID (creator)
   * @returns Array of recording records, empty if none found
   * @throws Error if query fails
   */
  obtenerGrabacionesCreador(espacioId: string, userId: string): Promise<GrabacionRecord[]>;

  /**
   * Fetch recording IDs where user is a participant.
   * Returns IDs of all recordings the user participated in.
   *
   * @param userId - User ID
   * @returns Array of recording IDs, empty if none found
   * @throws Error if query fails
   */
  obtenerGrabacionesParticipante(userId: string): Promise<string[]>;

  /**
   * Fetch recordings by IDs (excluding creator's) in a workspace.
   * Returns specified recordings, filtering out creator's own recordings.
   *
   * @param espacioId - Workspace ID
   * @param ids - Recording IDs to fetch
   * @param excludeCreadorId - User ID to exclude from results
   * @returns Array of recording records for non-creator recordings
   * @throws Error if query fails
   */
  obtenerGrabacionesPorIds(
    espacioId: string,
    ids: string[],
    excludeCreadorId: string,
  ): Promise<GrabacionRecord[]>;

  /**
   * Fetch related data (transcriptions, analysis, summaries) for a recording.
   * Loads all dependent data for a single recording.
   *
   * @param grabacionId - Recording ID
   * @param incluirAnalisis - Whether to fetch behavioral analysis records
   * @returns Object with transcriptions, analysis, and AI summaries
   * @throws Error if query fails or recording not found
   */
  obtenerDatosRelacionados(
    grabacionId: string,
    incluirAnalisis: boolean,
  ): Promise<{
    transcripciones: TranscripcionRecord[];
    analisis_comportamiento: AnalisisComportamientoRecord[];
    resumenes_ai: ResumenAIRecord[];
  }>;

  /**
   * Get user cargo and rol from miembros_espacio.
   * Retrieves user's position and role in a workspace.
   *
   * @param userId - User ID
   * @param espacioId - Workspace ID
   * @returns User's cargo and rol, nulls if membership not found
   * @throws Error if query fails
   */
  obtenerCargoYRol(userId: string, espacioId: string): Promise<CargoYRolUsuario>;
}
