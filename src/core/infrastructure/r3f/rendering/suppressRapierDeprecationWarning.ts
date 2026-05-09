/**
 * @module lib/rendering/suppressRapierDeprecationWarning
 *
 * Infrastructure-layer shim que silencia un único warning de wasm-bindgen
 * emitido por `@dimforge/rapier3d-compat` durante la inicialización del
 * módulo WASM.
 *
 * ## Problema upstream
 * La función pública `init()` de `@dimforge/rapier3d-compat@0.19.x`
 * invoca el entrypoint generado por wasm-bindgen pasando el `Uint8Array`
 * del binario WASM de forma posicional:
 *
 *   xA(Lg.toByteArray("..."))
 *
 * wasm-bindgen detecta que el argumento NO es un `{ module_or_path: ... }`
 * literal y emite:
 *
 *   console.warn('using deprecated parameters for the initialization
 *                 function; pass a single object instead')
 *
 * El warning es cosmético — la carga del WASM funciona igual — pero
 * contamina los logs de producción en cada arranque. No podemos arreglarlo
 * en nuestro código porque `@react-three/rapier@2.2.0` importa
 * `rapier3d-compat` directamente y no expone el entrypoint para envolver
 * el argumento antes.
 *
 * ## Fix (Clean Architecture · Infrastructure)
 * Interceptamos `console.warn` de forma muy acotada:
 *   1. Solo filtramos mensajes que contengan el substring exacto del warning.
 *   2. El resto de warnings pasan intactos (no rompemos el canal de logs).
 *   3. Auto-restauramos el `console.warn` original tras `RESTORE_DELAY_MS`
 *      milisegundos (el warning solo se emite una vez al inicializar el
 *      módulo WASM, por lo que 10 s son suficientes).
 *
 * ## Eliminación de deuda técnica
 * Este shim es explícitamente temporal. Cuando upstream publique una
 * versión de `rapier3d-compat` / `@react-three/rapier` que envuelva el
 * argumento como `{ module_or_path }`, este archivo y su import en
 * `index.tsx` deben ser eliminados.
 *
 * ## Referencias oficiales
 * - wasm-bindgen deployment (init signature):
 *   https://rustwasm.github.io/wasm-bindgen/reference/deployment.html
 * - @dimforge/rapier.js releases:
 *   https://github.com/dimforge/rapier.js/releases
 * - @react-three/rapier changelog:
 *   https://github.com/pmndrs/react-three-rapier/blob/main/CHANGELOG.md
 */

/** Substring exacto del warning de wasm-bindgen que queremos suprimir. */
const RAPIER_WASM_BINDGEN_WARN = 'using deprecated parameters for the initialization function';

/** Tiempo máximo (ms) durante el cual el interceptor está activo. */
const RESTORE_DELAY_MS = 10_000;

let alreadyInstalled = false;

/**
 * Instala el interceptor de `console.warn` que filtra el warning de
 * rapier3d-compat. Idempotente: invocaciones posteriores son no-op.
 *
 * Debe llamarse ANTES de que se importe/monte cualquier código que
 * dependa de `@react-three/rapier` (p.ej. `<Physics>` en Scene3D).
 * El lugar correcto es `index.tsx`, antes de renderizar `<App>`.
 */
export function installSuppressRapierDeprecationWarning(): void {
  if (alreadyInstalled) return;
  alreadyInstalled = true;

  const originalWarn = console.warn.bind(console);

  const interceptor = (...args: unknown[]): void => {
    const first = args[0];
    if (typeof first === 'string' && first.includes(RAPIER_WASM_BINDGEN_WARN)) {
      // Silenciar: upstream wasm-bindgen, ver @module JSDoc arriba.
      return;
    }
    originalWarn(...args);
  };

  console.warn = interceptor;

  // Auto-restore: el warning solo se emite una vez durante la carga del
  // módulo WASM. Tras 10 s, devolvemos el canal original para no interferir
  // con warnings futuros de otras librerías.
  setTimeout(() => {
    if (console.warn === interceptor) {
      console.warn = originalWarn;
    }
  }, RESTORE_DELAY_MS);
}
