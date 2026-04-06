/**
 * @module domain/ports/IRenderingOptimizationService
 * Port para estrategias de optimización de renderizado 3D.
 *
 * Clean Architecture:
 *  - El dominio define qué objetos deben agruparse para instancing.
 *  - La implementación concreta (ThreeInstancedRenderer) vive en infrastructure.
 *  - El use case de optimización trabaja contra este contrato.
 *
 * Ref: R3F docs — https://r3f.docs.pmnd.rs/advanced/scaling-performance
 * "Reduce draw calls by instancing repeating objects"
 */

import type { ObjetoEspacio3D } from '../entities/espacio3d/ObjetoEspacio3D';

// ─── Value Objects ────────────────────────────────────────────────────────────

export interface GrupoInstanciado {
  /** Clave única del modelo (URL o builtin ID) */
  modeloId: string;
  /** Objetos del mismo modelo agrupados para un draw call */
  objetos: ObjetoEspacio3D[];
  /** Número de instancias */
  count: number;
}

export interface MetricasRenderizado {
  drawCalls: number;
  triangulos: number;
  geometrias: number;
  texturas: number;
  programas: number;
  objetosEscena: number;
  gpuTier: number;
}

export interface UmbralCalidad {
  drawCallsMaximo: number;    // R3F docs: "optimally a few hundred" → 200
  drawCallsAlerta: number;    // 60% del límite → alerta temprana
  trianglesBudget: number;    // presupuesto de triángulos
}

// ─── Port ─────────────────────────────────────────────────────────────────────

/**
 * Contrato para el servicio de optimización de renderizado.
 * @see ThreeInstancedRendererAdapter — implementación en infrastructure/adapters/
 */
export interface IRenderingOptimizationService {
  /** Agrupa objetos por modelo para reducir draw calls */
  agruparParaInstancing(objetos: ObjetoEspacio3D[]): GrupoInstanciado[];

  /** Evalúa si las métricas actuales superan los umbrales */
  evaluarSalud(metricas: MetricasRenderizado): {
    saludable: boolean;
    alertas: string[];
    recomendaciones: string[];
  };

  /** Libera caches de geometría y material */
  limpiarCaches(): void;
}

// ─── Constantes de dominio ────────────────────────────────────────────────────

/**
 * Umbrales recomendados por R3F docs para un workspace 3D compartido.
 * Ref: https://r3f.docs.pmnd.rs/advanced/scaling-performance
 */
export const UMBRALES_RENDERIZADO: UmbralCalidad = {
  drawCallsMaximo: 300,     // < 300 draw calls = rendimiento óptimo
  drawCallsAlerta: 180,     // > 180 = considerar más instancing
  trianglesBudget: 500_000, // < 500k triángulos para GPU mid-range
};
