'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils, GLTFLoader } from 'three-stdlib';
import { supabase } from '@/lib/supabase';
import { collectBoneData, remapAnimationTracks } from './rigUtils';
import {
  DEFAULT_MODEL_URL,
  EMBEDDED_NAME_MAP,
  LOOP_ANIMATIONS,
  resolveAvatarModelUrl,
  resolveAvatarTextureUrl,
  type AvatarAssetQuality,
  type AnimationState,
  type Avatar3DConfig,
} from './shared';
import { ALTURA_AVATAR_ESTANDAR } from '../space3d/shared';

export interface GLTFAvatarProps {
  avatarConfig?: Avatar3DConfig | null;
  animationState?: AnimationState;
  direction?: string;
  skinColor?: string;
  clothingColor?: string;
  scale?: number;
  onHeightComputed?: (height: number) => void;
  onMetricasAvatarComputadas?: (metricas: { altura: number; alturaCadera: number; alturaCaderaSentada?: number }) => void;
  isSitting?: boolean;
  sitRotation?: number;
  assetQuality?: AvatarAssetQuality;
}

useGLTF.setDecoderPath('/draco/');

const animationAssetCache = new Map<string, Promise<THREE.AnimationClip[]>>();
const textureAssetCache = new Map<string, Promise<THREE.Texture>>();
const ENABLE_SIT_DEBUG = false;

function loadAnimationAsset(url: string, loader: GLTFLoader): Promise<THREE.AnimationClip[]> {
  const cached = animationAssetCache.get(url);
  if (cached) return cached;

  const pending = loader.loadAsync(url).then((gltf) => gltf.animations);
  animationAssetCache.set(url, pending);
  return pending;
}

function loadTextureAsset(url: string, loader: THREE.TextureLoader): Promise<THREE.Texture> {
  const cached = textureAssetCache.get(url);
  if (cached) return cached;

  const pending = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      (error) => {
        textureAssetCache.delete(url);
        reject(error);
      }
    );
  });

  textureAssetCache.set(url, pending);
  return pending;
}

