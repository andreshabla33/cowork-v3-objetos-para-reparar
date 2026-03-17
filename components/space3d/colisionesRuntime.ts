import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { AsientoRuntime3D, Posicion3DPlano } from './asientosRuntime';
import {
  normalizarConfiguracionGeometricaObjeto,
  type AberturaArquitectonica,
} from '@/src/core/domain/entities/objetosArquitectonicos';
import { esObjetoReclamable, normalizarNumeroRuntime3D, obtenerDimensionesObjetoRuntime } from './objetosRuntime';

export interface ObstaculoColision3D {
  id: string;
  tipo: 'escritorio' | 'objeto_persistente';
  posicion: {
    x: number;
    y: number;
    z: number;
  };
  semiextensiones: {
    x: number;
    y: number;
    z: number;
  };
  rotacion: number;
  padding: number;
}

const normalizarRotacion = (rotacion?: number | null) => {
  if (!Number.isFinite(rotacion)) return 0;
  return rotacion as number;
};

const clamp = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, valor));

const normalizarGeometriaLegacy = (valor?: string | null) => (valor || '').trim().toLowerCase();

interface AberturaTransitableColision extends AberturaArquitectonica {
  izquierda: number;
  derecha: number;
  inferior: number;
  superior: number;
}

const normalizarAberturasTransitablesColision = (
  aberturas: AberturaArquitectonica[],
  ancho: number,
  alto: number,
): AberturaTransitableColision[] => {
  const margen = 0.08;
  return aberturas
    .filter((abertura) => abertura.tipo === 'puerta')
    .map((abertura) => {
      const anchoAbertura = clamp(abertura.ancho, 0.2, Math.max(0.2, ancho - margen * 2));
      const altoAbertura = clamp(abertura.alto, 0.2, Math.max(0.2, alto - margen * 2));
      const izquierda = clamp(abertura.posicion_x - anchoAbertura / 2, -ancho / 2 + margen, ancho / 2 - margen - anchoAbertura);
      const inferior = clamp(abertura.posicion_y - altoAbertura / 2, -alto / 2 + margen, alto / 2 - margen - altoAbertura);
      return {
        ...abertura,
        ancho: anchoAbertura,
        alto: altoAbertura,
        izquierda,
        derecha: izquierda + anchoAbertura,
        inferior,
        superior: inferior + altoAbertura,
      };
    });
};

const crearObstaculoSegmentado = (
  id: string,
  objeto: EspacioObjeto,
  centroLocalX: number,
  centroLocalY: number,
  ancho: number,
  alto: number,
  profundidad: number,
  padding: number,
): ObstaculoColision3D => {
  const rotacion = normalizarRotacion(objeto.rotacion_y);
  const cos = Math.cos(rotacion);
  const sin = Math.sin(rotacion);
  const offsetX = centroLocalX * cos;
  const offsetZ = centroLocalX * sin;

  return {
    id,
    tipo: 'objeto_persistente',
    posicion: {
      x: objeto.posicion_x + offsetX,
      y: objeto.posicion_y + centroLocalY,
      z: objeto.posicion_z + offsetZ,
    },
    semiextensiones: {
      x: Math.max(ancho / 2, 0.01),
      y: Math.max(alto / 2, 0.01),
      z: Math.max(profundidad / 2, 0.01),
    },
    rotacion,
    padding,
  };
};

export const crearObstaculoObjetoPersistente = (objeto: EspacioObjeto): ObstaculoColision3D => {
  const perfil = obtenerDimensionesObjetoRuntime(objeto);
  const esReclamable = esObjetoReclamable(objeto);
  const esSentable = !!objeto.es_sentable;
  const rotacionAsiento = normalizarRotacion((objeto.rotacion_y || 0) + normalizarNumeroRuntime3D(objeto.sit_rotation_y, 0));
  const avanceX = Math.sin(rotacionAsiento);
  const avanceZ = Math.cos(rotacionAsiento);
  const retrocesoAsiento = esSentable ? Math.max(perfil.profundidad * 0.18, 0.08) : 0;
  const semiextX = esSentable
    ? Math.max((perfil.ancho / 2) * 0.78, 0.16)
    : perfil.ancho / 2;
  const semiextZ = esSentable
    ? Math.max((perfil.profundidad / 2) * 0.52, 0.12)
    : perfil.profundidad / 2;

  return {
    id: `obstaculo_objeto_${objeto.id}`,
    tipo: esReclamable ? 'escritorio' : 'objeto_persistente',
    posicion: {
      x: objeto.posicion_x - avanceX * retrocesoAsiento,
      y: objeto.posicion_y,
      z: objeto.posicion_z - avanceZ * retrocesoAsiento,
    },
    semiextensiones: {
      x: semiextX,
      y: perfil.alto / 2,
      z: semiextZ,
    },
    rotacion: normalizarRotacion(objeto.rotacion_y),
    padding: esReclamable ? 0.12 : esSentable ? 0.02 : 0.08,
  };
};

