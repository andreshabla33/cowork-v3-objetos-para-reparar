/**
 * @module realtime-room/presentation/useLocalCameraTrack
 *
 * Hook compartido que wrapea el `MediaStreamTrack` crudo de cámara en un
 * `LocalVideoTrack` de LiveKit con `userProvidedTrack=true`, preservando
 * la identidad del wrapper mientras el `MediaStreamTrack.id` no cambie.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation
 * ════════════════════════════════════════════════════════════════
 *
 * Motivo: `@livekit/track-processors` requiere un `LocalVideoTrack` para
 * aplicar `setProcessor()`. En espacios donde la publicación a la room de
 * LiveKit está gated por proximidad, el stream local existe mucho antes
 * de que haya una publicación — y aun así el usuario quiere ver su propio
 * video con blur / fondo virtual aplicado en el HUD local.
 *
 * Este hook cubre ese hueco: produce un `LocalVideoTrack` wrapper vivo
 * siempre que haya `MediaStreamTrack` activo, y el hook `useLiveKitVideo
 * Background` aplica el processor sobre él. Cuando la publicación real
 * aparece, `VirtualSpace3D` compone un `resolveActiveVideoTrack` que
 * prefiere el publicado y cae al preview si no hay.
 *
 * Meetings puede migrar en un segundo paso para consumir este mismo hook
 * desde `useMeetingMediaBridge` (hoy hace el wrap inline) y así eliminar
 * la duplicación final.
 *
 * @see src/core/infrastructure/adapters/LocalVideoTrackFactory.ts
 * @see src/modules/realtime-room/presentation/useLiveKitVideoBackground.ts
 */

import { useEffect, useState } from 'react';
import type { LocalVideoTrack } from 'livekit-client';
import { getLocalVideoTrackFactory } from '@/src/core/infrastructure/adapters/LocalVideoTrackFactory';
import { logger } from '@/lib/logger';

const log = logger.child('useLocalCameraTrack');

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface UseLocalCameraTrackParams {
  /**
   * `MediaStream` local de la cámara (típicamente el retornado por
   * `useMediaStream` o el `SpaceMediaCoordinator`). Puede ser `null`
   * cuando la cámara está apagada o no hay captura.
   */
  mediaStream: MediaStream | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Retorna un `LocalVideoTrack` wrapper estable para el `MediaStreamTrack`
 * de video activo del `mediaStream` dado. La referencia es **estable** (igual
 * objeto) mientras el `MediaStreamTrack.id` no cambie → útil como dep de
 * `useCallback`/`useEffect` en consumidores downstream.
 *
 * Cuando el `mediaStream` es `null` o no hay pista de video activa,
 * retorna `null`. La factory (infrastructure) cachea los wrappers por
 * `trackId` y los libera cuando el track llega a `ended`.
 */
export function useLocalCameraTrack(
  params: UseLocalCameraTrackParams,
): LocalVideoTrack | null {
  const { mediaStream } = params;
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);

  useEffect(() => {
    const rawVideoTrack = mediaStream
      ?.getVideoTracks()
      .find((t) => t.readyState === 'live') ?? null;

    if (!rawVideoTrack) {
      setTrack((prev) => {
        if (prev) {
          log.debug('clearing local camera wrapper (no live video track)');
        }
        return null;
      });
      return;
    }

    setTrack((prev) => {
      // Reutilizar wrapper si el MediaStreamTrack subyacente es el mismo.
      // La factory también cachea por id, pero chequear aquí evita un
      // setState innecesario que dispararía re-renders en cascada.
      if (prev?.mediaStreamTrack.id === rawVideoTrack.id) {
        return prev;
      }
      const wrapper = getLocalVideoTrackFactory().wrapRawTrack(rawVideoTrack);
      log.debug('local camera wrapper ready', { trackId: rawVideoTrack.id });
      return wrapper;
    });
  }, [mediaStream]);

  return track;
}
