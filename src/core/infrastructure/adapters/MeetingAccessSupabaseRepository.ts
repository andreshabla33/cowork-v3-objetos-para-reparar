/**
 * @module infrastructure/adapters/MeetingAccessSupabaseRepository
 * @description Supabase implementation of IMeetingAccessRepository port.
 * Encapsulates all Supabase PostgREST calls and Edge Functions for meeting access.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Dependency Inversion: Domain depends on IMeetingAccessRepository interface.
 *
 * Key patterns:
 * - No `any` types; use `unknown` with type guards
 * - Structured logging via logger.child()
 * - Type-safe interfaces for Supabase join results
 * - 15s AbortController timeout for LiveKit token requests
 * - Proper error handling with descriptive messages
 *
 * Ref: Supabase JS v2 — .maybeSingle(), .single(), .invoke()
 * Ref: Edge Functions — validar-invitacion-reunion, livekit-token, livekit-moderate-participant
 */

import type {
  IMeetingAccessRepository,
  SalaInfoRecord,
  InvitacionValidada,
  TokenDataRecord,
  SolicitarTokenData,
  PermisosInvitado,
  ModerarParticipanteData,
  ActualizarEstadoParticipanteData,
  CargoRolData,
} from '@/core/domain/ports/IMeetingAccessRepository';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { CONFIG_PUBLICA_APP } from '@/lib/env';

const log = logger.child('meeting-access-repository');

/**
 * Type-safe interface for cargo reference join result.
 * Extracts cargo.clave from Supabase join without casting to `any`.
 */
interface CargoRefJoin {
  clave?: string;
}

/**
 * Response structure from validar-invitacion-reunion Edge Function.
 * Type-safe wrapper to avoid `as any` on response parsing.
 */
interface InvitacionResponse {
  invitacion?: {
    nombre?: string;
    email?: string;
    sala?: {
      nombre?: string;
      tipo?: string;
      configuracion?: Record<string, unknown>;
      espacio_id?: string;
    };
  };
  organizador_nombre?: string;
  error?: string;
}

/**
 * Response structure from livekit-token Edge Function.
 * Type-safe wrapper for token data with optional fields.
 */
interface LiveKitTokenResponse {
  token: string;
  url: string;
  tipo_reunion?: string;
  reunion_id?: string;
  permisos?: {
    roomAdmin?: boolean;
    [key: string]: unknown;
  };
  error?: string;
  [key: string]: unknown;
}

/**
 * Supabase implementation of IMeetingAccessRepository.
 * Handles meeting access, sala info, LiveKit tokens, and participant management.
 */
