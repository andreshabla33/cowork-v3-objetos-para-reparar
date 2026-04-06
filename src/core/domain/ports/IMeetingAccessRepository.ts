/**
 * @module domain/ports/IMeetingAccessRepository
 * @description Port interface for meeting access and sala operations.
 * Decouples meeting access logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — Edge Functions, PostgREST API.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

/**
 * Sala (meeting room) information record.
 * Represents core metadata about a meeting room.
 */
export interface SalaInfoRecord {
  /** Display name of the sala */
  nombre: string;

  /** Type of meeting (e.g., 'reunion', 'workshop') */
  tipo: string;

  /** Configuration object for the sala */
  configuracion: Record<string, unknown>;

  /** Creator user ID (optional) */
  creador_id?: string | null;

  /** Workspace (espacio) ID (optional) */
  espacio_id?: string | null;
}

/**
 * Validated invitation data.
 * Result of successful invitation token validation.
 */
export interface InvitacionValidada {
  /** Sala information from the invitation */
  sala: SalaInfoRecord;

  /** Guest name (optional) */
  nombre?: string;

  /** Guest email (optional) */
  email?: string;

  /** Organizer name (optional) */
  organizador_nombre?: string;
}

/**
 * LiveKit token data returned from Edge Function.
 * Contains access token and connection URL for LiveKit room.
 */
export interface TokenDataRecord {
  /** JWT token for LiveKit access */
  token: string;

  /** LiveKit connection URL */
  url: string;

  /** Type of meeting (optional) */
  tipo_reunion?: string;

  /** Meeting ID (optional) */
  reunion_id?: string;

  /** Permissions object for the token */
  permisos?: {
    roomAdmin?: boolean;
    [key: string]: unknown;
  };

  /** Additional token metadata */
  [key: string]: unknown;
}

/**
 * Request body for LiveKit token solicitation.
 * Used when requesting a token via Edge Function.
 */
export interface SolicitarTokenData {
  /** Sala ID (for authenticated users) */
  sala_id?: string;

  /** Invitation token (for guest access) */
  token_invitacion?: string;

  /** Guest name (for invitation-based requests) */
  nombre_invitado?: string;
}

/**
 * Guest permissions from workspace configuration.
 * Defines what actions guests can perform in a meeting.
 */
export interface PermisosInvitado {
  /** Whether guests can use chat */
  allowChat: boolean;

  /** Whether guests can enable video */
  allowVideo: boolean;
}

/**
 * External guest invitation data.
 * Minimal data about an invited external participant.
 */
export interface InvitadoExternoData {
  /** Guest name */
  nombre: string;

  /** Guest email (optional) */
  email?: string;

  /** Additional guest metadata */
  [key: string]: unknown;
}

/**
 * Data for moderating a participant in a LiveKit room.
 * Used to control participant behavior (e.g., mute).
 */
export interface ModerarParticipanteData {
  /** Moderation action to perform */
  action: 'mute_microphone';

  /** LiveKit room name */
  room_name: string;

  /** Participant identity in the room */
  participant_identity: string;

  /** Track SID to moderate */
  track_sid: string;

  /** Invitation token (optional, for guest moderation) */
  token_invitacion?: string;
}

/**
 * Participant status update data.
 * Used to record participant presence in a sala.
 */
export interface ActualizarEstadoParticipanteData {
  /** Participant status: in room or disconnected */
  estado_participante: 'en_sala' | 'desconectado';

  /** Timestamp of last activity (optional) */
  ultima_actividad?: string;

  /** Timestamp when participant left (optional) */
  salido_en?: string;
}

/**
 * User cargo and role information in a workspace.
 * Result from querying miembros_espacio + cargos join.
 */
export interface CargoRolData {
  /** Job position/title */
  cargo: string | null;

  /** Role in workspace (e.g., 'admin', 'miembro') */
  rol: string | null;
}

