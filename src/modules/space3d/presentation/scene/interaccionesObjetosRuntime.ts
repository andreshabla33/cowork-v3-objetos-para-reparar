/**
 * @deprecated CLEAN-ARCH-F1: Proxy de compatibilidad.
 * La lógica canónica vive en: src/core/domain/entities/espacio3d/InteraccionObjetoEntity.ts
 *
 * Actualizar importadores a:
 *   import { normalizarInteraccionConfig, resolverDestinoTeleport, ... } from '@/src/core/domain/entities/espacio3d'
 */

export type {
  DestinoTeleport3D as DestinoTeleportRuntime3D,
  DisplayNormalizado3D,
  // Alias legacy: VirtualSpace3D.tsx importa DisplayRuntimeNormalizado3D
  DisplayNormalizado3D as DisplayRuntimeNormalizado3D,
  UseNormalizado3D,
} from '@/src/core/domain/entities/espacio3d';

export {
  normalizarInteraccionConfig as normalizarInteraccionConfigObjeto,
  resolverDestinoTeleport as resolverDestinoTeleportObjeto,
  resolverDisplayObjeto,
  resolverUseObjeto,
} from '@/src/core/domain/entities/espacio3d';
