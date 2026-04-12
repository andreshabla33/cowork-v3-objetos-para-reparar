/**
 * @module domain/ports/EstabilidadRenderizado
 *
 * Value Object + reglas puras de dominio para evaluar la estabilidad de una
 * secuencia de muestras de métricas de renderizado mediante ventana deslizante.
 *
 * Clean Architecture:
 *   - Capa Domain pura: ZERO imports de Three.js, React o Application.
 *   - Solo depende de `MetricasRenderizado` (también Domain).
 *   - Funciones libres de efectos secundarios, determinísticas y testeables.
 *
 * Motivación (DEBT-003 part B, cierre definitivo 2026-04-10):
 *
 * El enfoque anterior (delta frame-a-frame === 0) era incorrecto según las
 * mejores prácticas oficiales de Three.js / R3F:
 *
 *   - Three.js Best Practices Tip 42: "renderer.info.memory — if counts keep
 *     GROWING, you have a leak" (no "if counts change frame-to-frame").
 *     Ref: https://www.utsubo.com/blog/threejs-best-practices-100-tips
 *
 *   - R3F `PerformanceMonitor` utiliza ventanas temporales, no diffs puntuales.
 *     Ref: https://r3f.docs.pmnd.rs/advanced/scaling-performance
 *
 *   - three.js issue #5680 documenta que `renderer.info.memory.geometries`
 *     tiene precisión aproximada; fluctúa por operaciones internas legítimas
 *     (InstancedMesh resize, DataTexture flush, BatchedMesh reorder, shadow
 *     map traversal) sin que haya churn real de VRAM.
 *     Ref: https://github.com/mrdoob/three.js/issues/5680
 *
 * Ajuste post-validación en producción (2026-04-10, DEBT-003-B-CLOSE):
 *
 * Tras el primer deploy del sliding-window, se observó un falso positivo de
 * `leak-geometrias` durante la transición baseline(10) → scene-construction
 * (55) → frustum-culling-activo(154). El crecimiento era monotónicamente
 * creciente dentro de la ventana de 3 samples, PERO no correspondía a un
 * leak real — era el ramp natural de warm-up de la escena. Tras ese ramp,
 * las geometrías oscilaron 118-154 sin crecer, confirmando estabilidad.
 *
 * Dos defensas añadidas, alineadas con Three.js Tip 42 ("sustained growth"):
 *
 *   1. **Cooldown post-baseline** (`COOLDOWN_POST_BASELINE_MUESTRAS`): el
 *      detector de leak no evalúa hasta que se hayan observado al menos
 *      `maxSize + COOLDOWN_POST_BASELINE_MUESTRAS` muestras desde el inicio.
 *      Esto descarta el ramp de warm-up de la escena (scene construction
 *      lag), que no es un leak sino el estado transitorio esperado.
 *      Patrón estándar en telemetría: Node.js `perf_hooks.monitorEventLoopDelay`
 *      recomienda descartar warm-up samples.
 *
 *   2. **Umbral mínimo de crecimiento** (`CRECIMIENTO_MINIMO_PARA_LEAK`):
 *      cada paso monótono dentro de la ventana debe tener un delta absoluto
 *      ≥ umbral. Esto filtra la micro-oscilación ±1-2 del BufferGeometry
 *      pool y exige que el crecimiento sea semánticamente significativo.
 *
 * Diseño:
 *   - Ventana deslizante de N muestras (default 3).
 *   - Contador monotónico `totalObservadas` (no truncado por sliding window)
 *     para implementar el cooldown.
 *   - Una escena es "estable" si `drawCalls`, `programas` y `objetosEscena`
 *     se mantienen dentro de tolerancias bounded durante toda la ventana.
 *   - `geometrias` y `texturas` se excluyen del idle-guard y se evalúan por
 *     separado con un detector de crecimiento monótono (leak hunter) que
 *     respeta cooldown + umbral mínimo.
 *
 * Ref DEBT-003-B-CLOSE-2026-04-10.
 */

import type { MetricasRenderizado } from './IRenderingOptimizationService';

// ─── Constantes de dominio ────────────────────────────────────────────────────

/**
 * Tamaño de la ventana deslizante.
 * Con throttle de 8s por muestra → latencia de detección ~24s. Aceptable para
 * telemetría de idle (no es hot-path de gameplay).
 */
export const VENTANA_ESTABILIDAD_MAX_SAMPLES = 3;

/**
 * Número de muestras adicionales (más allá de llenar la ventana) que deben
 * observarse antes de habilitar el detector de leak. Descarta el scene
 * warm-up / construction ramp.
 *
 * Con maxSize=3 y cooldown=2 → leak detection activa a partir de la 5ª
 * muestra observada (~40s post-baseline con throttle de 8s). A esa altura
 * la escena ya pasó por: baseline → scene-construction → primer idle.
 */
