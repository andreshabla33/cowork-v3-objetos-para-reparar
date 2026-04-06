/**
 * @module infrastructure/browser/BackgroundCapabilityDetector
 *
 * Detecta en tiempo de ejecución el nivel de soporte del browser para
 * background processing de video.
 *
 * Niveles de soporte:
 *   - NONE       → Browser sin Insertable Streams, sin procesamiento
 *   - LEGACY     → Processor soportado, pero sin OffscreenCanvas (main thread)
 *   - MODERN     → Processor + OffscreenCanvas (off-main-thread) — Chrome 94+
 *
 * API usada de @livekit/track-processors v0.7.x:
 *   supportsBackgroundProcessors()       → boolean (¿puede correr el processor?)
 *   supportsModernBackgroundProcessors() → boolean (Insertable Streams)
 *   OffscreenCanvas                       → detección nativa del browser
 *
 * @see https://github.com/livekit/track-processors-js
 */

import {
  supportsBackgroundProcessors,
} from '@livekit/track-processors';

export type BackgroundCapabilityLevel = 'none' | 'legacy' | 'modern';

export interface BackgroundCapability {
  /** Nivel de soporte detectado */
  level: BackgroundCapabilityLevel;
  /** Si algún tipo de background processing está disponible */
  supported: boolean;
  /** Si el procesamiento ocurrirá en OffscreenCanvas (off-main-thread) */
  offMainThread: boolean;
  /** Descripción legible del nivel de soporte */
  description: string;
}

/**
 * Detecta las capacidades del browser para background processing.
 * Llamar una vez al inicio; el resultado no cambia durante la sesión.
 */
export function detectBackgroundCapability(): BackgroundCapability {
  const isSupported = supportsBackgroundProcessors();
  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  if (!isSupported) {
    return {
      level: 'none',
      supported: false,
      offMainThread: false,
      description: 'Browser no soporta background processing (sin Insertable Streams)',
    };
  }

  if (hasOffscreenCanvas) {
    return {
      level: 'modern',
      supported: true,
      offMainThread: true,
      description:
        'OffscreenCanvas disponible (Chrome 94+) — procesamiento off-main-thread',
    };
  }

  return {
    level: 'legacy',
    supported: true,
    offMainThread: false,
    description:
      'Processor soportado sin OffscreenCanvas — procesamiento en main thread',
  };
}

/**
 * Singleton cacheado — detección solo ocurre una vez por sesión.
 */
let cachedCapability: BackgroundCapability | null = null;

export function getBackgroundCapability(): BackgroundCapability {
  if (!cachedCapability) {
    cachedCapability = detectBackgroundCapability();
  }
  return cachedCapability;
}
