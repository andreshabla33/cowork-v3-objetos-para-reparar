'use client';
/**
 * @module space3d/scene/Avatar
 *
 * Componente individual del avatar 3D — renderiza el modelo (GLTF / sprite
 * según LOD), la burbuja de video, mensaje de chat, reaction y el menú
 * radial de acciones para avatares remotos. Extraído de `Avatar3DScene.tsx`
 * (ITEM 15 P1-07).
 *
 * Clean Architecture — Presentation. Consume `useStore` para `avatar3DConfig`
 * + `isEditMode`, y settings de video/perf vía `getSettingsSection`. La capa
 * de rendering masivo (instancing, LOD bucketing) vive en `RemoteUsers`.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '@/modules/avatar3d/presentation/GLTFAvatar';
import type { AnimationState, AvatarAssetQuality, Avatar3DConfig } from '@/modules/avatar3d/presentation/shared';
import { resolveAvatarModelUrl, DEFAULT_MODEL_URL } from '@/modules/avatar3d/presentation/shared';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { getSettingsSection } from '@/core/infrastructure/userSettings/userSettings';
import { AvatarLodLevel } from './shared';
import type { LocalVideoTrack } from 'livekit-client';
import { statusColors } from './spaceTypes';
import { StableVideo } from './Overlays';
import { VideoWithBackground } from '@/modules/realtime-room/presentation/VideoWithBackground';
import type { EffectType } from '@/src/core/domain/ports/IVideoTrackProcessor';
import {
  hitTestCylinderCurrentUser,
  hitTestCylinderRemote,
} from '@/modules/space3d/presentation/world/sharedGeometries';

/**
 * Fallback Avatar3DConfig for remote users whose avatar3DConfig is null/undefined.
 * Ensures GLTFAvatar always receives a valid config object — prevents shader errors
 * when the presence payload omits avatar data (e.g. cross-company users before fix,
 * or network-level payload truncation).
 */
