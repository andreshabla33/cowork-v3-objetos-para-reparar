/**
 * @module application/usecases/DetectarColisionesUseCase
 *
 * Caso de uso: Construye los obstáculos de colisión y evalúa la transitabilidad
 * de posiciones en el espacio 3D.
 *
 * Clean Architecture:
 *  - Orquesta ColisionEntity y ObjetoRuntimeEntity del dominio.
 *  - NO importa React, Three.js, Rapier ni Supabase.
 *  - Testeable de forma aislada.
 */

import type { ObjetoEspacio3D } from '../../../core/domain/entities/espacio3d/ObjetoEspacio3D';
import type { ObstaculoColision3D } from '../../../core/domain/entities/espacio3d/ColisionEntity';
import type { Posicion2D } from '../../../core/domain/entities/espacio3d/AsientoEntity';
import {
  colisionaJugadorConObstaculo,
  esPosicionTransitable,
  construirObstaculoBase,
  construirObstaculoSegmentado,
} from '../../../core/domain/entities/espacio3d/ColisionEntity';
import {
  obtenerDimensionesObjeto,
  esObjetoReclamable,
  normalizarNumero3D,
} from '../../../core/domain/entities/espacio3d/ObjetoRuntimeEntity';
import {
  normalizarConfiguracionGeometricaObjeto,
} from '../../domain/entities/objetosArquitectonicos';

// ─── Parámetros ───────────────────────────────────────────────────────────────

export interface DetectarColisionesParams {
  objetos: ObjetoEspacio3D[];
}

