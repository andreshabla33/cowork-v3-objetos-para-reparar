import type { ZonaEmpresa } from '@/types';

export interface IRepositorioEliminarPlantillaZona {
  obtenerZonaPorId(zonaId: string): Promise<ZonaEmpresa | null>;
  eliminarPlantillaAplicada(params: {
    zona: ZonaEmpresa;
    userId: string;
    plantillaOrigen?: string | null;
  }): Promise<{
    zona: ZonaEmpresa;
    objetosEliminados: number;
    subzonasEliminadas: number;
  }>;
}

export class EliminarPlantillaZonaUseCase {
  constructor(private readonly repositorio: IRepositorioEliminarPlantillaZona) {}

  async execute(params: {
    zonaId: string;
    espacioId: string;
    userId: string;
    plantillaOrigen?: string | null;
  }): Promise<{
    zona: ZonaEmpresa;
    objetosEliminados: number;
    subzonasEliminadas: number;
  }> {
    if (!params.userId.trim()) {
      throw new Error('No se pudo identificar el usuario que elimina la plantilla.');
    }

    const zona = await this.repositorio.obtenerZonaPorId(params.zonaId);
    if (!zona) {
      throw new Error('La zona seleccionada ya no existe.');
    }

    if (zona.espacio_id !== params.espacioId) {
      throw new Error('La zona no pertenece al espacio activo.');
    }

    return this.repositorio.eliminarPlantillaAplicada({
      zona,
      userId: params.userId,
      plantillaOrigen: params.plantillaOrigen ?? null,
    });
  }
}
