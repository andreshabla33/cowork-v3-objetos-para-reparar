/**
 * DeviceManager - Unified device management for media devices
 * Handles enumeration, selection, and hot-swapping of audio/video devices
 */

import { DeviceInfo } from '../../domain/types';

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
   * Enumerate all available media devices
   * Requires prior permission grant for meaningful labels
   */
  async enumerateDevices(): Promise<DeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mappedDevices: DeviceInfo[] = devices.map((device, index) => ({
        id: device.deviceId,
        label: device.label || this.getDefaultLabel(device.kind, index),
        kind: device.kind as DeviceInfo['kind'],
      }));

      // Update internal cache
      this.devices.clear();
      mappedDevices.forEach(d => this.devices.set(d.id, d));

      return mappedDevices;
    } catch (error) {
      console.error('[DeviceManager] Failed to enumerate devices:', error);
      this.options.onDeviceError?.(error as Error);
      return [];
    }
  }

  /**
   * Request initial permission to access devices
   * This populates device labels in subsequent enumerate calls
   */
  async requestInitialPermissions(constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Immediately stop all tracks - we just needed the permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('[DeviceManager] Failed to get initial permissions:', error);
      return false;
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
      console.error(`[DeviceManager] Failed to get ${kind} stream:`, error);

      if (kind === 'audio') {
        // Some desktop drivers fail with advanced audio constraints.
        // Fall back to minimal constraints before giving up.
        try {
          const relaxedAudioStream = await this.requestUserMediaWithRetry({ audio: true }, kind, null, true);
          return relaxedAudioStream;
        } catch (relaxedError) {
          console.error('[DeviceManager] Relaxed audio fallback failed:', relaxedError);
        }
      }

      // Try fallback to default device
      if (deviceId) {
        console.log(`[DeviceManager] Trying fallback for ${kind}...`);
        try {
          const fallbackConstraints = this.buildConstraints(kind, null, options, true);
          return await this.requestUserMediaWithRetry(fallbackConstraints, kind, null, true);
        } catch (fallbackError) {
          console.error(`[DeviceManager] Fallback failed for ${kind}:`, fallbackError);
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
      console.error(`[DeviceManager] Hot-swap failed for ${kind}:`, error);
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
      console.error('[DeviceManager] Failed to get screen share:', error);
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
      console.log('[DeviceManager] Device change detected');
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

        console.warn(`[DeviceManager] Retryable ${kind} error on attempt ${attempt + 1}:`, errorName, {
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
