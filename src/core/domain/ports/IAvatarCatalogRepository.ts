/**
 * @module domain/ports/IAvatarCatalogRepository
 * @description Port interface for avatar and object catalog operations.
 * Decouples catalog loading logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 */

import type { CatalogoObjeto3D } from '@/types/objetos3d';

/**
 * Columnas reales de la tabla `avatares_3d` en Supabase — verificado 2026-04-08.
 *
 * Nota: las propiedades LOD (modelo_url_medium/low, textura_url_medium/low) y
 * `premium` se mantienen como opcionales para futura migración DB sin romper
 * consumidores existentes. La query del adapter NO las solicita a Supabase.
 */
export interface AvatarModelData {
  id: string;
  nombre: string;
  descripcion: string | null;
  modelo_url: string;
  modelo_url_medium?: string | null;
  modelo_url_low?: string | null;
  textura_url?: string | null;
  textura_url_medium?: string | null;
  textura_url_low?: string | null;
  thumbnail_url: string | null;
  escala: string;
  premium?: boolean;
}

export interface AnimacionAvatarData {
  id: string;
  nombre: string;
  url: string;
  loop: boolean;
  orden: number;
  strip_root_motion: boolean;
}

export interface IAvatarCatalogRepository {
  /**
   * Load all active avatar models from catalog.
   */
  obtenerAvatares(): Promise<AvatarModelData[]>;

  /**
   * Load all active 3D objects from catalog.
   */
  obtenerObjetos(): Promise<CatalogoObjeto3D[]>;

  /**
   * Get the currently equipped avatar for a user.
   */
  obtenerAvatarEquipado(userId: string): Promise<string | null>;

  /**
   * Load animations specific to an avatar.
   */
  obtenerAnimacionesAvatar(avatarId: string): Promise<AnimacionAvatarData[]>;

  /**
   * Load universal animations (fallback for all avatars).
   */
  obtenerAnimacionesUniversales(): Promise<AnimacionAvatarData[]>;

  /**
   * Change the user's equipped avatar.
   */
  cambiarAvatar(userId: string, avatarId: string): Promise<boolean>;

  /**
   * Upload a thumbnail for an avatar.
   * Returns the public URL or null on failure.
   */
  subirThumbnailAvatar(avatarId: string, blob: Blob): Promise<string | null>;

  /**
   * Upload a thumbnail for a 3D object.
   * Returns the public URL or null on failure.
   */
  subirThumbnailObjeto(objectId: string, blob: Blob): Promise<string | null>;

  /**
   * Clean up an invalid 3D model by setting modelo_url to null
   * and optionally deactivating the object.
   */
  limpiarModeloInvalido(objectId: string, deactivate: boolean): Promise<void>;
}
