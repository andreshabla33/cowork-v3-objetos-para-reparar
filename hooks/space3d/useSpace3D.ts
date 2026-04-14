/**
 * @module hooks/space3d/useSpace3D
 * Hook facade que orquesta todos los domain hooks de Space3D.
 * Conecta las dependencias entre hooks y expone una API unificada
 * al componente VirtualSpace3D.
 */

import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '@/types';
import type { RealtimePositionEntry } from './types';
import { isTouchDevice, hapticFeedback } from '@/lib/mobileDetect';
import { registrarLoginDiario, otorgarXP, XP_POR_ACCION } from '@/lib/gamificacion';
import { supabase } from '@/lib/supabase';
import type { JoystickInput } from '@/components/3d/MobileJoystick';
import { saveCameraSettings, saveAudioSettings, type CameraSettings, type AudioSettings } from '@/modules/realtime-room';
import { seleccionarSpace3DBase } from '@/store/selectores';
import { useUserSettings } from './useUserSettings';
import { useRecording } from './useRecording';
import { useNotifications } from './useNotifications';
import { useChunkSystem } from './useChunkSystem';
import { useMediaStream } from './useMediaStream';
import { useLiveKit } from './useLiveKit';
import { useProximity } from './useProximity';
import { useBroadcast, setBroadcastSoundFunctions } from './useBroadcast';
import { useGatherInteractions } from './useGatherInteractions';
import { Gatekeeper, PreflightSessionStore, SpaceMediaCoordinator, getPreflightFeedback, getPreflightFeedbackMessage } from '@/modules/realtime-room';
import type { PreflightCheck, SpaceMediaCoordinatorState } from '@/modules/realtime-room';
import { logger } from '@/lib/logger';

const log = logger.child('useSpace3D');

