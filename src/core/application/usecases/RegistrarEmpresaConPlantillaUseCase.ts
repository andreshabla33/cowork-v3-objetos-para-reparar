import type { ZonaEmpresa } from '@/types';
import { obtenerPlantillaEspacio, type PlantillaEspacio, type PlantillaEspacioId } from '../../domain/entities/plantillasEspacio';

export interface IRegistroEmpresaRepositorio {
  guardarEmpresa(params: {
    empresaId?: string | null;
    userId: string;
    espacioId: string;
    nombre: string;
    industria?: string | null;
    tamano?: string | null;
    sitioWeb?: string | null;
    plantillaId: string;
  }): Promise<{ id: string; nombre: string; espacio_id: string }>;
  asegurarMiembro(params: {
    espacioId: string;
    userId: string;
    empresaId: string;
    cargoId?: string | null;
  }): Promise<{ id: string }>;
  asegurarZonaEmpresa(params: {
    espacioId: string;
    empresaId: string;
    nombreEmpresa: string;
    usuarioId: string;
    plantilla: PlantillaEspacio;
  }): Promise<ZonaEmpresa>;
}

export interface IInyectorPlantillaEspacio {
  sincronizarPlantilla(params: {
    espacioId: string;
    empresaId: string;
    userId: string;
    zona: ZonaEmpresa;
    plantilla: PlantillaEspacio;
  }): Promise<void>;
}

export class RegistrarEmpresaConPlantillaUseCase {
  constructor(
    private readonly registroEmpresaRepositorio: IRegistroEmpresaRepositorio,
    private readonly inyectorPlantillaEspacio: IInyectorPlantillaEspacio,
  ) {}

  async execute(params: {
    empresaId?: string | null;
    userId: string;
    espacioId: string;
    nombre: string;
    industria?: string | null;
    tamano?: string | null;
    sitioWeb?: string | null;
    cargoId?: string | null;
    plantillaId: PlantillaEspacioId;
  }): Promise<{ empresaId: string; miembroId: string; zona: ZonaEmpresa; plantilla: PlantillaEspacio }> {
    const nombreEmpresa = params.nombre.trim();
    if (!nombreEmpresa) {
      throw new Error('El nombre de la empresa es obligatorio.');
    }

    const cargoId = params.cargoId?.trim();
    if (!cargoId) {
      throw new Error('Debes seleccionar tu cargo antes de configurar la oficina.');
    }

    const plantilla = obtenerPlantillaEspacio(params.plantillaId);
    if (!plantilla) {
      throw new Error('La plantilla seleccionada no es válida.');
    }

    const empresa = await this.registroEmpresaRepositorio.guardarEmpresa({
      empresaId: params.empresaId,
      userId: params.userId,
      espacioId: params.espacioId,
      nombre: nombreEmpresa,
      industria: params.industria,
      tamano: params.tamano,
      sitioWeb: params.sitioWeb,
      plantillaId: plantilla.id,
    });

    const miembro = await this.registroEmpresaRepositorio.asegurarMiembro({
      espacioId: params.espacioId,
      userId: params.userId,
      empresaId: empresa.id,
      cargoId,
    });

    const zona = await this.registroEmpresaRepositorio.asegurarZonaEmpresa({
      espacioId: params.espacioId,
      empresaId: empresa.id,
      nombreEmpresa,
      usuarioId: params.userId,
      plantilla,
    });

    await this.inyectorPlantillaEspacio.sincronizarPlantilla({
      espacioId: params.espacioId,
      empresaId: empresa.id,
      userId: params.userId,
      zona,
      plantilla,
    });

    return {
      empresaId: empresa.id,
      miembroId: miembro.id,
      zona,
      plantilla,
    };
  }
}
