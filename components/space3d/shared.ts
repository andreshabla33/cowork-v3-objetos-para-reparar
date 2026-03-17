'use client';
/**
 * @module components/space3d/shared
 * Tipos, constantes, sonidos e iconos compartidos por los subcomponentes de Space3D.
 */

import React from 'react';
import type { User, PresenceStatus } from '@/types';
import { audioManager, type OpcionesSonidoEspacial } from '@/services/audioManager';

// ========== Types ==========
export type AvatarLodLevel = 'high' | 'mid' | 'low';
export type DireccionAvatar = User['direction'] | 'up' | 'down' | 'front-left' | 'front-right' | 'up-left' | 'up-right';

// ========== Constants ==========
export const MOVE_SPEED = 4;
export const RUN_SPEED = 8;
export const WORLD_SIZE = 100;
export const PROXIMITY_RADIUS = 180;
export const AUDIO_SPATIAL_RADIUS_FACTOR = 2;
export const TELEPORT_DISTANCE = 15;
export const CHAIR_SIT_RADIUS = 1.9;
export const CHAIR_POSITIONS_3D = [[8, 8], [12, 8], [8, 12], [12, 12], [8, 10], [12, 10]];
export const ZONA_SOLICITUD_RADIO = 140;
export const LOD_NEAR_DISTANCE = 25;
export const LOD_MID_DISTANCE = 60;
export const MOVEMENT_BROADCAST_MS = 100;
export const USAR_LIVEKIT = true;
export const PROXIMITY_COORD_THRESHOLD = 12;

// ========== Escala Métrica (1 Unidad = 1 Metro, estándar industria) ==========
// Ref: Roblox R15, Fortnite/UE5 (1cm→1u), LoL (hitbox-units).
// Todos los modelos 3D deben exportarse en metros desde Blender/Maya.
// Si un modelo no cumple, usar escala_normalizacion en la DB para corregir.
export const FACTOR_ESCALA_OBJETOS_ESCENA = 1.0;
export const ALTURA_AVATAR_ESTANDAR = 1.75; // metros — altura de referencia del avatar humano
export const ALTURA_CADERA_AVATAR_SENTADO = 0.55; // metros — altura del hueso Hips sobre el asiento
export const ANIMATION_SIT_DOWN_DURATION = 1000; // ms — base mínima para la transición sit_down
export const STAND_UP_GRACE_PERIOD = 2000; // ms para ignorar colisiones al levantarse
export const RADIO_COLISION_AVATAR = 0.42;

export const obtenerDireccionDesdeVector = (
  deltaX: number,
  deltaZ: number,
  fallback: DireccionAvatar = 'front'
): DireccionAvatar => {
  if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaZ) < 0.0001) {
    return fallback;
  }

  const pi = Math.PI;
  const angle = Math.atan2(deltaX, deltaZ);

  if (angle > -pi / 8 && angle <= pi / 8) return 'front';
  if (angle > pi / 8 && angle <= (3 * pi) / 8) return 'front-right';
  if (angle > (3 * pi) / 8 && angle <= (5 * pi) / 8) return 'right';
  if (angle > (5 * pi) / 8 && angle <= (7 * pi) / 8) return 'up-right';
  if (angle > (7 * pi) / 8 || angle <= (-7 * pi) / 8) return 'up';
  if (angle > (-7 * pi) / 8 && angle <= (-5 * pi) / 8) return 'up-left';
  if (angle > (-5 * pi) / 8 && angle <= (-3 * pi) / 8) return 'left';
  return 'front-left';
};

export const statusColors: Record<string, string> = {
  available: '#22c55e',
  busy: '#ef4444',
  away: '#eab308',
  dnd: '#a855f7',
};

export const themeColors: Record<string, string> = {
  dark: '#000000',
  midnight: '#0a0a1a',
  forest: '#0a1a0a',
  sunset: '#1a0a0a',
  ocean: '#0a1a2a',
  cyberpunk: '#1a0a2a',
  retro: '#1a1a0a',
  minimal: '#fafafa',
  neon: '#000011',
  pastel: '#f0e8f8',
  lava: '#1a0500',
  ice: '#e8f4ff',
  arcade: '#001100',
};

// ========== AudioContext compartido ==========
let _sharedAudioCtx: AudioContext | null = null;
let _audioResumed = false;
export const getAudioCtx = (): AudioContext => {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new AudioContext();
  }
  if (_sharedAudioCtx.state === 'suspended') {
    _sharedAudioCtx.resume();
  }
  return _sharedAudioCtx;
};
if (typeof window !== 'undefined') {
  const resumeAudio = () => {
    if (_audioResumed) return;
    _audioResumed = true;
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume();
    } else if (!_sharedAudioCtx) {
      _sharedAudioCtx = new AudioContext();
    }
    window.removeEventListener('click', resumeAudio, true);
    window.removeEventListener('keydown', resumeAudio, true);
    window.removeEventListener('touchstart', resumeAudio, true);
  };
  window.addEventListener('click', resumeAudio, true);
  window.addEventListener('keydown', resumeAudio, true);
  window.addEventListener('touchstart', resumeAudio, true);
}

// ========== Sonidos ==========
export const playTeleportSound = (options?: OpcionesSonidoEspacial) => {
  audioManager.playTeleport(options).catch(() => {});
};

export const playWaveSound = () => {
  audioManager.playWave().catch(() => {});
};

export const playNudgeSound = () => {
  audioManager.playNudge().catch(() => {});
};

export const playInviteSound = () => {
  audioManager.playInvite().catch(() => {});
};

export const playObjectInteractionSound = () => {
  audioManager.playObjectInteraction().catch(() => {});
};

// ========== Iconos ==========
export const IconPrivacy = ({ on }: { on: boolean }) =>
  React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '2.5', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' }),
    on ? React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '2.5', d: 'M12 11v4' }) : null
  );

export const IconExpand = ({ on }: { on: boolean }) =>
  React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    on
      ? React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '2.5', d: 'M6 18L18 6M6 6l12 12' })
      : React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '2.5', d: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' })
  );
