/**
 * Store Slices — Clean Architecture barrel export
 *
 * Cada slice es un dominio independiente que se compone en el store principal.
 * Los consumers existentes siguen usando useStore sin cambios.
 * Nuevo código puede importar slices individuales para subscripciones más granulares.
 *
 * @deprecated These slice creators are now consumed exclusively by
 *   `src/modules/_state/composedStore.ts`. New code should import the
 *   bounded-context store directly:
 *   `useUserStore`, `useUIStore`, `useWorkspaceStore`, `useChatStore`,
 *   `useSpace3DStore`, `usePresenceStore` (all under `src/modules/<feature>/state/`).
 */
export { createAuthSlice, type AuthSlice } from './authSlice';
export { createUISlice, type UISlice } from './uiSlice';
export { createWorkspaceSlice, type WorkspaceSlice } from './workspaceSlice';
export { createChatSlice, type ChatSlice } from './chatSlice';
export { createEditorSlice, type EditorSlice, type ModoEdicionObjeto, type PlantillaZonaEnColocacion } from './editorSlice';
export { createUsersSlice, type UsersSlice } from './usersSlice';
export { createAvatarSlice, type AvatarSlice } from './avatarSlice';
