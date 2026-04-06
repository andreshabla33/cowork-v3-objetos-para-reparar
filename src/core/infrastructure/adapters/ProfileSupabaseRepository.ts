/**
 * @module infrastructure/adapters/ProfileSupabaseRepository
 * @description Supabase implementation of IProfileRepository.
 * Encapsulates all Supabase queries for user profile operations.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { IProfileRepository } from '../../domain/ports/IProfileRepository';

const log = logger.child('profile-repo');

export class ProfileSupabaseRepository implements IProfileRepository {
  async subirFotoPerfil(userId: string, file: File): Promise<string | null> {
    try {
      const fileName = `profile/${userId}/avatar_${Date.now()}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        log.warn('Failed to upload profile photo', { error: uploadError.message, userId });
        return null;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

      if (!data?.publicUrl) {
        log.warn('Failed to get public URL for profile photo', { userId });
        return null;
      }

      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ avatar_url: data.publicUrl })
        .eq('id', userId);

      if (updateError) {
        log.warn('Failed to update profile photo URL', { error: updateError.message, userId });
        return null;
      }

      return data.publicUrl;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception uploading profile photo', { error: message, userId });
      return null;
    }
  }

  async eliminarFotoPerfil(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (error) {
        log.warn('Failed to delete profile photo', { error: error.message, userId });
        return false;
      }

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception deleting profile photo', { error: message, userId });
      return false;
    }
  }

  async guardarNombre(userId: string, nombre: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ nombre })
        .eq('id', userId);

      if (error) {
        log.warn('Failed to save user name', { error: error.message, userId });
        return false;
      }

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception saving user name', { error: message, userId });
      return false;
    }
  }
}

export const profileRepository = new ProfileSupabaseRepository();
