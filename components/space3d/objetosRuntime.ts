/**
 * @deprecated CLEAN-ARCH-F1: Proxy de compatibilidad.
 * La lógica canónica vive en: src/core/domain/entities/espacio3d/ObjetoRuntimeEntity.ts
 *
 * Los importadores pueden migrar gradualmente a:
 *   import { obtenerDimensionesObjeto, ... } from '@/src/core/domain/entities/espacio3d'
 *
 * NOTA: FACTOR_ESCALA_OBJETOS_ESCENA se mantiene aquí como alias de la constante
 * del dominio hasta que `shared.ts` y sus importadores migren.
 */

// ─── Re-exports desde dominio ─────────────────────────────────────────────────

export type { ObjetoRuntime3D } from '@/src/core/domain/entities/espacio3d';

export {
  normalizarNumero3D as normalizarNumeroRuntime3D,
  obtenerEscalaObjeto as obtenerFactoresEscalaObjetoRuntime,
  obtenerDimensionesObjeto as obtenerDimensionesObjetoRuntime,
  obtenerModeloObjeto as obtenerModeloRuntimeObjeto,
  esObjetoReclamable,
  esObjetoSentable,
  esObjetoInteractuable,
  obtenerRadioInteraccion as obtenerRadioInteraccionObjeto,
  obtenerEtiquetaInteraccion as obtenerEtiquetaInteraccionObjeto,
  obtenerEmojiInteraccion as obtenerEmojiInteraccionObjeto,
  rotarOffsetXZ,
} from '@/src/core/domain/entities/espacio3d';

// ─── Alias de FACTOR_ESCALA ───────────────────────────────────────────────────
// shared.ts exporta FACTOR_ESCALA_OBJETOS_ESCENA = 1, que coincide con el dominio.
// Re-exportamos con el nombre legacy para compatibilidad de importadores.
export { FACTOR_ESCALA_OBJETOS_ESPACIO as FACTOR_ESCALA_OBJETOS_ESCENA } from '@/src/core/domain/entities/espacio3d';
