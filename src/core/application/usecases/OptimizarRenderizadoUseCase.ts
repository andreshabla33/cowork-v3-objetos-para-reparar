/**
 * @module application/usecases/OptimizarRenderizadoUseCase
 *
 * Caso de uso: Agrupa objetos del espacio para instancing y evalúa la salud
 * del renderizado en base a métricas en tiempo real.
 *
 * Clean Architecture:
 *  - Depende del port IRenderingOptimizationService.
 *  - NO importa Three.js ni React Three Fiber.
 *
 * Ref: R3F docs — "Each mesh is a draw call. Optimally a few hundred or less."
 * https://r3f.docs.pmnd.rs/advanced/scaling-performance
 */

import type { IRenderingOptimizationService, GrupoInstanciado, MetricasRenderizado } from '../../domain/ports/IRenderingOptimizationService';
import type { ObjetoEspacio3D } from '../../domain/entities/espacio3d/ObjetoEspacio3D';
import { UMBRALES_RENDERIZADO } from '../../domain/ports/IRenderingOptimizationService';

// ─── Use Case Class ───────────────────────────────────────────────────────────

export class OptimizarRenderizadoUseCase {
  constructor(
    private readonly optimizationService: IRenderingOptimizationService,
  ) {}

  /**
   * Agrupa los objetos por modelo para que la capa de presentación
   * pueda renderizarlos como InstancedMesh en lugar de Mesh individuales.
   *
   * Impacto esperado: 50 sillas × 1 draw call → 1 draw call (reducción ~98%)
   */
  calcularGruposInstancing(objetos: ObjetoEspacio3D[]): GrupoInstanciado[] {
    return this.optimizationService.agruparParaInstancing(objetos);
  }

  /**
   * Evalúa si las métricas de renderizado están dentro de los umbrales óptimos.
   * Emite warnings accionables para el desarrollador.
   */
  evaluarSaludRenderizado(metricas: MetricasRenderizado): {
    saludable: boolean;
    alertas: string[];
    recomendaciones: string[];
  } {
    return this.optimizationService.evaluarSalud(metricas);
  }

  /**
   * Evaluación básica sin adapter (útil para logging directo en renderer-metrics).
   * Compara draw calls contra umbrales del dominio.
   */
  static evaluarMetricasSinAdapter(metricas: MetricasRenderizado): {
    saludable: boolean;
    alertas: string[];
  } {
    const alertas: string[] = [];

    if (metricas.drawCalls > UMBRALES_RENDERIZADO.drawCallsMaximo) {
      alertas.push(
        `Draw calls ${metricas.drawCalls} superan el máximo recomendado (${UMBRALES_RENDERIZADO.drawCallsMaximo}). Aplicar instancing.`,
      );
    } else if (metricas.drawCalls > UMBRALES_RENDERIZADO.drawCallsAlerta) {
      alertas.push(
        `Draw calls ${metricas.drawCalls} en zona de alerta (>${UMBRALES_RENDERIZADO.drawCallsAlerta}). Considerar más instancing.`,
      );
    }

    if (metricas.triangulos > UMBRALES_RENDERIZADO.trianglesBudget) {
      alertas.push(
        `Triángulos (${metricas.triangulos.toLocaleString()}) superan el presupuesto para GPU mid-range.`,
      );
    }

    return {
      saludable: alertas.length === 0,
      alertas,
    };
  }
}

export { UMBRALES_RENDERIZADO };
