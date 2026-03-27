/**
 * PreflightSessionStore - Manages pre-flight session state for meeting join readiness
 * Tracks permissions, device availability, and errors
 */

import { PreflightCheck, PreflightError, PermissionState } from '../domain/types';

export interface PreflightSessionStoreOptions {
  onStateChange?: (state: PreflightCheck) => void;
  onError?: (error: PreflightError) => void;
}

export class PreflightSessionStore {
  private state: PreflightCheck;
  private options: PreflightSessionStoreOptions;

  constructor(options: PreflightSessionStoreOptions = {}) {
    this.options = options;
    this.state = {
      camera: 'unknown',
      microphone: 'unknown',
      hasCameraDevice: false,
      hasMicrophoneDevice: false,
      cameraTrackReady: false,
      microphoneTrackReady: false,
      errors: [],
      ready: false,
    };
  }

  /**
   * Update permission state
   */
  updatePermission(device: 'camera' | 'microphone', state: PermissionState): void {
    this.state[device] = state;
    this.checkReadiness();
    this.notifyStateChange();
  }

  /**
   * Update device availability
   */
  updateDeviceAvailability(device: 'camera' | 'microphone', available: boolean): void {
    if (device === 'camera') {
      this.state.hasCameraDevice = available;
    } else {
      this.state.hasMicrophoneDevice = available;
    }
    this.checkReadiness();
    this.notifyStateChange();
  }

  /**
   * Update track readiness
   */
  updateTrackReady(device: 'camera' | 'microphone', ready: boolean): void {
    if (device === 'camera') {
      this.state.cameraTrackReady = ready;
    } else {
      this.state.microphoneTrackReady = ready;
    }
    this.checkReadiness();
    this.notifyStateChange();
  }

  /**
   * Add error
   */
  addError(error: PreflightError): void {
    // Avoid duplicate errors
    const exists = this.state.errors.some(
      e => e.type === error.type && e.device === error.device
    );
    if (!exists) {
      this.state.errors.push(error);
      this.options.onError?.(error);
      this.checkReadiness();
      this.notifyStateChange();
    }
  }

  /**
   * Remove error
   */
  removeError(type: PreflightError['type'], device?: PreflightError['device']): void {
    this.state.errors = this.state.errors.filter(
      e => !(e.type === type && (!device || e.device === device))
    );
    this.checkReadiness();
    this.notifyStateChange();
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.state.errors = [];
    this.checkReadiness();
    this.notifyStateChange();
  }

  /**
   * Check if session is ready to join
   */
  private checkReadiness(): void {
    const hasAudio = this.state.microphone !== 'denied' && this.state.hasMicrophoneDevice && this.state.microphoneTrackReady;
    const hasVideo = this.state.camera !== 'denied' && this.state.hasCameraDevice && this.state.cameraTrackReady;
    const hasCriticalErrors = this.state.errors.some(e => !e.recoverable);

    // Ready if we have at least audio or video and no critical errors
    this.state.ready = (hasAudio || hasVideo) && !hasCriticalErrors;
  }

  /**
   * Get current state
   */
  getState(): PreflightCheck {
    return { ...this.state };
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.state.ready;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      camera: 'unknown',
      microphone: 'unknown',
      hasCameraDevice: false,
      hasMicrophoneDevice: false,
      cameraTrackReady: false,
      microphoneTrackReady: false,
      errors: [],
      ready: false,
    };
    this.notifyStateChange();
  }

  /**
   * Get recoverable errors
   */
  getRecoverableErrors(): PreflightError[] {
    return this.state.errors.filter(e => e.recoverable);
  }

  /**
   * Get non-recoverable errors
   */
  getNonRecoverableErrors(): PreflightError[] {
    return this.state.errors.filter(e => !e.recoverable);
  }

  private notifyStateChange(): void {
    this.options.onStateChange?.({ ...this.state });
  }
}
