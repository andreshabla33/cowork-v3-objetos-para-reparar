/**
 * DeviceManager - Unified device management for media devices
 * Handles enumeration, selection, and hot-swapping of audio/video devices
 *
 * Phase 4 — Room.getLocalDevices() alignment:
 * enumerateDevices() usa Room.getLocalDevices() de livekit-client cuando está
 * disponible. Room.getLocalDevices() filtra dummy devices, solicita permisos
 * automáticamente si es necesario, y sigue las mejores prácticas del SDK de LiveKit.
 *
 * @see https://docs.livekit.io/client-sdk-js/classes/Room.html#getLocalDevices
 */

import { Room } from 'livekit-client';
import { logger } from '@/lib/logger';
import { DeviceInfo } from '../../domain/types';

const log = logger.child('device-manager');

export interface DeviceManagerOptions {
  onDevicesChanged?: (devices: DeviceInfo[]) => void;
  onDeviceError?: (error: Error) => void;
}

export class DeviceManager {
  private devices: Map<string, DeviceInfo> = new Map();
  private options: DeviceManagerOptions;
  private deviceChangeHandler: (() => void) | null = null;
  private static readonly RETRYABLE_MEDIA_ERROR_NAMES = new Set([
    'AbortError',
    'NotReadableError',
    'TrackStartError',
  ]);
  private static readonly USER_MEDIA_TIMEOUT_MS = 8000;

  constructor(options: DeviceManagerOptions = {}) {
    this.options = options;
    this.setupDeviceChangeListener();
  }

