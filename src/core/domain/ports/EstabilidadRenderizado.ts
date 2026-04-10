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
 * Diseño:
 *   - Ventana deslizante de N muestras (default 3).
 *   - Una escena es "estable" si `drawCalls`, `programas` y `objetosEscena`
 *     se mantienen dentro de tolerancias bounded durante toda la ventana.
 *   - `geometrias` y `texturas` se excluyen del idle-guard y se evalúan por
 *     separado con un detector de crecimiento monótono (leak hunter).
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
 */
export interface VentanaEstabilidad {
  readonly muestras: ReadonlyArray<MuestraRenderizado>;
  readonly maxSize: number;
}

/**
 * Resultado de la evaluación de estabilidad sobre una ventana.
 */
export interface ResultadoEstabilidad {
  /** True si la ventana está llena y todas las muestras son bounded-stable */
  readonly esEstable: boolean;
  /** True si `geometrias` crece monótonamente durante toda la ventana */
  readonly leakGeometrias: boolean;
  /** True si `texturas` crece monótonamente durante toda la ventana */
  readonly leakTexturas: boolean;
  /**
   * Decisión final para la capa de presentación: ¿debe emitirse un log?
   * - Primera muestra (baseline): true
   * - Ventana llena pero inestable: true
   * - Leak detectado: true
   * - Ventana llena y estable y sin leak: false (idle-guard suprime)
   */
  readonly debeEmitir: boolean;
  /** Razón textual para logging/diagnóstico — opcional */
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
});

/**
 * Añade una muestra a la ventana, descartando la más antigua si se excede
 * `maxSize`. Operación inmutable — devuelve una nueva ventana.
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
 * Detecta si un campo numérico crece estrictamente monótonamente a lo largo
 * de toda la ventana. Esta es la definición oficial de "leak" según Three.js
 * Best Practices Tip 42.
 *
 * Nota: crecimiento monótono DENTRO de una ventana corta (3 muestras) es un
 * indicio temprano, no una prueba concluyente. Para confirmación debería
 * mantenerse N ventanas consecutivas creciendo — eso es responsabilidad de
 * la capa de aplicación o presentación si se quiere suppression avanzada.
 */
export const detectarCrecimientoMonotono = (
  ventana: VentanaEstabilidad,
  campo: keyof Pick<MetricasRenderizado, 'geometrias' | 'texturas'>,
): boolean => {
  if (ventana.muestras.length < ventana.maxSize) return false;
  const valores = ventana.muestras.map((s) => s.metricas[campo]);
  // Estrictamente creciente: cada valor > el anterior.
  return valores.every((v, i) => i === 0 || v > valores[i - 1]);
};

/**
 * Evalúa una ventana y decide si debe emitirse un log de telemetría.
 * Esta es la única función que la capa de presentación debe llamar.
 */
export const evaluarVentanaEstabilidad = (
  ventana: VentanaEstabilidad,
  esPrimerMuestra: boolean,
): ResultadoEstabilidad => {
  if (esPrimerMuestra) {
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