/**
 * Repository contract for meeting access operations.
 *
 * Handles:
 * - Invitation validation via Edge Functions
 * - Sala (room) information retrieval
 * - LiveKit token provisioning
 * - Participant presence (heartbeat)
 * - Status updates and moderation
 * - Permission checks
 *
 * Implementation: `MeetingAccessRepository` in infrastructure/adapters
 */
export interface IMeetingAccessRepository {
  /**
   * Validate a meeting invitation token via Edge Function.
   * Returns invitation data with sala info, guest name, and organizer details.
   *
   * @param token - Invitation token to validate
   * @returns Validated invitation data with sala info
   * @throws Error if token is invalid or expired
   */
  validarInvitacion(token: string): Promise<InvitacionValidada>;

  /**
   * Fetch sala (room) by access code.
   * Returns full sala info including configuration and creator.
   *
   * @param codigoAcceso - Access code for the sala
   * @returns Sala info record, or null if not found
   */
  obtenerSalaPorCodigo(codigoAcceso: string): Promise<SalaInfoRecord | null>;

  /**
   * Fetch sala by ID with minimal fields.
   * Returns tipo, configuracion, and espacio_id for quick lookups.
   *
   * @param salaId - Sala ID to fetch
   * @returns Sala info record, or null if not found
   */
  obtenerSalaPorId(salaId: string): Promise<SalaInfoRecord | null>;

  /**
   * Fetch sala espacio_id (workspace ID) only.
   * Optimized query for workspace-related operations.
   *
   * @param salaId - Sala ID
   * @returns Workspace ID, or null if not found
   */
  obtenerEspacioIdDeSala(salaId: string): Promise<string | null>;

  /**
   * Get creator name by user ID.
   * Queries users table for display name.
   *
   * @param creadorId - User ID of creator
   * @returns Creator display name
   * @throws Error if user not found
   */
  obtenerNombreCreador(creadorId: string): Promise<string>;

  /**
   * Fetch LiveKit token via Edge Function.
   * Handles both authenticated users (via sala_id) and guest invitations (via token_invitacion).
   *
   * @param data - Token request containing sala_id or token_invitacion
   * @param accessToken - Authenticated user's access token (optional)
   * @returns Token data with JWT and LiveKit URL
   * @throws Error if token request fails
   */
  solicitarTokenLiveKit(
    data: SolicitarTokenData,
    accessToken?: string
  ): Promise<TokenDataRecord>;

  /**
   * Send heartbeat for participant presence.
   * Calls heartbeat_participante RPC to maintain presence in room.
   *
   * @param salaId - Sala ID where participant is present
   * @param userId - User ID of participant
   * @throws Error if heartbeat fails
   */
  heartbeatParticipante(salaId: string, userId: string): Promise<void>;

  /**
   * Update participant status in participantes_sala table.
   * Records when participant enters/leaves and last activity timestamp.
   *
   * @param salaId - Sala ID
   * @param userId - User ID of participant
   * @param data - Status update containing estado_participante and optional timestamps
   * @throws Error if update fails
   */
  actualizarEstadoParticipante(
    salaId: string,
    userId: string,
    data: ActualizarEstadoParticipanteData
  ): Promise<void>;

  /**
   * Invoke moderation Edge Function.
   * Sends moderation commands to LiveKit (e.g., mute remote participant).
   *
   * @param data - Moderation data containing action, room, participant, and track info
   * @throws Error if moderation action fails
   */
  moderarParticipante(data: ModerarParticipanteData): Promise<void>;

  /**
   * Get guest permissions from workspace configuration.
   * Retrieves allowChat and allowVideo from workspace espacio settings.
   *
   * @param espacioId - Workspace ID
   * @returns Guest permissions object
   */
  obtenerPermisosInvitado(espacioId: string): Promise<PermisosInvitado>;

  /**
   * Get user cargo (job position) and role in a workspace.
   * Queries miembros_espacio joined with cargos table.
   *
   * @param userId - User ID
   * @param espacioId - Workspace ID
   * @returns User's cargo and role in workspace (may be null if not a member)
   */
  obtenerCargoUsuario(
    userId: string,
    espacioId: string
  ): Promise<CargoRolData>;
}
