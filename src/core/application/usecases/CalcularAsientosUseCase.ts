/**
 * @module application/usecases/CalcularAsientosUseCase
 *
 * Caso de uso: Calcula los asientos disponibles en el espacio 3D
 * a partir de la lista de objetos persistentes.
 *
 * Clean Architecture:
 *  - Orquesta entidades de dominio (AsientoEntity, ObjetoRuntimeEntity).
 *  - NO importa React, Three.js, Supabase ni hooks.
 *  - Testeable de forma aislada (inyección de dependencias explícita).
 */

import type { ObjetoEspacio3D } from '../../../core/domain/entities/espacio3d/ObjetoEspacio3D';
import type { AsientoRuntime3D } from '../../../core/domain/entities/espacio3d/AsientoEntity';
import {
  obtenerDimensionesObjeto,
  obtenerEscalaObjeto,
  obtenerRadioInteraccion,
  normalizarNumero3D,
  rotarOffsetXZ,
  FACTOR_ESCALA_OBJETOS_ESPACIO,
} from '../../../core/domain/entities/espacio3d/ObjetoRuntimeEntity';
import {
  construirAsientoRuntime,
  buscarAsientoCercano,
  resolverAsientoUsuario,
  esAnimacionAsiento,
} from '../../../core/domain/entities/espacio3d/AsientoEntity';
import type { Posicion2D, EstadoAnimacionAvatar } from '../../../core/domain/entities/espacio3d/AsientoEntity';

// ─── Parámetros y resultado ───────────────────────────────────────────────────

export interface CalcularAsientosParams {
  objetos: ObjetoEspacio3D[];
  /** Radio de sit de silla (constante del espacio) */
  chairSitRadius: number;
  /** Radio de colisión del avatar */
  radioColisionAvatar: number;
  /** Factor de escala global de la escena (default: FACTOR_ESCALA_OBJETOS_ESPACIO) */
  factorEscena?: number;
}

export interface ResolverAsientoParams {
  posicionUsuario: Posicion2D;
  asientos: AsientoRuntime3D[];
  animacion?: EstadoAnimacionAvatar | null;
}

// ─── Use Case ─────────────────────────────────────────────────────────────────

/**
 * Calcula todos los asientos disponibles a partir de objetos sentables del espacio.
 * Devuelve AsientoRuntime3D[] listos para usar en Scene3D.
 */
export const calcularAsientosDisponibles = (
  params: CalcularAsientosParams,
): AsientoRuntime3D[] => {
  const factor = params.factorEscena ?? FACTOR_ESCALA_OBJETOS_ESPACIO;

  return params.objetos
    .filter((objeto) => !!objeto.es_sentable)
    .map((objeto) => {
      const dimensiones = obtenerDimensionesObjeto(objeto, factor);
      const escala = obtenerEscalaObjeto(objeto);
      const escalaHorizontal = (escala.x + escala.z) / 2;

      const radioActivacion = obtenerRadioInteraccion(
        objeto,
        Math.max(params.chairSitRadius, Math.max(dimensiones.ancho, dimensiones.profundidad) * 0.55),
      );

      const offsetXBruto = normalizarNumero3D(objeto.sit_offset_x, 0) * escala.x;
      const offsetZBruto = normalizarNumero3D(objeto.sit_offset_z, 0) * escala.z;
      // El límite de adelanto evita que el avatar flote frente al asiento
      const adelantoMax = 0.05;
      const offsetZLimitado = Math.min(offsetZBruto, Math.min(adelantoMax * escalaHorizontal, dimensiones.profundidad * 0.08));

      // retrocesoMid para el offset Z final
      const retrocesoMid = (0.08 + 0.18) / 2 * escalaHorizontal;
      const correccionFrontal = 0.03 * escalaHorizontal;
      const offsetRotado = rotarOffsetXZ(
        offsetXBruto,
        offsetZLimitado - retrocesoMid + correccionFrontal,
        objeto.rotacion_y || 0,
      );

      return construirAsientoRuntime(
        objeto,
        dimensiones,
        escala,
        radioActivacion,
        offsetRotado,
        { chairSitRadius: params.chairSitRadius, radioColisionAvatar: params.radioColisionAvatar },
      );
    });
};

/**
 * Resuelve qué asiento ocupa el usuario según posición y animación.
 * Devuelve null si no hay asiento cercano o la animación no es de sentarse.
 */
export const resolverAsientoActivo = (
  params: ResolverAsientoParams,
): AsientoRuntime3D | null =>
  resolverAsientoUsuario(params.posicionUsuario, params.animacion, params.asientos);

// Re-export utilidades de dominio usadas frecuentemente desde la capa de presentación
export { buscarAsientoCercano, esAnimacionAsiento };
