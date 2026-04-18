/**
 * @module lib/network/retryFetch
 *
 * Clean Architecture — Infrastructure.
 *
 * Instala un wrapper sobre `window.fetch` que aplica retry con backoff
 * exponencial + jitter sobre URLs que matchean una política AssetLoadPolicy.
 * URLs fuera de la política pasan sin modificar.
 *
 * Motivación (logs 2026-04-18 00:35):
 *   15 `useGLTF(...)` paralelos → 429/500 → drei throws → scene unmount.
 *   Un solo fallo transitorio tumbaba toda la escena. Este wrapper absorbe
 *   los 429/500 transitorios con retry silencioso — el usuario nunca los ve.
 *
 * Seguridad del wrapping:
 *   - Solo intercepta URLs que matchean policy.urlPattern (Supabase Storage)
 *   - Otras URLs invocan el fetch original SIN paso extra (zero overhead)
 *   - Respeta el header `Retry-After` del servidor si lo envía (429 RFC 6585)
 *   - AbortSignal se propaga correctamente (si el caller aborta, stop retry)
 *
 * Instalación: `index.tsx` después de Sentry init, antes de cualquier
 * componente que dispare fetches. Idempotente — múltiples llamadas solo
 * instalan una vez (protege contra HMR).
 *
 * Refs:
 *   - https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 *   - RFC 6585 §4 (429 Too Many Requests)
 *   - https://github.com/mdn/dom-examples/tree/main/abort-api
 */

import { logger } from '../logger';
import {
  type AssetLoadPolicy,
  isRetryableStatus,
  nextDelayMs,
  parseRetryAfterMs,
  shouldInterceptUrl,
} from '@/src/core/domain/ports/IAssetLoadPolicy';

const log = logger.child('retry-fetch');

// ─── Install guard ───────────────────────────────────────────────────────────

const INSTALL_FLAG = Symbol.for('cowork.retryFetchInstalled');

interface GlobalWithFlag {
  [INSTALL_FLAG]?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  // Request
  return input.url;
}

function resolveSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (input instanceof Request) return input.signal;
  return undefined;
}

// ─── Installer ───────────────────────────────────────────────────────────────

/**
 * Reemplaza globalThis.fetch con un wrapper que aplica retry a URLs que
 * matchean la policy. Idempotente.
 *
 * @param policy Política a aplicar (urlPattern, maxRetries, backoff, etc.)
 */
export function installRetryFetch(policy: AssetLoadPolicy): void {
  const g = globalThis as unknown as GlobalWithFlag;
  if (g[INSTALL_FLAG]) {
    log.debug('retryFetch already installed, skipping');
    return;
  }
  if (typeof globalThis.fetch !== 'function') {
    log.warn('globalThis.fetch not available — skipping retryFetch install');
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  const wrappedFetch: typeof fetch = async (input, init) => {
    const url = resolveUrl(input);
    if (!shouldInterceptUrl(url, policy)) {
      return originalFetch(input, init);
    }

    const signal = resolveSignal(input, init);
    let lastResponse: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const response = await originalFetch(input, init);
        if (!isRetryableStatus(response.status, policy)) {
          // Éxito o error no-retriable → devolver tal cual.
          return response;
        }
        lastResponse = response;
        if (attempt === policy.maxRetries) {
          log.warn('Retry budget exhausted, returning last response', {
            url,
            status: response.status,
            attempts: attempt + 1,
          });
          return response;
        }
        // Respetar Retry-After si el server lo envió.
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        const delay = retryAfter ?? nextDelayMs(attempt, policy);
        log.info('Retrying transient error', {
          url,
          status: response.status,
          attempt: attempt + 1,
          delayMs: delay,
          honoredRetryAfter: retryAfter !== null,
        });
        await sleep(delay, signal);
      } catch (err) {
        // DOMException AbortError → propagar sin retry (user cancelled).
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        lastError = err;
        if (attempt === policy.maxRetries) {
          log.warn('Retry budget exhausted after network error', {
            url,
            error: (err as Error)?.message,
            attempts: attempt + 1,
          });
          throw err;
        }
        const delay = nextDelayMs(attempt, policy);
        log.info('Retrying network error', {
          url,
          error: (err as Error)?.message,
          attempt: attempt + 1,
          delayMs: delay,
        });
        await sleep(delay, signal);
      }
    }

    // Unreachable por la estructura del loop, pero TS lo exige.
    if (lastResponse) return lastResponse;
    throw lastError ?? new Error('retryFetch: reached unreachable branch');
  };

  globalThis.fetch = wrappedFetch;
  g[INSTALL_FLAG] = true;
  log.info('retryFetch installed', {
    maxRetries: policy.maxRetries,
    baseDelayMs: policy.baseDelayMs,
    maxDelayMs: policy.maxDelayMs,
    pattern: policy.urlPattern.source,
  });
}
