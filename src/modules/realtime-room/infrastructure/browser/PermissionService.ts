/**
 * PermissionService - Unified permission handling for media devices
 * Detects granted/prompt/denied states with fallback when Permissions API is not available
 *
 * Phase 2 — MediaDeviceFailure alignment:
 * livekit-client v2.18.0 no exporta MediaDeviceFailure como clase pública.
 * Se implementa MediaDeviceFailureReason y classifyMediaDeviceError() que replican
 * el comportamiento que documenta LiveKit en RoomEvent.MediaDevicesError.
 *
 * @see https://docs.livekit.io/client-sdk-js/functions/MediaDeviceFailure.getFailure.html
 */

import { logger } from '@/lib/logger';
import { PermissionState, PreflightError } from '../../domain/types';

/**
 * Razones de fallo de dispositivo de media — alinea con lo que LiveKit documenta
 * en RoomEvent.MediaDevicesError (MediaDeviceFailure.getFailure).
 */
export enum MediaDeviceFailureReason {
  /** El usuario denegó el permiso (NotAllowedError / PermissionDeniedError) */
  PermissionDenied = 'PermissionDenied',
  /** No se encontró el dispositivo (NotFoundError / DevicesNotFoundError) */
  NotFound = 'NotFound',
  /** El dispositivo está en uso o no responde (NotReadableError / TrackStartError) */
  NotReadable = 'NotReadable',
  /** Browser no soporta media (NotSupportedError) */
  BrowserNotSupported = 'BrowserNotSupported',
  /** Error desconocido */
  Other = 'Other',
}

/**
 * Clasifica un error de getUserMedia en un MediaDeviceFailureReason tipado.
 * Replica el comportamiento de MediaDeviceFailure.getFailure() de LiveKit.
 * Compatible con livekit-client v2.x donde la clase no se exporta públicamente.
 */
export function classifyMediaDeviceError(error: unknown): MediaDeviceFailureReason {
  const errorName = error instanceof Error ? error.name : String(error);

  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return MediaDeviceFailureReason.PermissionDenied;

    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return MediaDeviceFailureReason.NotFound;

    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return MediaDeviceFailureReason.NotReadable;

    case 'NotSupportedError':
    case 'SecurityError':
      return MediaDeviceFailureReason.BrowserNotSupported;

    default:
      return MediaDeviceFailureReason.Other;
  }
}

const log = logger.child('permission-service');

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
        log.info(`Permissions API not available, using fallback for ${device}`, { device });
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
      log.warn(`Cannot query ${device} permission`, {
        device,
        error: error instanceof Error ? error.message : String(error),
      });
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

      // Permission granted — devolver stream sin detenerlo para evitar doble prompt
      return { granted: true, stream };
    } catch (error) {
      // Phase 2: usar classifyMediaDeviceError() en lugar de switch manual sobre err.name
      const reason = classifyMediaDeviceError(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      let preflightError: PreflightError;

      switch (reason) {
        case MediaDeviceFailureReason.PermissionDenied:
          preflightError = {
            type: 'permission-denied',
            device: device === 'both' ? undefined : device,
            message: this.getPermissionDeniedMessage(device),
            recoverable: true,
          };
          break;

        case MediaDeviceFailureReason.NotFound:
          preflightError = {
            type: 'no-device',
            device: device === 'both' ? undefined : device,
            message: this.getNoDeviceMessage(device),
            recoverable: false,
          };
          break;

        case MediaDeviceFailureReason.BrowserNotSupported:
          preflightError = {
            type: 'browser-not-supported',
            message: 'Tu navegador no soporta acceso a dispositivos de media.',
            recoverable: false,
          };
          break;

        case MediaDeviceFailureReason.NotReadable:
        case MediaDeviceFailureReason.Other:
        default:
          preflightError = {
            type: 'track-error',
            device: device === 'both' ? undefined : device,
            message: reason === MediaDeviceFailureReason.NotReadable
              ? this.getTrackErrorMessage(device)
              : `Error al acceder a ${device === 'both' ? 'dispositivos' : device}: ${errorMessage}`,
            recoverable: true,
          };
      }

      log.warn('Media device error classified', {
        reason,
        device,
        errorMessage,
      });

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
