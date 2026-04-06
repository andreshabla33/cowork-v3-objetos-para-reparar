/**
 * @module domain/ports/IMeetingRepository
 * @description Port interface for meeting/reunion operations (scheduled meetings, rooms, participants).
 * Decouples meeting logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — PostgREST API.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Basic user data for meetings (from usuarios table).
 */
export interface MiembroBasicoData {
  id: string;
  nombre: string;
  email: string;
  avatar_url?: string | null;
}

/**
 * Scheduled meeting data matching reuniones_programadas table structure.
 */
export interface ReunionProgramadaData {
  id: string;
  espacio_id: string;
  sala_id?: string | null;
  titulo: string;
  descripcion?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  creado_por: string;
  es_recurrente: boolean;
  recurrencia_regla?: string | null;
  recordatorio_minutos: number;
  creado_en: string;
  google_event_id?: string | null;
  meeting_link?: string | null;
  tipo_reunion?: string | null;
  creador?: MiembroBasicoData;
  sala?: { id: string; nombre: string } | null;
  participantes?: ParticipanteReunionData[];
}

/**
 * Meeting room data matching salas_reunion table structure.
 */
export interface SalaReunionData {
  id: string;
  espacio_id: string;
  nombre: string;
  tipo: 'general' | 'deal' | 'entrevista';
  creador_id: string;
  descripcion?: string | null;
  activa: boolean;
  max_participantes?: number | null;
  creada_en: string;
  finalizado_en?: string | null;
  es_privada?: boolean;
  password_hash?: string | null;
  creador?: MiembroBasicoData;
  participantes?: ParticipanteSalaData[];
}

/**
 * Room participant data matching participantes_sala table structure.
 */
export interface ParticipanteSalaData {
  id: string;
  sala_id: string;
  usuario_id?: string | null;
  es_externo: boolean;
  nombre_externo?: string | null;
  email_externo?: string | null;
  mic_activo: boolean;
  cam_activa: boolean;
  ultima_actividad: string;
  usuario?: MiembroBasicoData | null;
}

/**
 * Meeting participant data matching reunion_participantes table structure.
 */
export interface ParticipanteReunionData {
  id: string;
  reunion_id: string;
  usuario_id: string;
  estado: 'pendiente' | 'aceptado' | 'rechazado' | 'tentativo';
  notificado: boolean;
  usuario?: MiembroBasicoData;
}

/**
 * External participant invitation token data matching invitaciones_reunion table.
 */
export interface InvitacionReunionData {
  id: string;
  sala_id: string;
  email: string;
  nombre: string;
  token: string;
  token_hash: string;
  utilizado: boolean;
  utilizado_en?: string | null;
  expira_en: string;
  creado_en: string;
}

/**
 * DTO for creating a scheduled meeting.
 */
export interface DatosCrearReunion {
  espacio_id: string;
  titulo: string;
  descripcion?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  creado_por: string;
  tipo_reunion?: string | null;
  es_recurrente?: boolean;
  recurrencia_regla?: string | null;
  recordatorio_minutos?: number;
  google_event_id?: string | null;
  meeting_link?: string | null;
}

/**
 * DTO for creating a meeting room.
 */
export interface DatosCrearSala {
  espacio_id: string;
  nombre: string;
  tipo: 'general' | 'deal' | 'entrevista';
  creador_id: string;
  descripcion?: string | null;
  max_participantes?: number | null;
  es_privada?: boolean;
  password_hash?: string | null;
}

/**
 * DTO for adding a participant to a meeting.
 */
export interface DatosAgregarParticipante {
  reunion_id: string;
  usuario_id: string;
  estado?: 'pendiente' | 'aceptado' | 'rechazado' | 'tentativo';
}

/**
 * DTO for adding a room participant.
 */
export interface DatosAgregarParticipanteSala {
  sala_id: string;
  usuario_id?: string | null;
  es_externo: boolean;
  nombre_externo?: string | null;
  email_externo?: string | null;
  mic_activo?: boolean;
  cam_activa?: boolean;
}