class MeetingAccessSupabaseRepository implements IMeetingAccessRepository {
  /**
   * Validate a meeting invitation token via Edge Function.
   * Returns invitation data with sala info, guest name, and organizer details.
   *
   * @param token - Invitation token to validate
   * @returns Validated invitation data with sala info
   * @throws Error if token is invalid or expired
   */
  async validarInvitacion(token: string): Promise<InvitacionValidada> {
    try {
      log.debug('Validating invitation token', { tokenLength: token.length });

      const { data, error: fnError } = await supabase.functions.invoke(
        'validar-invitacion-reunion',
        { body: { token } }
      );

      if (fnError) {
        log.error('Edge Function error validating invitation', {
          error: fnError.message,
        });
        throw new Error(`Failed to validate invitation: ${fnError.message}`);
      }

      const response = data as InvitacionResponse;

      if (response.error) {
        log.warn('Invitation validation failed', { error: response.error });
        throw new Error(response.error);
      }

      if (!response.invitacion?.sala) {
        log.error('Invitation response missing sala data');
        throw new Error('Invitation validation returned incomplete data');
      }

      const salaData = response.invitacion.sala;
      const salaInfo: SalaInfoRecord = {
        nombre: salaData.nombre ?? 'Sin nombre',
        tipo: salaData.tipo ?? 'general',
        configuracion: salaData.configuracion ?? {},
        espacio_id: salaData.espacio_id ?? null,
      };

      const result: InvitacionValidada = {
        sala: salaInfo,
        nombre: response.invitacion.nombre,
        email: response.invitacion.email,
        organizador_nombre: response.organizador_nombre,
      };

      log.info('Invitation validated successfully', {
        salaId: salaInfo.nombre,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in validarInvitacion', { message });
      throw err;
    }
  }

  /**
   * Fetch sala (room) by access code.
   * Returns full sala info including configuration and creator.
   *
   * @param codigoAcceso - Access code for the sala
   * @returns Sala info record, or null if not found
   */
  async obtenerSalaPorCodigo(codigoAcceso: string): Promise<SalaInfoRecord | null> {
    try {
      log.debug('Fetching sala by access code', { codigoAcceso });

      const { data, error } = await supabase
        .from('salas_reunion')
        .select('nombre, tipo, configuracion, creador_id, espacio_id')
        .eq('codigo_acceso', codigoAcceso)
        .eq('activa', true)
        .maybeSingle();

      if (error) {
        log.error('Failed to fetch sala by code', {
          error: error.message,
          codigoAcceso,
        });
        return null;
      }

      if (!data) {
        log.debug('Sala not found for access code', { codigoAcceso });
        return null;
      }

      const salaInfo: SalaInfoRecord = {
        nombre: data.nombre ?? 'Sin nombre',
        tipo: data.tipo ?? 'general',
        configuracion: data.configuracion ?? {},
        creador_id: data.creador_id ?? null,
        espacio_id: data.espacio_id ?? null,
      };

      log.info('Sala fetched by code', {
        salaId: data.id,
        nombre: salaInfo.nombre,
      });

      return salaInfo;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in obtenerSalaPorCodigo', { message, codigoAcceso });
      return null;
    }
  }

  /**
   * Fetch sala by ID with minimal fields.
   * Returns tipo, configuracion, and espacio_id for quick lookups.
   *
   * @param salaId - Sala ID to fetch
   * @returns Sala info record, or null if not found
   */
  async obtenerSalaPorId(salaId: string): Promise<SalaInfoRecord | null> {
    try {
      log.debug('Fetching sala by id', { salaId });

      const { data, error } = await supabase
        .from('salas_reunion')
        .select('tipo, configuracion, espacio_id, nombre')
        .eq('id', salaId)
        .maybeSingle();

      if (error) {
        log.error('Failed to fetch sala by id', {
          error: error.message,
          salaId,
        });
        return null;
      }

      if (!data) {
        log.debug('Sala not found by id', { salaId });
        return null;
      }

      const salaInfo: SalaInfoRecord = {
        nombre: data.nombre ?? 'Sin nombre',
        tipo: data.tipo ?? 'general',
        configuracion: data.configuracion ?? {},
        espacio_id: data.espacio_id ?? null,
      };

      log.debug('Sala fetched by id', { salaId, nombre: salaInfo.nombre });

      return salaInfo;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in obtenerSalaPorId', { message, salaId });
      return null;
    }
  }

  /**
   * Fetch sala espacio_id (workspace ID) only.
   * Optimized query for workspace-related operations.
   *
   * @param salaId - Sala ID
   * @returns Workspace ID, or null if not found
   */
  async obtenerEspacioIdDeSala(salaId: string): Promise<string | null> {
    try {
      log.debug('Fetching espacio_id for sala', { salaId });

      const { data, error } = await supabase
        .from('salas_reunion')
        .select('espacio_id')
        .eq('id', salaId)
        .single();

      if (error) {
        log.error('Failed to fetch espacio_id', {
          error: error.message,
          salaId,
        });
        return null;
      }

      const espacioId = data?.espacio_id ?? null;

      log.debug('Espacio_id fetched', { salaId, espacioId });

      return espacioId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in obtenerEspacioIdDeSala', { message, salaId });
      return null;
    }
  }

  /**
   * Get creator name by user ID.
   * Queries users table for display name.
   *
   * @param creadorId - User ID of creator
   * @returns Creator display name
   * @throws Error if user not found
   */
  async obtenerNombreCreador(creadorId: string): Promise<string> {
    try {
      log.debug('Fetching creator name', { creadorId });

      const { data, error } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', creadorId)
        .single();

      if (error) {
        log.error('Failed to fetch creator name', {
          error: error.message,
          creadorId,
        });
        return 'Organizador';
      }

      const nombre = data?.nombre ?? 'Organizador';

      log.debug('Creator name fetched', { creadorId, nombre });

      return nombre;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Exception in obtenerNombreCreador', { message, creadorId });
      return 'Organizador';
    }
  }

  /**
   * Fetch LiveKit token via Edge Function.
   * Handles both authenticated users (via sala_id) and guest invitations (via token_invitacion).
   *
   * @param data - Token request containing sala_id or token_invitacion
   * @param accessToken - Authenticated user's access token (optional)
   * @returns Token data with JWT and LiveKit URL
   * @throws Error if token request fails
   */
  async solicitarTokenLiveKit(
    data: SolicitarTokenData,
    accessToken?: string
  ): Promise<TokenDataRecord> {
    try {
      log.debug('Requesting LiveKit token', {
        hasSalaId: Boolean(data.sala_id),
        hasTokenInvitacion: Boolean(data.token_invitacion),
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const body: Record<string, string | undefined> = {};
      if (data.sala_id) {
        body.sala_id = data.sala_id;
      }
      if (data.token_invitacion) {
        body.token_invitacion = data.token_invitacion;
      }
      if (data.nombre_invitado) {
        body.nombre_invitado = data.nombre_invitado;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const supabaseUrl = CONFIG_PUBLICA_APP.urlSupabase;
      const response = await fetch(`${supabaseUrl}/functions/v1/livekit-token`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();

      if (!text) {
        log.error('Empty response from livekit-token function');
        throw new Error('Empty response from server');
      }

      let responseData: unknown;
      try {
        responseData = JSON.parse(text);
      } catch {
        log.error('Failed to parse token response', {
          responseLength: text.length,
        });
        throw new Error('Invalid JSON response from token service');
      }

      const typedResponse = responseData as LiveKitTokenResponse;

      if (response.status < 200 || response.status >= 300) {
        const errorMsg = typedResponse.error ?? `HTTP ${response.status}`;
        log.error('Token request failed', {
          status: response.status,
          error: errorMsg,
        });
        throw new Error(errorMsg);
      }

      if (!typedResponse.token || !typedResponse.url) {
        log.error('Token response missing required fields', {
          hasToken: Boolean(typedResponse.token),
          hasUrl: Boolean(typedResponse.url),
        });
        throw new Error('Token response missing token or url');
      }

      const tokenRecord: TokenDataRecord = {
        token: typedResponse.token,
        url: typedResponse.url,
        tipo_reunion: typedResponse.tipo_reunion,
        reunion_id: typedResponse.reunion_id,
        permisos: typedResponse.permisos,
      };

      log.info('LiveKit token obtained', {
        hasRoomAdmin: Boolean(typedResponse.permisos?.roomAdmin),
      });

      return tokenRecord;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in solicitarTokenLiveKit', { message });
      throw err;
    }
  }

  /**
   * Send heartbeat for participant presence.
   * Calls heartbeat_participante RPC to maintain presence in room.
   *
   * @param salaId - Sala ID where participant is present
   * @param userId - User ID of participant
   * @throws Error if heartbeat fails
   */
  async heartbeatParticipante(salaId: string, userId: string): Promise<void> {
    try {
      log.debug('Sending participant heartbeat', { salaId, userId });

      const { error } = await supabase.rpc('heartbeat_participante', {
        p_sala_id: salaId,
        p_usuario_id: userId,
      });

      if (error) {
        log.error('Failed to send heartbeat', {
          error: error.message,
          salaId,
          userId,
        });
        throw new Error(`Heartbeat failed: ${error.message}`);
      }

      log.debug('Heartbeat sent', { salaId, userId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in heartbeatParticipante', { message, salaId, userId });
      throw err;
    }
  }

  /**
   * Update participant status in participantes_sala table.
   * Records when participant enters/leaves and last activity timestamp.
   *
   * @param salaId - Sala ID
   * @param userId - User ID of participant
   * @param data - Status update containing estado_participante and optional timestamps
   * @throws Error if update fails
   */
  async actualizarEstadoParticipante(
    salaId: string,
    userId: string,
    data: ActualizarEstadoParticipanteData
  ): Promise<void> {
    try {
      log.debug('Updating participant status', {
        salaId,
        userId,
        estado: data.estado_participante,
      });

      const { error } = await supabase
        .from('participantes_sala')
        .update(data)
        .eq('sala_id', salaId)
        .eq('usuario_id', userId);

      if (error) {
        log.error('Failed to update participant status', {
          error: error.message,
          salaId,
          userId,
        });
        throw new Error(`Update failed: ${error.message}`);
      }

      log.debug('Participant status updated', {
        salaId,
        userId,
        estado: data.estado_participante,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in actualizarEstadoParticipante', {
        message,
        salaId,
        userId,
      });
      throw err;
    }
  }

  /**
   * Invoke moderation Edge Function.
   * Sends moderation commands to LiveKit (e.g., mute remote participant).
   *
   * @param data - Moderation data containing action, room, participant, and track info
   * @throws Error if moderation action fails
   */
  async moderarParticipante(data: ModerarParticipanteData): Promise<void> {
    try {
      log.debug('Invoking participant moderation', {
        action: data.action,
        room: data.room_name,
        participant: data.participant_identity,
      });

      const { error: fnError } = await supabase.functions.invoke(
        'livekit-moderate-participant',
        { body: data }
      );

      if (fnError) {
        log.error('Edge Function error in moderation', {
          error: fnError.message,
          action: data.action,
        });
        throw new Error(`Moderation failed: ${fnError.message}`);
      }

      log.info('Participant moderation completed', {
        action: data.action,
        room: data.room_name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in moderarParticipante', { message });
      throw err;
    }
  }

  /**
   * Get guest permissions from workspace configuration.
   * Retrieves allowChat and allowVideo from workspace espacio settings.
   *
   * @param espacioId - Workspace ID
   * @returns Guest permissions object
   */
  async obtenerPermisosInvitado(espacioId: string): Promise<PermisosInvitado> {
    try {
      log.debug('Fetching guest permissions', { espacioId });

      const { data, error } = await supabase
        .from('espacios_trabajo')
        .select('configuracion')
        .eq('id', espacioId)
        .single();

      if (error) {
        log.warn('Failed to fetch guest permissions', {
          error: error.message,
          espacioId,
        });
        return {
          allowChat: true,
          allowVideo: true,
        };
      }

      if (!data?.configuracion) {
        log.debug('No configuration found for workspace', { espacioId });
        return {
          allowChat: true,
          allowVideo: true,
        };
      }

      const config = data.configuracion as Record<string, unknown>;
      const guestConfig = config.guests as Record<string, unknown> | undefined;

      const permisos: PermisosInvitado = {
        allowChat: guestConfig?.allowChat === false ? false : true,
        allowVideo: guestConfig?.allowVideo === false ? false : true,
      };

      log.debug('Guest permissions fetched', {
        espacioId,
        allowChat: permisos.allowChat,
        allowVideo: permisos.allowVideo,
      });

      return permisos;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Exception in obtenerPermisosInvitado', { message, espacioId });
      return {
        allowChat: true,
        allowVideo: true,
      };
    }
  }

  /**
   * Get user cargo (job position) and role in a workspace.
   * Queries miembros_espacio joined with cargos table.
   *
   * @param userId - User ID
   * @param espacioId - Workspace ID
   * @returns User's cargo and role in workspace (may be null if not a member)
   */
  async obtenerCargoUsuario(
    userId: string,
    espacioId: string
  ): Promise<CargoRolData> {
    try {
      log.debug('Fetching user cargo and role', { userId, espacioId });

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
      const rol = (data.rol as string | null) ?? null;

      const result: CargoRolData = {
        cargo,
        rol,
      };

      log.debug('User cargo and role fetched', {
        userId,
        espacioId,
        cargo,
        rol,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in obtenerCargoUsuario', { message, userId, espacioId });
      throw err;
    }
  }
}

/**
 * Singleton export of MeetingAccessSupabaseRepository.
 * Safe for repeated instantiation due to stateless design.
 */
export const meetingAccessRepository = new MeetingAccessSupabaseRepository();
