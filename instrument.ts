/**
 * @module instrument.ts
 * Inicialización de Sentry — DEBE importarse ANTES de cualquier otro módulo.
 *
 * Patrón oficial Sentry React SDK:
 * @see https://docs.sentry.io/platforms/javascript/guides/react/
 *
 * "Import your Sentry configuration as the first import in your application
 *  entry point, then render your app. Call Sentry.init() before you mount
 *  your React component."
 *
 * IMPORTANTE: Este archivo usa import ESTÁTICO (no dynamic import).
 * Dynamic import haría que Sentry.init() se ejecute DESPUÉS de que React
 * comience a renderizar, perdiendo errores durante la inicialización.
 *
 * Clean Architecture: Este archivo pertenece a la capa de Infrastructure
 * (bootstrap/monitoring). No contiene lógica de dominio ni aplicación.
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const environment = (import.meta.env.VITE_SENTRY_ENV as string) || 'development';
const release = import.meta.env.VITE_APP_VERSION as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: release ? `cowork@${release}` : undefined,

    // Enviar PII por defecto (IP, user agent) — facilita debugging de freezes
    sendDefaultPii: true,

    // Performance: 10% en prod, 100% en staging/dev para capturar todo durante debug
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

    // Integrations oficiales para React SPA
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Solo capturar replays en errores (reduce ancho de banda)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Replays: solo en errores para no consumir cuota
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,

    // Reducir ruido: errores comunes de extensiones y WebSocket reconnects
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error exception captured',
      // AbortError: race condition clásico de WebRTC cuando user apaga cámara
      // mientras <video>.play() promise está pending. Emitido por livekit-client
      // (ver warning "Video is paused, trying to play" en logs del SDK),
      // no por código propio. Observado en logs 2026-04-18 00:15:34.
      // Ref: https://docs.livekit.io/client-sdk-js/ — behavior esperado.
      'AbortError: The operation was aborted',
      'AbortError: The play() request was interrupted',
    ],

    // Filtrar breadcrumbs de debug para no saturar
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }
      return breadcrumb;
    },

    // Filtrar errores de WebSocket esperados (LiveKit reconnect)
    beforeSend(event, hint) {
      const error = hint.originalException;
      if (error instanceof Error && error.message.includes('WebSocket')) {
        return null;
      }
      return event;
    },
  });

  console.info('[Sentry] Initialized', { environment, release });
} else {
  console.info('[Sentry] DSN not configured — skipping init');
}
