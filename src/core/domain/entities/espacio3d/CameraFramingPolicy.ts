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

// ─── Camera mode strict type ────────────────────────────────────────────────

/**
 * Modos de cámara soportados. Type strict (no `string`) para que el compilador
 * detecte typos y branches no-soportados.
 *
 * - `'isometric'`: vista picada fija tipo Lords Mobile / Clash of Clans.
 *   Pan + zoom permitidos; rotate bloqueado (ángulo azimuth y polar fijos).
 *   Sin idle-hero close-up, sin chase-cam-rotation. **Default recomendado**
 *   para audiencia no-técnica (elimina friction de rotación accidental).
 * - `'free'`: legacy chase-cam con rotate 360° + idle-hero blend cuando
 *   avatar queda quieto. Conservado para usuarios que prefieren el modo
 *   pre-2026-05.
 *
 * 'fixed' (eliminado 2026-05-12): bloqueaba rotate + pan completamente,
 * UX confusa sin caso de uso real. Legacy persistido se migra a 'isometric'
 * en `userSettings.normalizarCameraModeLegacy`.
 */
export type CameraMode = 'isometric' | 'free';

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
  distance: 1.8,
  height: 1.2,
  targetHeight: 1.2,
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

/**
 * Vista isométrica picada estilo Lords Mobile / Clash of Clans. Avatar ocupa
 * ~25-35% del viewport, contexto visual amplio. Optimizado para audiencia
 * no-técnica: elimina la desorientación del chase-cam rotativo.
 *
 * Valores calibrados para FOV 50°. Ángulo polar fijo (ver
 * `ISOMETRIC_POLAR_ANGLE`) crea el look "tablero de ajedrez en perspectiva"
 * característico del género.
 *
 * Iteración 2026-05-12 #2: ajuste de distancia tras feedback visual. Iter
 * 1 (distance=12, height=10) dejaba el avatar a ~70px en pantalla (muy
 * lejos). Iter 2 acerca 1.7× manteniendo el ángulo isométrico — avatar
 * a ~120px, lo que pidió el usuario en la captura de referencia.
 *
 * Ref: Clash of Clans / Lords Mobile fixed isometric camera pattern.
 * Ref: Gather.town — cámara fija como decisión deliberada de accesibilidad.
 */
export const ISOMETRIC_FRAMING: CameraFraming = Object.freeze({
  distance: 7,
  height: 5.5,
  targetHeight: 1.0,
});

/**
 * Ángulo polar fijo para el modo isométrico (radianes desde el eje vertical).
 * π/4 ≈ 45° produce la inclinación canónica isométrica. Se aplica como
 * `min === max === ISOMETRIC_POLAR_ANGLE` en OrbitControls para bloquear
 * el tilt vertical.
 *
 * Ref: https://threejs.org/docs/#examples/en/controls/OrbitControls.minPolarAngle
 */
export const ISOMETRIC_POLAR_ANGLE = Math.PI / 4;

/**
 * Zoom permitido en modo isométrico. Min = 5m (más cerca = invasivo, el
 * avatar tapa el contexto). Max = 18m (más lejos = el avatar se pierde).
 * Calibrado tras iter 2 — antes era 8/25 cuando el default era 12.
 */
export const ISOMETRIC_MIN_ZOOM = 5;
export const ISOMETRIC_MAX_ZOOM = 18;

/**
 * Tiempo sin interacción manual con OrbitControls (drag / wheel / pinch) para
 * disparar auto-return al framing isométrico default. Si el usuario hizo zoom
 * y se alejó/acercó del default, tras este idle la cámara vuelve sola — UX
 * resiliente para usuarios que no saben cómo restaurar la vista.
 *
 * 2500ms = balance: lo bastante largo para no interrumpir mientras el usuario
 * sigue mirando algo zoomeado, lo bastante corto para que el retorno se
 * sienta automático tras soltar el mouse.
 *
 * Ref: Unity Cinemachine FreeLook `RecenterToTargetHeading.m_WaitTime` —
 * pattern canónico de auto-recenter en third-person cameras.
 * https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/manual/CinemachineFreeLook.html
 */
export const ZOOM_RETURN_IDLE_MS = 2500;

/**
 * Overview para modo dibujo/colocación de zonas y plantillas. Cámara alta
 * y alejada en ángulo isométrico suave, target en el piso del centro del
 * grid. Usado cuando `isDrawingZone` o `plantillaZonaEnColocacion` están
 * activos — permite ver toda la zona de la empresa (50×50m world) para
 * colocar pisos/muros sin perder el encuadre.
 *
 * Valores calibrados para:
 *  - Grid de 50×50m (WORLD_SIZE_PX=800 / 16) — lote estándar de empresa.
 *  - FOV 50° vertical (default PerspectiveCamera de drei).
 *  - Visible vertical a distance 22 + height 32 ≈ 35m diagonal.
 *
 * Ref: RepositorioRegistroEmpresaSupabaseAdapter.ts:33 — WORLD_SIZE_PX=800.
 */
export const DRAWING_OVERVIEW_FRAMING: CameraFraming = Object.freeze({
  distance: 22,      // horizontal desde el centro (ángulo isométrico)
  height: 32,        // altura world-Y (bird's-eye)
  targetHeight: 0,   // target al nivel del piso
});

/** Max distance permitido en OrbitControls durante drawing mode (zoom manual extra). */
export const DRAWING_MAX_ORBIT_DISTANCE = 80;

/**
 * Vista cenital pura para el modo "decorar piso". Cámara casi directamente
 * arriba del target (polar angle ≈ 1.6° desde la vertical) para que el admin
 * vea el espacio en 2D top-down y pueda colocar pisos sin distorsión de
 * perspectiva. distance > 0 obligatorio (OrbitControls requiere camera != target);
 * 0.5m es el mínimo práctico sin afectar la visual.
 *
 * Diferencia con DRAWING_OVERVIEW_FRAMING:
 *  - Drawing zone: distance=22 height=32 → polar ≈ 34° (isométrico picado,
 *    deja ver paredes y volumen 3D al definir zonas)
 *  - Paint floor: distance=0.5 height=35 → polar ≈ 0.8° (cenital plano,
 *    ideal para 2D layout de alfombras donde el volumen no aporta).
 *
 * Ref: https://threejs.org/docs/#examples/en/controls/OrbitControls.minPolarAngle
 */
export const PAINT_FLOOR_FRAMING: CameraFraming = Object.freeze({
  distance: 0.5,
  height: 35,
  targetHeight: 0,
});

/** Transición hacia/desde el overview framing (ms). */
export const TRANSITION_TO_DRAWING_MS = 500;

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
  ISOMETRIC: ISOMETRIC_FRAMING,
  ISOMETRIC_POLAR_ANGLE,
  ISOMETRIC_MIN_ZOOM,
  ISOMETRIC_MAX_ZOOM,
  IDLE_THRESHOLD_MS,
  TRANSITION_TO_IDLE_MS,
  TRANSITION_TO_MOVING_MS,
  selectGameplayFraming,
  dampLambdaForDurationMs,
} as const;