export const COOLDOWN_POST_BASELINE_MUESTRAS = 2;

/**
 * Delta absoluto mínimo entre samples consecutivos para considerar el
 * crecimiento como "leak real". Filtra micro-oscilación del pool de
 * BufferGeometry (±1-2 observado empíricamente).
 *
 * Un leak real (componente creando geometry/frame sin dispose) supera
 * fácilmente +8 geom por cada muestra de 8s sostenidamente.
 */
export const CRECIMIENTO_MINIMO_PARA_LEAK = 8;

/**
 * Tolerancias para el idle-guard por campo. Basadas en el comportamiento real
 * observado del WebGLRenderer/WebGPURenderer en Three.js r170:
 *
 *   - drawCalls: frustum culling puede variar ±2 calls entre frames sin cambio
 *     semántico de escena (objetos entrando/saliendo del view frustum).
 *   - programas: debe ser exactamente estable (cualquier cambio implica que se
 *     compiló un shader nuevo, lo que es siempre relevante).
 *   - objetosEscena: debe ser exactamente estable (cualquier add/remove es un
 *     evento de negocio: avatar joined, object placed, etc.).
 */
export const TOLERANCIA_DRAWCALLS_ABSOLUTO = 2;

// ─── Value Objects ────────────────────────────────────────────────────────────

/**
 * Una muestra inmutable de métricas en un instante dado.
 * Extiende `MetricasRenderizado` con un timestamp monotónico.
 */
export interface MuestraRenderizado {
  readonly metricas: MetricasRenderizado;
  readonly timestampMs: number;
}

/**
 * Ventana deslizante de muestras. Inmutable: cada operación devuelve una nueva.
 *
 * `totalObservadas` es un contador monotónico global desde la creación de la
 * ventana (no se resetea con el sliding truncation). Permite implementar el
 * cooldown post-baseline para el leak detector.
 */
export interface VentanaEstabilidad {
  readonly muestras: ReadonlyArray<MuestraRenderizado>;
  readonly maxSize: number;
  readonly totalObservadas: number;
}

/**
 * Resultado de la evaluación de estabilidad sobre una ventana.
 */
export interface ResultadoEstabilidad {
  /** True si la ventana está llena y todas las muestras son bounded-stable */
  readonly esEstable: boolean;
  /** True si `geometrias` crece monótonamente (post-cooldown, delta ≥ umbral) */
  readonly leakGeometrias: boolean;
  /** True si `texturas` crece monótonamente (post-cooldown, delta ≥ umbral) */
  readonly leakTexturas: boolean;
  /**
   * Decisión final para la capa de presentación: ¿debe emitirse un log?
   * - Primera muestra (baseline): true
   * - Ventana llena pero inestable: true
   * - Leak detectado post-cooldown: true
   * - Ventana llena y estable y sin leak: false (idle-guard suprime)
   * - En warm-up (cooldown activo): false
   */
  readonly debeEmitir: boolean;
  /** Razón textual para logging/diagnóstico */
  readonly motivo: MotivoEmision;
}

export type MotivoEmision =
  | 'baseline'
  | 'inestable'
  | 'leak-geometrias'
  | 'leak-texturas'
  | 'idle-suprimido';

// ─── Constructores puros ──────────────────────────────────────────────────────

/**
 * Crea una ventana vacía con capacidad `maxSize`.
 */
export const crearVentanaEstabilidad = (
  maxSize: number = VENTANA_ESTABILIDAD_MAX_SAMPLES,
): VentanaEstabilidad => ({
  muestras: [],
  maxSize,
  totalObservadas: 0,
});

/**
 * Añade una muestra a la ventana, descartando la más antigua si se excede
 * `maxSize`. Operación inmutable — devuelve una nueva ventana. Incrementa
 * el contador monotónico `totalObservadas` (no afectado por truncation).
 */
export const agregarMuestra = (
  ventana: VentanaEstabilidad,
  muestra: MuestraRenderizado,
): VentanaEstabilidad => {
  const nuevas = [...ventana.muestras, muestra];
  const truncadas =
    nuevas.length > ventana.maxSize
      ? nuevas.slice(nuevas.length - ventana.maxSize)
      : nuevas;
  return {
    muestras: truncadas,
    maxSize: ventana.maxSize,
    totalObservadas: ventana.totalObservadas + 1,
  };
};

// ─── Reglas puras de dominio ──────────────────────────────────────────────────

/**
 * Una ventana está "bounded-stable" si:
 *   - Está llena (length === maxSize).
 *   - `drawCalls` varía a lo sumo TOLERANCIA_DRAWCALLS_ABSOLUTO dentro de la ventana.
 *   - `programas` es idéntico en todas las muestras.
 *   - `objetosEscena` es idéntico en todas las muestras.
 *
 * `geometrias` y `texturas` NO participan — son evaluadas por leak-detector.
 */
