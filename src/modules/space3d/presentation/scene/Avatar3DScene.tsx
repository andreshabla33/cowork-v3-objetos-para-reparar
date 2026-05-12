'use client';
/**
 * @module space3d/scene/Avatar3DScene
 *
 * Barrel re-export — el monolito 1372 LOC original fue dividido en archivos
 * dedicados (ITEM 15 P1-07, sesión 2026-05-12). Conserva la API pública
 * que consume `InternalComponents.tsx` y demás barrels históricos.
 *
 * Cada componente vive ahora en su archivo:
 *  - `Avatar.tsx`               — componente individual + helpers + AvatarProps
 *  - `RemoteUsers.tsx`          — renderer ECS-driven + LOD bucketing
 *  - `CameraFollow.tsx`         — chase-cam + idle-hero blend + collision + auto-return
 *  - `AvatarScreenProjector.tsx`— proyecta posición 3D del avatar a screen 2D
 *  - `TeleportEffect.tsx`       — anillo + flash 350ms en teletransporte
 */

export { Avatar, type AvatarProps, FALLBACK_AVATAR_3D_CONFIG, obtenerZonaActivaEmpresa, limitarPosicionAZonaEmpresa } from './Avatar';
export { RemoteUsers, type RemoteUsersProps } from './RemoteUsers';
export { CameraFollow } from './CameraFollow';
export { AvatarScreenProjector } from './AvatarScreenProjector';
export { TeleportEffect } from './TeleportEffect';
