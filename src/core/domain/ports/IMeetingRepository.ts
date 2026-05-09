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

import type { ISalasReunionRepository } from './ISalasReunionRepository';
import type { IReunionesProgramadasRepository } from './IReunionesProgramadasRepository';
import type { IMeetingHelpersRepository } from './IMeetingHelpersRepository';

/**
 * Repository contract for meeting operations (composition of sub-ports).
 *
 * Split 2026-05-09 (ITEM 17 fase B):
 *  - `ISalasReunionRepository` — salas + participantes_sala (8 métodos)
 *  - `IReunionesProgramadasRepository` — calendario + participantes + invitaciones (10 métodos)
 *  - `IMeetingHelpersRepository` — usuarios + cargo (3 métodos)
 *
 * `IMeetingRepository` se mantiene como union para compat con consumers
 * existentes. Nuevos consumers que solo necesiten un sub-bounded pueden
 * depender del sub-port específico.
 *
 * All methods return typed data or null on failure (no exceptions thrown).
 */
export interface IMeetingRepository
  extends ISalasReunionRepository,
    IReunionesProgramadasRepository,
    IMeetingHelpersRepository {}