const GLTFAvatarInner: React.FC<GLTFAvatarProps> = ({
  avatarConfig,
  animationState = 'idle',
  direction = 'front',
  skinColor,
  clothingColor,
  scale = 1,
  onHeightComputed,
  onMetricasAvatarComputadas,
  isSitting = false,
  sitRotation = 0,
  assetQuality = 'high',
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [currentAnimation, setCurrentAnimation] = useState<AnimationState>('idle');
  const [externalTexture, setExternalTexture] = useState<THREE.Texture | null>(null);
  const [loadedAnimClips, setLoadedAnimClips] = useState<Record<string, THREE.AnimationClip>>({});
  const animConfigRef = useRef('');
  const currentAvatarIdRef = useRef('');
  const heightComputedRef = useRef(false);
  const frameCountRef = useRef(0);
  const hipsBoneRef = useRef<THREE.Bone | null>(null);
  const lastReportedSitHipY = useRef<number>(-1);
  const sitMeasureFrames = useRef(0);
  const [heightCorrection, setHeightCorrection] = useState(1);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const pendingAnimRef = useRef<{ anim: AnimationState; timer: ReturnType<typeof setTimeout> } | null>(null);
  const targetQuaternion = useRef(new THREE.Quaternion());
  const textureLoadErrorLogRef = useRef<Record<string, true>>({});
  const lowMatchDiscardLogRef = useRef<Record<string, true>>({});
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const avatarHeightRef = useRef(ALTURA_AVATAR_ESTANDAR);
  const avatarHipHeightRef = useRef(ALTURA_AVATAR_ESTANDAR * 0.53);

  const modelUrl = resolveAvatarModelUrl(avatarConfig, assetQuality);
  const { scene, animations: baseAnimations } = useGLTF(modelUrl);

  useEffect(() => {
    useGLTF.preload(modelUrl);
  }, [modelUrl]);

  const clone = useMemo(() => {
    // ALWAYS use SkeletonUtils.clone() — it shares geometries by reference.
    // scene.clone(true) deep-clones BufferGeometry objects, duplicating GPU buffers.
    // With 1 avatar this caused 1,479 geometries; SkeletonUtils.clone() reduces ~200-400.
    // Ref: Three.js SkeletonUtils docs — "Other data, like geometries and materials,
    //       are reused by reference"
    // https://threejs.org/docs/pages/module-SkeletonUtils.html
    const clonedScene = SkeletonUtils.clone(scene);

    clonedScene.traverse((child: any) => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((material: any) => material.clone())
          : child.material.clone();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material: any) => {
          if (material.vertexColors) {
            material.vertexColors = false;
          }
          if (material.map) {
            material.map.needsUpdate = true;
            material.color = new THREE.Color(0xffffff);
          }
          if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
            material.metalness = 0.0;
            material.roughness = 1.0;
            material.envMapIntensity = 0.0;
            if (material.emissiveMap || material.emissive.getHex() !== 0x000000) {
              material.emissive = new THREE.Color(0x000000);
              material.emissiveIntensity = 0;
            }
          }
          // OPTIMIZACIÓN GPU: Eliminar overdraw masivo cuando la cámara está muy cerca
          // La transparencia tradicional (alpha blending) ignora el early-Z culling.
          // Cambiamos a Alpha Clipping (alphaTest) que es 10x más rápido.
          if (material.transparent) {
            material.transparent = false;
            material.alphaTest = 0.5;
            material.depthWrite = true;
          }
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        });
        // Desactivar costosas sombras locales para mejorar el FPS al hacer zoom-in extremo
        child.castShadow = true; 
        child.receiveShadow = false; 
      }
    });

    return clonedScene;
  }, [scene, avatarConfig?.nombre]);

  // Dispose cloned materials on unmount to prevent GPU memory leak.
  // Geometries are shared by reference (SkeletonUtils.clone) — do NOT dispose them.
  // Only materials were cloned (line ~128), so we dispose those.
  // Ref: Three.js — "dispose geometry and material via dispose()"
  useEffect(() => {
    return () => {
      clone.traverse((child: any) => {
        if ((child.isMesh || child.isSkinnedMesh) && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: THREE.Material) => {
            // Dispose textures attached to the material
            if ('map' in mat && (mat as any).map) (mat as any).map.dispose();
            if ('normalMap' in mat && (mat as any).normalMap) (mat as any).normalMap.dispose();
            mat.dispose();
          });
        }
      });
    };
  }, [clone]);

  // modelYOffset siempre 0 — la corrección se hace vía heightCorrection
  const modelYOffset = 0;

  const { boneNames, spineChainMap } = useMemo(
    () => collectBoneData(clone, avatarConfig?.nombre),
    [clone, avatarConfig?.nombre]
  );

  useFrame(() => {
    if (heightComputedRef.current || !groupRef.current || (!onHeightComputed && !onMetricasAvatarComputadas)) return;
    frameCountRef.current += 1;
    if (frameCountRef.current < 5) return;

    let targetBone: THREE.Bone | null = null;
    let hipsBone: THREE.Bone | null = null;
    let fallbackBoneY = 0;

    clone.traverse((child: any) => {
      if (child.isBone) {
        const name = child.name.toLowerCase();
        if (name.includes('headtop_end')) {
          targetBone = child;
        } else if (!targetBone && name.includes('head')) {
          targetBone = child;
        }
        if (!hipsBone && (name.includes('hips') || name.includes('pelvis') || name.includes('root_hips'))) {
          hipsBone = child;
          hipsBoneRef.current = child;
        }
        const pos = new THREE.Vector3();
        child.getWorldPosition(pos);
        if (pos.y > fallbackBoneY) fallbackBoneY = pos.y;
      }
    });

    const rootPos = new THREE.Vector3();
    groupRef.current.getWorldPosition(rootPos);
    let worldHeight = 0;
    let worldHipHeight = 0;

    if (targetBone) {
      const bonePos = new THREE.Vector3();
      targetBone.getWorldPosition(bonePos);
      worldHeight = bonePos.y - rootPos.y;
    } else {
      const box = new THREE.Box3().setFromObject(clone);
      worldHeight = box.max.y - box.min.y;
      if (worldHeight < 0.1 && fallbackBoneY > 0) {
        worldHeight = fallbackBoneY - rootPos.y;
      }
    }

    if (hipsBone) {
      const hipsPos = new THREE.Vector3();
      hipsBone.getWorldPosition(hipsPos);
      worldHipHeight = Math.max(0, hipsPos.y - rootPos.y);
    }

    if (worldHeight > 0.1) {
      heightComputedRef.current = true;
      const correction = ALTURA_AVATAR_ESTANDAR / worldHeight;
      if (Math.abs(correction - 1) > 0.05) {
        setHeightCorrection(correction);
      }
      const escalaFinal = correction * (avatarConfig?.escala || 1) * scale;
      const alturaFinal = worldHeight * escalaFinal;
      const alturaCaderaFinal = Math.max(worldHipHeight, worldHeight * 0.5) * escalaFinal;
      onHeightComputed?.(alturaFinal);
      avatarHeightRef.current = alturaFinal;
      avatarHipHeightRef.current = alturaCaderaFinal;
      onMetricasAvatarComputadas?.({
        altura: alturaFinal,
        alturaCadera: alturaCaderaFinal,
      });
    }
  });

  useEffect(() => {
    const textureUrl = resolveAvatarTextureUrl(avatarConfig, assetQuality);
    if (!textureUrl) {
      setExternalTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loadTextureAsset(textureUrl, loader)
      .then((texture) => {
        if (!cancelled) {
          setExternalTexture(texture);
        }
      })
      .catch(() => {
        if (!textureLoadErrorLogRef.current[textureUrl]) {
          console.warn('⚠️ Error cargando textura:', textureUrl);
          textureLoadErrorLogRef.current[textureUrl] = true;
        }
        if (!cancelled) {
          setExternalTexture(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [avatarConfig, assetQuality]);

  useEffect(() => {
    if (!externalTexture) return;
    clone.traverse((child: any) => {
      if (child.isMesh || child.isSkinnedMesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        if (!material) return;
        material.map = externalTexture;
        material.metalness = 0;
        material.roughness = 1.0;
        material.side = THREE.DoubleSide;
        if (material.transparent) {
          material.transparent = false;
          material.alphaTest = 0.5;
          material.depthWrite = true;
        }
        material.needsUpdate = true;
      }
    });
  }, [clone, externalTexture]);

  useEffect(() => {
    const newId = avatarConfig?.id || '_default_';
    if (newId !== currentAvatarIdRef.current) {
      currentAvatarIdRef.current = '';
      animConfigRef.current = '';
      setLoadedAnimClips({});
      heightComputedRef.current = false;
      frameCountRef.current = 0;
    }
  }, [avatarConfig?.id]);

  useEffect(() => {
    currentAvatarIdRef.current = '';
    animConfigRef.current = '';
    setLoadedAnimClips({});
    heightComputedRef.current = false;
    frameCountRef.current = 0;
  }, [modelUrl]);

  useEffect(() => {
    if (boneNames.size === 0) return;
    const avatarId = avatarConfig?.id;
    if (avatarId === 'default') return;

    const cacheKey = avatarId || '_default_';
    if (cacheKey === currentAvatarIdRef.current) return;

    if (baseAnimations.length > 1) {
      currentAvatarIdRef.current = cacheKey;
      setLoadedAnimClips({});
      return;
    }

    let cancelled = false;

    const loadAnimations = async () => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let animaciones = avatarConfig?.animaciones;
      let isCrossSkeleton = false;

      if (animaciones && animaciones.length > 0 && (animaciones as any[])[0]?.es_fallback) {
        isCrossSkeleton = true;
      }

      if (!animaciones || animaciones.length === 0) {
        let anims: any[] | null = null;

        if (avatarId) {
          const { data } = await supabase
            .from('avatar_animaciones')
            .select('id, nombre, url, loop, orden, strip_root_motion')
            .eq('avatar_id', avatarId)
            .eq('activo', true)
            .order('orden', { ascending: true });
          anims = data;
        }

        if (!anims || anims.length === 0) {
          const { data: universalAnims } = await supabase
            .from('avatar_animaciones')
            .select('id, nombre, url, loop, orden, strip_root_motion')
            .eq('es_universal', true)
            .eq('activo', true)
            .order('orden', { ascending: true });
          if (universalAnims && universalAnims.length > 0) {
            anims = universalAnims;
            isCrossSkeleton = true;
          }
        }

        if (!anims || anims.length === 0) return;
        animaciones = anims.map((anim: any) => ({
          id: anim.id,
          nombre: anim.nombre,
          url: anim.url,
          loop: anim.loop ?? false,
          orden: anim.orden ?? 0,
          strip_root_motion: anim.strip_root_motion ?? false,
        }));
      }

      const configKey = animaciones.map((anim) => anim.url).join('|');
      if (configKey === animConfigRef.current) return;
      animConfigRef.current = configKey;
      currentAvatarIdRef.current = cacheKey;

      const loader = new GLTFLoader();
      const results = await Promise.all(
        animaciones.map(async (anim) => {
          try {
            const clipsForUrl = await loadAnimationAsset(anim.url, loader);
            return {
              nombre: anim.nombre,
              clips: clipsForUrl,
              strip: anim.strip_root_motion ?? false,
              isUniversal: isCrossSkeleton,
            };
          } catch (err) {
            if (!textureLoadErrorLogRef.current[anim.url]) {
              console.warn(`❌ Error loading ${anim.nombre}:`, err);
              textureLoadErrorLogRef.current[anim.url] = true;
            }
            return null;
          }
        })
      );

      if (cancelled || currentAvatarIdRef.current !== cacheKey) return;

      const clips: Record<string, THREE.AnimationClip> = {};
      results.forEach((result) => {
        if (result && result.clips.length > 0) {
          const clip = remapAnimationTracks(
            result.clips[0],
            boneNames,
            result.strip,
            spineChainMap,
            result.isUniversal,
            result.isUniversal
          );
          const matchRate = (clip as any)._matchRate ?? 0;
          if (matchRate < 0.3 && result.clips[0].tracks.length > 0) {
            if (!lowMatchDiscardLogRef.current[result.nombre]) {
              console.warn(`⚠️ ${result.nombre}: solo ${Math.round(matchRate * 100)}% tracks matched — descartada`);
              lowMatchDiscardLogRef.current[result.nombre] = true;
            }
            return;
          }
          clip.name = result.nombre;
          clips[result.nombre] = clip;
        }
      });

      if (cancelled || currentAvatarIdRef.current !== cacheKey) return;
      setLoadedAnimClips(clips);

      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = Math.max(0, Math.round(endedAt - startedAt));
      console.log(`[Avatar3D] Animations ready in ${elapsed}ms for ${avatarConfig?.nombre || cacheKey}`);
    };

    loadAnimations();

    return () => {
      cancelled = true;
    };
  }, [avatarConfig?.id, avatarConfig?.animaciones, avatarConfig?.nombre, boneNames, baseAnimations, spineChainMap]);

  const allAnimations = useMemo(() => {
    const animations: THREE.AnimationClip[] = [];

    if (baseAnimations.length > 1 && Object.keys(loadedAnimClips).length === 0) {
      const used = new Set<AnimationState>();
      baseAnimations.forEach((clip, idx) => {
        const lower = clip.name.toLowerCase().trim();
        let state: AnimationState | undefined = EMBEDDED_NAME_MAP[lower];
        if (!state) {
          for (const [key, value] of Object.entries(EMBEDDED_NAME_MAP)) {
            if (lower.includes(key)) {
              state = value as AnimationState;
              break;
            }
          }
        }
        if (!state && idx === 0) state = 'idle';
        if (!state || used.has(state)) return;
        used.add(state);
        const stripRootMotion = state === 'walk' || state === 'run';
        const remapped = remapAnimationTracks(clip, boneNames, stripRootMotion, spineChainMap, false, true);
        remapped.name = state;
        animations.push(remapped);
      });
      return animations;
    }

    if (loadedAnimClips.idle) {
      animations.push(loadedAnimClips.idle);
    } else if (baseAnimations.length > 0) {
      const clip = remapAnimationTracks(baseAnimations[0], boneNames, false, spineChainMap);
      clip.name = 'idle';
      animations.push(clip);
    }

    Object.entries(loadedAnimClips).forEach(([name, clip]) => {
      if (name !== 'idle') animations.push(clip);
    });

    return animations;
  }, [baseAnimations, boneNames, loadedAnimClips, spineChainMap]);

  useEffect(() => {
    if (!groupRef.current) return;
    const mixer = new THREE.AnimationMixer(groupRef.current);
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      if (groupRef.current) mixer.uncacheRoot(groupRef.current);
      mixerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mixer = mixerRef.current;
    const root = groupRef.current;
    if (!mixer || !root || allAnimations.length === 0) return;

    mixer.stopAllAction();
    Object.values(actionsRef.current).forEach((action) => {
      mixer.uncacheAction(action.getClip(), root);
    });

    const newActions: Record<string, THREE.AnimationAction> = {};
    allAnimations.forEach((clip) => {
      newActions[clip.name] = mixer.clipAction(clip, root);
    });
    actionsRef.current = newActions;

    if (newActions.idle) {
      newActions.idle.reset().fadeIn(0.2).play();
    }
    setCurrentAnimation('idle');
  }, [allAnimations]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  useEffect(() => {
    const actions = actionsRef.current;
    if (Object.keys(actions).length === 0) return;

    const targetAnim = animationState;
    if (currentAnimation === targetAnim) {
      if (pendingAnimRef.current) {
        clearTimeout(pendingAnimRef.current.timer);
        pendingAnimRef.current = null;
      }
      return;
    }

    const animationFallbacks: Record<string, string[]> = {
      cheer: ['wave', 'dance', 'victory', 'idle'],
      wave: ['cheer', 'idle'],
      victory: ['cheer', 'wave', 'idle'],
      jump: ['cheer', 'idle'],
      dance: ['idle'],
      sit: ['sitting_idle', 'sitting', 'idle'],
      sit_down: ['sit', 'sitting_idle', 'idle'],
      stand_up: ['getting_up', 'rise', 'idle'],
      walk: ['idle'],
      run: ['walk', 'idle'],
    };

    const resolveAnim = (anim: string): string => {
      if (actions[anim]) return anim;
      const fallbacks = animationFallbacks[anim] || ['idle'];
      for (const fallback of fallbacks) {
        if (actions[fallback]) return fallback;
      }
      return currentAnimation;
    };

    const resolvedAnim = resolveAnim(targetAnim) as AnimationState;
    const CROSSFADE_FAST = 0.15;
    const CROSSFADE_SMOOTH = 0.3;
    const CROSSFADE_SIT_DOWN = 0.5;
    const CROSSFADE_STAND_UP = 0.4;
    const CROSSFADE_SIT_SETTLE = 0.6;
    const IDLE_DEBOUNCE_MS = 100;

    const applyTransition = (fadeDuration: number) => {
      pendingAnimRef.current = null;
      const current = actions[currentAnimation];
      if (current) current.fadeOut(fadeDuration);
      const next = actions[resolvedAnim];
      if (next) {
        next.reset();
        next.setLoop(
          LOOP_ANIMATIONS.includes(resolvedAnim) ? THREE.LoopRepeat : THREE.LoopOnce,
          LOOP_ANIMATIONS.includes(resolvedAnim) ? Infinity : 1
        );
        next.clampWhenFinished = !LOOP_ANIMATIONS.includes(resolvedAnim);
        next.fadeIn(fadeDuration).play();
        setCurrentAnimation(resolvedAnim);
      }
    };

    if (pendingAnimRef.current) {
      clearTimeout(pendingAnimRef.current.timer);
      pendingAnimRef.current = null;
    }

    const isReturningToIdle = targetAnim === 'idle' && (currentAnimation === 'walk' || currentAnimation === 'run');

    if (isReturningToIdle) {
      pendingAnimRef.current = {
        anim: targetAnim,
        timer: setTimeout(() => applyTransition(CROSSFADE_SMOOTH), IDLE_DEBOUNCE_MS),
      };
    } else {
      const isStartingMovement = (targetAnim === 'walk' || targetAnim === 'run') && currentAnimation === 'idle';
      const isSitDown = targetAnim === 'sit_down';
      const isSettlingIntoSit = targetAnim === 'sit' && currentAnimation === 'sit_down';
      const isStandingUp = targetAnim === 'stand_up';
      const fadeDuration = isSitDown
        ? CROSSFADE_SIT_DOWN
        : isSettlingIntoSit
          ? CROSSFADE_SIT_SETTLE
          : isStandingUp
            ? CROSSFADE_STAND_UP
            : isStartingMovement
              ? CROSSFADE_FAST
              : CROSSFADE_SMOOTH;
      applyTransition(fadeDuration);
    }

    return () => {
      if (pendingAnimRef.current) {
        clearTimeout(pendingAnimRef.current.timer);
        pendingAnimRef.current = null;
      }
    };
  }, [animationState, currentAnimation, allAnimations]);

  useEffect(() => {
    if (!clone || (!skinColor && !clothingColor)) return;
    clone.traverse((child: any) => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        const material = child.material as THREE.MeshStandardMaterial;
        const meshName = child.name.toLowerCase();
        if (skinColor && (meshName.includes('skin') || meshName.includes('head') || meshName.includes('face'))) {
          material.color = new THREE.Color(skinColor);
          material.needsUpdate = true;
        }
        if (clothingColor && (meshName.includes('body') || meshName.includes('cloth') || meshName.includes('shirt'))) {
          material.color = new THREE.Color(clothingColor);
          material.needsUpdate = true;
        }
      }
    });
  }, [clone, skinColor, clothingColor]);

  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const rotationMap = useMemo<Record<string, number>>(() => ({
    left: -Math.PI / 2,
    right: Math.PI / 2,
    up: Math.PI,
    back: Math.PI,
    front: 0,
    down: 0,
    'front-left': -Math.PI / 4,
    'front-right': Math.PI / 4,
    'up-left': -Math.PI * 3 / 4,
    'up-right': Math.PI * 3 / 4,
  }), []);

  useFrame(() => {
    if (!groupRef.current || !hipsBoneRef.current) return;
    if (isSitting) {
      sitMeasureFrames.current += 1;
      if (ENABLE_SIT_DEBUG && sitMeasureFrames.current % 120 === 0) {
        console.log('[SIT_DEBUG][avatar] state_check', {
          animState: animationState, isSitting, frame: sitMeasureFrames.current,
        });
      }
      if (sitMeasureFrames.current >= 5) {
        const hipsPos = new THREE.Vector3();
        const rootPos = new THREE.Vector3();
        hipsBoneRef.current.getWorldPosition(hipsPos);
        groupRef.current.getWorldPosition(rootPos);
        const localHipY = Math.max(0.05, hipsPos.y - rootPos.y);
        const delta = Math.abs(localHipY - lastReportedSitHipY.current);
        if (ENABLE_SIT_DEBUG && (delta > 0.02 || lastReportedSitHipY.current < 0)) {
          lastReportedSitHipY.current = localHipY;
          console.log('[SIT_DEBUG][avatar] pelvis_medida', {
            localHipY: Number(localHipY.toFixed(4)),
            animState: animationState,
            frame: sitMeasureFrames.current,
          });
        }
        // Enviar a Player3D UNA SOLA VEZ cuando la pose se estabiliza
        const esPoseSentada = animationState === 'sit' || animationState === 'sit_down';
        const framesMinimos = animationState === 'sit' ? 10 : 5;
        if (esPoseSentada && sitMeasureFrames.current >= framesMinimos && lastReportedSitHipY.current < 0) {
          lastReportedSitHipY.current = localHipY;
          onMetricasAvatarComputadas?.({
            altura: avatarHeightRef.current,
            alturaCadera: avatarHipHeightRef.current,
            alturaCaderaSentada: localHipY,
          });
        }
      }
    } else {
      if (lastReportedSitHipY.current > 0) {
        lastReportedSitHipY.current = -1;
      }
      sitMeasureFrames.current = 0;
    }
  });

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Use animationState (not isSitting) to decide seat rotation — eliminates
    // the 1-3 frame race condition where isSitting lags behind due to double
    // setState batching (setSeatRuntime → setContextualAnim → setIsSitting).
    const isSeatAnim = animationState === 'sit' || animationState === 'sit_down';
    if (ENABLE_SIT_DEBUG && isSeatAnim && !isSitting) {
      console.warn('[SIT_DEBUG][rotation] animState is seat but isSitting=false — race condition bridged', {
        animationState, isSitting, sitRotation: Number(sitRotation.toFixed(3)),
      });
    }
    if (isSitting || isSeatAnim) {
      // Rotate toward the chair's forward direction.
      // During sit_down approach, slerp smoothly so the character turns naturally.
      // Once fully seated (animationState === 'sit'), snap instantly to avoid drift.
      targetQuaternion.current.setFromAxisAngle(yAxis, sitRotation);
      if (animationState === 'sit_down') {
        const seatSlerpFactor = 1 - Math.pow(1 - 0.35, delta * 60);
        groupRef.current.quaternion.slerp(targetQuaternion.current, seatSlerpFactor);
      } else {
        groupRef.current.quaternion.copy(targetQuaternion.current);
      }
      return;
    }
    const targetAngle = rotationMap[direction] ?? 0;
    targetQuaternion.current.setFromAxisAngle(yAxis, targetAngle);
    const lerpFactor = 1 - Math.pow(1 - 0.25, delta * 60);
    groupRef.current.quaternion.slerp(targetQuaternion.current, lerpFactor);
  });

  // Escala final = escala BD × escala prop × corrección de altura (Height Matcher)
  const avatarScale = (avatarConfig?.escala || 1) * scale * heightCorrection;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group scale={[avatarScale, avatarScale, avatarScale]} position={[0, modelYOffset * avatarScale, 0]}>
        <primitive object={clone} />
      </group>
      {/* Sombra proyectada */}
      {!isSitting && null}
    </group>
  );
};

