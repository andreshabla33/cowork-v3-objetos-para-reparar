/**
 * @module store/orchestrators/bootstrap/avatarLoader
 * @description Loads avatar configuration (2D + 3D) with animation fallbacks.
 * Atomic orchestrator — handles all avatar-related queries.
 *
 * Performance (500+ avatars): The `usuarios` query is now pre-fetched by
 * userDataLoader and injected via `UserAvatarData`, eliminating 1 RTT per boot.
 *
 * Ref: Supabase JS v2 — .maybeSingle() for optional rows, avoids throwing on 0 results.
 */

import type { AvatarConfig } from '../../../types';
import type { Avatar3DConfig } from '../../../components/avatar3d/shared';
import type { UserAvatarData } from './userDataLoader';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

const log = logger.child('avatar-loader');

export interface AvatarLoadResult {
  avatarConfig: AvatarConfig;
  avatar3DConfig: Avatar3DConfig | null;
}

/**
 * Load complete avatar configuration for a user.
 * Includes 2D config, 3D model, and animations with fallback chain.
 *
 * @param userId         Authenticated user ID
 * @param defaultAvatar  Fallback 2D avatar config
 * @param userData       Pre-fetched user data from userDataLoader (eliminates duplicate query)
 */
export async function cargarAvatar(
  userId: string,
  defaultAvatar: AvatarConfig,
  userData?: UserAvatarData,
): Promise<AvatarLoadResult> {
  let avatarConfig = defaultAvatar;
  let avatar3DConfig: Avatar3DConfig | null = null;

  // 1. Load 2D avatar config
  try {
    const { data: avatarConfigData } = await supabase
      .from('avatar_configuracion')
      .select('configuracion')
      .eq('usuario_id', userId)
      .maybeSingle();
    if (avatarConfigData?.configuracion) avatarConfig = avatarConfigData.configuracion;
  } catch (error: unknown) {
    log.warn('Could not load avatar config', { error: error instanceof Error ? error.message : String(error) });
  }

  // 2. Load 3D avatar + animations
  //    avatar_3d_id comes from pre-fetched userDataLoader (no extra RTT)
  try {
    let avatarId = userData?.avatar_3d_id ?? null;

    // Fallback: if no avatar assigned, pick the first active one
    if (!avatarId) {
      const { data: defaultAv } = await supabase
        .from('avatares_3d')
        .select('id')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .limit(1)
        .maybeSingle();
      avatarId = defaultAv?.id || null;
    }

    if (avatarId) {
      let avatar3D = (
        await supabase.from('avatares_3d').select('*').eq('id', avatarId).maybeSingle()
      ).data;

      // Fallback: assigned avatar doesn't exist in DB
      if (!avatar3D) {
        log.warn('Assigned avatar not found in DB, finding fallback');
        const { data: fallbackAvatar } = await supabase
          .from('avatares_3d')
          .select('*')
          .eq('activo', true)
          .order('orden', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (fallbackAvatar) {
          avatar3D = fallbackAvatar;
          avatarId = fallbackAvatar.id;
          await supabase.from('usuarios').update({ avatar_3d_id: fallbackAvatar.id }).eq('id', userId);
          log.info('Avatar reset to fallback', { nombre: fallbackAvatar.nombre });
        }
      }

      if (avatar3D) {
        let { data: anims } = await supabase
          .from('avatar_animaciones')
          .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
          .eq('avatar_id', avatarId)
          .eq('activo', true)
          .order('orden', { ascending: true });

        let isFallback = false;
        if (!anims || anims.length === 0) {
          const { data: universalAnims } = await supabase
            .from('avatar_animaciones')
            .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
            .eq('es_universal', true)
            .eq('activo', true)
            .order('orden', { ascending: true });
          if (universalAnims && universalAnims.length > 0) {
            anims = universalAnims;
            isFallback = true;
          }
        }

        avatar3DConfig = {
          ...avatar3D,
          textura_url: avatar3D.textura_url || null,
          animaciones:
            anims?.map((animation) => ({
              id: animation.id as string,
              nombre: animation.nombre as string,
              url: animation.url as string,
              loop: (animation.loop as boolean) ?? false,
              orden: (animation.orden as number) ?? 0,
              strip_root_motion: (animation.strip_root_motion as boolean) ?? false,
              es_fallback: isFallback,
            })) || [],
        } as Avatar3DConfig;
      }
    }
  } catch (error: unknown) {
    log.warn('Could not load avatar 3D config', { error: error instanceof Error ? error.message : String(error) });
  }

  return { avatarConfig, avatar3DConfig };
}
