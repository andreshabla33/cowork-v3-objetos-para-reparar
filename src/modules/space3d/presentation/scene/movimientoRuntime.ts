/**
 * @deprecated CLEAN-ARCH-F1: Proxy de compatibilidad.
 * La lógica canónica vive en: src/core/domain/entities/espacio3d/MovimientoEntity.ts
 *
 * Actualizar importadores a:
 *   import { resolverMovimientoConDeslizamiento } from '@/src/core/domain/entities/espacio3d'
 */

export type {
  MovimientoIntento3D,
  MovimientoResuelto3D,
} from '@/src/core/domain/entities/espacio3d';

export { resolverMovimientoConDeslizamiento } from '@/src/core/domain/entities/espacio3d';
