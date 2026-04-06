/**
 * @module application/usecases/CargarCatalogosUseCase
 * @description Use case to load all avatar and object catalogs in parallel.
 * Orchestrates catalog loading and returns both catalogs with equipped avatar info.
 *
 * Clean Architecture: Application layer — orchestrates catalog operations
 * through repository port, no direct infrastructure dependency.
 */

import type { IAvatarCatalogRepository, AvatarModelData, AnimacionAvatarData } from '../../domain/ports/IAvatarCatalogRepository';
import type { CatalogoObjeto3D } from '@/types/objetos3d';

export interface CatalogosCargados {
  avatares: AvatarModelData[];
  objetos: CatalogoObjeto3D[];
  avatarEquipadoId: string | null;
}

export class CargarCatalogosUseCase {
  constructor(private readonly avatarCatalogRepository: IAvatarCatalogRepository) {}

  /**
   * Load avatars, objects, and equipped avatar in parallel.
   */
  async ejecutar(userId: string): Promise<CatalogosCargados> {
    const [avatares, objetos, avatarEquipadoId] = await Promise.all([
      this.avatarCatalogRepository.obtenerAvatares(),
      this.avatarCatalogRepository.obtenerObjetos(),
      this.avatarCatalogRepository.obtenerAvatarEquipado(userId),
    ]);

    return {
      avatares,
      objetos,
      avatarEquipadoId,
    };
  }
}
