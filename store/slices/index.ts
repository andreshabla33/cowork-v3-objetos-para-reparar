/**
 * Store Slices — Clean Architecture barrel export
 *
 * Cada slice es un dominio independiente que se compone en el store principal.
 * Los consumers existentes siguen usando useStore sin cambios.
 * Nuevo código puede importar slices individuales para subscripciones más granulares.
 */
export { createAuthSlice, type AuthSlice } from './authSlice';
export { createUISlice, type UISlice } from './uiSlice';
export { createWorkspaceSlice, type WorkspaceSlice } from './workspaceSlice';
export { createChatSlice, type ChatSlice } from './chatSlice';
export { createEditorSlice, type EditorSlice, type ModoEdicionObjeto, type PlantillaZonaEnColocacion } from './editorSlice';
export { createUsersSlice, type UsersSlice } from './usersSlice';
export { createAvatarSlice, type AvatarSlice } from './avatarSlice';