/**
 * DTO for creating an external meeting invitation.
 */
export interface DatosCrearInvitacionExterna {
  sala_id: string;
  email: string;
  nombre: string;
  token: string;
  token_hash: string;
  expira_en: string;
}

/**
 * Repository contract for meeting operations.
 * All methods return typed data or null on failure (no exceptions thrown).
 */
export interface IMeetingRepository {
  /**
   * Fetch all scheduled meetings for a workspace, ordered by start date.
   */
  obtenerReuniones(espacioId: string): Promise<ReunionProgramadaData[]>;

  /**
   * Create a new scheduled meeting.
   */
  crearReunion(datos: DatosCrearReunion): Promise<ReunionProgramadaData | null>;

  /**
   * Update a scheduled meeting (partial update).
   */
  actualizarReunion(
    reunionId: string,
    datos: Partial<ReunionProgramadaData>
  ): Promise<boolean>;

  /**
   * Delete a scheduled meeting by ID.
   */
  eliminarReunion(reunionId: string): Promise<boolean>;

  /**
   * Fetch all meeting rooms for a workspace.
   */
  obtenerSalas(espacioId: string): Promise<SalaReunionData[]>;

  /**
   * Create a new meeting room.
   */
  crearSala(datos: DatosCrearSala): Promise<SalaReunionData | null>;

  /**
   * Delete a meeting room by ID.
   */
  eliminarSala(salaId: string): Promise<boolean>;

  /**
   * Fetch all participants in a room with user details.
   */
  obtenerParticipantesSala(salaId: string): Promise<ParticipanteSalaData[]>;

  /**
   * Add a participant to a room.
   */
  agregarParticipanteSala(
    datos: DatosAgregarParticipanteSala
  ): Promise<ParticipanteSalaData | null>;

  /**
   * Remove a participant from a room.
   */
  eliminarParticipanteSala(
    salaId: string,
    usuarioId: string
  ): Promise<boolean>;

  /**
   * Add a participant to a meeting.
   */
  agregarParticipanteReunion(
    datos: DatosAgregarParticipante
  ): Promise<ParticipanteReunionData | null>;

  /**
   * Batch add participants to a meeting.
   */
  agregarParticipantesReunion(
    reunionId: string,
    participantes: Array<{ usuario_id: string; estado?: string }>
  ): Promise<boolean>;

  /**
   * Update participant response status for a meeting.
   */
  actualizarRespuestaParticipante(
    reunionId: string,
    usuarioId: string,
    estado: 'aceptado' | 'rechazado' | 'tentativo'
  ): Promise<boolean>;

  /**
   * Mark all meeting participants as notified.
   */
  actualizarParticipantesNotificados(reunionId: string): Promise<boolean>;

  /**
   * Create an external invitation token for a meeting room.
   */
  crearInvitacionExterna(
    datos: DatosCrearInvitacionExterna
  ): Promise<{ id: string; token: string } | null>;

  /**
   * Fetch accepted workspace members.
   */
  obtenerMiembrosEspacio(espacioId: string): Promise<MiembroBasicoData[]>;

  /**
   * Fetch user info by IDs.
   */
  obtenerInfoUsuarios(userIds: string[]): Promise<MiembroBasicoData[]>;

  /**
   * Get a user's job title/role in a workspace.
   */
  obtenerCargoUsuario(
    espacioId: string,
    usuarioId: string
  ): Promise<string | null>;

  /**
   * Update a room's active status.
   */
  actualizarSalaActiva(salaId: string, activa: boolean): Promise<boolean>;

  /**
   * Fetch a single scheduled meeting with all relations.
   */
  obtenerReunionPorId(reunionId: string): Promise<ReunionProgramadaData | null>;

  /**
   * Fetch a single room with all relations.
   */
  obtenerSalaPorId(salaId: string): Promise<SalaReunionData | null>;
}