interface AvatarErrorBoundaryProps {
  fallbackConfig: Avatar3DConfig;
  children: React.ReactNode;
  avatarProps: GLTFAvatarProps;
}

interface AvatarErrorBoundaryState {
  hasError: boolean;
}

class AvatarErrorBoundary extends React.Component<AvatarErrorBoundaryProps, AvatarErrorBoundaryState> {
  constructor(props: AvatarErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error('🚨 GLTFAvatar crash. Usando avatar fallback.', error?.message || error);
  }

  render() {
    if (this.state.hasError) {
      const { avatarProps, fallbackConfig } = this.props;
      return <GLTFAvatarInner {...avatarProps} avatarConfig={fallbackConfig} />;
    }
    return this.props.children;
  }
}

export const GLTFAvatar: React.FC<GLTFAvatarProps> = (props) => {
  const fallbackConfig: Avatar3DConfig = {
    id: 'default',
    nombre: 'Default',
    modelo_url: DEFAULT_MODEL_URL,
    escala: 1,
  };

  return (
    <AvatarErrorBoundary fallbackConfig={fallbackConfig} avatarProps={props}>
      <GLTFAvatarInner key={props.avatarConfig?.modelo_url || 'default'} {...props} />
    </AvatarErrorBoundary>
  );
};

useGLTF.preload(DEFAULT_MODEL_URL);
