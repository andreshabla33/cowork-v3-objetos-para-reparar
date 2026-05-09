import { addComponent, addEntity, createWorld, removeEntity, type World } from 'bitecs';
import type { User } from '@/types';

export type DireccionEcs =
  | 'front'
  | 'left'
  | 'right'
  | 'back'
  | 'up'
  | 'down'
  | 'front-left'
  | 'front-right'
  | 'up-left'
  | 'up-right';

const DIRECCIONES_ECS: DireccionEcs[] = [
  'front',
  'left',
  'right',
  'back',
  'up',
  'down',
  'front-left',
  'front-right',
  'up-left',
  'up-right',
];

const INDICE_DIRECCION = new Map<string, number>(
  DIRECCIONES_ECS.map((direccion, indice) => [direccion, indice])
);

const Posicion = {
  x: [] as number[],
  z: [] as number[],
};

const Direccion = {
  valor: [] as number[],
};

const Movimiento = {
  activo: [] as number[],
};

const Actualizacion = {
  timestamp: [] as number[],
};

export interface EstadoEcsEspacio {
  mundo: World<{ components: { Posicion: typeof Posicion; Direccion: typeof Direccion; Movimiento: typeof Movimiento; Actualizacion: typeof Actualizacion } }>;
  entidadPorUsuario: Map<string, number>;
  usuarioPorEntidad: Map<number, string>;
}

const UMBRAL_SINCRONIZACION_MS = 2000;

const codificarDireccion = (direccion?: string) => {
  const indice = INDICE_DIRECCION.get(direccion ?? 'front');
  return typeof indice === 'number' ? indice : 0;
};

const decodificarDireccion = (indice: number) => {
  return DIRECCIONES_ECS[indice] ?? 'front';
};

export const crearEstadoEcsEspacio = (): EstadoEcsEspacio => {
  const mundo = createWorld({
    components: {
      Posicion,
      Direccion,
      Movimiento,
      Actualizacion,
    },
  });

  return {
    mundo,
    entidadPorUsuario: new Map(),
    usuarioPorEntidad: new Map(),
  };
};

const asegurarEntidad = (estado: EstadoEcsEspacio, usuarioId: string) => {
  const existente = estado.entidadPorUsuario.get(usuarioId);
  if (typeof existente === 'number') return { entidad: existente, creada: false };

  const entidad = addEntity(estado.mundo);
  addComponent(estado.mundo, entidad, Posicion);
  addComponent(estado.mundo, entidad, Direccion);
  addComponent(estado.mundo, entidad, Movimiento);
  addComponent(estado.mundo, entidad, Actualizacion);
  estado.entidadPorUsuario.set(usuarioId, entidad);
  estado.usuarioPorEntidad.set(entidad, usuarioId);
  return { entidad, creada: true };
};

export const sincronizarUsuariosEcs = (estado: EstadoEcsEspacio, usuarios: User[]) => {
  const idsActuales = new Set(usuarios.map((usuario) => usuario.id));

  estado.entidadPorUsuario.forEach((entidad, usuarioId) => {
    if (!idsActuales.has(usuarioId)) {
      removeEntity(estado.mundo, entidad);
      estado.entidadPorUsuario.delete(usuarioId);
      estado.usuarioPorEntidad.delete(entidad);
    }
  });

  usuarios.forEach((usuario) => {
    const { entidad, creada } = asegurarEntidad(estado, usuario.id);
    const ultimaActualizacion = Actualizacion.timestamp[entidad] ?? 0;
    if (!creada && Date.now() - ultimaActualizacion < UMBRAL_SINCRONIZACION_MS) {
      return;
    }
    Posicion.x[entidad] = usuario.x / 16;
    Posicion.z[entidad] = usuario.y / 16;
    Direccion.valor[entidad] = codificarDireccion(usuario.direction);
    Movimiento.activo[entidad] = usuario.isMoving ? 1 : 0;
    Actualizacion.timestamp[entidad] = Date.now();
  });
};

export const actualizarEstadoUsuarioEcs = (
  estado: EstadoEcsEspacio,
  usuarioId: string,
  x?: number,
  z?: number,
  direccion?: string,
  isMoving?: boolean
) => {
  const { entidad } = asegurarEntidad(estado, usuarioId);
  if (typeof x === 'number') Posicion.x[entidad] = x;
  if (typeof z === 'number') Posicion.z[entidad] = z;
  if (typeof direccion !== 'undefined') Direccion.valor[entidad] = codificarDireccion(direccion);
  if (typeof isMoving === 'boolean') Movimiento.activo[entidad] = isMoving ? 1 : 0;
  Actualizacion.timestamp[entidad] = Date.now();
};

export const obtenerEstadoUsuarioEcs = (estado: EstadoEcsEspacio, usuarioId: string) => {
  const entidad = estado.entidadPorUsuario.get(usuarioId);
  if (typeof entidad !== 'number') return null;

  return {
    x: Posicion.x[entidad],
    z: Posicion.z[entidad],
    direction: decodificarDireccion(Direccion.valor[entidad]),
    isMoving: Movimiento.activo[entidad] === 1,
    timestamp: Actualizacion.timestamp[entidad] ?? 0,
  };
};

export const limpiarEstadoEcs = (estado: EstadoEcsEspacio) => {
  estado.entidadPorUsuario.forEach((entidad) => {
    removeEntity(estado.mundo, entidad);
  });
  estado.entidadPorUsuario.clear();
  estado.usuarioPorEntidad.clear();
};
