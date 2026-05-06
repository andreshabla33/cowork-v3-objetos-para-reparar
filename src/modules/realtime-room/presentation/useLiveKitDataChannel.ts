/**
 * @module modules/realtime-room/presentation/useLiveKitDataChannel
 * @description Sub-hook of the P0-03 useLiveKit decomposition: thin wrapper
 * around the SpaceRealtimeCoordinator data-channel publish surface. The
 * delivery mode (lossy vs reliable) is resolved by the underlying
 * DataDeliveryPolicy based on the packet contract type, with optional
 * caller override.
 *
 * Single responsibility: data publish. No room/track side effects.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs (livekit-client / docs.livekit.io):
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/LocalParticipant.html#publishData
 *   - https://docs.livekit.io/home/client/data/packets/
 */

import { useCallback } from 'react';
import { logger } from '@/lib/logger';
import type {
  PublishableDataPacketContract,
  SpaceRealtimeCoordinator,
} from '@/modules/realtime-room';

const log = logger.child('useLiveKit-data-channel');

export interface UseLiveKitDataChannelParams {
  realtimeCoordinatorRef: React.MutableRefObject<SpaceRealtimeCoordinator | null>;
}

export interface UseLiveKitDataChannelReturn {
  enviarDataLivekit: (mensaje: PublishableDataPacketContract, reliableOverride?: boolean) => boolean;
}

export function useLiveKitDataChannel(
  params: UseLiveKitDataChannelParams,
): UseLiveKitDataChannelReturn {
  const { realtimeCoordinatorRef } = params;

  const enviarDataLivekit = useCallback((
    mensaje: PublishableDataPacketContract,
    reliableOverride?: boolean,
  ) => {
    const coordinator = realtimeCoordinatorRef.current;
    if (!coordinator) return false;
    coordinator.publishData(mensaje, reliableOverride).catch((e: unknown) =>
      log.warn('Error enviando data LiveKit', { error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  }, [realtimeCoordinatorRef]);

  return { enviarDataLivekit };
}
