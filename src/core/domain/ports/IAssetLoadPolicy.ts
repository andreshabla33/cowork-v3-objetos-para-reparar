/**
 * @module domain/ports/IAssetLoadPolicy
 *
 * Clean Architecture — Domain layer (puro, sin fetch/React/Three).
 *
 * Política para cargas de assets remotos (modelos 3D, texturas) con
 * retry exponencial cuando el backend rate-limita o falla transitoriamente.
 *
 * Contexto (observado en logs prod 2026-04-18 00:35):
 *   Al boot, StaticObjectBatcher dispara 15+ `useGLTF(url)` en paralelo
 *   contra Supabase Storage. La combinación de burst + rate limits internos
 *   devuelve 429 (Too Many Requests) y 500 (Internal Server Error). Drei
 *   propaga cualquier fallo como throw → react error boundary unmount →
 *   Scene optimization disposed → WebGL context lost → escena muerta.
 *
 * Solución: esta política define cómo reintentar transparentemente.
 * El adapter en lib/network/retryFetch.ts implementa la ejecución usando
 * window.fetch sin conocer detalles de negocio (separación de capas).
 *
 * Refs:
 *   - https://supabase.com/docs/guides/storage/production/scaling
 *   - RFC 6585 §4 (429 Too Many Requests, Retry-After header)
 *   - Exponential backoff: AWS builder's library
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AssetLoadPolicy {
  /** Número máximo de reintentos antes de dejar que el error propague. */
  maxRetries: number;
  /** Delay base para el backoff exponencial (ms). */
  baseDelayMs: number;
  /** Delay máximo entre reintentos (ms). Evita esperas de minutos. */
  maxDelayMs: number;
  /** Jitter factor en [0, 1] — evita thundering herd al reconectar. */
  jitterFactor: number;
  /** HTTP status codes que justifican reintento (no 4xx client errors salvo 429). */
  retryableStatus: readonly number[];
  /**
   * Regex de URLs que esta política intercepta. Otras URLs se dejan pasar
   * sin modificar (no queremos afectar auth endpoints, livekit ws, etc.).
   */
  urlPattern: RegExp;
}

// ─── Políticas por defecto ───────────────────────────────────────────────────

/**
 * Política para Supabase Storage (buckets públicos de GLBs/texturas).
 *
 * Cálculo de budget:
 *   Peor caso: 15 GLBs paralelos → todos 429 → retry 3× cada uno con
 *   backoff 500ms / 1s / 2s (+ jitter 0-300ms). Total ~4s antes de rendirse.
 *   Aceptable para el escenario de boot. Si sigue fallando tras 4s,
 *   probablemente el servicio está caído y el error boundary debe actuar.
 */
export const SUPABASE_STORAGE_POLICY: AssetLoadPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
  jitterFactor: 0.3,
  retryableStatus: [408, 425, 429, 500, 502, 503, 504] as const,
  // Coincide con lcryrsdyrzotjqdxcwtp.supabase.co u otros proyectos Supabase.
  // El bucket específico no importa — cualquier /storage/v1/object/... califica.
  urlPattern: /^https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\//i,
};

// ─── Helpers puros ────────────────────────────────────────────────────────────

/**
 * Calcula el siguiente delay con backoff exponencial + jitter aditivo.
 * Fórmula: min(baseDelayMs * 2^attempt, maxDelayMs) + random(0, jitter).
 *
 * @param attempt  Número de intento (0 = primer retry, 1 = segundo, etc.)
 * @param policy   Política a aplicar
 * @param rng      Función random (útil para tests determinísticos)
 */
export function nextDelayMs(
  attempt: number,
  policy: AssetLoadPolicy,
  rng: () => number = Math.random,
): number {
  const exponential = policy.baseDelayMs * Math.pow(2, Math.max(0, attempt));
  const capped = Math.min(exponential, policy.maxDelayMs);
  const jitter = rng() * capped * policy.jitterFactor;
  return Math.round(capped + jitter);
}

/**
 * ¿Este status HTTP justifica un retry?
 * True solo para los códigos en retryableStatus (429 + 5xx transitorios).
 */
export function isRetryableStatus(status: number, policy: AssetLoadPolicy): boolean {
  return policy.retryableStatus.includes(status);
}

/**
 * ¿Esta URL está bajo la política? Solo URLs que matchan urlPattern
 * son interceptadas — el resto pasa sin modificar.
 */
export function shouldInterceptUrl(url: string, policy: AssetLoadPolicy): boolean {
  return policy.urlPattern.test(url);
}

/**
 * Parsea el header `Retry-After` de una respuesta HTTP.
 * Soporta formato segundos (RFC 6585) o HTTP-date (RFC 7231).
 * Devuelve null si no se puede parsear o si ya pasó la fecha.
 */
export function parseRetryAfterMs(
  header: string | null,
  now: number = Date.now(),
): number | null {
  if (!header) return null;
  // Formato 1: entero de segundos
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds) && seconds >= 0 && String(seconds) === header.trim()) {
    return seconds * 1000;
  }
  // Formato 2: HTTP-date
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  const diff = date - now;
  return diff > 0 ? diff : null;
}
