/**
 * @module domain/entities/espacio3d/TerrenoEntity
 *
 * Entidad pura de dominio para el terreno (suelo + montañas + ríos) de un
 * espacio 3D. Sin React, Three.js, Rapier ni Supabase.
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md
 */

export type TipoTerreno = 'flat' | 'heightfield';

export interface EscalaTerreno {
  x: number;
  y: number;
  z: number;
}

export interface ZonaAgua {
  id: string;
  x: number;
  z: number;
  ancho: number;
  profundo: number;
  nivel: number;
  color: string;
}

export interface TerrenoEntity {
  id: string;
  espacioId: string;
  tipo: TipoTerreno;
  heightmapUrl: string | null;
  nrows: number | null;
  ncols: number | null;
  escala: EscalaTerreno;
  zonasAgua: ZonaAgua[];
  configuracion: Record<string, unknown>;
}

export const TERRENO_NROWS_MIN = 16;
export const TERRENO_NROWS_MAX = 256;
export const TERRENO_NCOLS_MIN = 16;
export const TERRENO_NCOLS_MAX = 256;

export const TERRENO_FLAT_DEFAULT: Omit<TerrenoEntity, 'id' | 'espacioId'> = {
  tipo: 'flat',
  heightmapUrl: null,
  nrows: null,
  ncols: null,
  escala: { x: 100, y: 10, z: 100 },
  zonasAgua: [],
  configuracion: {},
};

/**
 * Valida la consistencia interna de una entidad de terreno.
 * Retorna lista de errores (vacía = válido).
 */
export function validarTerreno(terreno: Omit<TerrenoEntity, 'id' | 'espacioId'>): string[] {
  const errores: string[] = [];

  if (terreno.tipo === 'heightfield') {
    if (!terreno.heightmapUrl) {
      errores.push('heightmap_url es obligatorio cuando tipo=heightfield');
    }
    if (terreno.nrows === null || terreno.ncols === null) {
      errores.push('nrows y ncols son obligatorios cuando tipo=heightfield');
    } else {
      if (terreno.nrows < TERRENO_NROWS_MIN || terreno.nrows > TERRENO_NROWS_MAX) {
        errores.push(`nrows fuera de rango [${TERRENO_NROWS_MIN}, ${TERRENO_NROWS_MAX}]`);
      }
      if (terreno.ncols < TERRENO_NCOLS_MIN || terreno.ncols > TERRENO_NCOLS_MAX) {
        errores.push(`ncols fuera de rango [${TERRENO_NCOLS_MIN}, ${TERRENO_NCOLS_MAX}]`);
      }
    }
  }

  if (terreno.escala.x <= 0 || terreno.escala.y <= 0 || terreno.escala.z <= 0) {
    errores.push('escala XYZ debe ser positiva');
  }

  for (const zona of terreno.zonasAgua) {
    if (zona.ancho <= 0 || zona.profundo <= 0) {
      errores.push(`zona_agua ${zona.id}: ancho/profundo deben ser positivos`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(zona.color)) {
      errores.push(`zona_agua ${zona.id}: color debe ser hex #RRGGBB`);
    }
  }

  return errores;
}
