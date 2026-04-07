/**
 * @module infrastructure/adapters/index
 * @description Barrel export for all adapters (repositories and services).
 * Simplifies imports in use cases and other modules.
 */

// Fase 3 — GPU Rendering adapters
export {
  BatchedMeshThreeAdapter,
  getBatchedMeshAdapter,
  resetBatchedMeshAdapter,
} from './BatchedMeshThreeAdapter';
export {
  TextureAtlasCanvasAdapter,
  getTextureAtlasAdapter,
  resetTextureAtlasAdapter,
} from './TextureAtlasCanvasAdapter';
export {
  GPUSkinnedInstanceAdapter,
  getGPUSkinnedInstanceAdapter,
  resetGPUSkinnedInstanceAdapter,
} from './GPUSkinnedInstanceAdapter';
export type {
  IBatchedMeshService,
  BatchGeometryId,
  BatchInstanceId,
  Matrix4Flat,
  BatchedMeshStats,
} from '../../domain/ports/IBatchedMeshService';
export type {
  ITextureAtlasService,
  AtlasRegion,
  UVTransform,
  AtlasStats,
} from '../../domain/ports/ITextureAtlasService';
export type {
  IGPUSkinnedInstanceService,
  AvatarRowIndex,
  BoneMatrices,
  GPUSkinnedInstanceStats,
} from '../../domain/ports/IGPUSkinnedInstanceService';

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
