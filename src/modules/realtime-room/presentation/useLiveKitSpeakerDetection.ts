/**
 * @module modules/realtime-room/presentation/useLiveKitSpeakerDetection
 * @description Sub-hook of the P0-03 useLiveKit decomposition: owns the
 * `speakingUsers` state and the speaker-change handler ref consumed by the
 * Coordinator at construction time inside useLiveKitRoomLifecycle.
 *
 * Single responsibility: speaker detection + local-participant inclusion.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs:
 *   - https://docs.livekit.io/reference/client-sdk-js/classes/Room.html
 *     (Room.activeSpeakers / RoomEvent.ActiveSpeakersChanged — exposed via
 *     SpaceRealtimeCoordinator's onSpeakerChange callback).
 *   - LocalParticipant.isSpeaking — Coordinator passes the room reference
 *     so we can include the local identity when speaking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceRealtimeCoordinator } from '@/modules/realtime-room';

export interface UseLiveKitSpeakerDetectionParams {
  realtimeCoordinatorRef: React.MutableRefObject<SpaceRealtimeCoordinator | null>;
  onSpeakerChangeOutRef: React.MutableRefObject<((speakerIds: string[]) => void) | null>;
  /** Output ref populated with `resetSpeakingUsers`. Read by Lifecycle's limpiarLivekit. */
  resetSpeakingUsersOutRef: React.MutableRefObject<(() => void) | null>;
}

export interface UseLiveKitSpeakerDetectionReturn {
  speakingUsers: Set<string>;
  setSpeakingUsers: React.Dispatch<React.SetStateAction<Set<string>>>;
  speakingUsersRef: React.MutableRefObject<Set<string>>;
  resetSpeakingUsers: () => void;
}

export function useLiveKitSpeakerDetection(
  params: UseLiveKitSpeakerDetectionParams,
): UseLiveKitSpeakerDetectionReturn {
  const { realtimeCoordinatorRef, onSpeakerChangeOutRef, resetSpeakingUsersOutRef } = params;

  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const speakingUsersRef = useRef<Set<string>>(new Set());
  speakingUsersRef.current = speakingUsers;

  // Coordinator reads `.current` of this ref at construction time. We publish
  // the latest handler on every render so the dependencies stay fresh without
  // recreating the Coordinator.
  useEffect(() => {
    onSpeakerChangeOutRef.current = (speakerIds: string[]) => {
      const active = new Set(speakerIds);
      const room = realtimeCoordinatorRef.current?.getRoom();
      if (room?.localParticipant.isSpeaking) active.add(room.localParticipant.identity);
      setSpeakingUsers(active);
    };
  }, [onSpeakerChangeOutRef, realtimeCoordinatorRef]);

  const resetSpeakingUsers = useCallback(() => {
    setSpeakingUsers(new Set());
  }, []);

  // Publish via output ref so Lifecycle.limpiarLivekit can clear speaking
  // users without taking `resetSpeakingUsers` as a direct prop dep — that
  // would unstabilize Lifecycle's `limpiarLivekit` identity each render and
  // trigger the unmount-effect cleanup to disconnect the in-flight LiveKit
  // connect (regression observed on Vercel preview of commit 1f4a8ab).
  useEffect(() => {
    resetSpeakingUsersOutRef.current = resetSpeakingUsers;
  }, [resetSpeakingUsersOutRef, resetSpeakingUsers]);

  return { speakingUsers, setSpeakingUsers, speakingUsersRef, resetSpeakingUsers };
}
