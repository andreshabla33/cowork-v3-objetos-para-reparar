/**
 * @module domain/entities/espacio3d
 * Barrel export de todas las entidades del espacio 3D virtual.
 *
 * Clean Architecture: estas entidades NO dependen de React, Three.js ni Supabase.
 * Solo referencian tipos de @/types (shared) y otras entidades de dominio.
 */

// ─── ObjetoEspacio3D ──────────────────────────────────────────────────────────
export type { ObjetoEspacio3D, EspacioObjetoDominio } from './ObjetoEspacio3D';

// ─── Asientos ─────────────────────────────────────────────────────────────────
export type {
  Posicion2D,
  Posicion3D,
  PerfilAsiento3D,
  AsientoRuntime3D,
  EstadoAnimacionAvatar,
  DimensionesObjeto,
  EscalaObjeto,
  ConstantesAsiento,
  Asiento3D,
  Posicion3DPlano,
} from './AsientoEntity';

export {
  resolverPerfilAsiento,
  esAnimacionAsiento,
  buscarAsientoCercano,
  resolverAsientoUsuario,
  construirAsientoRuntime,
} from './AsientoEntity';

// ─── Colisiones ───────────────────────────────────────────────────────────────
export type { ObstaculoColision3D } from './ColisionEntity';

export {
  colisionaJugadorConObstaculo,
  esPosicionTransitable,
  construirObstaculoBase,
  construirObstaculoSegmentado,
} from './ColisionEntity';

// ─── Movimiento ───────────────────────────────────────────────────────────────
export type { MovimientoIntento3D, MovimientoResuelto3D } from './MovimientoEntity';
export { resolverMovimientoConDeslizamiento } from './MovimientoEntity';

// ─── ObjetoRuntime ────────────────────────────────────────────────────────────
export type { ObjetoRuntime3D } from './ObjetoRuntimeEntity';

export {
  FACTOR_ESCALA_OBJETOS_ESPACIO,
  normalizarNumero3D,
  obtenerEscalaObjeto,
  obtenerDimensionesObjeto,
  obtenerModeloObjeto,
  esObjetoReclamable,
  esObjetoSentable,
  esObjetoInteractuable,
  obtenerRadioInteraccion,
  obtenerEtiquetaInteraccion,
  obtenerEmojiInteraccion,
  rotarOffsetXZ,
} from './ObjetoRuntimeEntity';

// ─── Interacciones ────────────────────────────────────────────────────────────
export type {
  DestinoTeleport3D,
  DisplayNormalizado3D,
  UseNormalizado3D,
} from './InteraccionObjetoEntity';

export {
  normalizarInteraccionConfig,
  resolverDestinoTeleport,
  resolverDisplayObjeto,
  resolverUseObjeto,
} from './InteraccionObjetoEntity';

// ─── Avatar Labels ───────────────────────────────────────────────────────────
export type { AvatarLabelEntity, LabelPresenceStatus } from './AvatarLabelEntity';
export { LABEL_CONFIG } from './AvatarLabelEntity';