export const esVentanaEstable = (ventana: VentanaEstabilidad): boolean => {
  if (ventana.muestras.length < ventana.maxSize) return false;

  const drawCalls = ventana.muestras.map((s) => s.metricas.drawCalls);
  const programas = ventana.muestras.map((s) => s.metricas.programas);
  const objetosEscena = ventana.muestras.map((s) => s.metricas.objetosEscena);

  const drawCallsRango = Math.max(...drawCalls) - Math.min(...drawCalls);
  if (drawCallsRango > TOLERANCIA_DRAWCALLS_ABSOLUTO) return false;

  if (new Set(programas).size > 1) return false;
  if (new Set(objetosEscena).size > 1) return false;

  return true;
};

/**
 * Detecta si un campo numérico crece monótonamente a lo largo de toda la
 * ventana, con dos defensas adicionales contra falsos positivos:
 *
 *   1. **Cooldown post-baseline**: `totalObservadas` debe ser ≥
 *      `maxSize + COOLDOWN_POST_BASELINE_MUESTRAS`. Esto descarta el ramp
 *      de warm-up de la escena.
 *
 *   2. **Delta mínimo**: cada paso sample-a-sample debe tener delta ≥
 *      `CRECIMIENTO_MINIMO_PARA_LEAK`. Esto filtra la micro-oscilación
 *      del pool interno de BufferGeometry y exige que el crecimiento sea
 *      semánticamente significativo.
 *
 * Definición alineada con Three.js Best Practices Tip 42: "sustained
 * growth, not oscillation".
 */
export const detectarCrecimientoMonotono = (
  ventana: VentanaEstabilidad,
  campo: keyof Pick<MetricasRenderizado, 'geometrias' | 'texturas'>,
): boolean => {
  // Defensa 1: ventana debe estar llena.
  if (ventana.muestras.length < ventana.maxSize) return false;

  // Defensa 2: cooldown post-baseline. Descarta scene construction ramp.
  if (
    ventana.totalObservadas <
    ventana.maxSize + COOLDOWN_POST_BASELINE_MUESTRAS
  ) {
    return false;
  }

  // Defensa 3: crecimiento estrictamente monótono con delta mínimo.
  const valores = ventana.muestras.map((s) => s.metricas[campo]);
  for (let i = 1; i < valores.length; i++) {
    const delta = valores[i] - valores[i - 1];
    if (delta < CRECIMIENTO_MINIMO_PARA_LEAK) return false;
  }
  return true;
};

/**
 * Evalúa una ventana y decide si debe emitirse un log de telemetría.
 * Esta es la única función que la capa de presentación (vía use-case) debe
 * invocar. El primer-sample baseline se detecta internamente mediante
 * `totalObservadas === 1` — el caller NO necesita pasar un flag externo.
 */
export const evaluarVentanaEstabilidad = (
  ventana: VentanaEstabilidad,
): ResultadoEstabilidad => {
  // Baseline: primera muestra observada en la vida de la ventana.
  if (ventana.totalObservadas === 1) {
    return {
      esEstable: false,
      leakGeometrias: false,
      leakTexturas: false,
      debeEmitir: true,
      motivo: 'baseline',
    };
  }

  // Mientras la ventana no esté llena, no emitimos ni decidimos nada:
  // estamos acumulando señal. Esto evita bursting durante scene construction.
  if (ventana.muestras.length < ventana.maxSize) {
    return {
      esEstable: false,
      leakGeometrias: false,
      leakTexturas: false,
      debeEmitir: false,
      motivo: 'idle-suprimido',
    };
  }

  const leakGeometrias = detectarCrecimientoMonotono(ventana, 'geometrias');
  const leakTexturas = detectarCrecimientoMonotono(ventana, 'texturas');

  if (leakGeometrias) {
    return {
      esEstable: false,
      leakGeometrias,
      leakTexturas,
      debeEmitir: true,
      motivo: 'leak-geometrias',
    };
  }

  if (leakTexturas) {
    return {
      esEstable: false,
      leakGeometrias,
      leakTexturas,
      debeEmitir: true,
      motivo: 'leak-texturas',
    };
  }

  const esEstable = esVentanaEstable(ventana);
  if (!esEstable) {
    return {
      esEstable: false,
      leakGeometrias: false,
      leakTexturas: false,
      debeEmitir: true,
      motivo: 'inestable',
    };
  }

  return {
    esEstable: true,
    leakGeometrias: false,
    leakTexturas: false,
    debeEmitir: false,
    motivo: 'idle-suprimido',
  };
};
