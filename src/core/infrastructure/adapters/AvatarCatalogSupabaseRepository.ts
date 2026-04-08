/**
 * @module infrastructure/adapters/AvatarCatalogSupabaseRepository
 * @description Supabase implementation of IAvatarCatalogRepository.
 * Encapsulates all Supabase queries for avatar/object catalogs and animations.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IAvatarCatalogRepository,
  AvatarModelData,
  AnimacionAvatarData,
} from '../../domain/ports/IAvatarCatalogRepository';
import type { CatalogoObjeto3D } from '@/types/objetos3d';

const log = logger.child('avatar-catalog-repo');

export class AvatarCatalogSupabaseRepository implements IAvatarCatalogRepository {
  async obtenerAvatares(): Promise<AvatarModelData[]> {
    try {
      // Columnas reales de avatares_3d — verificadas 2026-04-08.
      // Las columnas LOD (modelo_url_medium/low, textura_url_medium/low) y premium
      // NO existen en la tabla. Se excluyen del select para evitar HTTP 400 de PostgREST.
      // Ref: https://supabase.com/docs/guides/api#filtering
      const { data, error } = await supabase
        .from('avatares_3d')
        .select(
          `id, nombre, descripcion, modelo_url, textura_url, thumbnail_url, escala`
        )
        .eq('activo', true)
        .order('orden');

      if (error) {
        log.warn('Failed to load avatars', { error: error.message });
        return [];
      }

      return (data || []) as AvatarModelData[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading avatars', { error: message });
      return [];
    }
  }

  async obtenerObjetos(): Promise<CatalogoObjeto3D[]> {
    try {
      const { data, error } = await supabase
        .from('catalogo_objetos_3d')
        .select(
          `id, slug, nombre, descripcion, categoria, tipo, modelo_url, thumbnail_url,
           built_in_geometry, built_in_color, ancho, profundidad, alto, es_sentable,
           sit_offset_x, sit_offset_y, sit_offset_z, sit_rotation_y,
           es_interactuable, interaccion_tipo, interaccion_radio, interaccion_emoji,
           interaccion_label, interaccion_config, configuracion_geometria,
           es_reclamable, premium, escala_normalizacion`
        )
        .eq('activo', true)
        .order('orden');

      if (error) {
        log.warn('Failed to load objects', { error: error.message });
        return [];
      }

      return (data || []) as CatalogoObjeto3D[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading objects', { error: message });
      return [];
    }
  }

  async obtenerAvatarEquipado(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('avatar_3d_id')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        log.warn('Failed to load equipped avatar', { error: error.message, userId });
        return null;
      }

      return (data?.avatar_3d_id as string | null) || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading equipped avatar', { error: message, userId });
      return null;
    }
  }

  async obtenerAnimacionesAvatar(avatarId: string): Promise<AnimacionAvatarData[]> {
    try {
      const { data, error } = await supabase
        .from('avatar_animaciones')
        .select('id, nombre, url, loop, orden, strip_root_motion')
        .eq('avatar_id', avatarId)
        .eq('activo', true)
        .order('orden');

      if (error) {
        log.warn('Failed to load avatar animations', { error: error.message, avatarId });
        return [];
      }

      return (data || []) as AnimacionAvatarData[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading avatar animations', { error: message, avatarId });
      return [];
    }
  }

  async obtenerAnimacionesUniversales(): Promise<AnimacionAvatarData[]> {
    try {
      const { data, error } = await supabase
        .from('avatar_animaciones')
        .select('id, nombre, url, loop, orden, strip_root_motion')
        .eq('es_universal', true)
        .eq('activo', true)
        .order('orden');

      if (error) {
        log.warn('Failed to load universal animations', { error: error.message });
        return [];
      }

      return (data || []) as AnimacionAvatarData[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading universal animations', { error: message });
      return [];
    }
  }

  async cambiarAvatar(userId: string, avatarId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ avatar_3d_id: avatarId })
        .eq('id', userId);

      if (error) {
        log.warn('Failed to change avatar', { error: error.message, userId, avatarId });
        return false;
      }

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception changing avatar', { error: message, userId, avatarId });
      return false;
    }
  }

  async subirThumbnailAvatar(avatarId: string, blob: Blob): Promise<string | null> {
    try {
      const fileName = `avatars/thumbnails/avatar_${avatarId}_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) {
        log.warn('Failed to upload avatar thumbnail', { error: uploadError.message, avatarId });
        return null;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

      if (!data?.publicUrl) {
        log.warn('Failed to get public URL for avatar thumbnail', { avatarId });
        return null;
      }

      const { error: updateError } = await supabase
        .from('avatares_3d')
        .update({ thumbnail_url: data.publicUrl })
        .eq('id', avatarId);

      if (updateError) {
        log.warn('Failed to update avatar thumbnail URL', { error: updateError.message, avatarId });
        return null;
      }

      return data.publicUrl;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception uploading avatar thumbnail', { error: message, avatarId });
      return null;
    }
  }

  async subirThumbnailObjeto(objectId: string, blob: Blob): Promise<string | null> {
    try {
      const fileName = `objects/thumbnails/object_${objectId}_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) {
        log.warn('Failed to upload object thumbnail', { error: uploadError.message, objectId });
        return null;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

      if (!data?.publicUrl) {
        log.warn('Failed to get public URL for object thumbnail', { objectId });
        return null;
      }

      const { error: updateError } = await supabase
        .from('catalogo_objetos_3d')
        .update({ thumbnail_url: data.publicUrl })
        .eq('id', objectId);

      if (updateError) {
        log.warn('Failed to update object thumbnail URL', { error: updateError.message, objectId });
        return null;
      }

      return data.publicUrl;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception uploading object thumbnail', { error: message, objectId });
      return null;
    }
  }

  async limpiarModeloInvalido(objectId: string, deactivate: boolean): Promise<void> {
    try {
      const updatePayload: Record<string, unknown> = {
        modelo_url: null,
      };

      if (deactivate) {
        updatePayload.activo = false;
      }

      const { error } = await supabase
        .from('catalogo_objetos_3d')
        .update(updatePayload)
        .eq('id', objectId);

      if (error) {
        log.warn('Failed to clean invalid model', { error: error.message, objectId, deactivate });
        return;
      }

      log.info('Cleaned invalid model', { objectId, deactivate });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception cleaning invalid model', { error: message, objectId, deactivate });
    }
  }
}

export const avatarCatalogRepository = new AvatarCatalogSupabaseRepository();
