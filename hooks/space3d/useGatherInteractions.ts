/**
 * @module hooks/space3d/useGatherInteractions
 * Hook para interacciones estilo Gather: click en avatar remoto,
 * wave, nudge, invite, follow, go-to, y accept invite.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';
import type { EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { obtenerEstadoUsuarioEcs } from '@/lib/ecs/espacioEcs';
import { hapticFeedback } from '@/lib/mobileDetect';
import type { DataPacketContract } from '@/modules/realtime-room';
import type { AccionXP } from '@/lib/gamificacion';
import { SpaceInteractionCoordinator } from '@/modules/realtime-room';
import { type UseGatherInteractionsReturn } from './types';

export function useGatherInteractions(params: {
  session: Session | null;
  currentUser: User;
  currentUserEcs: User;
  usuariosEnChunks: User[];
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  enviarDataLivekit: (mensaje: DataPacketContract, reliable?: boolean) => boolean;
  grantXP: (accion: AccionXP, cooldownMs?: number) => void;
  setTeleportTarget: React.Dispatch<React.SetStateAction<{ x: number; z: number } | null>>;
  setMoveTarget: React.Dispatch<React.SetStateAction<{ x: number; z: number } | null>>;
  setIncomingNudge: React.Dispatch<React.SetStateAction<{ from: string; fromName: string } | null>>;
  setIncomingInvite: React.Dispatch<React.SetStateAction<{ from: string; fromName: string; x: number; y: number } | null>>;
}): UseGatherInteractionsReturn {
  const {
    session, currentUser, currentUserEcs, usuariosEnChunks,
    ecsStateRef, enviarDataLivekit, grantXP,
    setTeleportTarget, setMoveTarget, setIncomingNudge, setIncomingInvite,
  } = params;

  const [interactionState, setInteractionState] = useState(() => ({
    selectedRemoteUser: null as User | null,
    followTargetId: null as string | null,
  }));
  const followTargetIdRef = useRef<string | null>(null);
  const coordinatorRef = useRef<SpaceInteractionCoordinator | null>(null);

  if (!coordinatorRef.current) {
    coordinatorRef.current = new SpaceInteractionCoordinator({
      onStateChange: setInteractionState,
    });
  }

  useEffect(() => {
    coordinatorRef.current?.setRuntime({
      resolveUserById: (userId) => usuariosEnChunks.find((user) => user.id === userId) ?? null,
      resolveUserPosition: (userId) => {
        const ecsData = obtenerEstadoUsuarioEcs(ecsStateRef.current, userId);
        if (!ecsData) return null;
        return { x: ecsData.x, z: ecsData.z };
      },
      getCurrentUserContext: () => ({
        id: session?.user?.id ?? null,
        name: currentUser.name,
        x: currentUserEcs.x,
        y: currentUserEcs.y,
        profilePhoto: currentUser.profilePhoto || null,
      }),
      sendInteraction: (packet) => {
        enviarDataLivekit(packet);
      },
      grantXP,
      setTeleportTarget,
      setMoveTarget,
      hapticFeedback,
    });
  }, [session?.user?.id, currentUser.name, currentUser.profilePhoto, currentUserEcs.x, currentUserEcs.y, usuariosEnChunks, ecsStateRef, enviarDataLivekit, grantXP, setTeleportTarget, setMoveTarget]);

  useEffect(() => {
    followTargetIdRef.current = interactionState.followTargetId;
  }, [interactionState.followTargetId]);

  const setSelectedRemoteUser = useCallback((value: React.SetStateAction<User | null>) => {
    const currentValue = coordinatorRef.current?.getState().selectedRemoteUser ?? null;
    const nextValue = typeof value === 'function' ? value(currentValue) : value;
    coordinatorRef.current?.setSelectedRemoteUser(nextValue);
  }, []);

  const setFollowTargetId = useCallback((value: React.SetStateAction<string | null>) => {
    const currentValue = coordinatorRef.current?.getState().followTargetId ?? null;
    const nextValue = typeof value === 'function' ? value(currentValue) : value;
    coordinatorRef.current?.setFollowTargetId(nextValue);
  }, []);

  const handleClickRemoteAvatar = useCallback((userId: string) => {
    coordinatorRef.current?.handleClickRemoteAvatar(userId);
  }, []);

  const handleGoToUser = useCallback((userId: string) => {
    coordinatorRef.current?.handleGoToUser(userId);
  }, []);

  const handleWaveUser = useCallback((userId: string) => {
    coordinatorRef.current?.handleWaveUser(userId);
  }, []);

  const handleNudgeUser = useCallback((userId: string) => {
    coordinatorRef.current?.handleNudgeUser(userId);
  }, []);

  const handleInviteUser = useCallback((userId: string) => {
    coordinatorRef.current?.handleInviteUser(userId);
  }, []);

  const handleFollowUser = useCallback((userId: string) => {
    coordinatorRef.current?.handleFollowUser(userId);
  }, []);

  const handleAcceptInvite = useCallback(() => {
    coordinatorRef.current?.handleAcceptInvite();
  }, []);

  const avatarInteractionsMemo = useMemo(() => ({
    onGoTo: handleGoToUser,
    onNudge: handleNudgeUser,
    onInvite: handleInviteUser,
    onFollow: handleFollowUser,
    onWave: handleWaveUser,
    followTargetId: interactionState.followTargetId,
    profilePhoto: currentUser.profilePhoto || null,
  }), [handleGoToUser, handleNudgeUser, handleInviteUser, handleFollowUser, handleWaveUser, interactionState.followTargetId, currentUser.profilePhoto]);

  return {
    selectedRemoteUser: interactionState.selectedRemoteUser,
    setSelectedRemoteUser,
    followTargetId: interactionState.followTargetId,
    setFollowTargetId,
    followTargetIdRef,
    incomingNudge: null, // Gestionado externamente
    setIncomingNudge,
    incomingInvite: null, // Gestionado externamente
    setIncomingInvite,
    handleClickRemoteAvatar,
    handleGoToUser,
    handleNudgeUser,
    handleInviteUser,
    handleFollowUser,
    handleWaveUser,
    handleAcceptInvite,
    avatarInteractionsMemo,
  };
}
