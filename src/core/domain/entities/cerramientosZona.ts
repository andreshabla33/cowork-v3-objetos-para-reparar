import { normalizarEstiloVisualArquitectonico, type EstiloVisualArquitectonico } from './estilosVisualesArquitectonicos';
import { resolverPerfilEsteticoParedPorSuelo } from './esteticaParedesPorSuelo';
import type { TipoMaterialArquitectonico } from './objetosArquitectonicos';

export type LadoCerramientoZona = 'norte' | 'sur' | 'este' | 'oeste';
export type TipoSubsueloZona = 'organizacional' | 'decorativo';

export interface ConfiguracionCerramientoZona {
  habilitado: boolean;
  geometria_tramo: string;
  geometria_acceso: string;
  color_base: string;
  altura: number;
  grosor: number;
  opacidad: number;
  estilo_visual: EstiloVisualArquitectonico;
  tipo_material: TipoMaterialArquitectonico;
  escala_textura: number;
  rugosidad: number;
  metalicidad: number;
  lado_acceso: LadoCerramientoZona;
  lados: Record<LadoCerramientoZona, boolean>;
}

export interface ConfiguracionPlantillaZonaAplicada {
  id: string;
  version: number;
  editable_por_miembro: boolean;
  permite_agregar_objetos: boolean;
  permite_mover_objetos: boolean;
  aplicada_en?: string | null;
  tipo_suelo_original?: string | null;
  centro_x?: number | null;
  centro_z?: number | null;
  objetos_generados?: string[] | null;
  subzonas_generadas?: string[] | null;
}

export interface ConfiguracionSubzonaPlantillaZona {
  zona_padre_id: string;
  plantilla_id: string;
  clave_subzona: string;
}

export interface ConfiguracionZonaEmpresa {
  cerramiento?: Partial<ConfiguracionCerramientoZona> | null;
  tipo_subsuelo?: TipoSubsueloZona | null;
  plantilla_zona?: ConfiguracionPlantillaZonaAplicada | null;
  plantilla_zona_hija?: ConfiguracionSubzonaPlantillaZona | null;
}

const LADOS_CERRAMIENTO: LadoCerramientoZona[] = ['norte', 'sur', 'este', 'oeste'];

const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

const normalizarLado = (valor: unknown, fallback: LadoCerramientoZona = 'sur'): LadoCerramientoZona => {
  if (valor === 'norte' || valor === 'sur' || valor === 'este' || valor === 'oeste') return valor;
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'norte' || normalizado === 'sur' || normalizado === 'este' || normalizado === 'oeste') return normalizado;
  }
  return fallback;
};

const normalizarColor = (valor: unknown, fallback: string) => {
  if (typeof valor !== 'string' || !valor.trim()) return fallback;
  return valor.startsWith('#') ? valor : `#${valor}`;
};

export const normalizarTipoSubsueloZona = (
  valor: unknown,
  fallback: TipoSubsueloZona = 'organizacional',
): TipoSubsueloZona => {
  if (valor === 'organizacional' || valor === 'decorativo') return valor;
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'organizacional' || normalizado === 'decorativo') return normalizado;
  }
  return fallback;
};

export const normalizarConfiguracionZonaEmpresa = (valor: unknown): ConfiguracionZonaEmpresa => {
  if (!valor || typeof valor !== 'object') return {};
  const configuracion = valor as ConfiguracionZonaEmpresa;
  return {
    ...configuracion,
    tipo_subsuelo: normalizarTipoSubsueloZona(configuracion.tipo_subsuelo, 'organizacional'),
  };
};

export const resolverTipoSubsueloZona = (
  valor: unknown,
  fallback: TipoSubsueloZona = 'organizacional',
): TipoSubsueloZona => {
  const configuracion = normalizarConfiguracionZonaEmpresa(valor);
  return normalizarTipoSubsueloZona(configuracion.tipo_subsuelo, fallback);
};

const normalizarTipoMaterialArquitectonico = (
  valor: unknown,
  fallback: TipoMaterialArquitectonico,
): TipoMaterialArquitectonico => {
  if (valor === 'ladrillo' || valor === 'madera' || valor === 'yeso' || valor === 'concreto' || valor === 'vidrio' || valor === 'metal') {
    return valor;
  }
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'ladrillo' || normalizado === 'madera' || normalizado === 'yeso' || normalizado === 'concreto' || normalizado === 'vidrio' || normalizado === 'metal') {
      return normalizado;
    }
  }
  return fallback;
};

export const resolverConfiguracionCerramientoZona = (
  valor: unknown,
  tipoSuelo?: string | null,
): ConfiguracionCerramientoZona | null => {
  const configuracion = normalizarConfiguracionZonaEmpresa(valor);
  const cerramientoCrudo = configuracion.cerramiento;

  if (!cerramientoCrudo || typeof cerramientoCrudo !== 'object') return null;
  if (cerramientoCrudo.habilitado === false) return null;

  const perfilSuelo = resolverPerfilEsteticoParedPorSuelo(tipoSuelo);

  const lados = LADOS_CERRAMIENTO.reduce<Record<LadoCerramientoZona, boolean>>((acc, lado) => {
    const valorLado = cerramientoCrudo.lados && typeof cerramientoCrudo.lados === 'object'
      ? (cerramientoCrudo.lados as Record<string, unknown>)[lado]
      : true;
    acc[lado] = valorLado !== false;
    return acc;
  }, {
    norte: true,
    sur: true,
    este: true,
    oeste: true,
  });

  return {
    habilitado: true,
    geometria_tramo: typeof cerramientoCrudo.geometria_tramo === 'string' && cerramientoCrudo.geometria_tramo.trim()
      ? cerramientoCrudo.geometria_tramo.trim()
      : 'wall-window-double',
    geometria_acceso: typeof cerramientoCrudo.geometria_acceso === 'string' && cerramientoCrudo.geometria_acceso.trim()
      ? cerramientoCrudo.geometria_acceso.trim()
      : 'wall-door-double',
    color_base: normalizarColor(cerramientoCrudo.color_base, perfilSuelo.color_base),
    altura: clamp(Number(cerramientoCrudo.altura) || 3, 2, 5),
    grosor: clamp(Number(cerramientoCrudo.grosor) || 0.15, 0.08, 0.4),
    opacidad: clamp(Number(cerramientoCrudo.opacidad) || 1, 0.1, 1),
    estilo_visual: normalizarEstiloVisualArquitectonico(cerramientoCrudo.estilo_visual, perfilSuelo.estilo_visual),
    tipo_material: normalizarTipoMaterialArquitectonico(cerramientoCrudo.tipo_material, perfilSuelo.tipo_material),
    escala_textura: clamp(Number(cerramientoCrudo.escala_textura) || perfilSuelo.escala_textura, 0.35, 4),
    rugosidad: clamp(Number(cerramientoCrudo.rugosidad) || perfilSuelo.rugosidad, 0, 1),
    metalicidad: clamp(Number(cerramientoCrudo.metalicidad) || perfilSuelo.metalicidad, 0, 1),
    lado_acceso: normalizarLado(cerramientoCrudo.lado_acceso, 'sur'),
    lados,
  };
};
