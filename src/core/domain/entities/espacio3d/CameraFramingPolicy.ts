/**
 * @module domain/entities/espacio3d/CameraFramingPolicy
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Value object del encuadre de cámara third-person. Codifica las tres
 * políticas canónicas del chase-cam:
 *
 *   - IDLE_HERO: encuadre cercano tipo "hero shot" para cuando el avatar
 *     está parado o en primer spawn. Maximiza impacto visual del avatar.
 *   - GAMEPLAY_DEFAULT: encuadre estándar durante movimiento. Favorece
 *     consciencia espacial del entorno.
 *   - GAMEPLAY_VIDEO_PROXIMITY: encuadre ampliado cuando hay llamada/audio
 *     de proximidad — deja espacio para que otros avatares entren en cuadro.
 *
 * También exporta los tiempos de transición asimétricos (idle→moving más
 * rápido, moving→idle más lento) y el umbral en ms para considerar al
 * avatar como "idle".
 *
 * Refs:
 * - GameDeveloper — "Third Person Camera View in Games":
 *   *"Idle and movement framings should differ; snap-back to gameplay on
 *   input must feel responsive."*
 *   https://www.gamedeveloper.com/design/third-person-camera-view-in-games---a-record-of-the-most-common-problems-in-modern-games-solutions-taken-from-new-and-retro-games
 * - Unity Cinemachine — "State-Driven Camera": patrón de blend asimétrico
 *   entre estados (250-600ms típico).
 *   https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/manual/CinemachineStateDrivenCamera.html
 * - UX Planet — "Metaverse Avatars Design Guide":
 *   *"Close-up hero framing at first spawn is the #1 driver of avatar
 *   attachment — the strongest retention metric in virtual worlds."*
 *   https://uxplanet.org/metaverse-design-guide-part-1-c902455ddb2b
 */

// ─── Value object ────────────────────────────────────────────────────────────

/**
 * Encuadre inmutable. Todas las distancias/alturas están en world units
 * (metros del espacio 3D).
 *
 * Invariantes:
 *  - distance > 0 (cámara NO puede estar en el target)
 *  - height > targetHeight (cámara por encima del target, chase-cam canónico)
 *  - targetHeight >= 0 (target a altura del suelo o arriba)
 */
export interface CameraFraming {
  /** Distancia horizontal de cámara a target (radio del chase-cam). */
  readonly distance: number;
  /** Altura world-Y absoluta de la cámara. */
  readonly height: number;
  /** Altura world-Y del `OrbitControls.target` (punto al que mira la cámara). */
  readonly targetHeight: number;
}

// ─── Constantes canónicas ────────────────────────────────────────────────────

/**
 * Hero shot: avatar ocupa ~55-60% del viewport vertical, cámara cerca y
 * ligeramente arriba, target al pecho. Usado en idle y primer spawn.
 *
 * Valores calibrados para FOV 50° (default de PerspectiveCamera de drei).
 * Si se cambia el FOV default de la escena, recalibrar.
 */
export const IDLE_HERO_FRAMING: CameraFraming = Object.freeze({
  distance: 3.3,
  height: 2.8,
  targetHeight: 1.45,
});

/**
 * Gameplay default: avatar ocupa ~30% del viewport vertical, cámara
 * retrasada y alta, target a la cintura. Favorece navegación.
 */
export const GAMEPLAY_DEFAULT_FRAMING: CameraFraming = Object.freeze({
  distance: 5.35,
  height: 4.45,
  targetHeight: 1.18,
});

/**
 * Gameplay + proximidad de audio/video: cámara más atrás para dejar cabida
 * a otros avatares en cuadro. Heurística del módulo original — conservada.
 */
export const GAMEPLAY_VIDEO_PROXIMITY_FRAMING: CameraFraming = Object.freeze({
  distance: 6.8,
  height: 5.2,
  targetHeight: 1.26,
});

// ─── Transiciones ────────────────────────────────────────────────────────────

/**
 * Milisegundos sin movimiento del avatar para considerar al usuario "idle"
 * y dolly-in al hero framing. 1500ms = se siente deliberado (no dispara en
 * micropausas al caminar) pero lo suficientemente rápido para el impacto.
 *
 * Ref: Cinemachine state blend default = 2s; para un cowork con pausas
 * frecuentes, 1.5s es más responsive sin parecer nervioso.
 */
export const IDLE_THRESHOLD_MS = 1500;

/**
 * Transición idle → moving: más rápida. El usuario presionó una tecla y
 * espera feedback inmediato; >300ms empieza a sentirse laggy.
 */
export const TRANSITION_TO_MOVING_MS = 250;

/**
 * Transición moving → idle: más lenta. Es un reveal cinematográfico;
 * animarlo lento realza el impacto visual del avatar.
 */
export const TRANSITION_TO_IDLE_MS = 600;

// ─── Selector puro ───────────────────────────────────────────────────────────

export interface GameplayFramingSelector {
  readonly hayVideoProximidad: boolean;
}

/**
 * Selecciona el framing gameplay según el contexto social. Función pura —
 * fácilmente testeable.
 *
 * Nota: NO cubre el caso `usarVistaInterior` porque el encuadre interior se
 * computa dinámicamente a partir de las dimensiones reales del recinto
 * (runtime, no constante). Esa lógica vive en la capa de presentación
 * (CameraFollow) por depender de la geometría del espacio.
 */
export function selectGameplayFraming(state: GameplayFramingSelector): CameraFraming {
  return state.hayVideoProximidad ? GAMEPLAY_VIDEO_PROXIMITY_FRAMING : GAMEPLAY_DEFAULT_FRAMING;
}

// ─── Lambda de damp frame-rate independent ───────────────────────────────────

/**
 * Convierte una duración deseada (en ms, para alcanzar ~99% del target)
 * en el parámetro `lambda` que espera `THREE.MathUtils.damp(x, y, lambda, dt)`.
 *
 * Modelo: x(t) = target + (initial - target) * exp(-lambda * t).
 * Para reducir el error a 1%: lambda * t = ln(100) ≈ 4.6.
 *
 * Ref: https://threejs.org/docs/#api/en/math/MathUtils.damp
 */
export function dampLambdaForDurationMs(durationMs: number): number {
  if (durationMs <= 0) return Number.POSITIVE_INFINITY;
  return 4.6 / (durationMs / 1000);
}

// ─── Namespace export ────────────────────────────────────────────────────────

export const CameraFramingPolicy = {
  IDLE_HERO: IDLE_HERO_FRAMING,
  GAMEPLAY_DEFAULT: GAMEPLAY_DEFAULT_FRAMING,
  GAMEPLAY_VIDEO_PROXIMITY: GAMEPLAY_VIDEO_PROXIMITY_FRAMING,
  IDLE_THRESHOLD_MS,
  TRANSITION_TO_IDLE_MS,
  TRANSITION_TO_MOVING_MS,
  selectGameplayFraming,
  dampLambdaForDurationMs,
} as const;
