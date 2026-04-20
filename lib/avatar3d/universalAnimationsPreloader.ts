/**
 * @module lib/avatar3d/universalAnimationsPreloader
 * @description Module-level cache + boot-time preloader for the universal
 * animation GLBs shared across all avatars without native animations.
 *
 * Clean Architecture: Infrastructure (pure, no React, no DOM).
 *
 * Rationale:
 * Each Chxx_nonPBR avatar has `n_anims = 0` in DB and falls back to the 12
 * `avatar_animaciones` rows marked `es_universal = true`. Without preload,
 * the 12 GLBs (~400KB-1MB each) are fetched lazily the first time an avatar
 * mounts. The 460-851ms ventana opens a race window where the GLTFAvatarInner
 * useEffect can be cancelled by a remount before `setLoadedAnimClips` fires
 * → empty clips map → AnimationMixer has zero actions → bind pose (T-pose).
 *
 * Preloading at boot warms this cache so the per-avatar load resolves in
 * ~1-5ms (cache hit) instead of 500-800ms, closing the race window.
 *
 * Official docs alignment:
 * - R3F — Loading Models: "Preload models with useGLTF.preload"
 *   https://r3f.docs.pmnd.rs/tutorials/loading-models
 *   (We use a plain GLTFLoader here because the clip list is extracted
 *    imperatively outside of R3F's Suspense tree — drei's useGLTF works only
 *    inside a Canvas. The caching pattern is equivalent: single module-level
 *    Promise per URL, subsequent callers reuse the resolved value.)
 * - Three.js — AnimationMixer: "one AnimationMixer may be used for each
 *   object... the same AnimationClip can be reused across multiple mixers"
 *   https://threejs.org/docs/pages/AnimationMixer.html
 *   So we cache the *raw* AnimationClip[], and each GLTFAvatar remaps them
 *   against its own skeleton (cheap, synchronous).
 * - Discover Three.js — Animation System: "clips can be shared across
 *   compatible models that have the same internal structure"
 *   https://discoverthreejs.com/book/first-steps/animation-system/
 */

import type * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const log = logger.child('universal-anims-preloader');

export interface UniversalAnimationRow {
  id: string;
  nombre: string;
  url: string;
  loop: boolean;
  orden: number;
  strip_root_motion: boolean;
}

// ─── Module-level caches ─────────────────────────────────────────────────
// Shared across ALL GLTFAvatar instances and the bootstrap preloader.
// Map semantics: once set, always resolved (failed loads are removed so
// callers can retry).

const rawClipsCache = new Map<string, Promise<THREE.AnimationClip[]>>();
const sharedLoader = new GLTFLoader();
let universalListPromise: Promise<UniversalAnimationRow[]> | null = null;

// ─── API ─────────────────────────────────────────────────────────────────

/**
 * Fetch the list of universal animations from Supabase.
 * Module-level cached Promise — subsequent calls return the same Promise.
 */
export function getUniversalAnimationsList(): Promise<UniversalAnimationRow[]> {
  if (universalListPromise) return universalListPromise;
  universalListPromise = (async () => {
    const { data, error } = await supabase
      .from('avatar_animaciones')
      .select('id, nombre, url, loop, orden, strip_root_motion')
      .eq('es_universal', true)
      .eq('activo', true)
      .order('orden', { ascending: true });
    if (error) {
      log.warn('Failed to fetch universal animations list', { error: error.message });
      universalListPromise = null; // Allow retry on failure.
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      nombre: row.nombre as string,
      url: row.url as string,
      loop: (row.loop as boolean) ?? false,
      orden: (row.orden as number) ?? 0,
      strip_root_motion: (row.strip_root_motion as boolean) ?? false,
    }));
  })();
  return universalListPromise;
}

/**
 * Load (or return cached) raw AnimationClip[] for a GLB URL.
 * Used both by the preloader and by GLTFAvatar's loadAnimations useEffect —
 * they share the same cache instance.
 *
 * Note: the returned clips are RAW (no remap). Each GLTFAvatar remaps them
 * against its own skeleton via `remapAnimationTracks`.
 */
export function getCachedRawClips(url: string): Promise<THREE.AnimationClip[]> {
  const existing = rawClipsCache.get(url);
  if (existing) return existing;

  const pending = sharedLoader
    .loadAsync(url)
    .then((gltf) => gltf.animations ?? [])
    .catch((err) => {
      // Remove from cache so future callers can retry. Do not swallow — rethrow
      // so the caller can decide whether to log or degrade.
      rawClipsCache.delete(url);
      throw err;
    });

  rawClipsCache.set(url, pending);
  return pending;
}

/**
 * Kick off parallel preload of all universal animation GLBs.
 * Non-blocking: the promises populate the cache as they complete.
 *
 * Call once at app boot (e.g. in bootstrap orchestrator). Subsequent calls
 * are no-ops because the caches are already populated.
 */
export async function preloadUniversalAnimations(): Promise<void> {
  const list = await getUniversalAnimationsList();
  if (list.length === 0) {
    log.info('No universal animations to preload');
    return;
  }
  // Fire all loads in parallel. Swallow individual errors here — they are
  // already logged by getCachedRawClips; the preload is best-effort and the
  // per-avatar flow has its own fallback to Supabase.
  for (const anim of list) {
    getCachedRawClips(anim.url).catch(() => {
      /* logged inside */
    });
  }
  log.info('Universal animations preload started', { count: list.length });
}