export const crearObstaculosFisicosObjetoPersistente = (objeto: EspacioObjeto): ObstaculoColision3D[] => {
  const obstaculoBase = crearObstaculoObjetoPersistente(objeto);
  const perfil = obtenerDimensionesObjetoRuntime(objeto);
  const geometriaLegacy = normalizarGeometriaLegacy(objeto.built_in_geometry);
  const configuracion = normalizarConfiguracionGeometricaObjeto({
    tipo: objeto.tipo,
    built_in_geometry: objeto.built_in_geometry,
    built_in_color: objeto.built_in_color,
    ancho: perfil.ancho,
    alto: perfil.alto,
    profundidad: perfil.profundidad,
    configuracion_geometria: objeto.configuracion_geometria,
  });

  if (!configuracion || configuracion.tipo_geometria !== 'pared') {
    return [obstaculoBase];
  }

  const aberturasTransitables = normalizarAberturasTransitablesColision(configuracion.aberturas, perfil.ancho, perfil.alto)
    .filter((abertura) => (
      abertura.insertar_cerramiento === false
      || abertura.forma === 'arco'
      || ((geometriaLegacy === 'wall-door' || geometriaLegacy === 'wall-door-double') && abertura.tipo === 'puerta')
    ));

  if (aberturasTransitables.length !== 1) {
    return [obstaculoBase];
  }

  const abertura = aberturasTransitables[0];
  const paddingSegmento = Math.min(obstaculoBase.padding, 0.05);
  const segmentos: ObstaculoColision3D[] = [];

  const anchoIzquierdo = Math.max(0, abertura.izquierda - (-perfil.ancho / 2));
  if (anchoIzquierdo > 0.02) {
    segmentos.push(crearObstaculoSegmentado(
      `${obstaculoBase.id}_izquierda`,
      objeto,
      (-perfil.ancho / 2) + (anchoIzquierdo / 2),
      0,
      anchoIzquierdo,
      perfil.alto,
      perfil.profundidad,
      paddingSegmento,
    ));
  }

  const anchoDerecho = Math.max(0, (perfil.ancho / 2) - abertura.derecha);
  if (anchoDerecho > 0.02) {
    segmentos.push(crearObstaculoSegmentado(
      `${obstaculoBase.id}_derecha`,
      objeto,
      abertura.derecha + (anchoDerecho / 2),
      0,
      anchoDerecho,
      perfil.alto,
      perfil.profundidad,
      paddingSegmento,
    ));
  }

  const altoSuperior = Math.max(0, (perfil.alto / 2) - abertura.superior);
  if (altoSuperior > 0.02) {
    segmentos.push(crearObstaculoSegmentado(
      `${obstaculoBase.id}_superior`,
      objeto,
      (abertura.izquierda + abertura.derecha) / 2,
      abertura.superior + (altoSuperior / 2),
      abertura.ancho,
      altoSuperior,
      perfil.profundidad,
      paddingSegmento,
    ));
  }

  return segmentos.length > 0 ? segmentos : [obstaculoBase];
};

export const crearObstaculosObjetosPersistentes = (objetos: EspacioObjeto[]): ObstaculoColision3D[] => {
  return objetos.flatMap((objeto) => crearObstaculosFisicosObjetoPersistente(objeto));
};

const convertirAPosicionLocal = (posicion: Posicion3DPlano, obstaculo: ObstaculoColision3D) => {
  const dx = posicion.x - obstaculo.posicion.x;
  const dz = posicion.z - obstaculo.posicion.z;
  const cos = Math.cos(-obstaculo.rotacion);
  const sin = Math.sin(-obstaculo.rotacion);

  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
};

export const colisionaJugadorConObstaculo = (
  posicion: Posicion3DPlano,
  radioJugador: number,
  obstaculo: ObstaculoColision3D,
  idsIgnorados: Set<string> = new Set()
): boolean => {
  if (idsIgnorados.has(obstaculo.id)) return false;

  const local = convertirAPosicionLocal(posicion, obstaculo);
  const limiteX = obstaculo.semiextensiones.x + radioJugador + obstaculo.padding;
  const limiteZ = obstaculo.semiextensiones.z + radioJugador + obstaculo.padding;

  return Math.abs(local.x) < limiteX && Math.abs(local.z) < limiteZ;
};

export const esPosicionTransitable = (
  posicion: Posicion3DPlano,
  obstaculos: ObstaculoColision3D[],
  radioJugador: number,
  idsIgnorados: string[] = []
): boolean => {
  const ignorados = new Set(idsIgnorados);
  return !obstaculos.some((obstaculo) => colisionaJugadorConObstaculo(posicion, radioJugador, obstaculo, ignorados));
};
