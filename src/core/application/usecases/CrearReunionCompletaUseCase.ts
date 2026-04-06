/**
 * @module application/usecases/CrearReunionCompletaUseCase
 * @description Complex use case for creating a complete meeting with room, participants, and invitations.
 * This is the big orchestrator that was extracted from CalendarPanel.tsx.
 * Extracted from CalendarPanel.tsx createMeeting function (~330 lines).
 *
 * Clean Architecture: Application layer — orchestrates multiple repository operations
 * in a transaction-like flow. Encapsulates domain rules for meeting creation.
 */

import { logger } from '@/lib/logger';
import type {
  IMeetingRepository,
  ReunionProgramadaData,
  SalaReunionData,
  DatosCrearReunion,
  DatosCrearSala,
} from '../../domain/ports/IMeetingRepository';

const log = logger.child('crear-reunion-completa');

export interface ParticipanteInput {
  usuario_id: string;
  estado?: 'pendiente' | 'aceptado' | 'rechazado' | 'tentativo';
}

export interface InvitadoExternoInput {
  email: string;
  nombre: string;
  empresa?: string | null;
}

export interface CrearReunionCompletaInput {
  espacioId: string;
  titulo: string;
  descripcion?: string | null;
  fechaInicio: string; // ISO 8601 datetime
  fechaFin: string; // ISO 8601 datetime
  creadorId: string;
  tipoReunion?: string | null;
  participantesInternos: ParticipanteInput[];
  participantesExternos?: InvitadoExternoInput[];
  recordatorioMinutos?: number;
  meetingLink?: string | null;
  googleEventId?: string | null;
  crearSala?: boolean; // Create accompanying meeting room
  tipoSala?: 'general' | 'deal' | 'entrevista'; // If crearSala is true
}

export interface CrearReunionCompletaOutput {
  reunion: ReunionProgramadaData | null;
  sala: SalaReunionData | null;
  success: boolean;
  error?: string;
}

/**
 * Create a complete meeting with room, participants, and external invitations.
 *
 * Orchestrates:
 * 1. Create scheduled meeting (reuniones_programadas)
 * 2. Optionally create meeting room (salas_reunion)
 * 3. Add internal participants (reunion_participantes)
 * 4. Create external invitation tokens (invitaciones_reunion)
 *
 * This is the main entry point extracted from CalendarPanel's 330-line createMeeting function.
 */
export class CrearReunionCompletaUseCase {
  /**
   * @param repo Meeting repository (injected via DI)
   */
  constructor(private readonly repo: IMeetingRepository) {}

  /**
   * Execute the use case: create meeting + room + participants + invitations.
   *
   * @param input Complete meeting creation input
   * @returns Created meeting and room (if applicable), or null + error on failure
   */
  async ejecutar(
    input: CrearReunionCompletaInput
  ): Promise<CrearReunionCompletaOutput> {
    log.info('Creating complete meeting', {
      espacioId: input.espacioId,
      titulo: input.titulo,
      participantesInternos: input.participantesInternos.length,
      participantesExternos: input.participantesExternos?.length || 0,
      crearSala: input.crearSala ?? false,
    });

    try {
      // Step 1: Create scheduled meeting
      const datosReunion: DatosCrearReunion = {
        espacio_id: input.espacioId,
        titulo: input.titulo,
        descripcion: input.descripcion,
        fecha_inicio: input.fechaInicio,
        fecha_fin: input.fechaFin,
        creado_por: input.creadorId,
        tipo_reunion: input.tipoReunion,
        meeting_link: input.meetingLink,
        google_event_id: input.googleEventId,
        recordatorio_minutos: input.recordatorioMinutos ?? 15,
      };

      const reunion = await this.repo.crearReunion(datosReunion);

      if (!reunion) {
        log.error('Failed to create meeting', {
          espacioId: input.espacioId,
          titulo: input.titulo,
        });
        return {
          reunion: null,
          sala: null,
          success: false,
          error: 'Failed to create meeting',
        };
      }

      log.info('Meeting created', { reunionId: reunion.id });

      // Step 2: Optionally create meeting room
      let sala: SalaReunionData | null = null;
      if (input.crearSala && input.tipoSala) {
        const datosSala: DatosCrearSala = {
          espacio_id: input.espacioId,
          nombre: input.titulo,
          tipo: input.tipoSala,
          creador_id: input.creadorId,
          descripcion: input.descripcion,
          max_participantes: 50,
        };

        sala = await this.repo.crearSala(datosSala);

        if (sala) {
          log.info('Meeting room created', { salaId: sala.id });

          // Update meeting with room ID
          await this.repo.actualizarReunion(reunion.id, {
            ...reunion,
            sala_id: sala.id,
          });

          log.info('Meeting updated with room', {
            reunionId: reunion.id,
            salaId: sala.id,
          });
        } else {
          log.warn('Failed to create meeting room, continuing without it', {
            reunionId: reunion.id,
          });
        }
      }

      // Step 3: Add internal participants
      if (input.participantesInternos.length > 0) {
        const success = await this.repo.agregarParticipantesReunion(
          reunion.id,
          input.participantesInternos
        );

        if (success) {
          log.info('Participants added to meeting', {
            reunionId: reunion.id,
            count: input.participantesInternos.length,
          });
        } else {
          log.warn('Failed to add participants to meeting', {
            reunionId: reunion.id,
          });
        }
      }

      // Step 4: Create external invitations (if room exists)
      if (
        input.participantesExternos &&
        input.participantesExternos.length > 0 &&
        sala
      ) {
        for (const externo of input.participantesExternos) {
          const token = Math.random().toString(36).substring(2, 15);
          const tokenHash = token; // In production, hash this

          const invResult = await this.repo.crearInvitacionExterna({
            sala_id: sala.id,
            email: externo.email,
            nombre: externo.nombre,
            token,
            token_hash: tokenHash,
            expira_en: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(), // 7 days
          });

          if (invResult) {
            log.info('External invitation created', {
              salaId: sala.id,
              email: externo.email,
              invitacionId: invResult.id,
            });
          } else {
            log.warn('Failed to create external invitation', {
              salaId: sala.id,
              email: externo.email,
            });
          }
        }
      }

      // Step 5: Mark participants as notified
      await this.repo.actualizarParticipantesNotificados(reunion.id);

      log.info('Complete meeting creation finished successfully', {
        reunionId: reunion.id,
        salaId: sala?.id,
      });

      return {
        reunion,
        sala,
        success: true,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating complete meeting', {
        error: message,
        espacioId: input.espacioId,
      });

      return {
        reunion: null,
        sala: null,
        success: false,
        error: message,
      };
    }
  }
}
