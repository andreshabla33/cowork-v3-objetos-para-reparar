/**
 * @module infrastructure/adapters/index
 * @description Barrel export for all adapters (repositories and services).
 * Simplifies imports in use cases and other modules.
 */

// Workspace
export { WorkspaceSupabaseRepository } from './WorkspaceSupabaseRepository';
export type {
  IWorkspaceRepository,
  MiembroEspacioData,
  AutorizacionEmpresa,
} from '../../domain/ports/IWorkspaceRepository';

// Chat
export { ChatSupabaseRepository, chatRepository } from './ChatSupabaseRepository';
export { ChatRealtimeSupabaseService, chatRealtimeService } from './ChatRealtimeSupabaseService';
export type {
  IChatRepository,
  MensajeChatRecord,
  InsertarMensajeChatData,
  NombreUsuario,
  OnNuevoMensajeCallback,
} from '../../domain/ports/IChatRepository';
export type {
  IChatRealtimeService,
  ChatRealtimeSubscription,
  TypingPayload,
} from '../../domain/ports/IChatRealtimeService';

// Meetings
export { MeetingSupabaseRepository, meetingRepository } from './MeetingSupabaseRepository';
export { MeetingRealtimeSupabaseService, meetingRealtimeService } from './MeetingRealtimeSupabaseService';
export type {
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
export type {
  IMeetingRealtimeService,
  MeetingRealtimeSubscription,
} from '../../domain/ports/IMeetingRealtimeService';
