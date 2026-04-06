/**
 * @module domain/ports/IVideoTrackProcessor
 *
 * Puerto principal para procesador de tracks de video con efectos de fondo.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Dominio
 * ════════════════════════════════════════════════════════════════
 *
 * Define los tipos y la interfaz que la capa de Infraestructura
 * (LiveKitOfficialBackgroundAdapter) debe implementar para
 * proveer background processing de video.
 *
 * El ciclo de vida del processor se gestiona exclusivamente a
 * través de los métodos keep-alive:
 *   attachProcessor → setEffect → disableEffect → detachProcessor
 *
 * La capa de Application (GestionarBackgroundVideoUseCase) orquesta
 * estos métodos; la capa de Presentación NO los invoca directamente.
 */

/**
 * Tipo de efecto de fondo soportado por el pipeline de video.
 * Fuente de verdad única para todo el dominio.
 */
export type EffectType = 'none' | 'blur' | 'image';

export interface VideoTrackProcessorConfig {
  /** Tipo de efecto a aplicar */
  effectType: EffectType;
  /** Cantidad de blur (solo para effectType='blur') */
  blurRadius?: number;
  /** URL de imagen de fondo (solo para effectType='image') */
  backgroundImageUrl?: string | null;
  /** FPS objetivo para procesamiento (default: 15) */
  targetFps?: number;
}

/**
 * Puerto para procesador de tracks de video — patrón keep-alive.
 *
 * La implementación debe garantizar:
 *   - WASM se inicializa UNA sola vez por track (en attachProcessor)
 *   - switchTo() es O(1) — sin re-init de GPU/WebGL
 *   - detachProcessor() libera todos los recursos (solo en cleanup final)
 */
export interface IVideoTrackProcessor {
  /** Liberar todos los recursos y detener todo procesamiento */
  dispose(): void;
}
