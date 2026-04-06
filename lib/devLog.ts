/**
 * @deprecated ARCHIVO HUÉRFANO — Sin referencias activas. Eliminar manualmente.
 * Detectado en auditoría arquitectural 2026-03-30 (ARCH-CLEANUP-001).
 * Usar lib/logger.ts como logger canónico del proyecto.
 * Ejecutar: git rm lib/devLog.ts
 *
 * Logger condicional para desarrollo.
 * En producción (import.meta.env.PROD), los logs se silencian para evitar
 * exponer información sensible en la consola del navegador.
 */

const isDev = import.meta.env.DEV;

export const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};

export const devWarn = (...args: any[]) => {
  if (isDev) console.warn(...args);
};

export const devError = (...args: any[]) => {
  // Errores siempre se muestran, pero sin datos sensibles en prod
  if (isDev) {
    console.error(...args);
  } else {
    // En prod, solo el primer argumento (mensaje genérico)
    console.error(args[0]);
  }
};
