/**
 * @module domain/entities/espacio3d/AsientoEntity
 *
 * Entidades y lógica pura de dominio para cálculo de asientos 3D.
 * Clean Architecture: capa de dominio — sin dependencias de React, Three.js ni Supabase.
 *
 * Migrado desde: components/space3d/asientosRuntime.ts
 * Motivo: la lógica de asientos (perfiles, posicionamiento, detección) es negocio puro.
 */

import type { ObjetoEspacio3D } from './ObjetoEspacio3D';

// ─── Constantes de dominio ────────────────────────────────────────────────────

/** Tipo de animación de avatar que indica estado sentado */
export type EstadoAnimacionAvatar =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'sit_down'
  | 'stand_up'
  | string;

// ─── Value Objects ────────────────────────────────────────────────────────────

export interface Posicion2D {
  x: number;
  z: number;
}

export interface Posicion3D {
  x: number;
  y: number;
  z: number;
}

export interface PerfilAsiento3D {
  tipoPerfil: 'silla' | 'silla_gamer' | 'sofa' | 'banco' | 'generico';
  factorCaderaSentada: number;
  ajusteVertical: number;
  retrocesoMin: number;
  retrocesoMax: number;
  profundidadFactor: number;
  adelantoMaximo: number;
  correccionFrontal: number;
  aproximacionFrontal: number;
  fraccionAsientoDesdeBase: number;
}

// ─── Entidad Asiento ──────────────────────────────────────────────────────────

export interface AsientoRuntime3D {
  id: string;
  posicion: Posicion3D;
  rotacion: number;
  radioActivacion: number;
  radioCaptura: number;
  tipo: 'objeto_persistente';
  objetoId?: string | null;
  claveAsiento?: string;
  obstaculoId?: string | null;
  perfil: PerfilAsiento3D;
}

// ─── Perfiles predefinidos ────────────────────────────────────────────────────

const PERFILES_ASIENTO: Record<PerfilAsiento3D['tipoPerfil'], PerfilAsiento3D> = {
  silla: {
    tipoPerfil: 'silla',
    factorCaderaSentada: 0.56,
    ajusteVertical: 0,
    retrocesoMin: 0.08,
    retrocesoMax: 0.16,
    profundidadFactor: 0.15,
    adelantoMaximo: 0.05,
    correccionFrontal: 0.045,
    aproximacionFrontal: 0.08,
    fraccionAsientoDesdeBase: 0.45,
  },
  silla_gamer: {
    tipoPerfil: 'silla_gamer',
    factorCaderaSentada: 0.52,
    ajusteVertical: 0,
    retrocesoMin: 0.10,
    retrocesoMax: 0.18,
    profundidadFactor: 0.16,
    adelantoMaximo: 0.04,
    correccionFrontal: 0.05,
    aproximacionFrontal: 0.09,
    fraccionAsientoDesdeBase: 0.28,
  },
  sofa: {
    tipoPerfil: 'sofa',
    factorCaderaSentada: 0.54,
    ajusteVertical: 0,
    retrocesoMin: 0.12,
    retrocesoMax: 0.22,
    profundidadFactor: 0.18,
    adelantoMaximo: 0.04,
    correccionFrontal: 0.13,
    aproximacionFrontal: 0.14,
    fraccionAsientoDesdeBase: 0.40,
  },
  banco: {
    tipoPerfil: 'banco',
    factorCaderaSentada: 0.58,
    ajusteVertical: 0,
    retrocesoMin: 0.06,
    retrocesoMax: 0.12,
    profundidadFactor: 0.12,
    adelantoMaximo: 0.06,
    correccionFrontal: 0.02,
    aproximacionFrontal: 0.05,
    fraccionAsientoDesdeBase: 0.85,
  },
  generico: {
    tipoPerfil: 'generico',
    factorCaderaSentada: 0.56,
    ajusteVertical: 0,
    retrocesoMin: 0.08,
    retrocesoMax: 0.18,
    profundidadFactor: 0.16,
    adelantoMaximo: 0.05,
    correccionFrontal: 0.03,
    aproximacionFrontal: 0.07,
    fraccionAsientoDesdeBase: 0.45,
  },
};

// ─── Funciones de dominio puras ───────────────────────────────────────────────

/** Resuelve el perfil de asiento según el tipo del objeto (basado en keywords) */
export const resolverPerfilAsiento = (
  tipoObjeto: string,
  catalogoTipo: string,
  profundidad: number,
): PerfilAsiento3D => {
  const tipo = `${tipoObjeto} ${catalogoTipo}`.toLowerCase();
  if (tipo.includes('sofa') || tipo.includes('couch') || tipo.includes('sillon')) return PERFILES_ASIENTO.sofa;
  if (tipo.includes('banco') || tipo.includes('bench') || tipo.includes('taburete') || tipo.includes('stool')) return PERFILES_ASIENTO.banco;
  if (tipo.includes('gamer') || tipo.includes('gaming') || tipo.includes('racing')) return PERFILES_ASIENTO.silla_gamer;
  if (tipo.includes('silla') || tipo.includes('chair') || tipo.includes('seat')) return PERFILES_ASIENTO.silla;
  if (profundidad >= 0.85) return PERFILES_ASIENTO.sofa;
  return PERFILES_ASIENTO.generico;
};

