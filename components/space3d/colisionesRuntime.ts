import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { AsientoRuntime3D, Posicion3DPlano } from './asientosRuntime';
import { esObjetoReclamable, normalizarNumeroRuntime3D, obtenerDimensionesObjetoRuntime } from './objetosRuntime';

export interface ObstaculoColision3D {
  id: string;
  tipo: 'escritorio' | 'objeto_persistente' | 'silla_demo' | 'mesa_demo';
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

export const crearObstaculosObjetosPersistentes = (objetos: EspacioObjeto[]): ObstaculoColision3D[] => {
  return objetos.map((objeto) => crearObstaculoObjetoPersistente(objeto));
};

export const crearObstaculosSillasDemo = (asientos: AsientoRuntime3D[]): ObstaculoColision3D[] => {
  return asientos.map((asiento) => {
    const avanceX = Math.sin(asiento.rotacion);
    const avanceZ = Math.cos(asiento.rotacion);

    return {
      id: `obstaculo_${asiento.id}`,
      tipo: 'silla_demo',
      posicion: {
        x: asiento.posicion.x - avanceX * 0.28,
        y: 0.32,
        z: asiento.posicion.z - avanceZ * 0.28,
      },
      semiextensiones: {
        x: 0.3,
        y: 0.32,
        z: 0.22,
      },
      rotacion: asiento.rotacion,
      padding: 0.05,
    };
  });
};

export const crearObstaculosMesaDemo = (): ObstaculoColision3D[] => {
  return [
    {
      id: 'obstaculo_mesa_demo_principal',
      tipo: 'mesa_demo',
      posicion: {
        x: 10,
        y: 0.5,
        z: 10,
      },
      semiextensiones: {
        x: 2,
        y: 0.5,
        z: 1,
      },
      rotacion: 0,
      padding: 0.12,
    },
  ];
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
