/**
 * SpaceMediaCoordinator - Application layer coordinator for media management
 * Extracted from useMediaStream logic to provide clean separation of concerns
 */

import { DeviceManager } from '../infrastructure/browser/DeviceManager';
import { PermissionService } from '../infrastructure/browser/PermissionService';
import {
  DeviceInfo,
  DevicePreferences,
  PreflightCheck,
  PreflightError,
  AudioProcessingOptions,
  MediaTrackState,
  ScreenShareSession,
} from '../domain/types';

export interface SpaceMediaCoordinatorState {
  stream: MediaStream | null;
  processedStream: MediaStream | null;
  effectiveStream: MediaStream | null;
  screenShareSession: ScreenShareSession;
  preflightCheck: PreflightCheck;
  devicePreferences: DevicePreferences;
  audioProcessingOptions: AudioProcessingOptions;
  desiredCameraEnabled: boolean;
  desiredMicrophoneEnabled: boolean;
  desiredScreenShareEnabled: boolean;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
}

export interface SpaceMediaCoordinatorOptions {
  onStreamChange?: (stream: MediaStream | null) => void;
  onScreenShareChange?: (session: ScreenShareSession) => void;
  onError?: (error: PreflightError) => void;
  onDeviceChange?: (devices: { cameras: DeviceInfo[]; microphones: DeviceInfo[]; speakers: DeviceInfo[] }) => void;
  onStateChange?: (state: SpaceMediaCoordinatorState) => void;
}

export class SpaceMediaCoordinator {
  private deviceManager: DeviceManager;
  private permissionService: PermissionService;
  private options: SpaceMediaCoordinatorOptions;

  // State
  private stream: MediaStream | null = null;
  private screenShareSession: ScreenShareSession = { active: false, withAudio: false };
  private processedStream: MediaStream | null = null;
  private devicePreferences: DevicePreferences = {
    selectedCameraId: null,
    selectedMicrophoneId: null,
    selectedSpeakerId: null,
  };
  private audioProcessingOptions: AudioProcessingOptions = {
    noiseReduction: true,
    noiseReductionLevel: 'standard',
    echoCancellation: true,
    autoGainControl: true,
  };
  private desiredCameraEnabled = false;
  private desiredMicrophoneEnabled = false;
  private desiredScreenShareEnabled = false;
  private trackStates: Map<string, MediaTrackState> = new Map();
  private preflightCheck: PreflightCheck = {
    camera: 'unknown',
    microphone: 'unknown',
    hasCameraDevice: false,
    hasMicrophoneDevice: false,
    cameraTrackReady: false,
    microphoneTrackReady: false,
    errors: [],
    ready: false,
  };

  constructor(options: SpaceMediaCoordinatorOptions = {}) {
    this.options = options;
    this.deviceManager = new DeviceManager({
      onDevicesChanged: this.handleDevicesChanged.bind(this),
      onDeviceError: (error) => this.options.onError?.({
        type: 'track-error',
        message: error.message,
        recoverable: true,
      }),
    });
    this.permissionService = new PermissionService({
      onPermissionChange: this.handlePermissionChange.bind(this),
    });
  }

  /**
   * Initialize and check permissions
   */
  async initialize(requireVideo: boolean = true, requireAudio: boolean = true): Promise<PreflightCheck> {
    // Check permissions
    const permissions = await this.permissionService.checkAllPermissions();

    // Enumerate devices
    await this.deviceManager.enumerateDevices();
    const cameras = this.deviceManager.getDevicesByKind('videoinput');
    const microphones = this.deviceManager.getDevicesByKind('audioinput');
    const speakers = this.deviceManager.getDevicesByKind('audiooutput');

    if (this.devicePreferences.selectedCameraId && !cameras.some((device) => device.id === this.devicePreferences.selectedCameraId)) {
      this.devicePreferences.selectedCameraId = null;
    }

    if (!this.devicePreferences.selectedCameraId && cameras[0]) {
      this.devicePreferences.selectedCameraId = cameras[0].id;
    }

    if (this.devicePreferences.selectedMicrophoneId && !microphones.some((device) => device.id === this.devicePreferences.selectedMicrophoneId)) {
      this.devicePreferences.selectedMicrophoneId = null;
    }

    if (!this.devicePreferences.selectedMicrophoneId && microphones[0]) {
      this.devicePreferences.selectedMicrophoneId = microphones[0].id;
    }

    if (this.devicePreferences.selectedSpeakerId && !speakers.some((device) => device.id === this.devicePreferences.selectedSpeakerId)) {
      this.devicePreferences.selectedSpeakerId = null;
    }

    if (!this.devicePreferences.selectedSpeakerId && speakers[0]) {
      this.devicePreferences.selectedSpeakerId = speakers[0].id;
    }

    // Update preflight check
    this.preflightCheck = {
      camera: permissions.camera,
      microphone: permissions.microphone,
      hasCameraDevice: cameras.length > 0,
      hasMicrophoneDevice: microphones.length > 0,
      cameraTrackReady: false,
      microphoneTrackReady: false,
      errors: [],
      ready: false,
    };

    // Validate join readiness
    const validation = this.permissionService.validateJoinReadiness(
      permissions.camera,
      permissions.microphone,
      requireVideo,
      requireAudio
    );

    this.preflightCheck.errors = validation.errors;
    this.preflightCheck.ready = validation.canJoin;

    this.notifyStateChange();

    return this.preflightCheck;
  }

