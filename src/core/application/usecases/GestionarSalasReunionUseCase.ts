/**
 * @module application/usecases/GestionarSalasReunionUseCase
 * @description Complex use case for CRUD operations on meeting rooms.
 * Extracted from MeetingRooms.tsx component logic.
 * Clean Architecture: Application layer — orchestrates room operations
 * through repository port.
 */

import { logger } from '@/lib/logger';
import type {
  IMeetingRepository,
  SalaReunionData,
  ParticipanteSalaData,
  DatosCrearSala,
  DatosAgregarParticipanteSala,
} from '../../domain/ports/IMeetingRepository';

const log = logger.child('gestionar-salas-reunion');

export interface CargarSalasInput {
  espacioId: string;
}

export interface CargarSalasOutput {
  salas: SalaReunionData[];
}

export interface CrearSalaInput {
  espacioId: string;
  nombre: string;
  tipo: 'general' | 'deal' | 'entrevista';
  creadorId: string;
  descripcion?: string | null;
  maxParticipantes?: number;
  esPrivada?: boolean;
  password?: string | null;
}

export interface CrearSalaOutput {
  sala: SalaReunionData | null;
  success: boolean;
  error?: string;
}

export interface EliminarSalaInput {
  salaId: string;
}

export interface EliminarSalaOutput {
  success: boolean;
  error?: string;
}

export interface ObtenerParticipantesSalaInput {
  salaId: string;
}

export interface ObtenerParticipantesSalaOutput {
  participantes: ParticipanteSalaData[];
}

export interface AgregarParticipanteSalaInput {
  salaId: string;
  usuarioId?: string | null;
  esExterno: boolean;
  nombreExterno?: string | null;
  emailExterno?: string | null;
}

export interface AgregarParticipanteSalaOutput {
  participante: ParticipanteSalaData | null;
  success: boolean;
  error?: string;
}

export interface EliminarParticipanteSalaInput {
  salaId: string;
  usuarioId: string;
}

export interface EliminarParticipanteSalaOutput {
  success: boolean;
  error?: string;
}

export interface TerminarSalaInput {
  salaId: string;
}

export interface TerminarSalaOutput {
  success: boolean;
  error?: string;
}

/**
 * Comprehensive meeting room management use case.
 *
 * Handles:
 * 1. Load all rooms for a workspace
 * 2. Create a new room
 * 3. Delete a room
 * 4. Get room participants
 * 5. Add participant to room
 * 6. Remove participant from room
 * 7. End/close a room
 */
