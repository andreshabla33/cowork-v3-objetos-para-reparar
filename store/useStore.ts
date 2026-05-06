/**
 * @module store/useStore
 * @description Backwards-compatibility shim for the multi-store decomposition (P0-04).
 *
 * The canonical store now lives in `src/modules/_state/composedStore.ts`, with
 * feature-bounded views exposed under `src/modules/<feature>/state/use<X>Store.ts`
 * (`useUserStore`, `useUIStore`, `useWorkspaceStore`, `useChatStore`,
 * `useSpace3DStore`, `usePresenceStore`). This file re-exports the composed
 * store under the legacy `useStore` name so existing consumers keep working
 * unchanged while migration progresses.
 *
 * @deprecated Prefer importing the bounded-context store you actually need:
 *   - `useUserStore`        from `@/modules/user/state/useUserStore`
 *   - `useUIStore`          from `@/modules/ui/state/useUIStore`
 *   - `useWorkspaceStore`   from `@/modules/workspace/state/useWorkspaceStore`
 *   - `useChatStore`        from `@/modules/chat/state/useChatStore`
 *   - `useSpace3DStore`     from `@/modules/space3d/state/useSpace3DStore`
 *   - `usePresenceStore`    from `@/modules/presence/state/usePresenceStore`
 */

export { useComposedStore as useStore } from '../src/modules/_state/composedStore';
