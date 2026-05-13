/**
 * @module application/usecases/GestionarMaterialesSueloUseCase
 *
 * Caso de uso: gestiona materiales GPU-procedural para suelos del espacio 3D.
 *
 * Clean Architecture:
 *  - Depende del port IFloorMaterialFactory (dominio), NO del adapter Three.js.
 *  - Centraliza la lógica de cache, precarga y dispose.
 *  - El adapter compila MeshStandardMaterial + onBeforeCompile con shader
 *    procedural — coste VRAM ~0 por suelo, PBR completo (luces/sombras).
 */

import type {
  IFloorMaterialFactory,
  MaterialAbstracto,
} from '../../domain/ports/IFloorMaterialFactory';
import type { FloorType } from '../../domain/entities';

export class GestionarMaterialesSueloUseCase {
  constructor(private readonly materialFactory: IFloorMaterialFactory) {}

  /** Devuelve el material GPU para un FloorType. Cacheado por tipo. */
  obtenerMaterialSuelo(floorType: FloorType): MaterialAbstracto {
    return this.materialFactory.obtenerMaterial(floorType);
  }

  /**
   * Precarga la compilación de shaders para los tipos indicados. Llamar en
   * `requestIdleCallback` al mount para evitar stalls al pintar la primera
   * zona de cada tipo.
   */
  precargarMateriales(floorTypes: readonly FloorType[]): void {
    this.materialFactory.precargar(floorTypes);
  }

  /** Color hex representativo para UIs (swatches de selector). */
  obtenerColorSwatch(floorType: FloorType): string {
    return this.materialFactory.obtenerColorSwatch(floorType);
  }

  /** OBLIGATORIO al desmontar el workspace 3D. */
  dispose(): void {
    this.materialFactory.dispose();
  }
}
