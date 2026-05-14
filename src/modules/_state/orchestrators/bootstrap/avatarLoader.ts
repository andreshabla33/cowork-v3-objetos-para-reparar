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

import type { AvatarConfig } from '@/types';
import type { Avatar3DConfig } from '@/modules/avatar3d/presentation/shared';
import type { UserAvatarData } from './userDataLoader';
import { avatarCatalogRepository } from '@/core/infrastructure/adapters/AvatarCatalogSupabaseRepository';
import { logger } from '@/core/infrastructure/observability/logger';
// NOTE: `universalAnimationsPreloader` se importa DINÁMICAMENTE en el cuerpo
// del use case (no statically) para que `three-stdlib` (GLTFLoader, 925 KB
// pulled into vendor-three) viva en su propio chunk y NO se preloadee al boot.
// Ref: https://vite.dev/guide/features.html#dynamic-import

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
    const avatarConfigData = await avatarCatalogRepository.obtenerConfiguracionAvatar(userId);
    if (avatarConfigData) avatarConfig = avatarConfigData;
  } catch (error: unknown) {
    log.warn('Could not load avatar config', { error: error instanceof Error ? error.message : String(error) });
  }

  // 2. Load 3D avatar + animations
  //    avatar_3d_id comes from pre-fetched userDataLoader (no extra RTT)
  try {
    let avatarId = userData?.avatar_3d_id ?? null;

    // Fallback: if no avatar assigned, pick the first active one
    if (!avatarId) {
      const defaultAv = await avatarCatalogRepository.obtenerAvatarPorDefecto();
      avatarId = defaultAv?.id || null;
    }

    if (avatarId) {
      let avatar3D: Record<string, unknown> | null =
        (await avatarCatalogRepository.obtenerAvatarPorId(avatarId)) as Record<string, unknown> | null;

      // Fallback: assigned avatar doesn't exist in DB
      if (!avatar3D) {
        log.warn('Assigned avatar not found in DB, finding fallback');
        const fallbackAvatar = await avatarCatalogRepository.obtenerAvatarPorDefecto();
        if (fallbackAvatar) {
          avatar3D = fallbackAvatar as unknown as Record<string, unknown>;
          avatarId = fallbackAvatar.id;
          await avatarCatalogRepository.cambiarAvatar(userId, fallbackAvatar.id);
          log.info('Avatar reset to fallback', { nombre: fallbackAvatar.nombre });
        }
      }

      if (avatar3D) {
        let anims = await avatarCatalogRepository.obtenerAnimacionesAvatar(avatarId);

        let isFallback = false;
        if (!anims || anims.length === 0) {
          const universalAnims = await avatarCatalogRepository.obtenerAnimacionesUniversales();
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
              id: animation.id,
              nombre: animation.nombre,
              url: animation.url,
              loop: animation.loop ?? false,
              orden: animation.orden ?? 0,
              strip_root_motion: animation.strip_root_motion ?? false,
              es_fallback: isFallback,
            })) || [],
        } as Avatar3DConfig;
      }
    }
  } catch (error: unknown) {
    log.warn('Could not load avatar 3D config', { error: error instanceof Error ? error.message : String(error) });
  }

  // Fire-and-forget preload of the 12 shared universal animation GLBs.
  // Warms the module-level cache used by GLTFAvatar so subsequent avatar
  // selections load clips in ~1-5ms (cache hit) instead of 460-851ms,
  // closing the race window that produced T-pose on avatars without native
  // animations (doc: fix-tpose-universal-anims-preload-2026-04-20).
  // Non-blocking: bootstrap continues immediately.
  // Dynamic import: el preloader importa `three-stdlib` (GLTFLoader) que
  // arrastra ~925 KB de vendor-three. Aislarlo en su chunk evita preload
  // al boot — solo se descarga cuando el avatar real lo necesita.
  void import('@/core/infrastructure/r3f/avatar3d/universalAnimationsPreloader')
    .then((m) => m.preloadUniversalAnimations())
    .catch((err) => {
      log.warn('Universal animations preload failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return { avatarConfig, avatar3DConfig };
}
