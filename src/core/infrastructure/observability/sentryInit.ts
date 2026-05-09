/**
 * @module lib/monitoring/sentryInit
 * Helpers de Sentry para captura de errores y gestión de contexto de usuario.
 *
 * La inicialización de Sentry (Sentry.init) se hace en /instrument.ts
 * que se importa PRIMERO en index.tsx — patrón oficial de Sentry.
 *
 * Este módulo exporta helpers que usan import ESTÁTICO de @sentry/react.
 * Al ser tree-shakeable y con Sentry ya inicializado, no hay overhead.
 *
 * Clean Architecture: Infrastructure layer — monitoring/observabilidad.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/react/
 */

import * as Sentry from '@sentry/react';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface SentryContext {
  userId?: string;
  email?: string;
  workspaceId?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Captura un error en Sentry con contexto adicional.
 * Safe to call incluso si Sentry no está inicializado (DSN ausente):
 * el SDK de Sentry simplemente descarta el evento internamente.
 */
export function captureError(
  error: Error | unknown,
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Actualiza el contexto de usuario en Sentry (llamar después del login).
 * Enriquece todos los eventos futuros con la identidad del usuario.
 */
export function setSentryUser(context: SentryContext): void {
  Sentry.setUser({
    id: context.userId,
    email: context.email,
  });
  if (context.workspaceId) {
    Sentry.setTag('workspace_id', context.workspaceId);
  }
}

/**
 * Limpia el contexto de usuario en Sentry (llamar en logout).
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}
