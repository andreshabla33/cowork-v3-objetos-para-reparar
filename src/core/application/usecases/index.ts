/**
 * @module application/usecases/index
 * @description Barrel export for all use cases (chat, meetings, etc.).
 * Simplifies imports in components and other modules.
 */

// Fase 3 — GPU Rendering (BatchedMesh, TextureAtlas, GPUSkinning)
export { GestionarBatchedMeshUseCase } from './GestionarBatchedMeshUseCase';
export { GestionarMultiBatchMeshUseCase } from './GestionarMultiBatchMeshUseCase';
export { GestionarTextureAtlasUseCase } from './GestionarTextureAtlasUseCase';
export { GestionarGPUSkinnedInstanceUseCase } from './GestionarGPUSkinnedInstanceUseCase';

// Fase 4D — Per-instance material properties via DataTexture
export { GestionarPropiedadesMaterialBatchUseCase } from './GestionarPropiedadesMaterialBatchUseCase';

// Geometry cache
export { GestionarGeometryCacheUseCase } from './GestionarGeometryCacheUseCase';

// Chat
export { CargarGruposChatUseCase } from './CargarGruposChatUseCase';
export { CargarMensajesChatUseCase, type ResultadoCargarMensajes } from './CargarMensajesChatUseCase';
export { CargarHiloMensajeUseCase } from './CargarHiloMensajeUseCase';
export { EnviarMensajeChatUseCase, type DatosEnviarMensaje } from './EnviarMensajeChatUseCase';
export { GestionarCanalesChatUseCase, type DatosCrearCanal } from './GestionarCanalesChatUseCase';
export { GestionarChatDirectoUseCase, type ResultadoObtenerChatDirecto } from './GestionarChatDirectoUseCase';
export { SubirArchivoChatUseCase, type DatosEnviarArchivo, type ResultadoEnviarArchivo } from './SubirArchivoChatUseCase';

// Meetings
export { CargarReunionesUseCase, type CargarReunionesInput, type CargarReunionesOutput } from './CargarReunionesUseCase';
export { CargarMiembrosEspacioUseCase, type CargarMiembrosEspacioInput, type CargarMiembrosEspacioOutput } from './CargarMiembrosEspacioUseCase';
export { CrearReunionCompletaUseCase, type CrearReunionCompletaInput, type CrearReunionCompletaOutput, type ParticipanteInput, type InvitadoExternoInput } from './CrearReunionCompletaUseCase';
export { EliminarReunionUseCase, type EliminarReunionInput, type EliminarReunionOutput } from './EliminarReunionUseCase';
export { ResponderInvitacionReunionUseCase, type ResponderInvitacionReunionInput, type ResponderInvitacionReunionOutput } from './ResponderInvitacionReunionUseCase';
export { GestionarSalasReunionUseCase, type CargarSalasInput, type CargarSalasOutput, type CrearSalaInput, type CrearSalaOutput, type EliminarSalaInput, type EliminarSalaOutput, type ObtenerParticipantesSalaInput, type ObtenerParticipantesSalaOutput, type AgregarParticipanteSalaInput, type AgregarParticipanteSalaOutput, type EliminarParticipanteSalaInput, type EliminarParticipanteSalaOutput, type TerminarSalaInput, type TerminarSalaOutput } from './GestionarSalasReunionUseCase';