export interface EvaluarTransitabilidadParams {
  posicion: Posicion2D;
  obstaculos: ObstaculoColision3D[];
  radioJugador: number;
  idsIgnorados?: string[];
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

const normalizarGeometriaLegacy = (valor?: string | null): string =>
  (valor || '').trim().toLowerCase();

const normalizarRotacion = (rotacion?: number | null): number =>
  Number.isFinite(rotacion) ? (rotacion as number) : 0;

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

// ─── Use Case ─────────────────────────────────────────────────────────────────

/**
 * Construye los obstáculos de colisión para un objeto persistente.
 * Maneja paredes con aberturas (puertas) segmentando la colisión.
 */
export const construirObstaculosDeObjeto = (
  objeto: ObjetoEspacio3D,
): ObstaculoColision3D[] => {
  const perfil = obtenerDimensionesObjeto(objeto);
  const esReclamable = esObjetoReclamable(objeto);
  const esSentable = !!objeto.es_sentable;
  const geometriaLegacy = normalizarGeometriaLegacy(objeto.built_in_geometry);
  const esPared = geometriaLegacy.startsWith('wall') || geometriaLegacy === 'pared' || geometriaLegacy === 'muro';

  const rotacion = normalizarRotacion(objeto.rotacion_y);
  const rotacionAsiento = normalizarRotacion(
    (objeto.rotacion_y || 0) + normalizarNumero3D(objeto.sit_rotation_y, 0),
  );

  const avanceX = Math.sin(rotacionAsiento);
  const avanceZ = Math.cos(rotacionAsiento);
  const retrocesoAsiento = esSentable ? Math.max(perfil.profundidad * 0.18, 0.08) : 0;
  const semiextX = esSentable
    ? Math.max((perfil.ancho / 2) * 0.78, 0.16)
    : esPared ? Math.max((perfil.ancho / 2) * 0.98, 0.08) : perfil.ancho / 2;
  const semiextZ = esSentable
    ? Math.max((perfil.profundidad / 2) * 0.52, 0.12)
    : esPared ? Math.max((perfil.profundidad / 2) * 0.68, 0.035) : perfil.profundidad / 2;

  const obstaculoBase = construirObstaculoBase({
    id: `obstaculo_objeto_${objeto.id}`,
    tipo: esReclamable ? 'escritorio' : 'objeto_persistente',
    posicion: {
      x: objeto.posicion_x - avanceX * retrocesoAsiento,
      y: objeto.posicion_y,
      z: objeto.posicion_z - avanceZ * retrocesoAsiento,
    },
    semiextensiones: { x: semiextX, y: perfil.alto / 2, z: semiextZ },
    rotacion,
    padding: esReclamable ? 0.1 : esSentable ? 0.015 : esPared ? 0.004 : 0.05,
  });

  // Paredes con aberturas: segmentar colisión para dejar hueco de puerta
  const configuracion = normalizarConfiguracionGeometricaObjeto({
    tipo: objeto.tipo,
    built_in_geometry: objeto.built_in_geometry,
    built_in_color: objeto.built_in_color,
    ancho: perfil.ancho,
    alto: perfil.alto,
    profundidad: perfil.profundidad,
    configuracion_geometria: objeto.configuracion_geometria,
  });

  if (!configuracion || configuracion.tipo_geometria !== 'pared') return [obstaculoBase];

  const margen = 0.08;
  const aberturasPuerta = (configuracion.aberturas || [])
    .filter((a) => a.tipo === 'puerta')
    .filter((a) => (
      a.insertar_cerramiento === false ||
      a.forma === 'arco' ||
      ((geometriaLegacy === 'wall-door' || geometriaLegacy === 'wall-door-double') && a.tipo === 'puerta')
    ))
    .map((a) => {
      const aw = clamp(a.ancho, 0.2, Math.max(0.2, perfil.ancho - margen * 2));
      const ah = clamp(a.alto, 0.2, Math.max(0.2, perfil.alto - margen * 2));
      const izq = clamp(a.posicion_x - aw / 2, -perfil.ancho / 2 + margen, perfil.ancho / 2 - margen - aw);
      const inf = clamp(a.posicion_y - ah / 2, -perfil.alto / 2 + margen, perfil.alto / 2 - margen - ah);
      return { ...a, ancho: aw, alto: ah, izquierda: izq, derecha: izq + aw, inferior: inf, superior: inf + ah };
    });

  if (aberturasPuerta.length !== 1) return [obstaculoBase];

  const abertura = aberturasPuerta[0];
  const paddingSegmento = Math.min(obstaculoBase.padding, 0.006);
  const segmentos: ObstaculoColision3D[] = [];

  const anchoIzq = Math.max(0, abertura.izquierda - (-perfil.ancho / 2));
  if (anchoIzq > 0.02) {
    segmentos.push(construirObstaculoSegmentado({
      id: `${obstaculoBase.id}_izquierda`,
      posicionBase: { x: objeto.posicion_x, y: objeto.posicion_y, z: objeto.posicion_z },
      rotacion,
      centroLocalX: (-perfil.ancho / 2) + (anchoIzq / 2),
      centroLocalY: 0,
      ancho: anchoIzq,
      alto: perfil.alto,
      profundidad: perfil.profundidad,
      padding: paddingSegmento,
    }));
  }

  const anchoDer = Math.max(0, (perfil.ancho / 2) - abertura.derecha);
  if (anchoDer > 0.02) {
    segmentos.push(construirObstaculoSegmentado({
      id: `${obstaculoBase.id}_derecha`,
      posicionBase: { x: objeto.posicion_x, y: objeto.posicion_y, z: objeto.posicion_z },
      rotacion,
      centroLocalX: abertura.derecha + (anchoDer / 2),
      centroLocalY: 0,
      ancho: anchoDer,
      alto: perfil.alto,
      profundidad: perfil.profundidad,
      padding: paddingSegmento,
    }));
  }

  const altoSup = Math.max(0, (perfil.alto / 2) - abertura.superior);
  if (altoSup > 0.02) {
    segmentos.push(construirObstaculoSegmentado({
      id: `${obstaculoBase.id}_superior`,
      posicionBase: { x: objeto.posicion_x, y: objeto.posicion_y, z: objeto.posicion_z },
      rotacion,
      centroLocalX: (abertura.izquierda + abertura.derecha) / 2,
      centroLocalY: abertura.superior + (altoSup / 2),
      ancho: abertura.ancho,
      alto: altoSup,
      profundidad: perfil.profundidad,
      padding: paddingSegmento,
    }));
  }

  return segmentos.length > 0 ? segmentos : [obstaculoBase];
};

/**
 * Construye todos los obstáculos de colisión para una lista de objetos.
 */
export const construirTodosLosObstaculos = (
  objetos: ObjetoEspacio3D[],
): ObstaculoColision3D[] =>
  objetos.flatMap((o) => construirObstaculosDeObjeto(o));

/**
 * Evalúa si una posición es transitable (sin colisiones).
 */
export const evaluarTransitabilidad = (
  params: EvaluarTransitabilidadParams,
): boolean =>
  esPosicionTransitable(
    params.posicion,
    params.obstaculos,
    params.radioJugador,
    params.idsIgnorados ?? [],
  );

// Re-exports de utilidades de colisión desde dominio
export { colisionaJugadorConObstaculo };
