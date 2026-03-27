import type { ZonaEmpresa } from '@/types';
import { resolverTipoSubsueloZona } from '../../domain/entities/cerramientosZona';
import { obtenerPlantillaZona, type PlantillaZona, type PlantillaZonaId } from '../../domain/entities/plantillasEspacio';

export interface IRepositorioPlantillaZona {
  obtenerZonaPorId(zonaId: string): Promise<ZonaEmpresa | null>;
  guardarAplicacionPlantilla(params: {
    zona: ZonaEmpresa;
    userId: string;
    plantilla: PlantillaZona;
    centroXMetros: number;
    centroZMetros: number;
    objetosGenerados: string[];
    subzonasGeneradas: string[];
  }): Promise<ZonaEmpresa>;
}

export interface IInyectorPlantillaZona {
  sincronizarPlantilla(params: {
    espacioId: string;
    userId: string;
    zona: ZonaEmpresa;
    plantilla: PlantillaZona;
    centroXMetros: number;
    centroZMetros: number;
  }): Promise<{
    objetosGenerados: string[];
    subzonasGeneradas: string[];
  }>;
}

export class AplicarPlantillaZonaUseCase {
  constructor(
    private readonly repositorioPlantillaZona: IRepositorioPlantillaZona,
    private readonly inyectorPlantillaZona: IInyectorPlantillaZona,
  ) {}

  async execute(params: {
    zonaId: string;
    espacioId: string;
    userId: string;
    plantillaId: PlantillaZonaId;
    centroXMetros?: number;
    centroZMetros?: number;
  }): Promise<{
    zona: ZonaEmpresa;
    plantilla: PlantillaZona;
    objetosGenerados: string[];
    subzonasGeneradas: string[];
  }> {
    if (!params.userId.trim()) {
      throw new Error('No se pudo identificar el usuario que aplica la plantilla.');
    }

    const plantilla = obtenerPlantillaZona(params.plantillaId);
    if (!plantilla) {
      throw new Error('La plantilla de zona seleccionada no es válida.');
    }

    const zona = await this.repositorioPlantillaZona.obtenerZonaPorId(params.zonaId);
    if (!zona) {
      throw new Error('La zona seleccionada ya no existe.');
    }

    if (zona.espacio_id !== params.espacioId) {
      throw new Error('La zona no pertenece al espacio activo.');
    }

    if (zona.estado !== 'activa') {
      throw new Error('Solo puedes aplicar plantillas sobre zonas activas.');
    }

    if (resolverTipoSubsueloZona(zona.configuracion, 'organizacional') === 'decorativo') {
      throw new Error('No se pueden aplicar plantillas sobre subsuelos decorativos.');
    }

    const anchoZonaMetros = Number(zona.ancho) / 16;
    const altoZonaMetros = Number(zona.alto) / 16;
    const centroZonaXMetros = Number(zona.posicion_x) / 16;
    const centroZonaZMetros = Number(zona.posicion_y) / 16;

    if (anchoZonaMetros < plantilla.ancho_minimo_metros || altoZonaMetros < plantilla.alto_minimo_metros) {
      throw new Error(`La zona es demasiado pequeña para la plantilla ${plantilla.nombre}. Requiere al menos ${plantilla.ancho_minimo_metros}m × ${plantilla.alto_minimo_metros}m.`);
    }

    const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
    const mitadAnchoDisponible = Math.max((anchoZonaMetros - plantilla.ancho_minimo_metros) / 2, 0);
    const mitadAltoDisponible = Math.max((altoZonaMetros - plantilla.alto_minimo_metros) / 2, 0);
    const centroXMetros = clamp(
      Number.isFinite(params.centroXMetros) ? Number(params.centroXMetros) : centroZonaXMetros,
      centroZonaXMetros - mitadAnchoDisponible,
      centroZonaXMetros + mitadAnchoDisponible,
    );
    const centroZMetros = clamp(
      Number.isFinite(params.centroZMetros) ? Number(params.centroZMetros) : centroZonaZMetros,
      centroZonaZMetros - mitadAltoDisponible,
      centroZonaZMetros + mitadAltoDisponible,
    );

    const { objetosGenerados, subzonasGeneradas } = await this.inyectorPlantillaZona.sincronizarPlantilla({
      espacioId: params.espacioId,
      userId: params.userId,
      zona,
      plantilla,
      centroXMetros,
      centroZMetros,
    });

    const zonaActualizada = await this.repositorioPlantillaZona.guardarAplicacionPlantilla({
      zona,
      userId: params.userId,
      plantilla,
      centroXMetros,
      centroZMetros,
      objetosGenerados,
      subzonasGeneradas,
    });

    return {
      zona: zonaActualizada,
      plantilla,
      objetosGenerados,
      subzonasGeneradas,
    };
  }
}
