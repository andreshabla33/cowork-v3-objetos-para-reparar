/**
 * @module domain/ports/ITextureFactory
 * Port (interfaz) para la fábrica de texturas y materiales de suelo PBR.
 *
 * Clean Architecture:
 *  - Define el contrato desde la perspectiva del Dominio.
 *  - NO importa THREE.js ni ninguna librería de infraestructura.
 *  - Los tipos concretos (THREE.Texture, THREE.Color) viven en el Adapter.
 *  - Permite intercambiar la implementación (Canvas → asset loader) sin tocar use cases.
 *
 * Ref roadmap: REMEDIATION-003 + CLEAN-ARCH-F1
 */

import type { FloorType } from '../entities';

// ─── Tipos abstractos del dominio (sin dependencia de Three.js) ───────────────

/**
 * Referencia opaca a una textura. El adapter inyecta el objeto concreto.
 * El dominio nunca conoce la implementación (THREE.Texture, ImageBitmap, etc.).
 */
export interface TexturaAbstracta {
  /** Identificador único para cache y comparación */
  readonly id: string;
  /** Indica si la textura está lista para usar */
  readonly ready: boolean;
}

/**
 * Color en espacio lineal RGB [0–1].
 * Equivalente abstracto de THREE.Color sin acoplarse a Three.js.
 */
export interface ColorLineal {
  r: number;
  g: number;
  b: number;
}

// ─── Value Objects del contrato ───────────────────────────────────────────────

/**
 * Propiedades de material PBR para el dominio.
 * El Adapter convierte estos valores a propiedades de THREE.MeshStandardMaterial.
 */
export interface PBRMaterialProps {
  map: TexturaAbstracta;
  roughness: number;
  metalness: number;
  transparent: boolean;
  opacity: number;
  emissive: ColorLineal;
  emissiveIntensity: number;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

// ─── Port ─────────────────────────────────────────────────────────────────────

/**
 * Contrato para la fábrica de texturas y materiales de suelo PBR.
 * Las implementaciones concretas se registran en el contenedor DI.
 *
 * @see ThreeTextureFactoryAdapter — implementación Three.js en infrastructure/adapters/
 */
export interface ITextureFactory {
  /**
   * Obtiene la textura de albedo para el tipo de suelo dado.
   * Las implementaciones deben cachear las texturas internamente para evitar
   * re-compilaciones de shader y presión sobre la GPU.
   */
  getAlbedoTexture(floorType: FloorType): TexturaAbstracta;

  /**
   * Construye las propiedades de material PBR para un suelo dado.
   *
   * @param floorType - Tipo de suelo del dominio
   * @param ancho     - Ancho en unidades de mundo
   * @param alto      - Alto (profundidad) en unidades de mundo
   * @param opacidad  - Opacidad (0–1, por defecto 1)
   */
  buildMaterialProps(
    floorType: FloorType,
    ancho: number,
    alto: number,
    opacidad?: number,
  ): PBRMaterialProps;

  /**
   * Libera todas las texturas cacheadas de GPU.
   * OBLIGATORIO llamar al desmontar el workspace para evitar memory leaks.
   */
  dispose(): void;
}