export class GestionarSalasReunionUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Load all meeting rooms for a workspace.
   */
  async cargarSalas(input: CargarSalasInput): Promise<CargarSalasOutput> {
    log.info('Loading meeting rooms', { espacioId: input.espacioId });

    try {
      const salas = await this.repo.obtenerSalas(input.espacioId);

      log.info('Meeting rooms loaded successfully', {
        espacioId: input.espacioId,
        count: salas.length,
      });

      return { salas };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading meeting rooms', {
        error: message,
        espacioId: input.espacioId,
      });

      return { salas: [] };
    }
  }

  /**
   * Create a new meeting room.
   */
  async crearSala(input: CrearSalaInput): Promise<CrearSalaOutput> {
    log.info('Creating meeting room', {
      espacioId: input.espacioId,
      nombre: input.nombre,
      tipo: input.tipo,
    });

    try {
      const datosSala: DatosCrearSala = {
        espacio_id: input.espacioId,
        nombre: input.nombre,
        tipo: input.tipo,
        creador_id: input.creadorId,
        descripcion: input.descripcion,
        max_participantes: input.maxParticipantes,
        es_privada: input.esPrivada,
        password_hash: input.password,
      };

      const sala = await this.repo.crearSala(datosSala);

      if (!sala) {
        log.warn('Failed to create meeting room', {
          espacioId: input.espacioId,
          nombre: input.nombre,
        });
        return {
          sala: null,
          success: false,
          error: 'Failed to create room',
        };
      }

      // Auto-join creator to room
      await this.repo.agregarParticipanteSala({
        sala_id: sala.id,
        usuario_id: input.creadorId,
        es_externo: false,
        mic_activo: true,
        cam_activa: false,
      });

      log.info('Meeting room created successfully', {
        salaId: sala.id,
        nombre: sala.nombre,
      });

      return { sala, success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating meeting room', {
        error: message,
        espacioId: input.espacioId,
      });

      return {
        sala: null,
        success: false,
        error: message,
      };
    }
  }

  /**
   * Delete a meeting room.
   */
  async eliminarSala(input: EliminarSalaInput): Promise<EliminarSalaOutput> {
    log.info('Deleting meeting room', { salaId: input.salaId });

    try {
      const success = await this.repo.eliminarSala(input.salaId);

      if (!success) {
        log.warn('Failed to delete meeting room', { salaId: input.salaId });
        return {
          success: false,
          error: 'Failed to delete room',
        };
      }

      log.info('Meeting room deleted successfully', { salaId: input.salaId });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception deleting meeting room', {
        error: message,
        salaId: input.salaId,
      });

      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Get all participants in a room.
   */
  async obtenerParticipantes(
    input: ObtenerParticipantesSalaInput
  ): Promise<ObtenerParticipantesSalaOutput> {
    log.info('Fetching room participants', { salaId: input.salaId });

    try {
      const participantes = await this.repo.obtenerParticipantesSala(
        input.salaId
      );

      log.info('Room participants fetched successfully', {
        salaId: input.salaId,
        count: participantes.length,
      });

      return { participantes };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching room participants', {
        error: message,
        salaId: input.salaId,
      });

      return { participantes: [] };
    }
  }

  /**
   * Add a participant to a room.
   */
  async agregarParticipante(
    input: AgregarParticipanteSalaInput
  ): Promise<AgregarParticipanteSalaOutput> {
    log.info('Adding participant to room', {
      salaId: input.salaId,
      usuarioId: input.usuarioId,
      esExterno: input.esExterno,
    });

    try {
      const datosParticipante: DatosAgregarParticipanteSala = {
        sala_id: input.salaId,
        usuario_id: input.usuarioId,
        es_externo: input.esExterno,
        nombre_externo: input.nombreExterno,
        email_externo: input.emailExterno,
        mic_activo: true,
        cam_activa: false,
      };

      const participante = await this.repo.agregarParticipanteSala(
        datosParticipante
      );

      if (!participante) {
        log.warn('Failed to add participant to room', {
          salaId: input.salaId,
          usuarioId: input.usuarioId,
        });
        return {
          participante: null,
          success: false,
          error: 'Failed to add participant',
        };
      }

      log.info('Participant added to room successfully', {
        salaId: input.salaId,
        participanteId: participante.id,
      });

      return { participante, success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception adding participant to room', {
        error: message,
        salaId: input.salaId,
      });

      return {
        participante: null,
        success: false,
        error: message,
      };
    }
  }

  /**
   * Remove a participant from a room.
   */
  async eliminarParticipante(
    input: EliminarParticipanteSalaInput
  ): Promise<EliminarParticipanteSalaOutput> {
    log.info('Removing participant from room', {
      salaId: input.salaId,
      usuarioId: input.usuarioId,
    });

    try {
      const success = await this.repo.eliminarParticipanteSala(
        input.salaId,
        input.usuarioId
      );

      if (!success) {
        log.warn('Failed to remove participant from room', {
          salaId: input.salaId,
          usuarioId: input.usuarioId,
        });
        return {
          success: false,
          error: 'Failed to remove participant',
        };
      }

      log.info('Participant removed from room successfully', {
        salaId: input.salaId,
        usuarioId: input.usuarioId,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception removing participant from room', {
        error: message,
        salaId: input.salaId,
      });

      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * End/close a meeting room (mark as inactive).
   */
  async terminarSala(input: TerminarSalaInput): Promise<TerminarSalaOutput> {
    log.info('Ending meeting room', { salaId: input.salaId });

    try {
      const success = await this.repo.actualizarSalaActiva(input.salaId, false);

      if (!success) {
        log.warn('Failed to end meeting room', { salaId: input.salaId });
        return {
          success: false,
          error: 'Failed to end room',
        };
      }

      log.info('Meeting room ended successfully', { salaId: input.salaId });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception ending meeting room', {
        error: message,
        salaId: input.salaId,
      });

      return {
        success: false,
        error: message,
      };
    }
  }
}
