/**
 * @module application/usecases/GestionarMaterialesSueloUseCase
 *
 * Caso de uso: Obtiene materiales PBR para suelos del espacio 3D
 * a través del port ITextureFactory.
 *
 * Clean Architecture:
 *  - Depende del port ITextureFactory (dominio), NO del adapter Three.js.
 *  - Permite cambiar la implementación de renderizado sin modificar este use case.
 *  - Centraliza la lógica de cache y disposición de materiales.
 */

import type { ITextureFactory, PBRMaterialProps } from '../../domain/ports/ITextureFactory';
import type { FloorType } from '../../domain/entities';

// ─── Parámetros ───────────────────────────────────────────────────────────────

export interface ObtenerMaterialParams {
  floorType: FloorType;
  ancho: number;
  alto: number;
  opacidad?: number;
}

// ─── Use Case Class ───────────────────────────────────────────────────────────

/**
 * Use case para gestión de materiales de suelo PBR.
 * Se instancia con un ITextureFactory inyectado desde el contenedor DI.
 *
 * @example
 * const uc = new GestionarMaterialesSueloUseCase(diContainer.textureFactory);
 * const props = uc.obtenerPropsMaterial({ floorType, ancho: 10, alto: 10 });
 */
export class GestionarMaterialesSueloUseCase {
  constructor(private readonly textureFactory: ITextureFactory) {}

  /** Obtiene las propiedades PBR para un tipo de suelo */
  obtenerPropsMaterial(params: ObtenerMaterialParams): PBRMaterialProps {
    return this.textureFactory.buildMaterialProps(
      params.floorType,
      params.ancho,
      params.alto,
      params.opacidad,
    );
  }

  /**
   * Precarga las texturas de los tipos de suelo usados en el espacio.
   * Llamar después de mount para evitar compilaciones de shader en runtime.
   */
  precargarTexturas(floorTypes: FloorType[]): void {
    for (const tipo of floorTypes) {
      this.textureFactory.getAlbedoTexture(tipo);
    }
  }

  /**
   * Libera todas las texturas cacheadas.
   * OBLIGATORIO llamar en el cleanup del componente que monta el espacio 3D.
   */
  dispose(): void {
    this.textureFactory.dispose();
  }
}
