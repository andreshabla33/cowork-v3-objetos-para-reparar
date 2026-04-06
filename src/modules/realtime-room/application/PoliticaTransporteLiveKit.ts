/**
 * @module PoliticaTransporteLiveKit
 * Política de transporte LiveKit: codecs, encoding, simulcast, reconnect.
 *
 * Decisiones de diseño (basadas en docs.livekit.io/transport/):
 * - VP9 preferido con L3T3_KEY para SVC (mejor calidad/bitrate que simulcast VP8)
 * - Fallback a VP8 si el navegador no soporta VP9
 * - Screen share con L3T3_KEY (capas espaciales para zoom vs overview)
 * - Audio con preset 'music' para audio espacial de alta fidelidad
 * - webAudioMix habilitado para mixing de audio espacial en el navegador
 * - Dynacast + adaptiveStream para ahorro de ancho de banda
 */

import {
  AudioPresets,
  Track,
  VideoPresets,
  type RoomOptions,
  type TrackPublishOptions,
  type VideoCodec,
} from 'livekit-client';

// ========== Constantes de Reconexión ==========

const MAXIMO_REINTENTOS_RECONEXION_LIVEKIT = 5;
const MAXIMO_DELAY_RECONEXION_LIVEKIT_MS = 16_000;

// ========== Codec preferido ==========

/**
 * VP9 con SVC L3T3_KEY: 3 capas espaciales + 3 temporales, keyframe-aligned.
 * Permite que el SFU seleccione la capa adecuada sin re-encoding.
 * Fallback a VP8 simulcast en navegadores sin soporte VP9.
 */
export const CODEC_VIDEO_PREFERIDO: VideoCodec = 'vp9';
export const CODEC_VIDEO_BACKUP: VideoCodec = 'vp8';
export const SCALABILITY_MODE_CAMERA = 'L3T3_KEY';
export const SCALABILITY_MODE_SCREEN_SHARE = 'L3T3_KEY';

// ========== Capas Simulcast (fallback VP8) ==========

export const CAPAS_SIMULCAST_VIDEO_LIVEKIT = [
  VideoPresets.h180,
  VideoPresets.h360,
  VideoPresets.h540,
];

// ========== Encoding Presets ==========

export const CODIFICACION_VIDEO_CAMARA_LIVEKIT = {
  maxBitrate: 1_500_000,
  maxFramerate: 24,
};

export const CODIFICACION_SCREEN_SHARE_LIVEKIT = {
  maxBitrate: 2_500_000,
  maxFramerate: 15,
};

// ========== Reconexión ==========

export const obtenerSiguienteDelayReconexionLiveKitMs = (retryCount: number): number | null => {
  if (retryCount > MAXIMO_REINTENTOS_RECONEXION_LIVEKIT) {
    return null;
  }
  return Math.min(1000 * Math.pow(2, retryCount), MAXIMO_DELAY_RECONEXION_LIVEKIT_MS);
};

// ========== Opciones de Sala ==========

/**
 * Crea las opciones de sala LiveKit con las mejores prácticas oficiales:
 * - dynacast: pausa capas de video no consumidas (ahorro CPU/BW publisher)
 * - adaptiveStream: ajusta resolución automáticamente al tamaño del elemento UI
 * - webAudioMix: habilita Web Audio API para mixing espacial
 * - disconnectOnPageLeave: limpieza automática al cerrar pestaña
 */
export const crearOpcionesSalaLiveKit = (): RoomOptions => ({
  dynacast: true,
  adaptiveStream: { pixelDensity: 'screen' },
  webAudioMix: true,
  disconnectOnPageLeave: true,
  reconnectPolicy: {
    nextRetryDelayInMs: (ctx: { retryCount: number }) =>
      obtenerSiguienteDelayReconexionLiveKitMs(ctx.retryCount),
  },
  publishDefaults: {
    videoCodec: CODEC_VIDEO_PREFERIDO,
    backupCodec: { codec: CODEC_VIDEO_BACKUP, simulcast: true },
    simulcast: true,
    videoSimulcastLayers: CAPAS_SIMULCAST_VIDEO_LIVEKIT,
    screenShareSimulcastLayers: [],
    videoEncoding: CODIFICACION_VIDEO_CAMARA_LIVEKIT,
    screenShareEncoding: CODIFICACION_SCREEN_SHARE_LIVEKIT,
    audioPreset: AudioPresets.musicHighQuality,
    scalabilityMode: SCALABILITY_MODE_CAMERA,
    stopMicTrackOnMute: false,
  },
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },
});

// ========== Opciones de Publicación por Track ==========

export const crearOpcionesPublicacionTrackLiveKit = (
  source: 'camera' | 'microphone' | 'screen_share',
): TrackPublishOptions => {
  if (source === 'camera') {
    return {
      source: Track.Source.Camera,
      name: source,
      videoCodec: CODEC_VIDEO_PREFERIDO,
      backupCodec: { codec: CODEC_VIDEO_BACKUP, simulcast: true },
      simulcast: true,
      videoEncoding: CODIFICACION_VIDEO_CAMARA_LIVEKIT,
      scalabilityMode: SCALABILITY_MODE_CAMERA,
    };
  }

  if (source === 'screen_share') {
    return {
      source: Track.Source.ScreenShare,
      name: source,
      videoCodec: CODEC_VIDEO_PREFERIDO,
      backupCodec: { codec: CODEC_VIDEO_BACKUP, simulcast: false },
      simulcast: false,
      videoEncoding: CODIFICACION_SCREEN_SHARE_LIVEKIT,
      scalabilityMode: SCALABILITY_MODE_SCREEN_SHARE,
    };
  }

  // Microphone: Opus con preset music para audio espacial
  return {
    source: Track.Source.Microphone,
    name: source,
    audioPreset: AudioPresets.musicHighQuality,
  };
};