/** Indica si la animación corresponde a un estado sentado */
export const esAnimacionAsiento = (animacion?: EstadoAnimacionAvatar | null): boolean => {
  return animacion === 'sit' || animacion === 'sit_down' || animacion === 'stand_up';
};

/** Busca el asiento más cercano dentro del radio de activación */
export const buscarAsientoCercano = (
  posicionUsuario: Posicion2D,
  asientos: AsientoRuntime3D[],
): AsientoRuntime3D | null => {
  let asientoCercano: AsientoRuntime3D | null = null;
  let distanciaMinima = Number.POSITIVE_INFINITY;

  for (const asiento of asientos) {
    const dx = posicionUsuario.x - asiento.posicion.x;
    const dz = posicionUsuario.z - asiento.posicion.z;
    const distancia = Math.sqrt(dx * dx + dz * dz);
    if (distancia <= asiento.radioActivacion && distancia < distanciaMinima) {
      distanciaMinima = distancia;
      asientoCercano = asiento;
    }
  }
  return asientoCercano;
};

/** Resuelve qué asiento ocupa el usuario según posición y animación */
export const resolverAsientoUsuario = (
  posicionUsuario: Posicion2D,
  animacion?: EstadoAnimacionAvatar | null,
  asientos: AsientoRuntime3D[] = [],
): AsientoRuntime3D | null => {
  if (animacion && !esAnimacionAsiento(animacion)) return null;
  return buscarAsientoCercano(posicionUsuario, asientos);
};

/**
 * Crea los asientos runtime desde objetos del espacio.
 * Requiere las funciones de cálculo de dimensiones del ObjetoRuntimeEntity.
 */
export interface DimensionesObjeto {
  ancho: number;
  alto: number;
  profundidad: number;
}

export interface EscalaObjeto {
  x: number;
  y: number;
  z: number;
}

export interface ConstantesAsiento {
  chairSitRadius: number;
  radioColisionAvatar: number;
}

/** Construye un AsientoRuntime3D a partir de un ObjetoEspacio3D y datos calculados */
export const construirAsientoRuntime = (
  objeto: ObjetoEspacio3D,
  dimensiones: DimensionesObjeto,
  escala: EscalaObjeto,
  radioInteraccion: number,
  offsetRotado: { x: number; z: number },
  constantes: ConstantesAsiento,
): AsientoRuntime3D => {
  const perfil = resolverPerfilAsiento(
    String(objeto.tipo || ''),
    String((objeto as unknown as Record<string, unknown>).catalogo_tipo || ''),
    dimensiones.profundidad,
  );
  const escalaHorizontal = (escala.x + escala.z) / 2;
  const radioActivacion = radioInteraccion;
  const profundidadAcceso = Math.max(0.18, dimensiones.profundidad / 2);
  const radioCapturaBase = profundidadAcceso + constantes.radioColisionAvatar + 0.18;
  const radioCapturaMax = Math.max(1.15, Math.max(dimensiones.ancho, dimensiones.profundidad) * 0.45);
  const radioCaptura = Math.min(
    radioActivacion,
    Math.max(0.72, Math.min(radioCapturaMax, radioCapturaBase)),
  );
  const retrocesoPelvis = Math.min(
    perfil.retrocesoMax * escalaHorizontal,
    Math.max(perfil.retrocesoMin * escalaHorizontal, dimensiones.profundidad * perfil.profundidadFactor),
  );
  const sitOffsetYRaw = Number.isFinite(Number(objeto.sit_offset_y)) ? Number(objeto.sit_offset_y) : 0;
  const baseVisual = objeto.posicion_y - dimensiones.alto / 2;
  const seatY = sitOffsetYRaw !== 0
    ? objeto.posicion_y + sitOffsetYRaw * escala.y
    : baseVisual + dimensiones.alto * perfil.fraccionAsientoDesdeBase;
  const sitRotationY = Number.isFinite(Number(objeto.sit_rotation_y)) ? Number(objeto.sit_rotation_y) : 0;

  return {
    id: `asiento_objeto_${objeto.id}`,
    posicion: {
      x: objeto.posicion_x + offsetRotado.x,
      y: seatY,
      z: objeto.posicion_z + offsetRotado.z,
    },
    rotacion: (objeto.rotacion_y || 0) + sitRotationY,
    radioActivacion,
    radioCaptura,
    tipo: 'objeto_persistente',
    objetoId: objeto.id,
    claveAsiento: 'principal',
    obstaculoId: `obstaculo_objeto_${objeto.id}`,
    perfil,
  };
};

// Re-export alias para compatibilidad con código existente
export type { AsientoRuntime3D as Asiento3D };
export type { Posicion2D as Posicion3DPlano };
