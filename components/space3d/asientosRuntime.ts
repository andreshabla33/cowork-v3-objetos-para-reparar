/**
 * @deprecated CLEAN-ARCH-F1: Este archivo es un proxy de compatibilidad.
 * La lógica canónica vive en: src/core/domain/entities/espacio3d/AsientoEntity.ts
 *
 * Migración gradual: los importadores pueden actualizar sus rutas a:
 *   import { ... } from '@/src/core/domain/entities/espacio3d'
 *
 * Este archivo se eliminará cuando todos los consumidores hayan migrado.
 */

// ─── Re-exports desde la capa de dominio ─────────────────────────────────────

export type {
  PerfilAsiento3D,
  AsientoRuntime3D,
  Posicion3DPlano,
} from '@/src/core/domain/entities/espacio3d';

export {
  esAnimacionAsiento,
  buscarAsientoCercano,
  resolverAsientoUsuario,
} from '@/src/core/domain/entities/espacio3d';

// ─── crearAsientosObjetos3D — wrapper de compatibilidad ──────────────────────
// La función original depende de obtenerDimensionesObjetoRuntime, etc.
// Mantenemos el wrapper aquí con las importaciones de presentación
// hasta que los consumidores (Scene3D) migren al use case.

import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import {
  obtenerDimensionesObjetoRuntime,
  obtenerFactoresEscalaObjetoRuntime,
  obtenerRadioInteraccionObjeto,
  normalizarNumeroRuntime3D,
  rotarOffsetXZ,
} from './objetosRuntime';
import { CHAIR_SIT_RADIUS, RADIO_COLISION_AVATAR } from './shared';
import { construirAsientoRuntime } from '@/src/core/domain/entities/espacio3d';

export const crearAsientosObjetos3D = (objetos: EspacioObjeto[]) => {
  return objetos
    .filter((objeto) => !!objeto.es_sentable)
    .map((objeto) => {
      const dimensiones = obtenerDimensionesObjetoRuntime(objeto);
      const escala = obtenerFactoresEscalaObjetoRuntime(objeto);
      const escalaHorizontal = (escala.x + escala.z) / 2;
      const radioActivacion = obtenerRadioInteraccionObjeto(
        objeto,
        Math.max(CHAIR_SIT_RADIUS, Math.max(dimensiones.ancho, dimensiones.profundidad) * 0.55),
      );
      const offsetXBruto = normalizarNumeroRuntime3D(objeto.sit_offset_x, 0) * escala.x;
      const offsetZBruto = normalizarNumeroRuntime3D(objeto.sit_offset_z, 0) * escala.z;
      const perfil = {
        tipoPerfil: 'generico' as const,
        factorCaderaSentada: 0.56, ajusteVertical: 0,
        retrocesoMin: 0.08, retrocesoMax: 0.18, profundidadFactor: 0.16,
        adelantoMaximo: 0.05, correccionFrontal: 0.03, aproximacionFrontal: 0.07,
        fraccionAsientoDesdeBase: 0.45,
      };
      const offsetZLimitado = Math.min(offsetZBruto, Math.min(perfil.adelantoMaximo * escalaHorizontal, dimensiones.profundidad * 0.08));
      const offsetRotado = rotarOffsetXZ(
        offsetXBruto,
        offsetZLimitado - Math.min(perfil.retrocesoMax * escalaHorizontal, Math.max(perfil.retrocesoMin * escalaHorizontal, dimensiones.profundidad * perfil.profundidadFactor)) + perfil.correccionFrontal * escalaHorizontal,
        objeto.rotacion_y || 0,
      );

      return construirAsientoRuntime(
        objeto,
        dimensiones,
        escala,
        radioActivacion,
        offsetRotado,
        { chairSitRadius: CHAIR_SIT_RADIUS, radioColisionAvatar: RADIO_COLISION_AVATAR },
      );
    });
};
