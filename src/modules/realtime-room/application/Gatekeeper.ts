/**
 * Gatekeeper - Validates pre-flight state before allowing room join
 * Ensures required permissions and devices are available
 */

import { PreflightCheck, PreflightError } from '../domain/types';

export interface GatekeeperOptions {
  requireVideo?: boolean;
  requireAudio?: boolean;
  onBlocked?: (errors: PreflightError[]) => void;
  onAllowed?: () => void;
}

export class Gatekeeper {
  private options: GatekeeperOptions;

  constructor(options: GatekeeperOptions = {}) {
    this.options = {
      requireVideo: false,
      requireAudio: true,
      ...options,
    };
  }

  /**
   * Validate if user can join based on preflight state
   */
  validate(preflight: PreflightCheck): { canJoin: boolean; errors: PreflightError[] } {
    const errors: PreflightError[] = [];
    const requiresTrackedMedia = Boolean(this.options.requireAudio || this.options.requireVideo);

    // Check audio requirement
    if (this.options.requireAudio) {
      if (preflight.microphone === 'denied') {
        errors.push({
          type: 'permission-denied',
          device: 'microphone',
          message: 'Se requiere acceso al micrófono para unirse a la reunión.',
          recoverable: true,
        });
      } else if (!preflight.hasMicrophoneDevice) {
        errors.push({
          type: 'no-device',
          device: 'microphone',
          message: 'No se detectó un micrófono disponible.',
          recoverable: false,
        });
      } else if (!preflight.microphoneTrackReady) {
        errors.push({
          type: 'track-error',
          device: 'microphone',
          message: 'Activa o reinicia el micrófono antes de unirte a la reunión.',
          recoverable: true,
        });
      }
    }

    // Check video requirement
    if (this.options.requireVideo) {
      if (preflight.camera === 'denied') {
        errors.push({
          type: 'permission-denied',
          device: 'camera',
          message: 'Se requiere acceso a la cámara para esta reunión.',
          recoverable: true,
        });
      } else if (!preflight.hasCameraDevice) {
        errors.push({
          type: 'no-device',
          device: 'camera',
          message: 'No se detectó una cámara disponible.',
          recoverable: false,
        });
      } else if (!preflight.cameraTrackReady) {
        errors.push({
          type: 'track-error',
          device: 'camera',
          message: 'Activa o reinicia la cámara antes de unirte a la reunión.',
          recoverable: true,
        });
      }
    }

    // Check for non-recoverable errors in preflight
    const criticalErrors = preflight.errors.filter(e => !e.recoverable);
    errors.push(...criticalErrors);

    const canJoin = errors.length === 0 && (requiresTrackedMedia ? preflight.ready : criticalErrors.length === 0);

    if (canJoin) {
      this.options.onAllowed?.();
    } else {
      this.options.onBlocked?.(errors);
    }

    return { canJoin, errors };
  }

  /**
   * Quick check if preflight state allows joining
   */
  canJoin(preflight: PreflightCheck): boolean {
    return this.validate(preflight).canJoin;
  }

  /**
   * Get user-friendly error messages
   */
  getErrorMessages(errors: PreflightError[]): string[] {
    return errors.map(e => e.message);
  }

  /**
   * Check if there are recoverable errors that can be fixed
   */
  hasRecoverableErrors(errors: PreflightError[]): boolean {
    return errors.some(e => e.recoverable);
  }

  /**
   * Get recoverable errors
   */
  getRecoverableErrors(errors: PreflightError[]): PreflightError[] {
    return errors.filter(e => e.recoverable);
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<GatekeeperOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