export function useSpace3D(props: {
  theme?: string;
  isGameHubOpen?: boolean;
  isPlayingGame?: boolean;
  showroomMode?: boolean;
  showroomDuracionMin?: number;
  showroomNombreVisitante?: string;
}) {
  const { theme = 'dark', isGameHubOpen = false, isPlayingGame = false, showroomMode = false, showroomDuracionMin = 5, showroomNombreVisitante } = props;
  const syncCurrentUserMediaState = useStore((state) => state.syncCurrentUserMediaState);

  // ========== Store ==========
  const {
    currentUser, onlineUsers, setPosition, activeWorkspace,
    togglePrivacy, setPrivacy, updateAvatar,
    session, setActiveSubTab, setActiveChatGroupId, activeSubTab,
    empresasAutorizadas, setEmpresasAutorizadas,
    isEditMode, setIsEditMode, isDragging, setIsDragging,
  } = useStore(useShallow(seleccionarSpace3DBase));

  // ========== Top-level state ==========
  const [moveTarget, setMoveTarget] = useState<{ x: number; z: number } | null>(null);
  const [teleportTarget, setTeleportTarget] = useState<{ x: number; z: number } | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showEmoteWheel, setShowEmoteWheel] = useState(false);
  const [showGamificacion, setShowGamificacion] = useState(false);
  const [cargoUsuario, setCargoUsuario] = useState<string>('colaborador');
  const [incomingNudge, setIncomingNudge] = useState<{ from: string; fromName: string } | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<{ from: string; fromName: string; x: number; y: number } | null>(null);
  const [raisedHandParticipantIds, setRaisedHandParticipantIds] = useState<Set<string>>(new Set());
  const [preflightCheck, setPreflightCheck] = useState<PreflightCheck>({
    camera: 'unknown',
    microphone: 'unknown',
    hasCameraDevice: false,
    hasMicrophoneDevice: false,
    cameraTrackReady: false,
    microphoneTrackReady: false,
    errors: [],
    ready: false,
  });
  const [initialDesiredMediaState] = useState(() => ({
    isCameraEnabled: currentUser.isCameraOn,
    isMicrophoneEnabled: currentUser.isMicOn,
    isScreenShareEnabled: currentUser.isScreenSharing,
  }));
  const [mediaCoordinatorState, setMediaCoordinatorState] = useState<SpaceMediaCoordinatorState | null>(null);
  const [canJoinRealtimeRoom, setCanJoinRealtimeRoom] = useState(false);
  const mobileInputRef = useRef<JoystickInput>({ dx: 0, dz: 0, magnitude: 0, isRunning: false, active: false });
  const isMobile = useMemo(() => isTouchDevice(), []);
  const cardScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  const proximidadNotificadaRef = useRef(false);
  const realtimePositionsRef = useRef<Map<string, RealtimePositionEntry>>(new Map());
  const hasActiveCallRef = useRef(false);
  const mediaCoordinatorRef = useRef<SpaceMediaCoordinator | null>(null);
  const preflightStoreRef = useRef<PreflightSessionStore | null>(null);
  const gatekeeperRef = useRef<Gatekeeper | null>(null);
  const coordinatorDesiredMediaState = mediaCoordinatorState ?? mediaCoordinatorRef.current?.getState() ?? null;
  const desiredMediaState = {
    isCameraEnabled: coordinatorDesiredMediaState?.desiredCameraEnabled ?? initialDesiredMediaState.isCameraEnabled,
    isMicrophoneEnabled: coordinatorDesiredMediaState?.desiredMicrophoneEnabled ?? initialDesiredMediaState.isMicrophoneEnabled,
    isScreenShareEnabled: coordinatorDesiredMediaState?.desiredScreenShareEnabled ?? initialDesiredMediaState.isScreenShareEnabled,
  };

  // ========== XP tracking ==========
  const xpThrottleRef = useRef<Record<string, number>>({});
  const xpLoginRegisteredRef = useRef(false);
  const setMicrophoneDesiredStateCoordinator = useCallback((enabled?: boolean) => {
    const nextEnabled = enabled ?? !desiredMediaState.isMicrophoneEnabled;
    mediaCoordinatorRef.current?.setDesiredMediaState({ microphoneEnabled: nextEnabled });
  }, [desiredMediaState.isMicrophoneEnabled]);
  const setCameraDesiredStateCoordinator = useCallback((enabled?: boolean) => {
    const nextEnabled = enabled ?? !desiredMediaState.isCameraEnabled;
    mediaCoordinatorRef.current?.setDesiredMediaState({ cameraEnabled: nextEnabled });
  }, [desiredMediaState.isCameraEnabled]);
  const setScreenShareDesiredStateCoordinator = useCallback((enabled?: boolean) => {
    const nextEnabled = enabled ?? !desiredMediaState.isScreenShareEnabled;
    mediaCoordinatorRef.current?.setDesiredMediaState({ screenShareEnabled: nextEnabled });
  }, [desiredMediaState.isScreenShareEnabled]);
  const setMicrophoneDesiredState = useCallback((enabled?: boolean) => {
    setMicrophoneDesiredStateCoordinator(enabled);
  }, [setMicrophoneDesiredStateCoordinator]);
  const setCameraDesiredState = useCallback((enabled?: boolean) => {
    setCameraDesiredStateCoordinator(enabled);
  }, [setCameraDesiredStateCoordinator]);
  const setScreenShareDesiredState = useCallback((enabled?: boolean) => {
    setScreenShareDesiredStateCoordinator(enabled);
  }, [setScreenShareDesiredStateCoordinator]);
  const toggleMic = useCallback(() => {
    setMicrophoneDesiredState();
  }, [setMicrophoneDesiredState]);
  const toggleCamera = useCallback(() => {
    setCameraDesiredState();
  }, [setCameraDesiredState]);
  const toggleScreenShare = useCallback((value?: boolean) => {
    setScreenShareDesiredState(value);
  }, [setScreenShareDesiredState]);
  const grantXP = useCallback((accion: keyof typeof XP_POR_ACCION, cooldownMs: number = 10000) => {
    if (!session?.user?.id || !activeWorkspace?.id) return;
    const now = Date.now();
    if (xpThrottleRef.current[accion] && now - xpThrottleRef.current[accion] < cooldownMs) return;
    xpThrottleRef.current[accion] = now;
    otorgarXP(session.user.id, activeWorkspace.id, XP_POR_ACCION[accion], accion).then();
  }, [session?.user?.id, activeWorkspace?.id]);

  // ========== Service Worker ==========
  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    preflightStoreRef.current = new PreflightSessionStore();
    gatekeeperRef.current = new Gatekeeper({
      requireAudio: false,
      requireVideo: false,
      onAllowed: () => setCanJoinRealtimeRoom(true),
      onBlocked: () => setCanJoinRealtimeRoom(false),
    });
    mediaCoordinatorRef.current = new SpaceMediaCoordinator({
      onStateChange: setMediaCoordinatorState,
    });
    mediaCoordinatorRef.current.setDesiredMediaState({
      cameraEnabled: initialDesiredMediaState.isCameraEnabled,
      microphoneEnabled: initialDesiredMediaState.isMicrophoneEnabled,
      screenShareEnabled: initialDesiredMediaState.isScreenShareEnabled,
    });
    setMediaCoordinatorState(mediaCoordinatorRef.current.getState());

    mediaCoordinatorRef.current.initialize(false, false).then((check) => {
      const store = preflightStoreRef.current;
      const gatekeeper = gatekeeperRef.current;
      if (!store || !gatekeeper) {
        setPreflightCheck(check);
        setCanJoinRealtimeRoom(check.ready);
        return;
      }

      store.reset();
      store.updatePermission('camera', check.camera);
      store.updatePermission('microphone', check.microphone);
      store.updateDeviceAvailability('camera', check.hasCameraDevice);
      store.updateDeviceAvailability('microphone', check.hasMicrophoneDevice);
      const validation = gatekeeper.validate(store.getState());
      setPreflightCheck({
        ...check,
        errors: validation.errors,
        ready: validation.canJoin,
      });
      setCanJoinRealtimeRoom(validation.canJoin);
    }).catch(() => {});

    return () => {
      mediaCoordinatorRef.current?.stopMedia();
      preflightStoreRef.current?.reset();
    };
  }, [initialDesiredMediaState]);

  // ========== 1. User Settings ==========
  const settings = useUserSettings({
    livekitRoomRef: { current: null } as React.MutableRefObject<import('livekit-client').Room | null>, // Se actualiza abajo
    hasActiveCallRef,
    toggleMic,
    toggleCamera,
  });

  // ========== 2. Chunk System ==========
  const chunks = useChunkSystem({
    currentUser,
    onlineUsers,
    empresasAutorizadas,
    radioInteresChunks: settings.radioInteresChunks,
    setPosition,
  });

  // ========== 3. Recording ==========
  const recording = useRecording(session?.user?.id);

  // ========== 4. Notifications ==========
  const notifications = useNotifications({
    session,
    activeWorkspace,
    currentUser,
    empresasAutorizadas,
    setEmpresasAutorizadas,
    currentUserEcs: chunks.currentUserEcs,
    notifSettings: settings.notifSettings,
  });

  // ========== 5. Media Stream ==========
  const media = useMediaStream({
    desiredMediaState,
    cameraSettings: settings.cameraSettings,
    audioSettings: settings.audioSettings,
    setScreenShareDesiredState: setScreenShareDesiredStateCoordinator,
  });

  useEffect(() => {
    mediaCoordinatorRef.current?.syncExternalMediaState({
      stream: media.stream,
      screenShareSession: media.screenStream
        ? {
            active: true,
            withAudio: media.screenStream.getAudioTracks().length > 0,
            stream: media.screenStream,
            track: media.screenStream.getVideoTracks()[0],
          }
        : { active: false, withAudio: false },
      desiredCameraEnabled: desiredMediaState.isCameraEnabled,
      desiredMicrophoneEnabled: desiredMediaState.isMicrophoneEnabled,
      desiredScreenShareEnabled: desiredMediaState.isScreenShareEnabled,
    });
  }, [media.stream, media.screenStream, desiredMediaState.isCameraEnabled, desiredMediaState.isMicrophoneEnabled, desiredMediaState.isScreenShareEnabled]);

  useEffect(() => {
    const store = preflightStoreRef.current;
    const gatekeeper = gatekeeperRef.current;

    if (!store || !gatekeeper) {
      return;
    }

    const coordinatorPreflight = mediaCoordinatorRef.current?.getState().preflightCheck;
    if (coordinatorPreflight) {
      store.updatePermission('camera', coordinatorPreflight.camera);
      store.updatePermission('microphone', coordinatorPreflight.microphone);
      store.updateDeviceAvailability('camera', coordinatorPreflight.hasCameraDevice);
      store.updateDeviceAvailability('microphone', coordinatorPreflight.hasMicrophoneDevice);
    }

    const mediaSnapshot = mediaCoordinatorState ?? mediaCoordinatorRef.current?.getState() ?? null;
    const activeStream = mediaSnapshot?.stream ?? media.stream;
    const hasLiveVideoTrack = Boolean(activeStream?.getVideoTracks().some((track) => track.readyState === 'live'));
    const hasLiveAudioTrack = Boolean(activeStream?.getAudioTracks().some((track) => track.readyState === 'live'));
    const isCameraEnabled = mediaSnapshot?.desiredCameraEnabled ?? mediaSnapshot?.isCameraEnabled ?? desiredMediaState.isCameraEnabled;
    const isMicrophoneEnabled = mediaSnapshot?.desiredMicrophoneEnabled ?? mediaSnapshot?.isMicrophoneEnabled ?? desiredMediaState.isMicrophoneEnabled;

    store.updateTrackReady('camera', isCameraEnabled ? hasLiveVideoTrack : false);
    store.updateTrackReady('microphone', isMicrophoneEnabled ? hasLiveAudioTrack : false);

    const nextState = store.getState();
    const validation = gatekeeper.validate(nextState);

    setPreflightCheck({
      ...nextState,
      errors: validation.errors,
      ready: validation.canJoin,
    });
    setCanJoinRealtimeRoom(validation.canJoin);
  }, [mediaCoordinatorState, desiredMediaState.isCameraEnabled, desiredMediaState.isMicrophoneEnabled, media.stream]);

  // ========== 6. LiveKit ==========
  // Necesita hasActiveCall y usersInCall que vienen de proximity
  // Pero proximity necesita remoteStreams de livekit → dependencia circular
  // Solución: usar refs para romper el ciclo
  const hasActiveCallComputed = useRef(false);
  const usersInCallRef = useRef<User[]>([]);
  const usersInAudioRangeRef = useRef<User[]>([]);
  const conversacionesBloqueadasRemotoRef = useRef<Map<string, string[]>>(new Map());

  const livekit = useLiveKit({
    activeWorkspace,
    session,
    currentUser,
    empresasAutorizadas,
    onlineUsers,
    activeStreamRef: media.activeStreamRef,
    activeScreenRef: media.activeScreenRef,
    desiredMediaState,
    mediaCoordinatorState,
    stream: media.stream,
    screenStream: media.screenStream,
    cameraSettings: settings.cameraSettings,
    performanceSettings: settings.performanceSettings as { graphicsQuality?: string; batterySaver?: boolean },
    hasActiveCall: hasActiveCallComputed.current,
    usersInCall: usersInCallRef.current,
    usersInAudioRange: usersInAudioRangeRef.current,
    conversacionesBloqueadasRemoto: conversacionesBloqueadasRemotoRef.current,
  });

  // TODO(round-2): El livekitRoomRef pasado a useUserSettings es un dummy —
  // refactorizar para inyectar el ref real de livekit.livekitRoomRef.

  // ========== 7. Proximity ==========
  // Ahora tenemos remoteStreams de livekit
  const [selectedRemoteUserState, setSelectedRemoteUserState] = useState<User | null>(null);

  const proximity = useProximity({
    currentUserEcs: chunks.currentUserEcs,
    usuariosEnChunks: chunks.usuariosEnChunks,
    session,
    currentUser,
    isScreenShareEnabled: desiredMediaState.isScreenShareEnabled,
    userProximityRadius: settings.userProximityRadius,
    remoteStreams: livekit.remoteStreams,
    remoteScreenStreams: livekit.remoteScreenStreams,
    speakingUsers: livekit.speakingUsers,
    raisedHandParticipantIds,
    performanceSettings: settings.performanceSettings,
    selectedRemoteUser: selectedRemoteUserState,
    setSelectedRemoteUser: setSelectedRemoteUserState,
    handleToggleScreenShare: media.handleToggleScreenShare,
  });

  // Sync refs para LiveKit
  hasActiveCallComputed.current = proximity.hasActiveCall;
  hasActiveCallRef.current = proximity.hasActiveCall;
  usersInCallRef.current = proximity.usersInCall;
  usersInAudioRangeRef.current = proximity.usersInAudioRange;
  conversacionesBloqueadasRemotoRef.current = proximity.conversacionesBloqueadasRemoto;

  // ========== 8. Broadcast ==========
  const broadcast = useBroadcast({
    session,
    currentUser,
    currentUserEcs: chunks.currentUserEcs,
    activeWorkspace,
    usersInCall: proximity.usersInCall,
    enviarDataLivekit: livekit.enviarDataLivekit,
    ecsStateRef: chunks.ecsStateRef,
    usuariosVisiblesRef: chunks.usuariosVisiblesRef,
    realtimePositionsRef,
    realtimeEventBusRef: livekit.realtimeEventBusRef,
    livekitConnected: livekit.livekitConnected,
    raisedHandParticipantIds,
    setRaisedHandParticipantIds,
    conversacionBloqueada: proximity.conversacionBloqueada,
    setConversacionBloqueada: proximity.setConversacionBloqueada,
    setConversacionesBloqueadasRemoto: proximity.setConversacionesBloqueadasRemoto,
    grantXP,
    notifSettings: settings.notifSettings,
    setPrivacy,
    hasActiveCall: proximity.hasActiveCall,
    proximidadNotificadaRef,
    // Fix issue 4bed1af1: useBroadcast ahora setea los incoming cuando
    // llegan los data packets de nudge/invite.
    setIncomingNudge,
    setIncomingInvite,
  });

  // ========== 10. Gather Interactions ==========
  const interactions = useGatherInteractions({
    session,
    currentUser,
    currentUserEcs: chunks.currentUserEcs,
    usuariosEnChunks: chunks.usuariosEnChunks,
    ecsStateRef: chunks.ecsStateRef,
    enviarDataLivekit: livekit.enviarDataLivekit,
    grantXP,
    setTeleportTarget,
    setMoveTarget,
    setIncomingNudge,
    setIncomingInvite,
  });

  // ========== Cargar cargo del usuario ==========
  useEffect(() => {
    const cargarCargo = async () => {
      if (!session?.user?.id || !activeWorkspace?.id) return;
      const { data } = await supabase
        .from('miembros_espacio')
        .select('cargo_id, cargo_ref:cargos!cargo_id(clave)')
        .eq('usuario_id', session.user.id)
        .eq('espacio_id', activeWorkspace.id)
        .single();
      const cargoRef = data?.cargo_ref as { clave?: string } | null;
      const clave = cargoRef?.clave;
      if (clave) setCargoUsuario(clave);
    };
    cargarCargo();

    if (!xpLoginRegisteredRef.current && session?.user?.id && activeWorkspace?.id) {
      xpLoginRegisteredRef.current = true;
      registrarLoginDiario(session.user.id, activeWorkspace.id).then();
    }
  }, [session?.user?.id, activeWorkspace?.id]);

  // ========== Accept invite handler ==========
  const handleAcceptInvite = useCallback(() => {
    if (!incomingInvite) return;
    setMoveTarget(null);
    setTeleportTarget({ x: incomingInvite.x, z: incomingInvite.y });
    setIncomingInvite(null);
    hapticFeedback('medium');
  }, [incomingInvite]);

  const preflightFeedback = useMemo(() => getPreflightFeedback(preflightCheck.errors), [preflightCheck.errors]);
  const preflightFeedbackMessage = useMemo(() => getPreflightFeedbackMessage(preflightCheck.errors), [preflightCheck.errors]);
  const coordinatorMediaSnapshot = mediaCoordinatorState ?? mediaCoordinatorRef.current?.getState() ?? null;
  const mediaState = {
    stream: coordinatorMediaSnapshot?.stream ?? null,
    screenShareSession: coordinatorMediaSnapshot?.screenShareSession ?? { active: false, withAudio: false, stream: undefined, track: undefined },
    desiredCameraEnabled: coordinatorMediaSnapshot?.desiredCameraEnabled ?? coordinatorMediaSnapshot?.isCameraEnabled ?? false,
    desiredMicrophoneEnabled: coordinatorMediaSnapshot?.desiredMicrophoneEnabled ?? coordinatorMediaSnapshot?.isMicrophoneEnabled ?? false,
    desiredScreenShareEnabled: coordinatorMediaSnapshot?.desiredScreenShareEnabled ?? coordinatorMediaSnapshot?.screenShareSession.active ?? false,
    isCameraEnabled: coordinatorMediaSnapshot?.isCameraEnabled ?? false,
    isMicrophoneEnabled: coordinatorMediaSnapshot?.isMicrophoneEnabled ?? false,
  };
  const currentUserRefactored = {
    ...currentUser,
    isMicOn: mediaState.isMicrophoneEnabled,
    isCameraOn: mediaState.isCameraEnabled,
    isScreenSharing: mediaState.screenShareSession.active,
  };
  const mediaRefactored = {
    ...media,
    stream: mediaState.stream,
    screenStream: mediaState.screenShareSession.stream ?? null,
  };
  useEffect(() => {
    syncCurrentUserMediaState({
      isMicOn: mediaState.isMicrophoneEnabled,
      isCameraOn: mediaState.isCameraEnabled,
      isScreenSharing: mediaState.screenShareSession.active,
    });
  }, [mediaState.isMicrophoneEnabled, mediaState.isCameraEnabled, mediaState.screenShareSession.active, syncCurrentUserMediaState]);
  const livekitRefactored = {
    ...livekit,
    livekitConnected: livekit.realtimeCoordinatorState?.connected ?? livekit.livekitConnected,
  };
  const handleToggleCameraNew = useCallback(async (enabled?: boolean) => {
    const nextEnabled = enabled ?? !mediaState.desiredCameraEnabled;
    syncCurrentUserMediaState({ isCameraOn: nextEnabled }); // Optimistic UI update
    if (mediaState.desiredCameraEnabled !== nextEnabled) {
      setCameraDesiredStateCoordinator(nextEnabled);
    }
    return true;
  }, [mediaState.desiredCameraEnabled, setCameraDesiredStateCoordinator, syncCurrentUserMediaState]);
  const handleToggleMicrophoneNew = useCallback(async (enabled?: boolean) => {
    const nextEnabled = enabled ?? !mediaState.desiredMicrophoneEnabled;
    syncCurrentUserMediaState({ isMicOn: nextEnabled }); // Optimistic UI update
    if (mediaState.desiredMicrophoneEnabled !== nextEnabled) {
      setMicrophoneDesiredStateCoordinator(nextEnabled);
    }
    return true;
  }, [mediaState.desiredMicrophoneEnabled, setMicrophoneDesiredStateCoordinator, syncCurrentUserMediaState]);
  const handleToggleScreenShareNew = useCallback(async (enabled?: boolean) => {
    const nextEnabled = enabled ?? !mediaState.desiredScreenShareEnabled;
    syncCurrentUserMediaState({ isScreenSharing: nextEnabled }); // Optimistic UI update
    if (mediaState.desiredScreenShareEnabled !== nextEnabled) {
      setScreenShareDesiredStateCoordinator(nextEnabled);
    }
    return true;
  }, [mediaState.desiredScreenShareEnabled, setScreenShareDesiredStateCoordinator, syncCurrentUserMediaState]);

  const replaceActiveAudioInput = useCallback(async (deviceId: string, nextAudioSettings: AudioSettings) => {
    mediaCoordinatorRef.current?.updateDevicePreferences({
      selectedMicrophoneId: deviceId || null,
      selectedSpeakerId: nextAudioSettings.selectedSpeakerId || null,
    });
    mediaCoordinatorRef.current?.updateAudioProcessingOptions({
      noiseReduction: nextAudioSettings.noiseReduction,
      noiseReductionLevel: nextAudioSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : nextAudioSettings.noiseReductionLevel === 'off' ? 'off' : 'standard',
      echoCancellation: nextAudioSettings.echoCancellation,
      autoGainControl: nextAudioSettings.autoGainControl,
    }, false);

    const coordinator = mediaCoordinatorRef.current;
    if (!coordinator) {
      return false;
    }

    if (!media.activeStreamRef.current || !mediaState.desiredMicrophoneEnabled) {
      return true;
    }

    try {
      media.limpiarAudioProcesado();
      const switched = await coordinator.switchMicrophone(deviceId);
      if (!switched) {
        return false;
      }

      const nextStream = coordinator.getState().stream;
      const nextAudioTrack = nextStream?.getAudioTracks()[0];
      if (!nextStream || !nextAudioTrack) {
        return false;
      }

      nextAudioTrack.enabled = mediaState.desiredMicrophoneEnabled;
      media.activeStreamRef.current = nextStream;
      media.setStream(new MediaStream(nextStream.getTracks()));

      if (livekit.livekitRoomRef.current?.state === 'connected') {
        await livekit.publicarTrackLocal(nextAudioTrack, 'audio');
      }

      return true;
    } catch (error) {
      log.error('Error applying new microphone', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }, [livekit.livekitRoomRef, livekit.publicarTrackLocal, media, mediaState.desiredMicrophoneEnabled]);

  const replaceActiveCameraInput = useCallback(async (deviceId: string) => {
    mediaCoordinatorRef.current?.updateDevicePreferences({ selectedCameraId: deviceId || null });

    if (!media.activeStreamRef.current || !mediaState.desiredCameraEnabled) {
      return true;
    }

    const switched = await mediaCoordinatorRef.current?.switchCamera(deviceId);
    if (!switched) {
      return false;
    }

    const nextVideoTrack = media.activeStreamRef.current.getVideoTracks()[0];
    if (!nextVideoTrack) {
      return false;
    }

    const nextStream = new MediaStream([
      ...media.activeStreamRef.current.getAudioTracks(),
      nextVideoTrack,
    ]);
    media.activeStreamRef.current = nextStream;
    media.setStream(nextStream);

    if (livekit.livekitRoomRef.current?.state === 'connected') {
      await livekit.publicarTrackLocal(nextVideoTrack, 'video');
    }

    return true;
  }, [livekit.livekitRoomRef, livekit.publicarTrackLocal, media, mediaState.desiredCameraEnabled]);

  const handleSwitchDevice = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (kind === 'audio') {
      const nextAudioSettings = {
        ...settings.audioSettings,
        selectedMicrophoneId: deviceId,
      };
      settings.setAudioSettings(nextAudioSettings);
      saveAudioSettings(nextAudioSettings);
      return replaceActiveAudioInput(deviceId, nextAudioSettings);
    }
    const nextCameraSettings = {
      ...settings.cameraSettings,
      selectedCameraId: deviceId,
    };
    settings.setCameraSettings(nextCameraSettings);
    saveCameraSettings(nextCameraSettings);
    return replaceActiveCameraInput(deviceId);
  }, [replaceActiveAudioInput, replaceActiveCameraInput, settings.audioSettings, settings.cameraSettings, settings.setAudioSettings, settings.setCameraSettings]);

  const handleApplyAudioSettings = useCallback(async (nextAudioSettings: AudioSettings) => {
    const previousAudioSettings = settings.audioSettings;
    settings.setAudioSettings(nextAudioSettings);
    saveAudioSettings(nextAudioSettings);

    const microphoneChanged = nextAudioSettings.selectedMicrophoneId !== previousAudioSettings.selectedMicrophoneId;
    const processingChanged =
      nextAudioSettings.noiseReduction !== previousAudioSettings.noiseReduction ||
      nextAudioSettings.noiseReductionLevel !== previousAudioSettings.noiseReductionLevel ||
      nextAudioSettings.echoCancellation !== previousAudioSettings.echoCancellation ||
      nextAudioSettings.autoGainControl !== previousAudioSettings.autoGainControl ||
      nextAudioSettings.selectedSpeakerId !== previousAudioSettings.selectedSpeakerId;

    if ((microphoneChanged || processingChanged) && nextAudioSettings.selectedMicrophoneId) {
      return replaceActiveAudioInput(nextAudioSettings.selectedMicrophoneId, nextAudioSettings);
    }

    mediaCoordinatorRef.current?.updateDevicePreferences({
      selectedMicrophoneId: nextAudioSettings.selectedMicrophoneId || null,
      selectedSpeakerId: nextAudioSettings.selectedSpeakerId || null,
    });
    mediaCoordinatorRef.current?.updateAudioProcessingOptions({
      noiseReduction: nextAudioSettings.noiseReduction,
      noiseReductionLevel: nextAudioSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : nextAudioSettings.noiseReductionLevel === 'off' ? 'off' : 'standard',
      echoCancellation: nextAudioSettings.echoCancellation,
      autoGainControl: nextAudioSettings.autoGainControl,
    }, false);
    return true;
  }, [replaceActiveAudioInput, settings.audioSettings, settings.setAudioSettings]);

  const handleApplyCameraSettings = useCallback(async (nextCameraSettings: CameraSettings) => {
    const previousCameraId = settings.cameraSettings.selectedCameraId;
    settings.setCameraSettings(nextCameraSettings);
    saveCameraSettings(nextCameraSettings);

    if (nextCameraSettings.selectedCameraId && nextCameraSettings.selectedCameraId !== previousCameraId) {
      return replaceActiveCameraInput(nextCameraSettings.selectedCameraId);
    }

    mediaCoordinatorRef.current?.updateDevicePreferences({ selectedCameraId: nextCameraSettings.selectedCameraId || null });
    return true;
  }, [replaceActiveCameraInput, settings.cameraSettings.selectedCameraId, settings.setCameraSettings]);

  const videoBackgroundKey = useMemo(() => {
    if (!mediaState.stream) return 'no-stream';
    const videoTrack = mediaState.stream.getVideoTracks()[0];
    return videoTrack?.id || 'no-video-track';
  }, [mediaState.stream]);

  return {
    // Store
    currentUser: currentUserRefactored, onlineUsers, setPosition, activeWorkspace,
    toggleMic, toggleCamera, toggleScreenShare, togglePrivacy, setPrivacy, updateAvatar,
    setMicrophoneDesiredState, setCameraDesiredState, setScreenShareDesiredState,
    setMicrophoneDesiredStateCoordinator, setCameraDesiredStateCoordinator, setScreenShareDesiredStateCoordinator,
    session, setActiveSubTab, setActiveChatGroupId, activeSubTab,
    empresasAutorizadas, setEmpresasAutorizadas,
    isEditMode, setIsEditMode, isDragging, setIsDragging,


    // Top-level state
    theme, isGameHubOpen, isPlayingGame, showroomMode, showroomDuracionMin, showroomNombreVisitante,
    moveTarget, setMoveTarget,
    teleportTarget, setTeleportTarget,
    showAvatarModal, setShowAvatarModal,
    showEmoteWheel, setShowEmoteWheel,
    showGamificacion, setShowGamificacion,
    cargoUsuario,
    incomingNudge, setIncomingNudge,
    incomingInvite, setIncomingInvite,
    mobileInputRef, isMobile,
    cardScreenPosRef,
    realtimePositionsRef,
    grantXP,
    handleAcceptInvite,
    preflightCheck,
    preflightFeedback,
    preflightFeedbackMessage,
    canJoinRealtimeRoom,
    preflightState: preflightCheck,
    mediaState,
    videoBackgroundKey,
    realtimeState: livekit.realtimeCoordinatorState,
    mediaCoordinatorRef,
    mediaCoordinatorState,
    realtimeCoordinatorRef: livekit.realtimeCoordinatorRef,
    realtimeCoordinatorState: livekit.realtimeCoordinatorState,
    preflightStoreRef,
    gatekeeperRef,
    handleToggleCameraNew,
    handleToggleMicrophoneNew,
    handleToggleScreenShareNew,
    handleSwitchDevice,
    handleApplyAudioSettings,
    handleApplyCameraSettings,

    // Domain hooks
    settings,
    chunks,
    recording,
    notifications,
    media: mediaRefactored,
    livekit: livekitRefactored,
    proximity,
    broadcast,
    interactions,
  };
}
