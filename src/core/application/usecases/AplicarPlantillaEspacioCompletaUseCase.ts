import type { ZonaEmpresa } from '@/types';
import { 
  PLANTILLAS_ESPACIO_COMPLETAS, 
  obtenerPlantillaZona, 
} from '../../domain/entities/plantillasEspacio';
import { AplicarPlantillaZonaUseCase } from './AplicarPlantillaZonaUseCase';

export interface IRepositorioPlantillaEspacioCompleta {
  limpiarEspacio(espacioId: string, empresaId: string): Promise<void>;
  crearZonaBase(params: {
    espacioId: string;
    empresaId: string;
    nombre: string;
    ancho: number;
    alto: number;
    posicion_x: number;
    posicion_y: number;
    color: string;
    plantillaId: string;
    tipo_suelo: string;
  }): Promise<ZonaEmpresa>;
  eliminarZona(zonaId: string): Promise<void>;
  notificarRecargaEspacio(espacioId: string): Promise<void>;
}

export interface ResultadoPlantillaCompleta {
  exito: boolean;
  zonasGeneradas: number;
  zonasTotal: number;
  errores: { zona: string; error: string }[];
}

export type ProgresoCallback = (progreso: { paso: number; total: number; zona: string }) => void;

export class AplicarPlantillaEspacioCompletaUseCase {
  constructor(
    private readonly repositorio: IRepositorioPlantillaEspacioCompleta,
    private readonly aplicarZonaUseCase: AplicarPlantillaZonaUseCase
  ) {}

  async execute(params: {
    espacioId: string;
    empresaId: string;
    userId: string;
    plantillaCompletaId: string;
    onProgreso?: ProgresoCallback;
  }): Promise<ResultadoPlantillaCompleta> {
    if (!params.userId.trim() || !params.espacioId.trim() || !params.empresaId.trim()) {
      throw new Error('Faltan parámetros requeridos.');
    }

    const plantillaCompleta = PLANTILLAS_ESPACIO_COMPLETAS.find(p => p.id === params.plantillaCompletaId);
    if (!plantillaCompleta) {
      throw new Error('La plantilla de espacio completo seleccionada no es válida.');
    }

    // 1. Limpiar el espacio actual (zonas y objetos)
    await this.repositorio.limpiarEspacio(params.espacioId, params.empresaId);

    let zonasGeneradas = 0;
    const errores: { zona: string; error: string }[] = [];
    const zonasCreadas: string[] = []; // Track for rollback

    // 2. Iterar sobre cada zona en la plantilla completa
    for (let i = 0; i < plantillaCompleta.zonas.length; i++) {
      const zonaConfig = plantillaCompleta.zonas[i];
      const plantillaZona = obtenerPlantillaZona(zonaConfig.plantillaId);
      if (!plantillaZona) {
        errores.push({ zona: zonaConfig.plantillaId, error: 'Plantilla de zona no encontrada' });
        continue;
      }

      params.onProgreso?.({
        paso: i + 1,
        total: plantillaCompleta.zonas.length,
        zona: plantillaZona.nombre,
      });

      try {
        // Crear registro de la zona base en BD
        const nuevaZona = await this.repositorio.crearZonaBase({
          espacioId: params.espacioId,
          empresaId: params.empresaId,
          nombre: plantillaZona.nombre,
          ancho: plantillaZona.ancho_minimo_metros * 16,
          alto: plantillaZona.alto_minimo_metros * 16,
          posicion_x: zonaConfig.x * 16,
          posicion_y: zonaConfig.z * 16,
          color: plantillaZona.color_primario,
          plantillaId: plantillaZona.id,
          tipo_suelo: plantillaZona.tipo_suelo,
        });

        zonasCreadas.push(nuevaZona.id);

        // 3. Aplicar la plantilla específica usando el UseCase existente
        await this.aplicarZonaUseCase.execute({
          zonaId: nuevaZona.id,
          espacioId: params.espacioId,
          userId: params.userId,
          plantillaId: zonaConfig.plantillaId,
          centroXMetros: zonaConfig.x,
          centroZMetros: zonaConfig.z,
        });
        zonasGeneradas++;
      } catch (error: any) {
        const msg = error?.message || String(error);
        console.error(`Error al generar zona ${plantillaZona.nombre}:`, error);
        errores.push({ zona: plantillaZona.nombre, error: msg });
      }
    }

    // 4. Rollback if ALL zones failed (partial success is still useful)
    if (zonasGeneradas === 0 && plantillaCompleta.zonas.length > 0) {
      console.warn('[PlantillaCompleta] All zones failed, rolling back created zones...');
      for (const zonaId of zonasCreadas) {
        try { await this.repositorio.eliminarZona(zonaId); } catch { /* best-effort */ }
      }
      return {
        exito: false,
        zonasGeneradas: 0,
        zonasTotal: plantillaCompleta.zonas.length,
        errores,
      };
    }

    // 5. Notificar a los clientes para que recarguen
    await this.repositorio.notificarRecargaEspacio(params.espacioId);

    return {
      exito: true,
      zonasGeneradas,
      zonasTotal: plantillaCompleta.zonas.length,
      errores,
    };
  }
} 
