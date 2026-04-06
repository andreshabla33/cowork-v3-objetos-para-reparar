/**
 * @module lib/monitoring/sentryInit
 * Inicialización de Sentry para error tracking en producción.
 *
 * Roadmap REMEDIATION-008:
 *  - Integra Sentry SDK con source maps para error tracking.
 *  - Instrumenta logger.ts para forward de errores críticos.
 *  - Configura performance monitoring (p99 latency tracking).
 *  - Usa lazy init: no carga el SDK en desarrollo/pruebas.
 *
 * Instalación requerida (cuando se active):
 *   npm install @sentry/react @sentry/vite-plugin
 *
 * Vars de entorno necesarias:
 *   VITE_SENTRY_DSN     → DSN del proyecto Sentry
 *   VITE_SENTRY_ENV     → "production" | "staging"
 *   VITE_APP_VERSION    → Semver del release (p. ej. "3.7.0")
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/react/
 */

// ─── Tipos de interfaz mínima para evitar acoplamiento duro ─────────────────
// En lugar de importar @sentry/react directamente (lo que fallaría si el paquete
// no está instalado aún), usamos dynamic import para un acoplamiento suave.

export interface SentryContext {
  userId?: string;
  email?: string;
  workspaceId?: string;
}

let _initialized = false;

/**
 * Inicializa Sentry si el DSN está configurado y estamos en producción.
 * Safe to call multiple times (idempotente).
 *
 * @param context - Contexto del usuario para enriquecer los eventos
 */
export async function initSentry(context?: SentryContext): Promise<void> {
  if (_initialized) return;

  const dsn = (import.meta as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN;
  const environment = (import.meta as { env?: Record<string, string> }).env?.VITE_SENTRY_ENV ?? 'development';
  const release = (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION;

  // Solo inicializar si hay DSN configurado (no en dev local sin .env)
  if (!dsn) {
    console.info('[Sentry] DSN not configured — skipping init');
    return;
  }

  try {
    // Dynamic import para no bloquear el bundle principal
    const Sentry = await import('@sentry/react');

    Sentry.init({
      dsn,
      environment,
      release: release ? `cowork@${release}` : undefined,

      // Performance: muestrea el 10% de transacciones en prod, 100% en staging
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

      // Reducir ruido: no reportar errores de extensiones de browser
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error exception captured',
      ],

      // Integrations de React para component stack traces
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          // Solo capturar replays en errores (reduce ancho de banda)
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Capturar replays solo cuando hay error
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.0,

      // Breadcrumbs: limitar consola para no saturar
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
          return null; // Ignorar logs de debug
        }
        return breadcrumb;
      },

      // Hook para filtrar errores antes de enviar
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Ignorar errores de red esperados (WebSocket reconnect)
        if (error instanceof Error && error.message.includes('WebSocket')) {
          return null;
        }

        return event;
      },
    });

    // Configurar contexto de usuario si está disponible
    if (context?.userId) {
      Sentry.setUser({
        id: context.userId,
        email: context.email,
      });
    }

    if (context?.workspaceId) {
      Sentry.setTag('workspace_id', context.workspaceId);
    }

    Sentry.setTag('app_version', release ?? 'unknown');

    _initialized = true;
    console.info('[Sentry] Initialized', { environment, release });
  } catch (err: unknown) {
    // Si @sentry/react no está instalado, silenciar sin romper la app
    console.warn('[Sentry] Failed to initialize (package not installed?)', err);
  }
}

/**
 * Captura un error en Sentry si está inicializado.
 * Fallback seguro si Sentry no está disponible.
 */
export async function captureError(
  error: Error | unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!_initialized) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      Sentry.captureException(error);
    });
  } catch {
    // Silenciar si Sentry no está disponible
  }
}

/**
 * Actualiza el contexto de usuario en Sentry (llamar después del login).
 */
export async function setSentryUser(context: SentryContext): Promise<void> {
  if (!_initialized) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.setUser({
      id: context.userId,
      email: context.email,
    });
    if (context.workspaceId) {
      Sentry.setTag('workspace_id', context.workspaceId);
    }
  } catch {
    // Silenciar
  }
}

/**
 * Limpia el contexto de usuario en Sentry (llamar en logout).
 */
export async function clearSentryUser(): Promise<void> {
  if (!_initialized) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.setUser(null);
  } catch {
    // Silenciar
  }
}