export const FALLBACK_AVATAR_3D_CONFIG: Avatar3DConfig = {
  id: 'default',
  nombre: 'Default',
  modelo_url: DEFAULT_MODEL_URL,
  escala: 1,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export const obtenerZonaActivaEmpresa = (zonasEmpresa: ZonaEmpresa[] = [], empresaId?: string | null) => {
  if (!empresaId) return null;
  return zonasEmpresa.find((zona) => zona.empresa_id === empresaId && zona.estado === 'activa') || null;
};

export const limitarPosicionAZonaEmpresa = (
  x: number, z: number, empresaId?: string | null, zonasEmpresa: ZonaEmpresa[] = []
) => {
  const zonaPropia = obtenerZonaActivaEmpresa(zonasEmpresa, empresaId);
  if (!zonaPropia) return { x, z };
  const centroX = Number(zonaPropia.posicion_x) / 16;
  const centroZ = Number(zonaPropia.posicion_y) / 16;
  const halfW = Math.max((Number(zonaPropia.ancho) / 16) / 2, 0.35);
  const halfH = Math.max((Number(zonaPropia.alto) / 16) / 2, 0.35);
  const padding = 0.35;
  return {
    x: THREE.MathUtils.clamp(x, centroX - Math.max(halfW - padding, 0.1), centroX + Math.max(halfW - padding, 0.1)),
    z: THREE.MathUtils.clamp(z, centroZ - Math.max(halfH - padding, 0.1), centroZ + Math.max(halfH - padding, 0.1)),
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AVATAR (Componente individual) ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export interface AvatarProps {
  position: THREE.Vector3;
  config: any;
  name: string;
  status: PresenceStatus;
  isCurrentUser?: boolean;
  animationState?: AnimationState;
  direction?: string;
  isSitting?: boolean;
  sitPosition?: THREE.Vector3;
  sitRotation?: number;
  sitTransitionDurationMs?: number;
  seatForwardRotation?: number;
  reaction?: string | null;
  videoStream?: MediaStream | null;
  /**
   * `LocalVideoTrack` wrapper del usuario actual con el processor aplicado
   * (blur / virtual background). Solo se pasa para `isCurrentUser=true`.
   * Cuando está disponible, la burbuja local renderiza via `track.attach()`
   * del SDK de LiveKit → muestra el `processedTrack`. Los avatares remotos
   * NO usan esto: siguen con `videoStream` crudo porque el processor ya
   * fue aplicado en el lado del emisor antes de publicar.
   */
  localVideoTrack?: LocalVideoTrack | null;
  /** Tipo de efecto activo (para clases CSS / debug; el procesamiento lo
   * hace el SDK en el track). Solo aplica a `isCurrentUser`. */
  effectType?: EffectType;
  videoIsProcessed?: boolean;
  camOn?: boolean;
  showVideoBubble?: boolean;
  message?: string | null;
  onClickAvatar?: () => void;
  onClickRemoteAvatar?: (userId: string) => void;
  userId?: string;
  mirrorVideo?: boolean;
  hideSelfView?: boolean;
  showName?: boolean;
  lodLevel?: AvatarLodLevel;
  esFantasma?: boolean;
  remoteAvatar3DConfig?: any;
  onAvatarHeightComputed?: (height: number) => void;
  onMetricasAvatarComputadas?: (metricas: { altura: number; alturaCadera: number; alturaCaderaSentada?: number }) => void;
  /**
   * When true, the 3D mesh is rendered by InstancedAvatarRenderer (GPU instancing).
   * This Avatar component only renders overlays (video, chat, name, reaction, radial).
   * The invisible hit-test cylinder is still rendered for interaction.
   */
  useInstancedMesh?: boolean;
  castShadow?: boolean;
  avatarInteractions?: {
    onGoTo?: (userId: string) => void;
    onNudge?: (userId: string) => void;
    onInvite?: (userId: string) => void;
    onFollow?: (userId: string) => void;
    onWave?: (userId: string) => void;
    followTargetId?: string | null;
    profilePhoto?: string | null;
  };
}

export const Avatar: React.FC<AvatarProps> = ({
  position, config, name, status, isCurrentUser,
  animationState = 'idle', direction,
  isSitting = false, seatForwardRotation = 0,
  reaction, videoStream, localVideoTrack, effectType = 'none', videoIsProcessed = false,
  camOn, showVideoBubble = true, message,
  onClickAvatar, onClickRemoteAvatar, userId,
  mirrorVideo: mirrorVideoProp, hideSelfView: hideSelfViewProp,
  showName: _showNameProp, lodLevel: lodLevelProp,
  esFantasma = false, remoteAvatar3DConfig,
  onAvatarHeightComputed, onMetricasAvatarComputadas,
  avatarInteractions, useInstancedMesh = false, castShadow = true
}) => {
  const [showRadialWheel, setShowRadialWheel] = useState(false);
  const [avatarHeight, setAvatarHeight] = useState(2.0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef(0);
  const clickPreventedRef = useRef(false);
  const avatar3DConfig = useStore(s => s.avatar3DConfig);
  // Cuando el admin está en modo edición, el avatar propio NO debe capturar
  // clicks: si lo hace, bloquea la selección/movimiento de objetos detrás de
  // él (caso reportado: monitor cerca del avatar abre el modal del avatar
  // en lugar de seleccionar el objeto).
  const isEditMode = useStore((s) => s.isEditMode);

  const videoSettings = useMemo(() => getSettingsSection('video'), []);
  const perfS = useMemo(() => getSettingsSection('performance'), []);
  const mirrorVideo = mirrorVideoProp ?? videoSettings.mirrorVideo ?? true;
  const hideSelfView = hideSelfViewProp ?? videoSettings.hideSelfView ?? false;
  // showName is now handled by unified AvatarLabels (Clean Architecture)
  const lodLevel = lodLevelProp ?? 'high';
  const showHigh = lodLevel === 'high';
  const showMid = lodLevel === 'mid';
  const showLow = lodLevel === 'low';
  const esMismaEmpresa = !esFantasma && !isCurrentUser;
  // When useInstancedMesh=true, the 3D mesh is handled by InstancedAvatarRenderer.
  // Skip GLTFAvatar to avoid double-rendering the same avatar.
  // Also skip the sprite fallback — rendering a statusColor sprite while
  // InstancedAvatarRenderer loads produces the "green triangle" artifact.
  const renderGLTF = !useInstancedMesh && (showHigh || (esMismaEmpresa && showMid));
  const renderSprite = !renderGLTF && !useInstancedMesh && (showMid || showLow);
  const assetQuality: AvatarAssetQuality = showLow ? 'low' : showMid ? 'medium' : 'high';
  const effectiveAnimState = perfS.showAvatarAnimations === false ? 'idle' as AnimationState : animationState;

  const videoY = avatarHeight + 1.15;
  const chatY = avatarHeight + (camOn ? 2.75 : 0.95);
  const reactionY = avatarHeight + (camOn ? 1.75 : 0.65);
  const radialY = avatarHeight + (camOn ? 2.05 : 0.65);
  const allowVideo = (showHigh || showMid) && camOn;
  const allowMessage = showHigh && message;
  const allowReaction = (showHigh || showMid) && reaction;
  const spriteColor = isCurrentUser ? '#60a5fa' : statusColors[status];

  useEffect(() => {
    if (onAvatarHeightComputed && avatarHeight > 0) onAvatarHeightComputed(avatarHeight);
  }, [avatarHeight, onAvatarHeightComputed]);

  const handlePointerDown = useCallback((e: any) => {
    if (isCurrentUser || !userId || !avatarInteractions) return;
    e.stopPropagation();
    clickPreventedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      clickPreventedRef.current = true;
      setShowRadialWheel(true);
    }, 500);
  }, [isCurrentUser, userId, avatarInteractions]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);

  const handleClick = useCallback((e: any) => {
    // Modo edición: avatar propio NO captura el click (deja pasar al objeto).
    if (isCurrentUser && isEditMode) return;
    e.stopPropagation();
    if (isCurrentUser && onClickAvatar) { onClickAvatar(); return; }
    if (isCurrentUser || !userId) return;
    if (clickPreventedRef.current) { clickPreventedRef.current = false; return; }
    const now = Date.now();
    if (now - lastClickRef.current < 350 && avatarInteractions?.onGoTo) {
      setShowRadialWheel(false);
      avatarInteractions.onGoTo(userId);
      lastClickRef.current = now;
      return;
    }
    lastClickRef.current = now;
    setShowRadialWheel(false);
    if (onClickRemoteAvatar) onClickRemoteAvatar(userId);
  }, [isCurrentUser, userId, onClickAvatar, onClickRemoteAvatar, avatarInteractions]);

  return (
    <group position={position} onClick={handleClick} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      <mesh visible={false} geometry={isCurrentUser ? hitTestCylinderCurrentUser : hitTestCylinderRemote}>
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {renderGLTF && (
        // Key estable por entidad (userId) + modelUrl efectivo.
        // Fix 2026-04-22: antes el key incluía `assetQuality`, lo que hacía
        // REMOUNT de GLTFAvatar cada vez que el LOD cambiaba (near/mid/low)
        // aunque el modelUrl resuelto fuera el mismo (usuarios sin URLs
        // separados por calidad). Consecuencias: 3 cargas de animaciones,
        // texture leak monotónico (+12 por remount), WebGL context lost,
        // T-pose flash repetido.
        //
        // El key ahora depende del modelUrl resuelto — solo remonta si
        // realmente cambia el GLB (p.ej. usuario cambia de avatar o tiene
        // URLs específicas por calidad). Para cambios de calidad sin cambio
        // de URL, React reconcilia y GLTFAvatar reacciona a `assetQuality`
        // via props (texturas por calidad via useEffect).
        //
        // React docs: https://react.dev/learn/rendering-lists#rules-of-keys
        // Three.js docs: https://threejs.org/docs/#api/en/objects/LOD
        // — mount-once + visible toggle, nunca remount en LOD transitions.
        <GLTFAvatar
          key={`${userId ?? (isCurrentUser ? 'self' : 'remote')}:${resolveAvatarModelUrl(
            isCurrentUser ? avatar3DConfig : (remoteAvatar3DConfig || FALLBACK_AVATAR_3D_CONFIG),
            assetQuality
          )}`}
          avatarConfig={isCurrentUser ? avatar3DConfig : (remoteAvatar3DConfig || FALLBACK_AVATAR_3D_CONFIG)}
          animationState={effectiveAnimState}
          direction={direction}
          isSitting={isSitting}
          sitRotation={seatForwardRotation}
          skinColor={config?.skinColor}
          clothingColor={config?.clothingColor}
          scale={1}
          assetQuality={assetQuality}
          onHeightComputed={setAvatarHeight}
          onMetricasAvatarComputadas={onMetricasAvatarComputadas}
        />
      )}

      {renderSprite && (
        <sprite scale={showMid ? [1.6, 1.6, 1.6] : [0.8, 0.8, 0.8]}>
          <spriteMaterial color={spriteColor} />
        </sprite>
      )}

      {allowMessage && (
        <Html position={[0, chatY, 0]} center distanceFactor={10} zIndexRange={[100, 0]}>
          <div className="animate-chat-bubble">
            <div className="bg-white/95 backdrop-blur-sm text-gray-800 px-3 py-1.5 rounded-full shadow-lg max-w-[180px] text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              {message}
            </div>
          </div>
        </Html>
      )}

      {allowVideo && showVideoBubble && !(isCurrentUser && hideSelfView) && (
        <Html position={[0, videoY, 0]} center distanceFactor={12} zIndexRange={[100, 0]}>
          <div className="w-24 h-16 rounded-[12px] overflow-hidden border-[2px] border-[#6366f1] shadow-lg bg-black relative">
            {isCurrentUser && (localVideoTrack || (videoStream && videoStream.getVideoTracks().length > 0)) ? (
              // Path nativo para el usuario actual: VideoWithBackground usa
              // track.attach() → muestra el processedTrack del background
              // processor (blur / virtual bg). Fallback a stream crudo si
              // el wrapper aún no existe.
              // MIRROR: depende sólo de mirrorVideo (el processor no invierte).
              <VideoWithBackground
                stream={videoStream ?? null}
                localVideoTrack={localVideoTrack ?? null}
                effectType={effectType}
                mirrorVideo={!!mirrorVideo}
                muted
                className="w-full h-full object-cover"
              />
            ) : videoStream && videoStream.getVideoTracks().length > 0 ? (
              // Avatares remotos: stream crudo. El emisor ya aplicó el
              // processor antes de publicar, así que este stream ya llega
              // con blur cuando corresponde.
              <StableVideo stream={videoStream} muted={false} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-indigo-900/80 to-purple-900/80">
                <span className="text-[9px] text-white/80 font-medium">{name.split(' ')[0]}</span>
              </div>
            )}
          </div>
        </Html>
      )}
      {/* videoIsProcessed queda como hint semántico para futuras optimizaciones
          (p.ej. desactivar post-process CSS redundantes), pero no se usa aquí. */}
      {false && videoIsProcessed /* reserved */}

      {allowReaction && (
        <Html position={[0, reactionY, 0]} center distanceFactor={8} zIndexRange={[200, 0]}>
          <div className="animate-emoji-float text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">{reaction}</div>
        </Html>
      )}

      {/* Name labels are now rendered by the unified AvatarLabels component (Clean Architecture).
        * All label logic (dynamic Y, current user color, status tooltip, distance culling)
        * is handled via PrepararAvatarLabelsUseCase → AvatarLabels. */}

      {showRadialWheel && !isCurrentUser && userId && avatarInteractions && (
        <Html position={[0, radialY, 0]} center distanceFactor={6} zIndexRange={[310, 0]}>
          <div className="select-none pointer-events-auto" onClick={(e) => { e.stopPropagation(); setShowRadialWheel(false); }}>
            <div className="relative w-[160px] h-[160px]">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-zinc-800/90 border border-white/10 flex items-center justify-center z-10">
                <span className="text-[9px] font-bold text-white/60">{name.split(' ')[0]}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onFollow?.(userId); setShowRadialWheel(false); }} className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-violet-600/80 hover:bg-violet-500 text-white" title="Seguir">
                <span className="text-[7px] font-bold">{avatarInteractions.followTargetId === userId ? 'Dejar' : 'Seguir'}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onInvite?.(userId); setShowRadialWheel(false); }} className="absolute top-1/2 right-0 -translate-y-1/2 w-12 h-12 rounded-full bg-indigo-600/80 text-white" title="Invitar">
                <span className="text-[7px] font-bold">Invitar</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onWave?.(userId); setShowRadialWheel(false); }} className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-amber-500/80 text-white" title="Saludar">
                <span className="text-lg">👋</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); avatarInteractions.onNudge?.(userId); setShowRadialWheel(false); }} className="absolute top-1/2 left-0 -translate-y-1/2 w-12 h-12 rounded-full bg-pink-500/80 text-white" title="Ring">
                <span className="text-[7px] font-bold">Ring</span>
              </button>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

Avatar.displayName = 'Avatar';
