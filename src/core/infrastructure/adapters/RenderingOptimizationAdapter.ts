/**
 * @module infrastructure/adapters/RenderingOptimizationAdapter
 *
 * Adapter que implementa IRenderingOptimizationService.
 * Agrupa objetos por modelo para habilitar instancing en Three.js.
 *
 * Clean Architecture: capa de infraestructura — conoce la estrategia
 * de agrupación pero NO importa Three.js directamente.
 *
 * Ref: R3F Scaling Performance docs — "reduce draw calls by instancing repeating objects"
 * https://r3f.docs.pmnd.rs/advanced/scaling-performance
 */

import type {
  IRenderingOptimizationService,
  GrupoInstanciado,
  MetricasRenderizado,
} from '../../domain/ports/IRenderingOptimizationService';
import { UMBRALES_RENDERIZADO } from '../../domain/ports/IRenderingOptimizationService';
import type { ObjetoEspacio3D } from '../../domain/entities/espacio3d/ObjetoEspacio3D';
import { obtenerModeloObjeto } from '../../domain/entities/espacio3d/ObjetoRuntimeEntity';

export class RenderingOptimizationAdapter implements IRenderingOptimizationService {

  /**
   * Agrupa objetos por URL de modelo para instancing.
   * Objetos con el mismo modeloId se renderizan en 1 draw call con InstancedMesh.
   */
  agruparParaInstancing(objetos: ObjetoEspacio3D[]): GrupoInstanciado[] {
    const grupos = new Map<string, ObjetoEspacio3D[]>();

    for (const objeto of objetos) {
      const modeloId = obtenerModeloObjeto(objeto) ?? `builtin:unknown:${objeto.tipo}`;
      const grupo = grupos.get(modeloId) ?? [];
      grupo.push(objeto);
      grupos.set(modeloId, grupo);
    }

    return Array.from(grupos.entries()).map(([modeloId, items]) => ({
      modeloId,
      objetos: items,
      count: items.length,
    }));
  }

  /** Evalúa métricas contra umbrales del dominio */
  evaluarSalud(metricas: MetricasRenderizado): {
    saludable: boolean;
    alertas: string[];
    recomendaciones: string[];
  } {
    const alertas: string[] = [];
    const recomendaciones: string[] = [];

    if (metricas.drawCalls > UMBRALES_RENDERIZADO.drawCallsMaximo) {
      alertas.push(`Draw calls críticos: ${metricas.drawCalls} (máx: ${UMBRALES_RENDERIZADO.drawCallsMaximo})`);
      recomendaciones.push('Aplicar <Instances> de Drei para objetos repetidos (muebles, decoración).');
    } else if (metricas.drawCalls > UMBRALES_RENDERIZADO.drawCallsAlerta) {
      alertas.push(`Draw calls elevados: ${metricas.drawCalls} (alerta: >${UMBRALES_RENDERIZADO.drawCallsAlerta})`);
      recomendaciones.push('Revisar objetos repetidos y considerar instancing adicional.');
    }

    if (metricas.triangulos > UMBRALES_RENDERIZADO.trianglesBudget) {
      alertas.push(`Triángulos (${metricas.triangulos.toLocaleString()}) sobre el presupuesto`);
      recomendaciones.push('Usar LOD (Level of Detail) para avatares y objetos lejanos.');
    }

    if (metricas.geometrias > 200) {
      alertas.push(`Geometrías activas: ${metricas.geometrias} — posible GC pressure`);
      recomendaciones.push('Cachear geometrías con useMemo o en scope global fuera del render loop.');
    }

    if (metricas.programas > 20) {
      alertas.push(`Shader programs: ${metricas.programas} — muchos materiales únicos`);
      recomendaciones.push('Consolidar materiales similares; usar atlas de texturas.');
    }

    return { saludable: alertas.length === 0, alertas, recomendaciones };
  }

  /** Limpia caches (las texturas THREE se gestionan en ThreeTextureFactoryAdapter) */
  limpiarCaches(): void {
    // No-op: este adapter no mantiene cache interno de Three.js
    // ThreeTextureFactoryAdapter.dispose() maneja las texturas
  }
}