  /**
   * Enumera todos los dispositivos de media disponibles.
   *
   * Phase 4 — Usa Room.getLocalDevices() de livekit-client para:
   *   - Filtrar automáticamente dummy devices (deviceId vacío o 'default' duplicado)
   *   - Solicitar permisos si `requestPermissions=false` y los labels están vacíos
   *   - Seguir las mejores prácticas del SDK de LiveKit para device management
   *
   * Fallback a navigator.mediaDevices.enumerateDevices() si Room no está disponible.
   */
  async enumerateDevices(): Promise<DeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return [];
    }

    try {
      // Phase 4: Room.getLocalDevices() por tipo — agrupa los 3 tipos de devices
      // requestPermissions=false: no pedir permisos aquí, solo enumerar lo disponible
      const [audioInputs, videoInputs, audioOutputs] = await Promise.all([
        Room.getLocalDevices('audioinput', false).catch(() => []),
        Room.getLocalDevices('videoinput', false).catch(() => []),
        Room.getLocalDevices('audiooutput', false).catch(() => []),
      ]);

      const allDevices: MediaDeviceInfo[] = [...audioInputs, ...videoInputs, ...audioOutputs];

      const mappedDevices: DeviceInfo[] = allDevices.map((device, index) => ({
        id: device.deviceId,
        label: device.label || this.getDefaultLabel(device.kind, index),
        kind: device.kind as DeviceInfo['kind'],
      }));

      // Update internal cache
      this.devices.clear();
      mappedDevices.forEach(d => this.devices.set(d.id, d));

      return mappedDevices;
    } catch (error) {
      log.error('Failed to enumerate devices', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.options.onDeviceError?.(error as Error);
      return [];
    }
  }

  /**
   * Request initial permission to access devices.
   * Populates device labels en llamadas posteriores a enumerateDevices().
   *
   * Phase 4 — Usa Room.getLocalDevices() con requestPermissions=true.
   * Esto solicita permisos de forma integrada con el SDK de LiveKit,
   * sin necesidad de getUserMedia() + stop() inmediato que puede causar doble prompt.
   *
   * Si Room.getLocalDevices() falla (ej. browser muy antiguo), hace fallback
   * a getUserMedia() clásico.
   */
  async requestInitialPermissions(constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return false;
    }

    try {
      // Phase 4: usar Room.getLocalDevices(kind, requestPermissions=true)
      // Solicita permisos y filtra dummy devices en una sola llamada
      const kinds: MediaDeviceKind[] = [];
      if (constraints.video) kinds.push('videoinput');
      if (constraints.audio) kinds.push('audioinput');

      await Promise.all(
        kinds.map((kind) => Room.getLocalDevices(kind, true).catch(() => [])),
      );
      return true;
    } catch (error) {
      // Fallback: getUserMedia clásico si Room.getLocalDevices no funciona
      log.warn('Room.getLocalDevices permission request failed, falling back to getUserMedia', {
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        if (!navigator.mediaDevices.getUserMedia) return false;
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (fallbackError) {
        log.error('Failed to get initial permissions', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
        return false;
      }
    }
  }

  /**
   * Get a specific device stream with the given constraints
   */
  async getDeviceStream(
    kind: 'audio' | 'video',
    deviceId: string | null,
    options: AudioProcessingOptions = {
      noiseReduction: true,
      noiseReductionLevel: 'standard',
      echoCancellation: true,
      autoGainControl: true,
    }
  ): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    const primaryConstraints = this.buildConstraints(kind, deviceId, options, false);

    try {
      const stream = await this.requestUserMediaWithRetry(primaryConstraints, kind, deviceId, false);
      return stream;
    } catch (error) {
      log.error(`Failed to get ${kind} stream`, {
        error: error instanceof Error ? error.message : String(error),
        kind,
      });

      if (kind === 'audio') {
        // Some desktop drivers fail with advanced audio constraints.
        // Fall back to minimal constraints before giving up.
        try {
          const relaxedAudioStream = await this.requestUserMediaWithRetry({ audio: true }, kind, null, true);
          return relaxedAudioStream;
        } catch (relaxedError) {
          log.error('Relaxed audio fallback failed', {
            error: relaxedError instanceof Error ? relaxedError.message : String(relaxedError),
          });
        }
      }

      // Try fallback to default device
      if (deviceId) {
        log.info(`Trying fallback for ${kind}`, { kind });
        try {
          const fallbackConstraints = this.buildConstraints(kind, null, options, true);
          return await this.requestUserMediaWithRetry(fallbackConstraints, kind, null, true);
        } catch (fallbackError) {
          log.error(`Fallback failed for ${kind}`, {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            kind,
          });
        }
      }

      return null;
    }
  }

  /**
   * Hot-swap a device in an existing stream
   * Replaces the track and stops the old one
   */
  async hotSwapDevice(
    stream: MediaStream,
    kind: 'audio' | 'video',
    deviceId: string,
    options: AudioProcessingOptions = {
      noiseReduction: true,
      noiseReductionLevel: 'standard',
      echoCancellation: true,
      autoGainControl: true,
    }
  ): Promise<MediaStreamTrack | null> {
    try {
      // Get new track
      const newStream = await this.getDeviceStream(kind, deviceId, options);
      if (!newStream) return null;

      const newTrack = newStream.getTracks()[0];
      if (!newTrack) return null;

      // Get and stop old track
      const oldTracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
      oldTracks.forEach(track => {
        stream.removeTrack(track);
        track.stop();
      });

      // Add new track to stream
      stream.addTrack(newTrack);

      return newTrack;
    } catch (error) {
      log.error(`Hot-swap failed for ${kind}`, {
        error: error instanceof Error ? error.message : String(error),
        kind,
      });
      return null;
    }
  }

  /**
   * Apply audio processing to a track
   */
  async applyAudioProcessing(
    track: MediaStreamTrack,
    level: 'standard' | 'enhanced'
  ): Promise<MediaStreamTrack> {
    // For now, return the original track
    // Audio processing can be enhanced with Web Audio API or RNNoise
    return track;
  }

  /**
   * Get screen share stream
   */
  async getScreenShareStream(withAudio: boolean = false): Promise<MediaStream | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      return null;
    }

    try {
      const constraints: DisplayMediaStreamOptions = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15 },
        },
        audio: withAudio,
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      return stream;
    } catch (error) {
      log.error('Failed to get screen share', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Stop all tracks in a stream
   */
  stopStream(stream: MediaStream | null): void {
    if (!stream) return;
    stream.getTracks().forEach(track => {
      track.stop();
      stream.removeTrack(track);
    });
  }

  /**
   * Get current device by kind
   */
  getDevicesByKind(kind: DeviceInfo['kind']): DeviceInfo[] {
    return Array.from(this.devices.values()).filter(d => d.kind === kind);
  }

  destroy(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.removeEventListener || !this.deviceChangeHandler) {
      return;
    }

    navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
    this.deviceChangeHandler = null;
  }

  private setupDeviceChangeListener(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    this.deviceChangeHandler = async () => {
      log.info('Device change detected');
      const devices = await this.enumerateDevices();
      this.options.onDevicesChanged?.(devices);
    };

    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
  }

  private getDefaultLabel(kind: string, index: number): string {
    switch (kind) {
      case 'audioinput':
        return `Microphone ${index + 1}`;
      case 'videoinput':
        return `Camera ${index + 1}`;
      case 'audiooutput':
        return `Speaker ${index + 1}`;
      default:
        return `Device ${index + 1}`;
    }
  }

  private buildConstraints(
    kind: 'audio' | 'video',
    deviceId: string | null,
    options: AudioProcessingOptions,
    preferRelaxedVideo: boolean,
  ): MediaStreamConstraints {
    if (kind === 'video') {
      const videoBase = deviceId
        ? { deviceId: { exact: deviceId } }
        : {};

      return {
        video: {
          ...videoBase,
          width: preferRelaxedVideo ? { ideal: 640 } : { ideal: 1280 },
          height: preferRelaxedVideo ? { ideal: 480 } : { ideal: 720 },
          frameRate: preferRelaxedVideo ? { ideal: 15, max: 24 } : { ideal: 24, max: 30 },
        },
      };
    }

    return {
      audio: deviceId
        ? {
            deviceId: { exact: deviceId },
            noiseSuppression: options.noiseReduction,
            echoCancellation: options.echoCancellation,
            autoGainControl: options.autoGainControl,
          }
        : {
            noiseSuppression: options.noiseReduction,
            echoCancellation: options.echoCancellation,
            autoGainControl: options.autoGainControl,
          },
    };
  }

  private async requestUserMediaWithRetry(
    constraints: MediaStreamConstraints,
    kind: 'audio' | 'video',
    deviceId: string | null,
    preferRelaxedVideo: boolean,
  ): Promise<MediaStream> {
    const retryDelaysMs = [0, 250, 750];
    let lastError: unknown = null;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      if (retryDelaysMs[attempt] > 0) {
        await this.sleep(retryDelaysMs[attempt]);
      }

      try {
        return await this.requestUserMediaWithTimeout(constraints, DeviceManager.USER_MEDIA_TIMEOUT_MS);
      } catch (error) {
        lastError = error;
        const errorName = this.getMediaErrorName(error);
        if (!DeviceManager.RETRYABLE_MEDIA_ERROR_NAMES.has(errorName)) {
          throw error;
        }

        log.warn(`Retryable ${kind} error on attempt ${attempt + 1}`, {
          errorName,
          kind,
          attempt: attempt + 1,
          deviceId,
          preferRelaxedVideo,
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Unable to acquire ${kind} stream`);
  }

  private getMediaErrorName(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
      return error.name;
    }

    return 'UnknownError';
  }

  private async requestUserMediaWithTimeout(
    constraints: MediaStreamConstraints,
    timeoutMs: number,
  ): Promise<MediaStream> {
    const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timerId = window.setTimeout(() => {
        window.clearTimeout(timerId);
        reject(new DOMException('Timed out waiting for media device response', 'AbortError'));
      }, timeoutMs);
    });

    return Promise.race([mediaPromise, timeoutPromise]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}

interface AudioProcessingOptions {
  noiseReduction: boolean;
  noiseReductionLevel: 'off' | 'standard' | 'enhanced';
  echoCancellation: boolean;
  autoGainControl: boolean;
}
