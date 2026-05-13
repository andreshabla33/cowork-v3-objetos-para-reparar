/**
 * @module application/usecases/RegistrarEmpresaConGridDesksUseCase
 *
 * Reemplazo Gather-style del legacy `RegistrarEmpresaConPlantillaUseCase`.
 * En el onboarding del admin se pide la cantidad de miembros (1..100) y se
 * generan automáticamente N DeskAreas en grilla cuadrada, cada una con su
 * preset (silla + mesa + monitor) ya colocados.
 *
 * NO inyecta muebles "plantilla" estilo cubículos (legacy eliminado). Solo
 * crea la zona-empresa con dimensiones suficientes para contener la grilla
 * + un margen alrededor, y delega la creación de desks al
 * `GenerarOficinaTemplateUseCase`.
 *
 * Clean Architecture: recibe los 2 ports (`IRegistroEmpresaRepositorio` +
 * `IAreaEscritorioRepository`). Sin dependencias de plantillas legacy.
 */

import type { ZonaEmpresa } from '@/types';
import { FloorType } from '../../domain/entities';
import {
  PRESET_DESK_STANDARD,
  type PresetDesk,
} from '../../domain/entities/espacio3d/PresetDesk';
import {
  calcularBboxTotalGrid,
  normalizarCantidadMiembros,
  SEPARACION_DESKS_DEFAULT,
} from '../../domain/entities/espacio3d/OficinaTemplatePolicy';
import { GenerarOficinaTemplateUseCase } from './GenerarOficinaTemplateUseCase';
import type { IAreaEscritorioRepository } from '../../domain/ports/IAreaEscritorioRepository';

/**
 * Port para registrar empresa + miembro + zona-empresa en Supabase. Vive
 * aquí (Application) porque ningún otro use case lo consume — si crece,
 * mover a `core/domain/ports/`.
 */
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
    zonaParams: {
      anchoMetros: number;
      altoMetros: number;
      color: string;
      tipoSuelo: FloorType;
    };
  }): Promise<ZonaEmpresa>;
}

/** Margen extra alrededor de la grilla (m) para que el avatar pueda caminar
 *  entre los desks y los bordes de la zona-empresa. */
const MARGEN_ZONA_M = 4;

/** Color default de la zona-empresa (puede ser custom por owner luego). */
const COLOR_ZONA_DEFAULT = '#2563eb';

export interface RegistrarEmpresaConGridDesksInput {
  empresaId?: string | null;
  userId: string;
  espacioId: string;
  nombre: string;
  industria?: string | null;
  tamano?: string | null;
  sitioWeb?: string | null;
  cargoId?: string | null;
  /** Cantidad de miembros (1..100). El Domain clampa al rango. */
  cantidadMiembros: number;
  /** Preset a usar para los desks. Default `PRESET_DESK_STANDARD`. */
  preset?: PresetDesk;
}

export interface RegistrarEmpresaConGridDesksResult {
  empresaId: string;
  miembroId: string;
  zona: ZonaEmpresa;
  desksCreados: number;
  errores: Array<{ indice: number; motivo: string }>;
}

export class RegistrarEmpresaConGridDesksUseCase {
  constructor(
    private readonly registroEmpresaRepositorio: IRegistroEmpresaRepositorio,
    private readonly areaEscritorioRepositorio: IAreaEscritorioRepository,
  ) {}

  async execute(input: RegistrarEmpresaConGridDesksInput): Promise<RegistrarEmpresaConGridDesksResult> {
    const nombreEmpresa = input.nombre.trim();
    if (!nombreEmpresa) throw new Error('El nombre de la empresa es obligatorio.');

    const cargoId = input.cargoId?.trim();
    if (!cargoId) throw new Error('Debes seleccionar tu cargo antes de configurar la oficina.');

    const cantidad = normalizarCantidadMiembros(input.cantidadMiembros);
    const preset = input.preset ?? PRESET_DESK_STANDARD;

    // 1. Calcular dimensiones de la zona-empresa: bbox total del grid + margen.
    const bboxGrid = calcularBboxTotalGrid({
      cantidad,
      preset,
      separacion: SEPARACION_DESKS_DEFAULT,
    });
    const zonaParams = {
      anchoMetros: bboxGrid.ancho + MARGEN_ZONA_M * 2,
      altoMetros: bboxGrid.alto + MARGEN_ZONA_M * 2,
      color: COLOR_ZONA_DEFAULT,
      tipoSuelo: FloorType.CONCRETE_SMOOTH,
    };

    // 2. Crear empresa + miembro + zona (igual que el flow legacy, sin plantilla).
    const empresa = await this.registroEmpresaRepositorio.guardarEmpresa({
      empresaId: input.empresaId,
      userId: input.userId,
      espacioId: input.espacioId,
      nombre: nombreEmpresa,
      industria: input.industria,
      tamano: input.tamano,
      sitioWeb: input.sitioWeb,
      plantillaId: 'grid-desks', // marker para auditoría (no se usa en cubículos)
    });

    const miembro = await this.registroEmpresaRepositorio.asegurarMiembro({
      espacioId: input.espacioId,
      userId: input.userId,
      empresaId: empresa.id,
      cargoId,
    });

    const zona = await this.registroEmpresaRepositorio.asegurarZonaEmpresa({
      espacioId: input.espacioId,
      empresaId: empresa.id,
      nombreEmpresa,
      usuarioId: input.userId,
      zonaParams,
    });

    // 3. Generar grilla de desks dentro de la zona-empresa.
    //    Coords de la zona vienen en escala DB (×16); convertimos a world m.
    const centroZonaXm = Number(zona.posicion_x) / 16;
    const centroZonaZm = Number(zona.posicion_y) / 16;

    const generarOficinaUC = new GenerarOficinaTemplateUseCase(this.areaEscritorioRepositorio);
    const resultadoGrid = await generarOficinaUC.execute({
      espacioId: input.espacioId,
      preset,
      cantidadMiembros: cantidad,
      centro: { x: centroZonaXm, z: centroZonaZm },
      separacion: SEPARACION_DESKS_DEFAULT,
      audioAisladoDefault: true,
      prefijoNombre: 'Desk',
    });

    return {
      empresaId: empresa.id,
      miembroId: miembro.id,
      zona,
      desksCreados: resultadoGrid.desks.length,
      errores: resultadoGrid.errores.map((e) => ({ indice: e.indice, motivo: e.motivo })),
    };
  }
}
