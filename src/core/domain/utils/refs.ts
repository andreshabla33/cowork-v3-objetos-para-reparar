/**
 * @module domain/utils/refs
 *
 * Helpers puros para narrow con seguridad `useRef<T>(null)`. TypeScript
 * infiere `T | null` en el tipo del ref; los accesos a `.current.foo`
 * sin guard se rompen por `never` en strict mode.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Domain (utilidades puras)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin deps. Se usan donde la invariante *"el ref no es null en este punto"*
 * es real (post-montaje, dentro de callbacks que solo corren si el ref
 * está seteado, etc.). Fix plan-correcciones Fase 2.
 */

interface RefLike<T> {
  current: T | null;
}

/**
 * Retorna `ref.current` asumiendo que no es null. Si lo es, lanza con
 * un mensaje descriptivo — indica una invariante rota en el código.
 *
 * ```ts
 * const coordinator = invariantRef(coordinatorRef, 'coordinatorRef');
 * coordinator.startMedia();   // ← TS sabe que es no-null
 * ```
 */
export function invariantRef<T>(ref: RefLike<T>, name: string): T {
  if (ref.current === null) {
    throw new Error(
      `[invariantRef] Expected '${name}' to be non-null, got null. ` +
      `Likely called before mount or after unmount.`,
    );
  }
  return ref.current;
}

/**
 * Retorna `ref.current` o `fallback` si es null. Sin throw. Útil cuando
 * el código puede correr antes del mount o con el ref ya limpiado.
 *
 * ```ts
 * const state = refOr(stateRef, defaultState);
 * ```
 */
export function refOr<T>(ref: RefLike<T>, fallback: T): T {
  return ref.current !== null ? ref.current : fallback;
}
