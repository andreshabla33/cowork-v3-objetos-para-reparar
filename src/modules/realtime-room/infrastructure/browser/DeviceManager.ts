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

    try {
      const constraints: MediaStreamConstraints = {};

      if (kind === 'video') {
        constraints.video = deviceId
          ? { deviceId: { exact: deviceId } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } };
      } else {
        constraints.audio = deviceId
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
            };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error(`[DeviceManager] Failed to get ${kind} stream:`, error);

      // Try fallback to default device
      if (deviceId) {
        console.log(`[DeviceManager] Trying fallback for ${kind}...`);
        return this.getDeviceStream(kind, null, options);
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
}

interface AudioProcessingOptions {
  noiseReduction: boolean;
  noiseReductionLevel: 'off' | 'standard' | 'enhanced';
  echoCancellation: boolean;
  autoGainControl: boolean;
}
