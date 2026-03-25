/**
 * PermissionService - Unified permission handling for media devices
 * Detects granted/prompt/denied states with fallback when Permissions API is not available
 */

import { PermissionState, PreflightError } from '../../domain/types';

export interface PermissionServiceOptions {
  onPermissionChange?: (permission: PermissionState, device: 'camera' | 'microphone') => void;
}

export class PermissionService {
  private options: PermissionServiceOptions;

  constructor(options: PermissionServiceOptions = {}) {
    this.options = options;
  }

  /**
   * Check permission state for a specific device type
   * Falls back to "prompt" if Permissions API is not available or not supported for this device type
   */
  async checkPermission(device: 'camera' | 'microphone'): Promise<PermissionState> {
    const permissionName = device === 'camera' ? 'camera' : 'microphone';

    try {
      // Check if Permissions API is available
      if (!navigator.permissions || !navigator.permissions.query) {
        console.log(`[PermissionService] Permissions API not available, using fallback for ${device}`);
        return 'prompt';
      }

      // Check if the permission descriptor is supported
      const result = await navigator.permissions.query({
        name: permissionName as PermissionName,
      });

      const state = result.state as PermissionState;

      // Listen for permission changes
      result.addEventListener('change', () => {
        this.options.onPermissionChange?.(result.state as PermissionState, device);
      });

      return state;
    } catch (error) {
      // Some browsers don't support querying camera/microphone permissions
      console.warn(`[PermissionService] Cannot query ${device} permission:`, error);
      return 'prompt';
    }
  }

  /**
   * Check all media permissions at once
   */
  async checkAllPermissions(): Promise<{ camera: PermissionState; microphone: PermissionState }> {
    const [camera, microphone] = await Promise.all([
      this.checkPermission('camera'),
      this.checkPermission('microphone'),
    ]);

    return { camera, microphone };
  }

  /**
   * Request permission by attempting to get user media
   * This is the most reliable way to check/request permissions when Permissions API is not available
   */
  async requestPermission(
    device: 'camera' | 'microphone' | 'both'
  ): Promise<{ granted: boolean; stream?: MediaStream; error?: PreflightError }> {
    const constraints: MediaStreamConstraints = {};

    if (device === 'camera' || device === 'both') {
      constraints.video = true;
    }
    if (device === 'microphone' || device === 'both') {
      constraints.audio = true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Permission granted
      return { granted: true, stream };
    } catch (error) {
      const err = error as Error;
      let preflightError: PreflightError;

      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          preflightError = {
            type: 'permission-denied',
            device: device === 'both' ? undefined : device,
            message: this.getPermissionDeniedMessage(device),
            recoverable: true,
          };
          break;

        case 'NotFoundError':
        case 'DevicesNotFoundError':
          preflightError = {
            type: 'no-device',
            device: device === 'both' ? undefined : device,
            message: this.getNoDeviceMessage(device),
            recoverable: false,
          };
          break;

        case 'NotReadableError':
        case 'TrackStartError':
          preflightError = {
            type: 'track-error',
            device: device === 'both' ? undefined : device,
            message: this.getTrackErrorMessage(device),
            recoverable: true,
          };
          break;

        case 'NotSupportedError':
          preflightError = {
            type: 'browser-not-supported',
            message: 'Tu navegador no soporta acceso a dispositivos de media.',
            recoverable: false,
          };
          break;

        default:
          preflightError = {
            type: 'track-error',
            device: device === 'both' ? undefined : device,
            message: `Error al acceder a ${device === 'both' ? 'dispositivos' : device}: ${err.message}`,
            recoverable: true,
          };
      }

      return { granted: false, error: preflightError };
    }
  }

  /**
   * Validate if we can proceed with join based on current permissions and requirements
   */
  validateJoinReadiness(
    cameraPermission: PermissionState,
    microphonePermission: PermissionState,
    requireVideo: boolean = false,
    requireAudio: boolean = true
  ): { canJoin: boolean; errors: PreflightError[] } {
    const errors: PreflightError[] = [];

    // Check audio requirement
    if (requireAudio && microphonePermission === 'denied') {
      errors.push({
        type: 'permission-denied',
        device: 'microphone',
        message: 'Se requiere acceso al micrófono para unirse a la reunión.',
        recoverable: true,
      });
    }

    // Check video requirement
    if (requireVideo && cameraPermission === 'denied') {
      errors.push({
        type: 'permission-denied',
        device: 'camera',
        message: 'Se requiere acceso a la cámara para unirse a esta reunión.',
        recoverable: true,
      });
    }

    return {
      canJoin: errors.length === 0,
      errors,
    };
  }

  /**
   * Get user-friendly error message for permission denied
   */
  getPermissionDeniedMessage(device: 'camera' | 'microphone' | 'both'): string {
    const deviceText = device === 'both' ? 'dispositivos' : device === 'camera' ? 'cámara' : 'micrófono';
    return `Permiso denegado para acceder a la ${deviceText}. Por favor, permite el acceso en la configuración de tu navegador.`;
  }

  /**
   * Get user-friendly error message for no device found
   */
  getNoDeviceMessage(device: 'camera' | 'microphone' | 'both'): string {
    const deviceText = device === 'both' ? 'dispositivos' : device === 'camera' ? 'cámara' : 'micrófono';
    return `No se encontró ningún ${deviceText} disponible.`;
  }

  /**
   * Get user-friendly error message for track error
   */
  getTrackErrorMessage(device: 'camera' | 'microphone' | 'both'): string {
    const deviceText = device === 'both' ? 'dispositivos' : device === 'camera' ? 'cámara' : 'micrófono';
    return `No se pudo iniciar el ${deviceText}. Puede estar siendo usado por otra aplicación.`;
  }
}
