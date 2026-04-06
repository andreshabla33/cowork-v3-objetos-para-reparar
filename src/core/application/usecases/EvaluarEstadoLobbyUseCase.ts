/**
 * @module application/usecases/EvaluarEstadoLobbyUseCase
 *
 * Caso de uso de aplicación: calcula el estado de join-readiness del lobby
 * a partir del PreflightCheck y las preferencias de media del usuario.
 *
 * Clean Architecture — Application layer:
 *   - Solo depende del domain (lobby.ts, PreflightCheck)
 *   - Sin imports de React, LiveKit, Tailwind ni Supabase
 */

import type { PreflightCheck } from '@/modules/realtime-room';
import type {
  LobbyMediaStatus,
  JoinStatusIndicator,
  JoinMediaSummary,
} from '@/src/core/domain/entities/lobby';

export class EvaluarEstadoLobbyUseCase {
  /**
   * Determina qué dispositivos están realmente activos y listos
   * (permiso concedido + dispositivo disponible + track listo).
   */
  resolveMediaStatus(
    preflight: PreflightCheck,
    desired: { cameraEnabled: boolean; microphoneEnabled: boolean },
  ): LobbyMediaStatus {
    const cameraActive =
      desired.cameraEnabled &&
      preflight.camera !== 'denied' &&
      preflight.hasCameraDevice &&
      preflight.cameraTrackReady;

    const microphoneActive =
      desired.microphoneEnabled &&
      preflight.microphone !== 'denied' &&
      preflight.hasMicrophoneDevice &&
      preflight.microphoneTrackReady;

    return { cameraActive, microphoneActive };
  }

  /**
   * Genera un resumen textual de los dispositivos disponibles / no disponibles
   * y calcula los flags de fallback para el botón de join.
   */
  summarizeJoinMedia(
    desired: { cameraEnabled: boolean; microphoneEnabled: boolean },
    resolved: LobbyMediaStatus,
    preflight: PreflightCheck,
  ): JoinMediaSummary {
    const availableLabel = this.getAvailableLabel(resolved);

    const cameraUnavailable = desired.cameraEnabled && !resolved.cameraActive;
    const micUnavailable = desired.microphoneEnabled && !resolved.microphoneActive;
    const unavailableLabel = this.getUnavailableLabel(cameraUnavailable, micUnavailable);

    const hasPartialFallback = Boolean(
      !preflight.ready &&
        (resolved.cameraActive || resolved.microphoneActive) &&
        unavailableLabel,
    );

    const hasNoMediaFallback = Boolean(
      (desired.cameraEnabled || desired.microphoneEnabled) &&
        !preflight.ready &&
        !resolved.cameraActive &&
        !resolved.microphoneActive &&
        preflight.errors.length > 0,
    );

    return { availableLabel, unavailableLabel, hasPartialFallback, hasNoMediaFallback };
  }

  /**
   * Genera el indicador visual de estado (tono + etiqueta) para el lobby.
   */
  getStatusIndicator(options: {
    hasError: boolean;
    hasPartialFallback: boolean;
    hasNoMediaFallback: boolean;
    preflightReady: boolean;
  }): JoinStatusIndicator {
    if (options.hasError) {
      return { tone: 'error', label: 'Requiere atención' };
    }
    if (options.hasPartialFallback || options.hasNoMediaFallback) {
      return { tone: 'warning', label: 'Listo con limitaciones' };
    }
    if (options.preflightReady) {
      return { tone: 'ready', label: 'Listo para entrar' };
    }
    return { tone: 'preparing', label: 'Preparando dispositivos' };
  }

  /**
   * Texto del botón de join según el estado de media.
   */
  getJoinButtonLabel(summary: JoinMediaSummary): string {
    if (summary.hasPartialFallback) {
      return `Entrar con ${summary.availableLabel}`;
    }
    if (summary.hasNoMediaFallback) {
      return 'Entrar sin cámara ni micrófono';
    }
    return 'Unirse a la reunión';
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private getAvailableLabel(resolved: LobbyMediaStatus): string {
    if (resolved.cameraActive && resolved.microphoneActive) return 'cámara y micrófono';
    if (resolved.cameraActive) return 'cámara';
    if (resolved.microphoneActive) return 'micrófono';
    return 'sin cámara ni micrófono';
  }

  private getUnavailableLabel(
    cameraUnavailable: boolean,
    micUnavailable: boolean,
  ): string | null {
    if (cameraUnavailable && micUnavailable) return 'la cámara y el micrófono';
    if (cameraUnavailable) return 'la cámara';
    if (micUnavailable) return 'el micrófono';
    return null;
  }
}

// Singleton — el use case es stateless, reutilizable sin instanciación por render
export const evaluarEstadoLobby = new EvaluarEstadoLobbyUseCase();