  /**
   * Start media capture with current preferences
   */
  async startMedia(wantVideo: boolean = true, wantAudio: boolean = true): Promise<MediaStream | null> {
    try {
      this.desiredCameraEnabled = wantVideo;
      this.desiredMicrophoneEnabled = wantAudio;

      // Stop existing stream
      this.stopMedia();

      this.desiredCameraEnabled = wantVideo;
      this.desiredMicrophoneEnabled = wantAudio;

      if (wantVideo && wantAudio) {
        if (this.preflightCheck.camera !== 'granted' || this.preflightCheck.microphone !== 'granted') {
          await this.requestPermissionAccess('both');
        }
      } else if (wantVideo) {
        if (this.preflightCheck.camera !== 'granted') {
          await this.requestPermissionAccess('camera');
        }
      } else if (wantAudio) {
        if (this.preflightCheck.microphone !== 'granted') {
          await this.requestPermissionAccess('microphone');
        }
      }

      // Request video if needed
      if (wantVideo) {
        const videoStream = await this.deviceManager.getDeviceStream(
          'video',
          this.devicePreferences.selectedCameraId
        );
        if (videoStream) {
          await this.refreshDeviceAvailability();
          this.stream = videoStream;
          this.trackStates.set('video', {
            trackId: videoStream.getVideoTracks()[0]?.id || '',
            kind: 'video',
            deviceId: this.devicePreferences.selectedCameraId,
            enabled: true,
            muted: false,
            state: 'published',
          });
          this.preflightCheck.cameraTrackReady = true;
        } else {
          this.desiredCameraEnabled = false;
          this.preflightCheck.cameraTrackReady = false;
          await this.refreshPermissionState('camera');
        }
      }

      // Request audio if needed
      if (wantAudio) {
        const audioStream = await this.deviceManager.getDeviceStream(
          'audio',
          this.devicePreferences.selectedMicrophoneId,
          this.audioProcessingOptions
        );
        if (audioStream) {
          await this.refreshDeviceAvailability();
          if (this.stream) {
            // Add audio track to existing stream
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
              this.stream.addTrack(audioTrack);
            }
            // Stop the standalone audio stream tracks
            audioStream.getTracks().forEach(t => {
              if (t !== audioTrack) t.stop();
            });
          } else {
            this.stream = audioStream;
          }
          this.trackStates.set('audio', {
            trackId: this.stream.getAudioTracks()[0]?.id || '',
            kind: 'audio',
            deviceId: this.devicePreferences.selectedMicrophoneId,
            enabled: true,
            muted: false,
            state: 'published',
          });
          this.preflightCheck.microphoneTrackReady = true;
        } else {
          this.preflightCheck.microphoneTrackReady = false;
          await this.refreshPermissionState('microphone');
        }
      }

      // Update preflight
      this.updatePreflightReadiness();
      this.options.onStreamChange?.(this.stream);
      this.notifyStateChange();

      return this.stream;
    } catch (error) {
      console.error('[SpaceMediaCoordinator] Failed to start media:', error);
      this.options.onError?.({
        type: 'track-error',
        message: 'Error al iniciar la captura de media',
        recoverable: true,
      });
      return null;
    }
  }

  /**
   * Stop all media capture
   */
  stopMedia(): void {
    this.deviceManager.stopStream(this.stream);
    this.deviceManager.stopStream(this.processedStream);
    this.stream = null;
    this.processedStream = null;
    this.desiredCameraEnabled = false;
    this.desiredMicrophoneEnabled = false;
    this.trackStates.clear();
    this.preflightCheck.cameraTrackReady = false;
    this.preflightCheck.microphoneTrackReady = false;
    this.updatePreflightReadiness();
    this.options.onStreamChange?.(null);
    this.notifyStateChange();
  }

  /**
   * Toggle camera on/off
   */
  async toggleCamera(enabled: boolean): Promise<boolean> {
    this.desiredCameraEnabled = enabled;

    if (!this.stream) {
      if (enabled) {
        return !!(await this.startMedia(true, this.desiredMicrophoneEnabled));
      }
      this.notifyStateChange();
      return false;
    }

    const videoTracks = this.stream.getVideoTracks();

    if (enabled && videoTracks.length === 0) {
      if (this.preflightCheck.camera !== 'granted') {
        await this.requestPermissionAccess('camera');
      }

      // Need to add video track
      const videoStream = await this.deviceManager.getDeviceStream(
        'video',
        this.devicePreferences.selectedCameraId
      );
      if (videoStream) {
        await this.refreshDeviceAvailability();
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          this.stream.addTrack(videoTrack);
          this.trackStates.set('video', {
            trackId: videoTrack.id,
            kind: 'video',
            deviceId: this.devicePreferences.selectedCameraId || '',
            enabled: true,
            muted: false,
            state: 'published',
          });
          this.preflightCheck.cameraTrackReady = true;
          this.updatePreflightReadiness();
          this.options.onStreamChange?.(this.stream);
          this.notifyStateChange();
          return true;
        }
      }
      this.desiredCameraEnabled = false;
      this.preflightCheck.cameraTrackReady = false;
      await this.refreshPermissionState('camera');
      this.updatePreflightReadiness();
      this.notifyStateChange();
      return false;
    } else {
      // Enable/disable existing tracks
      videoTracks.forEach(track => {
        track.enabled = enabled;
      });

      const state = this.trackStates.get('video');
      if (state) {
        state.enabled = enabled;
        this.trackStates.set('video', state);
      }

      this.options.onStreamChange?.(this.stream);
      this.notifyStateChange();
      return true;
    }
  }

  /**
   * Toggle microphone on/off
   */
  async toggleMicrophone(enabled: boolean): Promise<boolean> {
    this.desiredMicrophoneEnabled = enabled;

    if (!this.stream) {
      if (enabled) {
        return !!(await this.startMedia(this.desiredCameraEnabled, true));
      }
      this.notifyStateChange();
      return false;
    }

    const audioTracks = this.stream.getAudioTracks();

    if (enabled && audioTracks.length === 0) {
      if (this.preflightCheck.microphone !== 'granted') {
        await this.requestPermissionAccess('microphone');
      }

      // Need to add audio track
      const audioStream = await this.deviceManager.getDeviceStream(
        'audio',
        this.devicePreferences.selectedMicrophoneId,
        this.audioProcessingOptions
      );
      if (audioStream) {
        await this.refreshDeviceAvailability();
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          this.stream.addTrack(audioTrack);
          this.trackStates.set('audio', {
            trackId: audioTrack.id,
            kind: 'audio',
            deviceId: this.devicePreferences.selectedMicrophoneId || '',
            enabled: true,
            muted: false,
            state: 'published',
          });
          this.preflightCheck.microphoneTrackReady = true;
          this.updatePreflightReadiness();
          this.options.onStreamChange?.(this.stream);
          this.notifyStateChange();
          return true;
        }
      }
      this.preflightCheck.microphoneTrackReady = false;
      await this.refreshPermissionState('microphone');
      this.updatePreflightReadiness();
      this.notifyStateChange();
      return false;
    } else {
      // Enable/disable existing tracks
      audioTracks.forEach(track => {
        track.enabled = enabled;
      });

      const state = this.trackStates.get('audio');
      if (state) {
        state.enabled = enabled;
        this.trackStates.set('audio', state);
      }

      this.options.onStreamChange?.(this.stream);
      this.notifyStateChange();
      return true;
    }
  }

  /**
   * Switch camera device
   */
  async switchCamera(deviceId: string): Promise<boolean> {
    this.devicePreferences.selectedCameraId = deviceId;

    if (!this.stream || this.stream.getVideoTracks().length === 0) {
      return true; // No active video to switch
    }

    const newTrack = await this.deviceManager.hotSwapDevice(
      this.stream,
      'video',
      deviceId
    );

    if (newTrack) {
      this.trackStates.set('video', {
        trackId: newTrack.id,
        kind: 'video',
        deviceId,
        enabled: true,
        muted: false,
        state: 'published',
      });
      this.options.onStreamChange?.(this.stream);
      this.notifyStateChange();
      return true;
    }

    return false;
  }

  /**
   * Switch microphone device
   */
  async switchMicrophone(deviceId: string): Promise<boolean> {
    this.devicePreferences.selectedMicrophoneId = deviceId;

    if (!this.stream || this.stream.getAudioTracks().length === 0) {
      return true; // No active audio to switch
    }

    const newTrack = await this.deviceManager.hotSwapDevice(
      this.stream,
      'audio',
      deviceId,
      this.audioProcessingOptions
    );

    if (newTrack) {
      this.trackStates.set('audio', {
        trackId: newTrack.id,
        kind: 'audio',
        deviceId,
        enabled: true,
        muted: false,
        state: 'published',
      });
      this.options.onStreamChange?.(this.stream);
      this.notifyStateChange();
      return true;
    }

    return false;
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(withAudio: boolean = false): Promise<ScreenShareSession | null> {
    try {
      this.desiredScreenShareEnabled = true;
      const stream = await this.deviceManager.getScreenShareStream(withAudio);
      if (!stream) {
        this.desiredScreenShareEnabled = false;
        return null;
      }

      // Handle screen share stop
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.stopScreenShare();
      });

      this.screenShareSession = {
        active: true,
        withAudio,
        track: stream.getVideoTracks()[0],
        stream,
      };

      this.options.onScreenShareChange?.(this.screenShareSession);
      this.notifyStateChange();
      return this.screenShareSession;
    } catch (error) {
      console.error('[SpaceMediaCoordinator] Failed to start screen share:', error);
      return null;
    }
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare(): void {
    this.desiredScreenShareEnabled = false;
    if (this.screenShareSession.stream) {
      this.deviceManager.stopStream(this.screenShareSession.stream);
    }
    this.screenShareSession = { active: false, withAudio: false };
    this.options.onScreenShareChange?.(this.screenShareSession);
    this.notifyStateChange();
  }

  /**
   * Toggle screen sharing
   */
  async toggleScreenShare(withAudio: boolean = false): Promise<ScreenShareSession | null> {
    if (this.screenShareSession.active) {
      this.stopScreenShare();
      return this.screenShareSession;
    } else {
      return await this.startScreenShare(withAudio);
    }
  }

  /**
   * Update audio processing options
   */
  updateAudioProcessingOptions(options: Partial<AudioProcessingOptions>, reapplyActiveTrack: boolean = true): void {
    this.audioProcessingOptions = { ...this.audioProcessingOptions, ...options };

    // If audio is active, re-apply with new options
    if (reapplyActiveTrack && this.stream && this.stream.getAudioTracks().length > 0 && this.devicePreferences.selectedMicrophoneId) {
      void this.switchMicrophone(this.devicePreferences.selectedMicrophoneId);
    }

    this.notifyStateChange();
  }

  /**
   * Update device preferences
   */
  updateDevicePreferences(preferences: Partial<DevicePreferences>): void {
    this.devicePreferences = { ...this.devicePreferences, ...preferences };
    this.notifyStateChange();
  }

  setDesiredMediaState(next: {
    cameraEnabled?: boolean;
    microphoneEnabled?: boolean;
    screenShareEnabled?: boolean;
  }): void {
    if (next.cameraEnabled !== undefined) {
      this.desiredCameraEnabled = next.cameraEnabled;
    }
    if (next.microphoneEnabled !== undefined) {
      this.desiredMicrophoneEnabled = next.microphoneEnabled;
    }
    if (next.screenShareEnabled !== undefined) {
      this.desiredScreenShareEnabled = next.screenShareEnabled;
    }
    this.notifyStateChange();
  }

  syncExternalMediaState(snapshot: {
    stream: MediaStream | null;
    processedStream: MediaStream | null;
    screenShareSession?: ScreenShareSession;
    desiredCameraEnabled?: boolean;
    desiredMicrophoneEnabled?: boolean;
    desiredScreenShareEnabled?: boolean;
  }): void {
    this.stream = snapshot.stream;
    this.processedStream = snapshot.processedStream;
    this.screenShareSession = snapshot.screenShareSession ?? { active: false, withAudio: false };
    this.desiredCameraEnabled = snapshot.desiredCameraEnabled ?? (snapshot.stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled) ?? false);
    this.desiredMicrophoneEnabled = snapshot.desiredMicrophoneEnabled ?? (snapshot.stream?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled) ?? false);
    this.desiredScreenShareEnabled = snapshot.desiredScreenShareEnabled ?? this.screenShareSession.active;

    this.preflightCheck.cameraTrackReady = snapshot.stream?.getVideoTracks().some(track => track.readyState === 'live') ?? false;
    this.preflightCheck.microphoneTrackReady = snapshot.stream?.getAudioTracks().some(track => track.readyState === 'live') ?? false;
    this.updatePreflightReadiness();
    this.notifyStateChange();
  }

  setProcessedStream(stream: MediaStream | null): void {
    this.processedStream = stream;
    this.notifyStateChange();
  }

  getEffectiveStream(): MediaStream | null {
    return this.processedStream ?? this.stream;
  }

  /**
   * Get current state
   */
  getState(): SpaceMediaCoordinatorState {
    return {
      stream: this.stream,
      processedStream: this.processedStream,
      effectiveStream: this.getEffectiveStream(),
      screenShareSession: this.screenShareSession,
      preflightCheck: this.preflightCheck,
      devicePreferences: { ...this.devicePreferences },
      audioProcessingOptions: { ...this.audioProcessingOptions },
      desiredCameraEnabled: this.desiredCameraEnabled,
      desiredMicrophoneEnabled: this.desiredMicrophoneEnabled,
      desiredScreenShareEnabled: this.desiredScreenShareEnabled,
      isCameraEnabled: this.stream?.getVideoTracks().some(t => t.enabled) ?? false,
      isMicrophoneEnabled: this.stream?.getAudioTracks().some(t => t.enabled) ?? false,
    };
  }

  /**
   * Get the device manager for direct access if needed
   */
  getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  /**
   * Get the permission service for direct access if needed
   */
  getPermissionService(): PermissionService {
    return this.permissionService;
  }

  private handleDevicesChanged(devices: { id: string; label: string; kind: 'audioinput' | 'videoinput' | 'audiooutput' }[]): void {
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const microphones = devices.filter(d => d.kind === 'audioinput');
    const speakers = devices.filter(d => d.kind === 'audiooutput');

    if (!cameras.some((device) => device.id === this.devicePreferences.selectedCameraId)) {
      this.devicePreferences.selectedCameraId = cameras[0]?.id ?? null;
    }

    if (!microphones.some((device) => device.id === this.devicePreferences.selectedMicrophoneId)) {
      this.devicePreferences.selectedMicrophoneId = microphones[0]?.id ?? null;
    }

    if (!speakers.some((device) => device.id === this.devicePreferences.selectedSpeakerId)) {
      this.devicePreferences.selectedSpeakerId = speakers[0]?.id ?? null;
    }

    this.preflightCheck.hasCameraDevice = cameras.length > 0;
    this.preflightCheck.hasMicrophoneDevice = microphones.length > 0;

    this.options.onDeviceChange?.({ cameras, microphones, speakers });
    this.notifyStateChange();
  }

  private handlePermissionChange(permission: PermissionState, device: 'camera' | 'microphone'): void {
    if (device === 'camera') {
      this.preflightCheck.camera = permission;
    } else {
      this.preflightCheck.microphone = permission;
    }
    this.updatePreflightReadiness();
    this.notifyStateChange();
  }

  private async refreshPermissionState(device: 'camera' | 'microphone'): Promise<void> {
    const permission = await this.permissionService.checkPermission(device);
    if (device === 'camera') {
      this.preflightCheck.camera = permission;
      return;
    }

    this.preflightCheck.microphone = permission;
  }

  private async requestPermissionAccess(device: 'camera' | 'microphone' | 'both'): Promise<boolean> {
    const result = await this.permissionService.requestPermission(device);

    if (result.stream) {
      this.deviceManager.stopStream(result.stream);
    }

    if (device !== 'microphone') {
      await this.refreshPermissionState('camera');
    }

    if (device !== 'camera') {
      await this.refreshPermissionState('microphone');
    }

    await this.refreshDeviceAvailability();
    this.updatePreflightReadiness();
    this.notifyStateChange();

    if (!result.granted && result.error) {
      this.options.onError?.(result.error);
    }

    return result.granted;
  }

  private async refreshDeviceAvailability(): Promise<void> {
    const devices = await this.deviceManager.enumerateDevices();
    this.handleDevicesChanged(devices);
  }

  private updatePreflightReadiness(): void {
    const hasRequiredAudio = this.preflightCheck.microphone !== 'denied' && this.preflightCheck.hasMicrophoneDevice;
    const hasRequiredVideo = this.preflightCheck.camera !== 'denied' && this.preflightCheck.hasCameraDevice;

    this.preflightCheck.ready = hasRequiredAudio || hasRequiredVideo;
  }

  private notifyStateChange(): void {
    this.options.onStateChange?.(this.getState());
  }
}
