/**
 * @module domain/ports/IFloorMaterialFactory
 *
 * Port para la fábrica de materiales de suelo GPU-procedural.
 *
 * Clean Architecture:
 *  - Define el contrato desde la perspectiva del dominio.
 *  - NO importa THREE.js — el tipo concreto del material vive en el adapter.
 *  - El adapter (FloorMaterialAdapter) compila un MeshStandardMaterial con
 *    onBeforeCompile inyectando un fragment shader procedural, manteniendo
 *    PBR (roughness, metalness, sombras) intacto.
 *
 * Generación GPU-procedural via GLSL fragment shader → ~0 VRAM por suelo,
 * sin texturas, PBR completo preservado (luces, sombras, roughness).
 */

import type { FloorType } from '../entities';

// ─── Tipos abstractos del dominio (sin dependencia de Three.js) ──────────────

/**
 * Referencia opaca a un material. El adapter expone el objeto concreto
 * (THREE.Material) vía `FloorMaterialAdapter.resolverMaterial(abstracto)`.
 * El dominio nunca conoce la implementación.
 */
export interface MaterialAbstracto {
  /** Identificador único para cache y comparación (UUID del material) */
  readonly id: string;
  /** FloorType que identifica al material en el catálogo */
  readonly floorType: FloorType;
}

// ─── Port ────────────────────────────────────────────────────────────────────

/**
 * Contrato para la fábrica de materiales de suelo GPU-procedural.
 *
 * Estrategia de cache:
 *  - 1 instancia de material por FloorType (compartida entre todas las zonas
 *    que usan ese tipo).
 *  - `customProgramCacheKey` agrupa por familia de patrón (chevron, planks,
 *    marble, etc.) — varios FloorType con misma topología comparten 1 GL
 *    program GPU.
 *
 * @see FloorMaterialAdapter — implementación Three.js en infrastructure/adapters/
 */
export interface IFloorMaterialFactory {
  /**
   * Devuelve el material para el FloorType dado. Cacheado por tipo: la
   * primera llamada compila el shader (~5-15ms), las siguientes reusan la
   * instancia y su GL program.
   */
  obtenerMaterial(floorType: FloorType): MaterialAbstracto;

  /**
   * Precarga la compilación de shaders para los tipos indicados. Pensado
   * para `requestIdleCallback` en el mount del espacio, evitando stalls al
   * pintar la primera zona de cada tipo.
   */
  precargar(floorTypes: readonly FloorType[]): void;

  /**
   * Color representativo del FloorType para UIs (swatch de selectores).
   * Reemplaza al `fallbackColor` del registry legacy.
   */
  obtenerColorSwatch(floorType: FloorType): string;

  /**
   * Libera GL programs, materiales cacheados y uniforms.
   * OBLIGATORIO llamar al desmontar el workspace 3D.
   */
  dispose(): void;
}
