import { Track, VideoPresets, type TrackPublishOptions } from 'livekit-client';

const MAXIMO_REINTENTOS_RECONEXION_LIVEKIT = 5;
const MAXIMO_DELAY_RECONEXION_LIVEKIT_MS = 16_000;

export const CAPAS_SIMULCAST_VIDEO_LIVEKIT = [
  VideoPresets.h180,
  VideoPresets.h360,
  VideoPresets.h540,
];

export const CODIFICACION_VIDEO_CAMARA_LIVEKIT = {
  maxBitrate: 1_700_000,
  maxFramerate: 24,
};

export const CODIFICACION_SCREEN_SHARE_LIVEKIT = {
  maxBitrate: 2_000_000,
  maxFramerate: 12,
};

export const obtenerSiguienteDelayReconexionLiveKitMs = (retryCount: number): number | null => {
  if (retryCount > MAXIMO_REINTENTOS_RECONEXION_LIVEKIT) {
    return null;
  }

  return Math.min(1000 * Math.pow(2, retryCount), MAXIMO_DELAY_RECONEXION_LIVEKIT_MS);
};

export const crearOpcionesSalaLiveKit = () => ({
  dynacast: true,
  reconnectPolicy: {
    nextRetryDelayInMs: (ctx: { retryCount: number }) => obtenerSiguienteDelayReconexionLiveKitMs(ctx.retryCount),
  },
  publishDefaults: {
    simulcast: true,
    videoSimulcastLayers: CAPAS_SIMULCAST_VIDEO_LIVEKIT,
    screenShareSimulcastLayers: [],
    videoEncoding: CODIFICACION_VIDEO_CAMARA_LIVEKIT,
    screenShareEncoding: CODIFICACION_SCREEN_SHARE_LIVEKIT,
  },
  adaptiveStream: { pixelDensity: 'screen' as const },
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },
});

export const crearOpcionesPublicacionTrackLiveKit = (source: 'camera' | 'microphone' | 'screen_share'): TrackPublishOptions => {
  if (source === 'camera') {
    return {
      source: Track.Source.Camera,
      name: source,
      simulcast: true,
      videoEncoding: CODIFICACION_VIDEO_CAMARA_LIVEKIT,
    };
  }

  if (source === 'screen_share') {
    return {
      source: Track.Source.ScreenShare,
      name: source,
      simulcast: false,
      videoEncoding: CODIFICACION_SCREEN_SHARE_LIVEKIT,
      scalabilityMode: 'L1T3' as const,
    };
  }

  return {
    source: Track.Source.Microphone,
    name: source,
  };
};
