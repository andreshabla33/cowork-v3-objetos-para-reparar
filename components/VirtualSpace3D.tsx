'use client';

import React, { useRef, useEffect, Suspense, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Grid, Loader } from '@react-three/drei';
import { Room, Track } from 'livekit-client';
import { User, PresenceStatus, Role, ZonaEmpresa } from '@/types';
import { FloorType } from '../src/core/domain/entities';
import { RecordingManager } from './meetings/recording/RecordingManager';
import type { CargoLaboral } from './meetings/recording/types/analysis';
import { ConsentimientoPendiente } from './meetings/recording/ConsentimientoPendiente';
import { BottomControlBar } from './BottomControlBar';
import { AvatarCustomizer3D } from './AvatarCustomizer3D';
import { useLiveKitVideoBackground, useLocalCameraTrack } from '@/modules/realtime-room';
import type { LocalVideoTrack } from 'livekit-client';
import { useRendererMetrics } from '@/hooks/space3d/useRendererMetrics';
import { SpatialAudio } from './3d/SpatialAudio';
import { type GpuInfo } from '@/lib/gpuCapabilities';
import { logger } from '@/lib/logger';
import { MobileJoystick, type JoystickInput } from './3d/MobileJoystick';
import { EmoteWheel } from './3d/EmoteWheel';
import { DayNightCycle } from './3d/DayNightCycle';
import { hapticFeedback } from '@/lib/mobileDetect';
import { GamificacionPanel } from './GamificacionPanel';
import { useSpace3D, useSpaceVideoHudLayoutSnapshot } from '@/hooks/space3d';
import { useEspacioObjetos, type EspacioObjeto, type TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
import { useHistorialEdicion } from '@/hooks/space3d/useHistorialEdicion';
import { useOcupacionAsientos } from '@/hooks/space3d/useOcupacionAsientos';
import { useWebGLContextRecovery } from '@/hooks/space3d/useWebGLContextRecovery';
import { useSpace3DKeyboardShortcuts } from '@/hooks/space3d/useSpace3DKeyboardShortcuts';
import { setBroadcastSoundFunctions } from '@/hooks/space3d/useBroadcast';
import { XP_POR_ACCION } from '@/lib/gamificacion';
import { useStore } from '@/store/useStore';
import { useApplicationServices } from '@/src/core/application/useApplicationServices';
import type { InteraccionObjetoAccion } from '@/src/core/application/usecases/InteraccionObjetoUseCase';
// GameHub ahora se importa en WorkspaceLayout
// Nota (F3): ya no importamos `toastEmitter` directamente. Los toasts se
// emiten a través del port `INotificationBus` (vía useApplicationServices).
import { EditModeHUD, EditModeToast, InspectorEdicionObjeto, PlacementHUD, PlacementToast, ToastContainer } from './3d/PlacementHUD';
import { AdminZoneHUD } from './3d/AdminZoneHUD';
import { BuildModePanel } from './3d/BuildModePanel';
import type { CatalogoObjeto3D, ObjetoPreview3D } from '@/types/objetos3d';
import type { AsientoRuntime3D } from './space3d/asientosRuntime';
// `normalizarInteraccionConfigObjeto` / `resolverDisplayObjeto` / `resolverUseObjeto`
// ya no se importan aquí: son detalles de dominio consumidos por
// `InteraccionObjetoUseCase`. Solo mantenemos el tipo `DisplayRuntimeNormalizado3D`
// que sigue siendo el param de `ejecutarDestinoVisual`.
import type { DisplayRuntimeNormalizado3D } from './space3d/interaccionesObjetosRuntime';

// `playObjectInteractionSound` ya no se importa aquí: lo invoca el port
// `soundBus.play('object_interaction')` dentro del ejecutor de acciones.
// Las otras tres siguen importadas porque `setBroadcastSoundFunctions`
// (hook legacy) requiere las funciones directamente — migrarlo a `ISoundBus`
// queda pendiente para cuando se refactorice `useBroadcast`.
import { themeColors, TELEPORT_DISTANCE, playWaveSound, playNudgeSound, playInviteSound } from './space3d/shared';

import { Minimap, StableVideo, Avatar, RemoteUsers, CameraFollow, AvatarScreenProjector, TeleportEffect, Player, Scene, AdaptiveFrameloop, VideoHUD, ScreenSpaceProfileCard, statusColors, type VirtualSpace3DProps } from './space3d/InternalComponents';

const SceneFallback: React.FC<{ theme: string }> = ({ theme }) => (
  <>
    <color attach="background" args={[themeColors[theme] || '#000000']} />
    <ambientLight intensity={0.45} />
    <Grid args={[200, 200]} cellSize={2} cellThickness={0.6} sectionSize={10} sectionThickness={1} fadeDistance={120} fadeStrength={1} infiniteGrid />
  </>
);

/**
 * @deprecated SceneReadyProbe — REMOVED (Fase 5C race condition fix, 2026-04-09).
 *
 * Previously fired onReady() immediately on mount inside Suspense, hiding the
 * loading screen ~2 seconds before StaticObjectBatcher/BuiltinWallBatcher
 * completed their merge pipeline. This caused visible pop-in where glass walls
 * appeared solid during the gap.
 *
 * The ready signal now originates from Scene3D.onSceneReady, which fires AFTER
 * sceneOptimization.isReady=true AND one requestAnimationFrame — guaranteeing
 * merged geometry is in the scene graph and submitted to the GPU.
 *
 * @see Scene3D — onSceneReady prop and useEffect that gates it
 */

/**
 * RendererMetricsProbe — Wrapper R3F del hook canónico `useRendererMetrics`.
 *
 * Reemplaza la implementación inline legacy (CLEAN-ARCH-F3 hotfix 2026-04-10)
 * que duplicaba la lectura de `gl.info.*`, bypassaba la capa Infrastructure
 * (`rendererMetricsMonitor`) y nunca pasaba por el dominio
 * (`OptimizarRenderizadoUseCase.evaluarMetricasSinAdapter`).
 *
 * El hook incluye:
 *   - Idle guard de doble capa (adaptive frameloop + delta tracking)
 *   - Detección de oscilación de geometrías/texturas
 *   - Alertas de umbrales del dominio
 */
const RendererMetricsProbe: React.FC<{ adaptiveDpr: number; gpuInfo?: GpuInfo | null }> = ({ adaptiveDpr, gpuInfo }) => {
  useRendererMetrics({
    gpuTier: gpuInfo?.tier ?? 1,
    adaptiveDpr,
    emitirAlertas: true,
  });
  return null;
};

const VirtualSpace3D: React.FC<VirtualSpace3DProps> = ({ theme = 'dark', isGameHubOpen = false, isPlayingGame = false, showroomMode = false, showroomDuracionMin = 5, showroomNombreVisitante }) => {
  // ========== Structured Logger ==========
  const log = logger.child('VirtualSpace3D');

  // ========== Domain Hook Facade ==========
  const s = useSpace3D({ theme, isGameHubOpen, isPlayingGame, showroomMode, showroomDuracionMin, showroomNombreVisitante });
  const addNotification = useStore((state) => state.addNotification);

  // Store
  const userRoleInActiveWorkspace = useStore((state) => state.userRoleInActiveWorkspace);
  const { currentUser, onlineUsers, setPosition, activeWorkspace, toggleScreenShare, togglePrivacy, setPrivacy, session, setActiveSubTab, setActiveChatGroupId, activeSubTab, empresasAutorizadas, setEmpresasAutorizadas, isEditMode, setIsEditMode, isDragging, setIsDragging, handleToggleCameraNew, handleToggleMicrophoneNew, handleApplyAudioSettings, handleApplyCameraSettings, mediaState, videoBackgroundKey } = s;
  const isScreenSharingActive = mediaState.screenShareSession.active;

  const [objetoEnColocacion, setObjetoEnColocacion] = React.useState<ObjetoPreview3D | null>(null);
  const [placementToastName, setPlacementToastName] = React.useState<string | null>(null);
  const [ultimoObjetoColocadoId, setUltimoObjetoColocadoId] = React.useState<string | null>(null);
  const setSelectedObjectId = useStore((state) => state.setSelectedObjectId);
  const selectedObjectId = useStore((state) => state.selectedObjectId);
  const selectedObjectIds = useStore((state) => state.selectedObjectIds);
  const setSelectedObjectIds = useStore((state) => state.setSelectedObjectIds);
  const copiedObjects = useStore((state) => state.copiedObjects);
  const setCopiedObjects = useStore((state) => state.setCopiedObjects);
  const modoEdicionObjeto = useStore((state) => state.modoEdicionObjeto);
  const setModoEdicionObjeto = useStore((state) => state.setModoEdicionObjeto);
  const clearObjectSelection = useStore((state) => state.clearObjectSelection);
  const plantillaZonaEnColocacion = useStore((state) => state.plantillaZonaEnColocacion);
  const actualizarPosicionPlantillaZonaEnColocacion = useStore((state) => state.actualizarPosicionPlantillaZonaEnColocacion);
  const clearPlantillaZonaEnColocacion = useStore((state) => state.clearPlantillaZonaEnColocacion);
  const dragSeleccionRef = useRef<string | null>(null);
  const prevIsDraggingRef = useRef(false);
  const lastPreflightFeedbackRef = useRef<string | null>(null);

  // ── DI: Use Cases inyectados vía container singleton ───────────────────────
  // El ApplicationServicesContainer instancia los adapters (Supabase repo,
  // inyector de plantilla) una sola vez por sesión y los comparte. Elimina
  // los `new … Adapter()` que antes vivían en este componente (violación
  // Clean Arch: Presentation instanciando Infrastructure).
  const {
    aplicarPlantillaZona: aplicarPlantillaZonaUseCase,
    eliminarPlantillaZona: eliminarPlantillaZonaUseCase,
    interaccionObjeto: interaccionObjetoUseCase,
    notifications: notificationBus,
    sounds: soundBus,
  } = useApplicationServices();

  // Top-level state
  const { moveTarget, setMoveTarget, teleportTarget, setTeleportTarget, showAvatarModal, setShowAvatarModal, showEmoteWheel, setShowEmoteWheel, showGamificacion, setShowGamificacion, cargoUsuario, incomingNudge, setIncomingNudge, incomingInvite, setIncomingInvite, mobileInputRef, isMobile, cardScreenPosRef, realtimePositionsRef, grantXP, handleAcceptInvite, preflightFeedbackMessage } = s;

  // Zona state (Admin)
  const [nuevaZonaTemp, setNuevaZonaTemp] = React.useState<{ancho: number, alto: number, x: number, z: number, tipoSuelo?: FloorType, nivelAnidamiento?: number} | null>(null);
  const [zonaAEditar, setZonaAEditar] = React.useState<ZonaEmpresa | null>(null);
  const setIsDrawingZone = useStore((s) => s.setIsDrawingZone);

  // Settings
  const { gpuRenderConfig, gpuInfo, userMoveSpeed, userRunSpeed, userProximityRadius, maxDpr, minDpr, adaptiveDpr, setAdaptiveDpr, enableDayNightCycle, cameraSettings, audioSettings } = s.settings;
  const space3dSettings = s.settings.space3dSettings;
  const performanceSettings = s.settings.performanceSettings;

  // Chunks
  const { currentUserEcs, onlineUsersEcs, usuariosEnChunks, usuariosParaConexion, usuariosParaMinimapa, chunkActual, ecsStateRef, interpolacionWorkerRef, posicionesInterpoladasRef, setPositionEcs, chunkVecinosRef, usuariosVisiblesRef } = s.chunks;

  // Recording
  const { isRecording, setIsRecording, recordingDuration, setRecordingDuration, consentimientoAceptado, setConsentimientoAceptado, tipoGrabacionActual, setTipoGrabacionActual, recordingTrigger, setRecordingTrigger, handleToggleRecording } = s.recording;

  // Notifications
  const { notificacionAutorizacion, setNotificacionAutorizacion, zonasEmpresa, zonaAccesoProxima, handleSolicitarAccesoZona, solicitandoAcceso, setZonaColisionadaId, refrescarZonasEmpresa } = s.notifications;

  // Media
  const { stream, screenStream, activeScreenRef, handleToggleScreenShare } = s.media;

  // LiveKit
  const { livekitConnected, remoteAudioTracks, speakingUsers, sincronizarTracksLocales, enviarDataLivekit, getPublishedVideoTrack } = s.livekit;
  const remoteStreams = s.livekit.remoteStreams;
  const remoteScreenStreams = s.livekit.remoteScreenStreams;

  // Preview LocalVideoTrack: wrapper del MediaStreamTrack crudo de la
  // cámara que existe ANTES de cualquier publicación a LiveKit. En el
  // espacio 3D la publicación está gated por proximidad (solo se publica
  // cuando hay usuarios cercanos), así que sin este preview el processor
  // no tendría sobre qué actuar hasta que otro usuario se acercara.
  const localCameraTrack = useLocalCameraTrack({ mediaStream: stream });

  // Background processor — hook compartido con meetings. Aplica
  // setProcessor(disabled) + switchTo() siguiendo el patrón oficial de
  // LiveKit. El `resolveActiveVideoTrack` prefiere el track publicado
  // (para que el processor aplique sobre el stream enviado a remotos)
  // y cae al preview local cuando aún no hay publicación (para que el
  // HUD local muestre el efecto desde el primer momento).
  const resolveActiveVideoTrack = useCallback((): LocalVideoTrack | null => {
    return getPublishedVideoTrack() ?? localCameraTrack;
  }, [getPublishedVideoTrack, localCameraTrack]);

  const { isLocalVideoProcessed: isProcessorActive } = useLiveKitVideoBackground({
    resolveActiveVideoTrack,
    effectType: cameraSettings.backgroundEffect as 'none' | 'blur' | 'image',
    blurRadius: 12,
    backgroundImage: cameraSettings.backgroundImage,
    enabled: mediaState.isCameraEnabled,
  });

  // Proximity
  const { usersInCall, orderedUsersInCall, usersInCallIds, hasActiveCall, usersInAudioRange, usersInAudioRangeIds, userDistances, remoteStreamsRouted, remoteScreenStreamsRouted, conversacionBloqueada, conversacionProximaBloqueada } = s.proximity;
  const { layoutSnapshot: videoHudLayoutSnapshot } = useSpaceVideoHudLayoutSnapshot({
    usersInCall,
    orderedUsersInCall,
    remoteStreams: remoteStreamsRouted,
    remoteScreenStreams: remoteScreenStreamsRouted,
    speakingUsers,
    raisedHandParticipantIds: s.broadcast.raisedHandParticipantIds,
    userDistances,
  });

  // Broadcast
  const { broadcastMovement, bloquearConversacion, handleSendMessage, handleTriggerReaction, handleToggleRaiseHand, showEmojis, setShowEmojis, showChat, setShowChat, showStatusPicker, setShowStatusPicker, chatInput, setChatInput, localMessage, remoteMessages, localReactions, remoteReaction, isLocalHandRaised, incomingWave, setIncomingWave } = s.broadcast;

  // Interactions
  const { selectedRemoteUser, setSelectedRemoteUser, followTargetId, setFollowTargetId, followTargetIdRef, handleClickRemoteAvatar, avatarInteractionsMemo, handleWaveUser, handleInviteUser, handleFollowUser } = s.interactions;

  // ── WebGL recovery (extraído a useWebGLContextRecovery) ────────────────────
  // El hook encapsula listeners webglcontextlost/restored, métricas de mount
  // y el flag isSceneReady. Reemplaza la gestión inline de canvasDomRef,
  // canvasEventHandlersRef y canvasMetricsRef.
  const {
    handleCanvasCreated,
    markSceneReady,
    isSceneReady,
    metricsRef: canvasMetricsRef,
  } = useWebGLContextRecovery({
    clearColor: themeColors[theme] || '#000000',
    onConfigureRenderer: (gl) => {
      if (gpuRenderConfig) {
        gl.toneMappingExposure = gpuRenderConfig.toneMappingExposure;
      }
    },
  });

  // Objetos persistentes (escritorios reclamables)
  const { objetos: espacioObjetos, refrescarObjetos, crearObjetoDesdeCatalogo, reemplazarObjetoDesdeCatalogo, reclamarObjeto, liberarObjeto, actualizarTransformacionObjeto, moverObjeto, rotarObjeto, eliminarObjeto, duplicarObjetos, restaurarObjeto, spawnPersonal, miEscritorio, guardarSpawnPersonal } = useEspacioObjetos(
    activeWorkspace?.id || null,
    session?.user?.id || null,
    currentUser.empresa_id || null
  );
  const objetoSeleccionado = React.useMemo(
    () => espacioObjetos.find((obj) => obj.id === selectedObjectId) || null,
    [espacioObjetos, selectedObjectId]
  );
  const { registrarCreacion, registrarEliminacion, registrarTransformacion, registrarInicioArrastre, registrarFinArrastre, canUndo, canRedo, deshacer, rehacer } = useHistorialEdicion({
    objetos: espacioObjetos,
    isEditMode,
    selectedObjectId,
    setSelectedObjectId,
    actualizarTransformacionObjeto,
    eliminarObjeto,
    restaurarObjeto,
    onNotificar: (msg: string) => notificationBus.emit({ mensaje: msg, variante: 'info' }),
  });
  const {
    ocupacionesPorObjetoId: ocupacionesAsientosPorObjetoId,
    ocuparAsiento,
    liberarAsiento,
    refrescarOcupacion,
  } = useOcupacionAsientos(
    activeWorkspace?.id || null,
    session?.user?.id || null
  );

  const handleOcuparAsiento = useCallback(async (asiento: AsientoRuntime3D) => {
    if (!asiento.objetoId) return true;

    const resultado = await ocuparAsiento(asiento.objetoId, asiento.claveAsiento || 'principal');
    if (!resultado.ok) {
      if (resultado.motivo === 'asiento_ocupado') {
        addNotification('Ese asiento ya está ocupado por otro usuario.', 'info');
      } else {
        addNotification('No se pudo reservar el asiento.', 'info');
      }
      return false;
    }

    return true;
  }, [addNotification, ocuparAsiento]);

  const handleLiberarAsiento = useCallback(async (asiento: AsientoRuntime3D | null) => {
    if (!asiento?.objetoId) return true;
    return liberarAsiento(asiento.objetoId, asiento.claveAsiento || 'principal');
  }, [liberarAsiento]);

  useEffect(() => {
    if (!preflightFeedbackMessage) {
      lastPreflightFeedbackRef.current = null;
      return;
    }

    if (lastPreflightFeedbackRef.current === preflightFeedbackMessage) {
      return;
    }

    lastPreflightFeedbackRef.current = preflightFeedbackMessage;
    addNotification(preflightFeedbackMessage, 'info');
  }, [addNotification, preflightFeedbackMessage]);

  const handleRefrescarAsiento = useCallback(async (asiento: AsientoRuntime3D) => {
    if (!asiento.objetoId) return true;
    return refrescarOcupacion(asiento.objetoId, asiento.claveAsiento || 'principal');
  }, [refrescarOcupacion]);

  const ejecutarDestinoVisual = useCallback((config: DisplayRuntimeNormalizado3D, fallbackMensaje?: string | null) => {
    let ejecutoAccion = false;

    if (config.subtab) {
      setActiveSubTab(config.subtab);
      ejecutoAccion = true;
    }

    if (config.modal === 'avatar') {
      setShowAvatarModal(true);
      ejecutoAccion = true;
    }

    if (config.modal === 'gamificacion') {
      setShowGamificacion(true);
      ejecutoAccion = true;
    }

    if (config.overlay === 'chat') {
      setShowChat(true);
      setShowEmojis(false);
      setShowStatusPicker(false);
      ejecutoAccion = true;
    }

    if (config.overlay === 'emotes') {
      setShowEmoteWheel(true);
      setShowChat(false);
      setShowStatusPicker(false);
      ejecutoAccion = true;
    }

    const mensaje = config.notificacionMensaje || fallbackMensaje;
    if (mensaje) {
      addNotification(mensaje, config.notificacionTipo || 'info');
      ejecutoAccion = true;
    }

    return ejecutoAccion;
  }, [addNotification, setActiveSubTab, setShowAvatarModal, setShowChat, setShowEmojis, setShowEmoteWheel, setShowGamificacion, setShowStatusPicker]);

  // `ejecutarTeleportObjeto` eliminado: la lógica vive ahora en
  // `InteraccionObjetoUseCase.execute()` (caso 'teleport') y la presentación
  // la ejecuta vía `ejecutarAccionInteraccion` (más abajo).

  /**
   * Ejecutor de acciones del plan devuelto por `InteraccionObjetoUseCase`.
   * Aísla la translación dominio→side-effect (setMoveTarget, addNotification,
   * grantXP, playSound, etc.) para que el componente no conozca la lógica
   * de switch-case de tipos de interacción.
   */
  const ejecutarAccionInteraccion = useCallback((accion: InteraccionObjetoAccion, fallbackLabel: string | null) => {
    switch (accion.tipo) {
      case 'caminar':
        setTeleportTarget(null);
        setMoveTarget(accion.destino);
        return true;
      case 'teleport':
        setMoveTarget(null);
        setTeleportTarget(accion.destino);
        return true;
      case 'destinoVisual': {
        const ejecuto = ejecutarDestinoVisual(accion.config, accion.fallbackMensaje);
        if (!ejecuto && fallbackLabel) {
          addNotification(fallbackLabel, 'info');
        }
        return ejecuto;
      }
      case 'otorgarXP':
        if (accion.accion in XP_POR_ACCION) {
          grantXP(accion.accion as keyof typeof XP_POR_ACCION, accion.cooldownMs);
        }
        return true;
      case 'notificar': {
        // `addNotification` acepta 'info' | 'error' | 'mention' | 'entry' | 'success'.
        // Mapeamos el nivel del use case al conjunto soportado por el store.
        const nivel: 'info' | 'error' | 'success' =
          accion.nivel === 'error' ? 'error' :
          accion.nivel === 'success' ? 'success' : 'info';
        addNotification(accion.mensaje, nivel);
        return true;
      }
      case 'haptic':
        hapticFeedback(accion.intensidad);
        return true;
      case 'sonido':
        soundBus.play(accion.clip);
        return true;
      default:
        return false;
    }
  }, [addNotification, ejecutarDestinoVisual, grantXP, setMoveTarget, setTeleportTarget]);

  const handleInteraccionObjeto = useCallback((objeto: EspacioObjeto, asiento: AsientoRuntime3D | null) => {
    const asientoOcupadoPorUsuarioId = asiento?.objetoId
      ? ocupacionesAsientosPorObjetoId.get(asiento.objetoId)?.usuario_id ?? null
      : null;

    const plan = interaccionObjetoUseCase.execute({
      objeto,
      asiento,
      posicionJugador: {
        x: (currentUserEcs?.x || 400) / 16,
        z: (currentUserEcs?.y || 400) / 16,
      },
      teleportThreshold: TELEPORT_DISTANCE,
      usuarioActualId: session?.user?.id ?? null,
      asientoOcupadoPorUsuarioId,
      xpAccionesConocidas: XP_POR_ACCION,
    });

    const fallbackLabel = objeto.interaccion_label || null;
    for (const accion of plan.acciones) {
      ejecutarAccionInteraccion(accion, fallbackLabel);
    }
  }, [currentUserEcs, ejecutarAccionInteraccion, interaccionObjetoUseCase, ocupacionesAsientosPorObjetoId, session?.user?.id]);

  const handlePrepararObjeto = useCallback((catalogo: CatalogoObjeto3D) => {
    if (isEditMode && selectedObjectId) {
      void (async () => {
        const reemplazado = await reemplazarObjetoDesdeCatalogo(selectedObjectId, catalogo);
        if (!reemplazado) return;
        notificationBus.emit({ mensaje: `♻ ${reemplazado.nombre || catalogo.nombre} reemplazado`, variante: 'success' });
      })();
      return;
    }

    const baseX = (currentUserEcs?.x || 400) / 16;
    const baseZ = (currentUserEcs?.y || 400) / 16;
    const alto = Number(catalogo.alto) || 1;

    setIsEditMode(false);
    setObjetoEnColocacion({
      ...catalogo,
      posicion_x: baseX + 1.5,
      posicion_y: Math.max(alto / 2, 0.02),
      posicion_z: baseZ + 1.5,
      rotacion_y: 0,
    });
  }, [currentUserEcs?.x, currentUserEcs?.y, isEditMode, reemplazarObjetoDesdeCatalogo, selectedObjectId, setIsEditMode]);

  const handleCancelarColocacion = useCallback(() => {
    setObjetoEnColocacion(null);
  }, []);

  const handleActualizarObjetoEnColocacion = useCallback((x: number, y: number, z: number) => {
    setObjetoEnColocacion((prev) => prev ? { ...prev, posicion_x: x, posicion_y: y, posicion_z: z } : prev);
  }, []);

  const handleActualizarPlantillaZonaEnColocacion = useCallback((x: number, z: number) => {
    actualizarPosicionPlantillaZonaEnColocacion(x, z);
  }, [actualizarPosicionPlantillaZonaEnColocacion]);

  const handleConfirmarObjetoEnColocacion = useCallback(async () => {
    if (!objetoEnColocacion) return;

    const creado = await crearObjetoDesdeCatalogo(
      objetoEnColocacion,
      {
        x: objetoEnColocacion.posicion_x,
        y: objetoEnColocacion.posicion_y,
        z: objetoEnColocacion.posicion_z,
      },
      objetoEnColocacion.rotacion_y || 0
    );

    if (!creado) return;

    registrarCreacion(creado);
    setPlacementToastName(objetoEnColocacion.nombre);
    notificationBus.emit({ mensaje: `📦 ${objetoEnColocacion.nombre} — listo para editar`, variante: 'success' });
    setUltimoObjetoColocadoId(creado.id);
    setObjetoEnColocacion(null);
    setIsEditMode(true);
    setSelectedObjectId(creado.id);
  }, [crearObjetoDesdeCatalogo, objetoEnColocacion, registrarCreacion, setIsEditMode, setSelectedObjectId]);

  const handleConfirmarPlantillaZonaEnColocacion = useCallback(async () => {
    if (!plantillaZonaEnColocacion || !activeWorkspace?.id || !session?.user?.id) {
      return;
    }

    try {
      const resultado = await aplicarPlantillaZonaUseCase.execute({
        zonaId: plantillaZonaEnColocacion.zonaId,
        espacioId: activeWorkspace.id,
        userId: session.user.id,
        plantillaId: plantillaZonaEnColocacion.plantillaId,
        centroXMetros: plantillaZonaEnColocacion.posicionX,
        centroZMetros: plantillaZonaEnColocacion.posicionZ,
      });

      clearPlantillaZonaEnColocacion();
      await Promise.all([refrescarZonasEmpresa(), refrescarObjetos()]);
      addNotification(`Plantilla ${resultado.plantilla.nombre} aplicada en la posición elegida.`, 'info');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Failed to apply plantilla de zona', { error: errorMsg });
      addNotification(errorMsg || 'No se pudo aplicar la plantilla de zona.', 'info');
    }
  }, [activeWorkspace?.id, addNotification, aplicarPlantillaZonaUseCase, clearPlantillaZonaEnColocacion, plantillaZonaEnColocacion, refrescarObjetos, refrescarZonasEmpresa, session?.user?.id]);

  const handleEliminarPlantillaZonaCompleta = useCallback(async (objeto: EspacioObjeto) => {
    if (!activeWorkspace?.id || !session?.user?.id) {
      return false;
    }

    const coincidenciaPlantilla = (objeto.plantilla_origen || '').match(/^zona:([^:]+):(.+)$/);
    const metaPlantilla = (objeto.configuracion_geometria as Record<string, unknown> | null)?.meta_plantilla_zona as { zona_id?: string } | undefined;
    const zonaId = coincidenciaPlantilla?.[2]
      || metaPlantilla?.zona_id
      || null;

    if (!zonaId) {
      addNotification('No se pudo resolver la zona dueña de esta plantilla.', 'info');
      return false;
    }

    try {
      const resultado = await eliminarPlantillaZonaUseCase.execute({
        zonaId,
        espacioId: activeWorkspace.id,
        userId: session.user.id,
        plantillaOrigen: objeto.plantilla_origen ?? null,
      });

      clearObjectSelection();
      await Promise.all([refrescarObjetos(), refrescarZonasEmpresa()]);
      addNotification(`Plantilla eliminada. Objetos: ${resultado.objetosEliminados}, subzonas: ${resultado.subzonasEliminadas}.`, 'info');
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Failed to delete plantilla completa', { error: errorMsg });
      addNotification(errorMsg || 'No se pudo eliminar la plantilla completa.', 'info');
      return false;
    }
  }, [activeWorkspace?.id, addNotification, clearObjectSelection, eliminarPlantillaZonaUseCase, refrescarObjetos, refrescarZonasEmpresa, session?.user?.id]);

  const handleRotarObjeto = useCallback(async (id: string, rotationY: number) => {
    const objetoAntes = espacioObjetos.find((obj) => obj.id === id);
    if (!objetoAntes) return false;

    const snapshotAntes = JSON.parse(JSON.stringify(objetoAntes)) as EspacioObjeto;
    const snapshotDespues = {
      ...snapshotAntes,
      rotacion_y: ((snapshotAntes.rotacion_y || rotationY || 0) + Math.PI / 2) % (Math.PI * 2),
    };

    const ok = await rotarObjeto(id, rotationY);
    if (ok) {
      registrarTransformacion(snapshotAntes, snapshotDespues);
      notificationBus.emit({ mensaje: '↻ Objeto rotado', variante: 'success' });
    }
    return ok;
  }, [espacioObjetos, registrarTransformacion, rotarObjeto]);

  const handleEliminarObjeto = useCallback(async (id: string) => {
    const objetoAntes = espacioObjetos.find((obj) => obj.id === id);
    if (!objetoAntes) return false;

    const snapshotAntes = JSON.parse(JSON.stringify(objetoAntes)) as EspacioObjeto;
    const ok = await eliminarObjeto(id);
    if (ok) {
      registrarEliminacion(snapshotAntes);
      notificationBus.emit({ mensaje: '🗑 Objeto eliminado', variante: 'warning' });
    }
    return ok;
  }, [eliminarObjeto, espacioObjetos, registrarEliminacion]);

  const handleTransformarObjeto = useCallback(async (id: string, cambios: TransformacionObjetoInput) => {
    const objetoAntes = espacioObjetos.find((obj) => obj.id === id);
    if (!objetoAntes) return false;
    return actualizarTransformacionObjeto(id, cambios);
  }, [actualizarTransformacionObjeto, espacioObjetos]);

  useEffect(() => {
    if (isDragging && !prevIsDraggingRef.current && selectedObjectId) {
      registrarInicioArrastre(selectedObjectId);
      dragSeleccionRef.current = selectedObjectId;
    }

    if (!isDragging && prevIsDraggingRef.current && dragSeleccionRef.current) {
      registrarFinArrastre(dragSeleccionRef.current);
      dragSeleccionRef.current = null;
    }

    prevIsDraggingRef.current = isDragging;
  }, [isDragging, registrarFinArrastre, registrarInicioArrastre, selectedObjectId]);

  // Los atajos de teclado (Escape para cancelar colocaciones, Ctrl/Cmd+C/V
  // para copiar/pegar en modo edición) viven en `useSpace3DKeyboardShortcuts`.
  // Ver invocación abajo tras la definición de duplicarObjetos.

  useEffect(() => {
    if (!ultimoObjetoColocadoId) return;
    const timeout = window.setTimeout(() => setUltimoObjetoColocadoId(null), 900);
    return () => window.clearTimeout(timeout);
  }, [ultimoObjetoColocadoId]);

  // ── Atajos de teclado del espacio 3D (F1.2) ────────────────────────────────
  // Escape: cancelar colocación de objeto / plantilla de zona.
  // Ctrl/Cmd+C / Ctrl/Cmd+V: copiar / pegar objetos en modo edición.
  useSpace3DKeyboardShortcuts({
    objetoEnColocacion: !!objetoEnColocacion,
    plantillaZonaEnColocacion: !!plantillaZonaEnColocacion,
    editMode: isEditMode,
    onCancelObjectPlacement: () => setObjetoEnColocacion(null),
    onCancelTemplatePlacement: () => {
      clearPlantillaZonaEnColocacion();
      addNotification('Colocación de plantilla cancelada.', 'info');
    },
    onCopySelectedObjects: () => {
      if (selectedObjectIds.length === 0) return;
      const objsToCopy = espacioObjetos.filter((obj) => selectedObjectIds.includes(obj.id));
      setCopiedObjects(objsToCopy);
      notificationBus.emit({ mensaje: `📋 ${objsToCopy.length} objeto(s) copiado(s)`, variante: 'info' });
    },
    onPasteObjects: async () => {
      if (!copiedObjects || copiedObjects.length === 0) return;
      try {
        const result = await duplicarObjetos(copiedObjects);
        if (result && result.length > 0) {
          setSelectedObjectIds(result.map((o) => o.id));
          notificationBus.emit({ mensaje: `✨ ${result.length} objeto(s) pegado(s)`, variante: 'success' });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error('Error pasting objects', { error: errorMsg });
      }
    },
  });

  // Teleport/correr al escritorio propio
  const handleIrAMiEscritorio = useCallback(() => {
    if (!miEscritorio) return;
    const destX = miEscritorio.posicion_x;
    const destZ = miEscritorio.posicion_z;
    const playerX = (currentUserEcs?.x || 400) / 16;
    const playerZ = (currentUserEcs?.y || 400) / 16;
    const dx = destX - playerX;
    const dz = destZ - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > TELEPORT_DISTANCE) {
      setTeleportTarget({ x: destX, z: destZ });
    } else {
      setMoveTarget({ x: destX, z: destZ });
    }
  }, [miEscritorio, currentUserEcs]);

  // Inyectar funciones de sonido al hook de broadcast
  useEffect(() => {
    setBroadcastSoundFunctions(playWaveSound, playNudgeSound, playInviteSound);
  }, []);

  // Ref para OrbitControls (usado en JSX/Scene)
  const orbitControlsRef = useRef<{ target: THREE.Vector3; update: () => void; object?: THREE.Camera } | null>(null);
  const cameraResetAnimationRef = useRef<number | null>(null);

  const animarCamaraOrbit = useCallback((toPosition: THREE.Vector3, toTarget: THREE.Vector3, durationMs = 350) => {
    const controls = orbitControlsRef.current;
    const camera = controls?.object;
    if (!controls?.target || !camera?.position) return;

    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const startedAt = performance.now();

    if (cameraResetAnimationRef.current !== null) {
      cancelAnimationFrame(cameraResetAnimationRef.current);
      cameraResetAnimationRef.current = null;
    }

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const easedProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      camera.position.lerpVectors(fromPosition, toPosition, easedProgress);
      controls.target.lerpVectors(fromTarget, toTarget, easedProgress);
      controls.update();

      if (progress < 1) {
        cameraResetAnimationRef.current = requestAnimationFrame(animate);
        return;
      }

      cameraResetAnimationRef.current = null;
    };

    cameraResetAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // Función para resetear la vista de la cámara (OrbitControls API)
  const handleResetView = useCallback(() => {
    const playerX = (currentUserEcs.x || 400) / 16;
    const playerZ = (currentUserEcs.y || 400) / 16;
    const toPosition = new THREE.Vector3(playerX, 4.45, playerZ + 5.35);
    const toTarget = new THREE.Vector3(playerX, 1.18, playerZ);
    animarCamaraOrbit(toPosition, toTarget, 350);
  }, [animarCamaraOrbit, currentUserEcs.x, currentUserEcs.y]);

  const handlePrepararCamaraDibujoZona = useCallback(() => {
    const playerX = (currentUserEcs.x || 400) / 16;
    const playerZ = (currentUserEcs.y || 400) / 16;
    const toPosition = new THREE.Vector3(playerX, 16, playerZ + 0.08);
    const toTarget = new THREE.Vector3(playerX, 0, playerZ);
    animarCamaraOrbit(toPosition, toTarget, 420);
  }, [animarCamaraOrbit, currentUserEcs.x, currentUserEcs.y]);

  useEffect(() => {
    return () => {
      if (cameraResetAnimationRef.current !== null) {
        cancelAnimationFrame(cameraResetAnimationRef.current);
      }
    };
  }, []);

  // Cerrar chat, emojis y status picker al hacer clic en el canvas
  const handleCanvasClick = useCallback(() => {
    setShowChat(false);
    setShowEmojis(false);
    setShowStatusPicker(false);
  }, []);

  // Drag & Drop de objetos desde el panel de personalización
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const catalogData: CatalogoObjeto3D = JSON.parse(rawData);
      if (catalogData && catalogData.id && catalogData.nombre) {
        handlePrepararObjeto(catalogData);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('[DnD] Error procesando drop de objeto', { error: errorMsg });
    }
  }, [handlePrepararObjeto]);

  const handleSceneReady = useCallback(() => {
    markSceneReady();
    log.debug('[3D] Scene ready signal', { dpr: Number(adaptiveDpr.toFixed(2)) });
  }, [adaptiveDpr, markSceneReady]);

  // PR-4: Memoizar handlers del Canvas y la Scene para evitar re-renders
  // cuando el estado de UI (showEmojis, showChat, etc.) cambia.
  // Sin esto, cada cambio de UI crea nuevas referencias y React reconcilia
  // toda la sub-tree del Canvas de Three.js.
  const isEditModeRef = useRef(isEditMode);
  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);

  const handlePointerMissed = useCallback(() => {
    if (isEditModeRef.current) clearObjectSelection();
  }, [clearObjectSelection]);

  const handleSceneClickAvatar = useCallback(() => setShowAvatarModal(true), [setShowAvatarModal]);
  const handleSceneReachTarget = useCallback(() => setMoveTarget(null), [setMoveTarget]);
  const handleSceneTeleportDone = useCallback(() => {
    setTeleportTarget(null);
    if (livekitConnected) {
      setTimeout(() => {
        sincronizarTracksLocales().catch(() => {});
        log.debug('[LIVEKIT] Re-sincronizando tracks tras teleport');
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livekitConnected, setTeleportTarget, sincronizarTracksLocales]);

  const handleSceneDrawZoneEnd = useCallback((zona: {ancho: number, alto: number, x: number, z: number, tipoSuelo: FloorType, nivelAnidamiento: number}) => {
    setNuevaZonaTemp(zona);
    setIsDrawingZone(false);
  }, [setIsDrawingZone]);

  // Legacy Escritorio3D owner names map removed — all objects come from catalog

  const handleSceneZonaClick = useCallback((zona: ZonaEmpresa) => {
    setZonaAEditar(zona);
  }, []);

  const isAdminUser = React.useMemo(
    () => ['admin', 'super_admin', 'owner', 'creador'].includes(currentUser.role?.toLowerCase() || '') ||
           ['admin', 'super_admin', 'owner', 'creador'].includes(userRoleInActiveWorkspace?.toLowerCase() || ''),
    [currentUser.role, userRoleInActiveWorkspace]
  );

  const onClickZonaStable = useMemo(
    () => (isAdminUser && isEditMode) ? handleSceneZonaClick : undefined,
    [isAdminUser, isEditMode, handleSceneZonaClick]
  );

  // El mount/unmount del canvas (métricas, listeners webgl) ahora vive dentro
  // de `useWebGLContextRecovery`. Ver sección WebGL recovery arriba.

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor: themeColors[theme] || '#000000' }} onClick={handleCanvasClick} onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className={`pointer-events-none absolute inset-0 z-[5] transition-opacity duration-300 ${isSceneReady ? 'opacity-0' : 'opacity-100'}`} style={{ background: themeColors[theme] || '#000000' }} />
      
      {/* Overlay visual para Modo Edición */}
      <div className={`pointer-events-none absolute inset-0 z-[40] border-[4px] sm:border-[8px] border-amber-500/40 transition-opacity duration-500 ${isEditMode ? 'opacity-100' : 'opacity-0'}`} style={{ 
        backgroundImage: isEditMode ? 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(245, 158, 11, 0.03) 20px, rgba(245, 158, 11, 0.03) 40px)' : 'none',
        boxShadow: isEditMode ? 'inset 0 0 50px rgba(245, 158, 11, 0.2)' : 'none'
      }} />

      <SpatialAudio
        tracks={remoteAudioTracks}
        usuarios={[...usersInCall, ...usersInAudioRange]}
        currentUser={currentUserEcs}
        enabled={!!space3dSettings.spatialAudio}
        silenciarAudio={currentUser.status !== PresenceStatus.AVAILABLE}
        speakerDeviceId={audioSettings.selectedSpeakerId || undefined}
      />
      <Canvas
        frameloop="demand"
        shadows={gpuRenderConfig ? gpuRenderConfig.shadows : performanceSettings.graphicsQuality !== 'low'}
        dpr={adaptiveDpr}
        style={{ background: themeColors[theme] || '#000000' }}
        gl={{ 
          alpha: true,
          antialias: gpuRenderConfig ? gpuRenderConfig.antialias : performanceSettings.graphicsQuality !== 'low',
          powerPreference: gpuRenderConfig ? gpuRenderConfig.powerPreference : (performanceSettings.batterySaver ? 'low-power' : 'default'),
          failIfMajorPerformanceCaveat: false
        }}
        onCreated={(state) => {
          // Listeners webglcontextlost/restored + setClearColor + toneMapping
          // se gestionan en `useWebGLContextRecovery` (arriba).
          handleCanvasCreated(state);
          log.info('Canvas created', {
            gpuTier: gpuInfo?.tier ?? '?',
            gpuApi: gpuInfo?.api ?? '?',
            gpuRenderer: gpuInfo?.renderer ?? '?',
          });
          // NOTA (DEBT-003-B-CLOSE-2026-04-10): NO aplicamos
          // `shadowMap.autoUpdate = false` aquí. Three.js Tip 61 recomienda
          // desactivarlo SOLO en escenas estáticas. Nuestra escena contiene
          // avatares que se mueven en walk phase → deshabilitarlo congelaría
          // sus sombras. Una optimización futura sería gatear needsUpdate por
          // detección de movimiento desde el ECS, pero eso requiere un
          // controller dedicado fuera del alcance de este hotfix.
          // Ref DEBT-003-B-CLOSE-2026-04-10.
        }}
        onPointerMissed={handlePointerMissed}
      >
        <AdaptiveFrameloop />
        <RendererMetricsProbe adaptiveDpr={adaptiveDpr} gpuInfo={gpuInfo} />
        <AvatarScreenProjector
          selectedUserId={selectedRemoteUser?.id || null}
          ecsStateRef={ecsStateRef}
          screenPosRef={cardScreenPosRef}
          onlineUsers={usuariosEnChunks}
        />
        <Suspense fallback={<SceneFallback theme={theme} />}>
          <Scene
            onSceneReady={handleSceneReady}
            currentUser={currentUserEcs}
            onlineUsers={usuariosEnChunks}
            setPosition={setPositionEcs}
            theme={theme}
            orbitControlsRef={orbitControlsRef}
            stream={stream}
            localVideoTrack={localCameraTrack}
            backgroundEffect={cameraSettings.backgroundEffect}
            remoteStreams={remoteStreamsRouted}
            showVideoBubbles={true}
            videoIsProcessed={isProcessorActive}
            localMessage={localMessage}
            remoteMessages={remoteMessages}
            localReactions={localReactions}
            remoteReaction={remoteReaction}
            onClickAvatar={handleSceneClickAvatar}
            moveTarget={moveTarget}
            onReachTarget={handleSceneReachTarget}
            teleportTarget={teleportTarget}
            onTeleportDone={handleSceneTeleportDone}
            showFloorGrid={space3dSettings.showFloorGrid || isEditMode}
            showNamesAboveAvatars={space3dSettings.showNamesAboveAvatars}
            cameraSensitivity={space3dSettings.cameraSensitivity}
            invertYAxis={space3dSettings.invertYAxis}
            cameraMode={space3dSettings.cameraMode}
            realtimePositionsRef={realtimePositionsRef}
            interpolacionWorkerRef={interpolacionWorkerRef}
            posicionesInterpoladasRef={posicionesInterpoladasRef}
            ecsStateRef={ecsStateRef}
            broadcastMovement={broadcastMovement}
            moveSpeed={userMoveSpeed}
            runSpeed={userRunSpeed}
            zonasEmpresa={zonasEmpresa}
            spawnPersonal={spawnPersonal}
            onGuardarPosicionPersistente={guardarSpawnPersonal}
            onZoneCollision={setZonaColisionadaId}
            usersInCallIds={usersInCallIds}
            usersInAudioRangeIds={usersInAudioRangeIds}
            empresasAutorizadas={empresasAutorizadas}
            mobileInputRef={mobileInputRef}
            enableDayNightCycle={enableDayNightCycle}
            onXPEvent={grantXP}
            onClickRemoteAvatar={handleClickRemoteAvatar}
            avatarInteractions={avatarInteractionsMemo}
            espacioObjetos={espacioObjetos}
            ocupacionesAsientosPorObjetoId={ocupacionesAsientosPorObjetoId}
            onInteractuarObjeto={handleInteraccionObjeto}
            onOcuparAsiento={handleOcuparAsiento}
            onLiberarAsiento={handleLiberarAsiento}
            onRefrescarAsiento={handleRefrescarAsiento}
            onMoverObjeto={moverObjeto}
            onRotarObjeto={handleRotarObjeto}
            onTransformarObjeto={handleTransformarObjeto}
            onEliminarObjeto={eliminarObjeto}
            onEliminarPlantillaZonaCompleta={handleEliminarPlantillaZonaCompleta}
            onClickZona={onClickZonaStable}
            objetoEnColocacion={objetoEnColocacion}
            onActualizarObjetoEnColocacion={handleActualizarObjetoEnColocacion}
            onConfirmarObjetoEnColocacion={handleConfirmarObjetoEnColocacion}
            plantillaZonaEnColocacion={plantillaZonaEnColocacion}
            onActualizarPlantillaZonaEnColocacion={handleActualizarPlantillaZonaEnColocacion}
            onConfirmarPlantillaZonaEnColocacion={handleConfirmarPlantillaZonaEnColocacion}
            ultimoObjetoColocadoId={ultimoObjetoColocadoId}
            onDrawZoneEnd={handleSceneDrawZoneEnd}
            onTapFloor={isMobile ? (point) => {
              // Mobile: single tap = walk/teleport (misma lógica que double-click en desktop)
              const playerX = (currentUserEcs.x || 400) / 16;
              const playerZ = (currentUserEcs.y || 400) / 16;
              const dx = point.x - playerX;
              const dz = point.z - playerZ;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist > TELEPORT_DISTANCE) {
                setMoveTarget(null);
                setTeleportTarget({ x: point.x, z: point.z });
              } else if (dist > 0.5) {
                setTeleportTarget(null);
                setMoveTarget({ x: point.x, z: point.z });
              }
              hapticFeedback('light');
            } : undefined}
            onDoubleClickFloor={(point) => {
              // Calcular distancia desde posición actual del avatar
              const playerX = (currentUserEcs.x || 400) / 16;
              const playerZ = (currentUserEcs.y || 400) / 16;
              const dx = point.x - playerX;
              const dz = point.z - playerZ;
              const dist = Math.sqrt(dx * dx + dz * dz);

              if (dist > TELEPORT_DISTANCE) {
                // Distancia larga → teletransportación estilo Goku
                setMoveTarget(null);
                setTeleportTarget({ x: point.x, z: point.z });
              } else {
                // Distancia corta → caminar/correr
                setTeleportTarget(null);
                setMoveTarget({ x: point.x, z: point.z });
              }
            }}
          />
        </Suspense>
      </Canvas>
      {!isSceneReady && (
        <Loader
          containerStyles={{ background: 'transparent', zIndex: 100 }}
          innerStyles={{ width: '300px', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}
          barStyles={{ background: '#6366f1', height: '10px' }}
          dataInterpolation={(p) => `Cargando Espacio Virtual... ${p.toFixed(0)}%`}
          dataStyles={{ color: '#818cf8', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.05em' }}
        />
      )}

      {/* Background effects are applied directly on the LiveKit track via useLiveKitVideoBackground (setProcessor/switchTo). Shared with meetings. */}
      
      {/* Indicador discreto de grabación para otros usuarios (no el grabador) */}
      {isRecording && (tipoGrabacionActual === null || !['rrhh_entrevista', 'rrhh_one_to_one'].includes(tipoGrabacionActual) || consentimientoAceptado) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-red-500/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-red-400 text-xs font-medium">Grabando</span>
          </div>
        </div>
      )}
      
      {/* Botón de resetear vista */}
      <button
        onClick={handleResetView}
        className="absolute bottom-[180px] left-6 bg-gray-800/80 hover:bg-gray-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm backdrop-blur-sm transition-colors z-10 hidden md:flex"
        title="Resetear vista (centrar cámara en tu avatar)"
        data-tour-step="avatar-area"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        Centrar
      </button>
      
      {/* VideoHUD - solo se muestra cuando hay usuarios cerca (burbuja local ahora está en el avatar) */}
      {usersInCall.length > 0 && (
        <VideoHUD
          userName={currentUser.name}
          userAvatar={currentUser.profilePhoto}
          visitorId={session?.user?.id || 'visitor'}
          camOn={mediaState.isCameraEnabled}
          sharingOn={isScreenSharingActive}
          isPrivate={currentUser.isPrivate}
          layoutSnapshot={videoHudLayoutSnapshot}
          stream={stream}
          localVideoTrack={localCameraTrack}
          screenStream={screenStream}
          remoteReaction={remoteReaction}
          onWaveUser={handleWaveUser}
          currentReaction={localReactions.length > 0 ? localReactions[localReactions.length - 1].emoji : null}
          theme={theme}
          speakingUsers={speakingUsers}
          muteRemoteAudio={currentUser.status !== PresenceStatus.AVAILABLE}
          cameraSettings={cameraSettings}
          speakerDeviceId={audioSettings.selectedSpeakerId || undefined}
        />
      )}

      {/* Banner Showroom Mode */}
      {showroomMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600/90 to-indigo-600/90 backdrop-blur-xl border border-white/20 shadow-2xl">
          <span className="text-lg">🏢</span>
          <div>
            <p className="text-white text-sm font-bold">Modo Demo{showroomNombreVisitante ? ` — ${showroomNombreVisitante}` : ''}</p>
            <p className="text-white/60 text-[10px]">Exploración del espacio virtual ({showroomDuracionMin} min)</p>
          </div>
        </div>
      )}

      {/* Admin HUD (Dibujar Zonas Gathering) */}
      {(['admin', 'super_admin', 'owner', 'creador'].includes(currentUser.role?.toLowerCase() || '') || ['admin', 'super_admin', 'owner', 'creador'].includes(userRoleInActiveWorkspace?.toLowerCase() || '')) && activeWorkspace && !showroomMode && (
        <AdminZoneHUD 
          workspaceId={activeWorkspace.id} 
          nuevaZona={nuevaZonaTemp}
          zonaAEditar={zonaAEditar}
          onLimpiarNuevaZona={() => {
            setNuevaZonaTemp(null);
            setZonaAEditar(null);
          }}
          onMaterialSeleccionado={handlePrepararCamaraDibujoZona}
          onZonaCreada={() => {
            void refrescarZonasEmpresa();
          }}
        />
      )}

      {/* Banner de proximidad: solo notificación de conversación bloqueada por otro usuario */}
      {hasActiveCall && !showroomMode && conversacionProximaBloqueada && (
        <div className="absolute top-4 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-red-950/80 border-red-500/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <span className="text-sm">🔒</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">Conversación bloqueada</p>
                <p className="text-white/50 text-[9px]">{conversacionProximaBloqueada.nombre} está en conversación privada</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Controles Inferior (Estilo 2026) — oculta en showroom */}
      {!showroomMode && <BottomControlBar
        onToggleMic={() => { void handleToggleMicrophoneNew(); }}
        onToggleCam={() => { void handleToggleCameraNew(); }}
        onToggleShare={handleToggleScreenShare}
        onToggleRecording={handleToggleRecording}
        onToggleEmojis={() => { setShowEmojis(!showEmojis); setShowChat(false); setShowStatusPicker(false); }}
        onToggleChat={() => { setShowChat(!showChat); setShowEmojis(false); setShowStatusPicker(false); }}
        onToggleRaiseHand={handleToggleRaiseHand}
        isMicOn={currentUser.isMicOn}
        isCamOn={currentUser.isCameraOn}
        isSharing={currentUser.isScreenSharing}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        showEmojis={showEmojis}
        showChat={showChat}
        showStatusPicker={showStatusPicker}
        onToggleStatusPicker={() => { setShowStatusPicker(!showStatusPicker); setShowEmojis(false); setShowChat(false); }}
        onTriggerReaction={handleTriggerReaction}
        isHandRaised={isLocalHandRaised}
        avatarConfig={currentUser.avatarConfig!}
        showShareButton={usersInCall.length > 0}
        showRecordingButton={usersInCall.length > 0}
        onToggleLock={bloquearConversacion}
        isLocked={conversacionBloqueada}
        showLockButton={usersInCall.length > 0 && !conversacionProximaBloqueada}
        currentStream={stream}
        onCameraSettingsChange={(newSettings) => { void handleApplyCameraSettings(newSettings); }}
        onAudioSettingsChange={(newSettings) => { void handleApplyAudioSettings(newSettings); }}
        isGameActive={isPlayingGame}
        isGameHubOpen={isGameHubOpen}
        onIrAMiEscritorio={handleIrAMiEscritorio}
        tieneMiEscritorio={!!miEscritorio}
      />}

      {/* Input de Chat Flotante - Minimalista */}
      {showChat && (
        <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-[201] animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <div className="bg-black/60 backdrop-blur-md px-1 py-1 rounded-2xl border border-white/10 flex gap-1 items-center">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleSendMessage();
                if (e.key === 'Escape') setShowChat(false);
              }}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder="Mensaje..."
              className="w-40 bg-transparent border-none px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none"
              autoFocus
              maxLength={100}
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim()}
              className="w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs flex items-center justify-center transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Minimapa */}
      <Minimap currentUser={currentUserEcs} users={usuariosParaMinimapa} workspace={activeWorkspace} onTeleport={(x, z) => {
        setMoveTarget(null);
        setTeleportTarget({ x, z });
        hapticFeedback('medium');
      }} />
      
      {/* Notificación de Wave entrante */}
      {incomingWave && (
        <div className="fixed top-16 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingWave.fromName}</p>
                <p className="text-white/50 text-[9px]">te está saludando 👋</p>
              </div>
              <button
                onClick={() => setIncomingWave(null)}
                className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-2.5 h-2.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === FASE A: Card flotante screen-space (tamaño fijo, posición proyectada desde 3D) === */}
      {selectedRemoteUser && (
        <ScreenSpaceProfileCard
          user={selectedRemoteUser}
          screenPosRef={cardScreenPosRef}
          onClose={() => setSelectedRemoteUser(null)}
          onWave={(id) => { handleWaveUser(id); }}
          onInvite={(id) => { handleInviteUser(id); }}
          onFollow={(id) => { handleFollowUser(id); }}
          followTargetId={followTargetId}
        />
      )}

      {/* Notificación de Nudge entrante */}
      {incomingNudge && (
        <div className="fixed top-32 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-pink-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingNudge.fromName}</p>
                <p className="text-white/50 text-[9px]">quiere tu atención 🔔</p>
              </div>
              <button
                onClick={() => setIncomingNudge(null)}
                className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-2.5 h-2.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación de Invite entrante */}
      {incomingInvite && (
        <div className="fixed top-48 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingInvite.fromName}</p>
                <p className="text-white/50 text-[9px]">te invita a unirte 📍</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleAcceptInvite}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30"
                >
                  Ir
                </button>
                <button
                  onClick={() => setIncomingInvite(null)}
                  className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <svg className="w-2.5 h-2.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Follow Mode activo */}
      {followTargetId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[201]">
          <div className="bg-violet-600/80 backdrop-blur-xl text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 border border-violet-400/30">
            <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            <span className="text-xs font-bold">Siguiendo a {usuariosEnChunks.find(u => u.id === followTargetId)?.name || 'usuario'}</span>
            <button
              onClick={() => { setFollowTargetId(null); followTargetIdRef.current = null; }}
              className="ml-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-bold transition-colors"
            >
              Dejar de seguir
            </button>
          </div>
        </div>
      )}

      {/* CTA: Solicitar acceso a zona privada */}
      {zonaAccesoProxima && (
        <div className="fixed bottom-32 right-4 z-[201] animate-slide-in">
          <div className="bg-slate-950/80 border border-slate-700/50 backdrop-blur-xl px-4 py-3 rounded-xl shadow-2xl w-64">
            <div className="text-xs text-slate-300">
              Estás cerca de una zona privada
            </div>
            <div className="text-sm text-white font-semibold">
              {zonaAccesoProxima.zona.nombre_zona || zonaAccesoProxima.zona.empresa?.nombre || 'Zona privada'}
            </div>
            <button
              onClick={handleSolicitarAccesoZona}
              disabled={zonaAccesoProxima.pendiente || solicitandoAcceso}
              className="mt-2 w-full rounded-lg bg-emerald-500/90 text-white text-xs py-2 font-semibold disabled:opacity-50"
            >
              {zonaAccesoProxima.pendiente ? 'Solicitud pendiente' : solicitandoAcceso ? 'Enviando...' : 'Solicitar acceso'}
            </button>
          </div>
        </div>
      )}

      {/* Toast notificaciones de autorizaciones */}
      {notificacionAutorizacion && (
        <div className="fixed top-36 right-4 z-[202] animate-slide-in">
          <div className="bg-slate-900/90 border border-slate-700/60 backdrop-blur-xl px-4 py-3 rounded-xl shadow-2xl w-72">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{notificacionAutorizacion.titulo}</p>
                {notificacionAutorizacion.mensaje && (
                  <p className="text-xs text-slate-300 mt-1">{notificacionAutorizacion.mensaje}</p>
                )}
              </div>
              <button
                onClick={() => setNotificacionAutorizacion(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            {notificacionAutorizacion.datos_extra?.canal_compartido_id && (
              <button
                onClick={() => {
                  setActiveChatGroupId(notificacionAutorizacion.datos_extra?.canal_compartido_id || null);
                  setActiveSubTab('chat');
                }}
                className="mt-2 w-full rounded-lg bg-sky-500/80 text-white text-xs py-2 font-semibold"
              >
                Abrir canal compartido
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Controles de ayuda — desktop: WASD, mobile: oculto (tiene joystick) */}
      {!isMobile && (
        <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm px-3 py-2 rounded-lg text-white text-xs">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]">WASD</kbd>
            <span className="opacity-70">o flechas para mover</span>
          </div>
        </div>
      )}

      {/* === MOBILE GAME HUD === */}
      {isMobile && (
        <>
          {/* Joystick virtual — esquina inferior izquierda */}
          <MobileJoystick inputRef={mobileInputRef} size={120} deadZone={0.15} runThreshold={0.7} />

          {/* Botón de emotes — esquina inferior derecha */}
          <button
            className="absolute z-[150] select-none touch-none flex items-center justify-center rounded-full"
            style={{
              bottom: 140,
              right: 24,
              width: 52,
              height: 52,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              border: '2px solid rgba(99, 102, 241, 0.4)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => { e.stopPropagation(); setShowEmoteWheel(true); }}
          >
            <span className="text-xl">😄</span>
          </button>

          {/* Botón de chat — encima de emotes */}
          <button
            className="absolute z-[150] select-none touch-none flex items-center justify-center rounded-full"
            style={{
              bottom: 200,
              right: 24,
              width: 44,
              height: 44,
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => { e.stopPropagation(); setShowChat(!showChat); setShowEmojis(false); }}
          >
            <span className="text-base">💬</span>
          </button>
        </>
      )}

      {/* Botón XP / Gamificación — esquina superior izquierda */}
      <button
        className="absolute top-4 left-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-sm border border-indigo-500/30 hover:border-indigo-500/60 transition-colors cursor-pointer"
        onClick={() => setShowGamificacion(true)}
        title="Gamificación"
      >
        <span className="text-sm">⭐</span>
        <span className="text-[10px] font-bold text-indigo-400">XP</span>
      </button>

      {/* Panel de Gamificación */}
      <GamificacionPanel
        usuarioId={session?.user?.id || ''}
        espacioId={activeWorkspace?.id || ''}
        visible={showGamificacion}
        onClose={() => setShowGamificacion(false)}
      />

      {/* Emote Wheel overlay — funciona en mobile y desktop */}
      <EmoteWheel
        visible={showEmoteWheel}
        onClose={() => setShowEmoteWheel(false)}
        onSelect={(emoteId) => {
          setShowEmoteWheel(false);
          // Mapear emoteId a animación del avatar o emoji reaction
          if (['wave', 'dance', 'cheer', 'victory', 'jump', 'sit'].includes(emoteId)) {
            // Broadcast como emote trigger via moveTarget pattern
            // El Player captará esto via su contextual animation system
            if (broadcastMovement) {
              const px = (currentUserEcs.x || 400);
              const py = (currentUserEcs.y || 400);
              broadcastMovement(px, py, currentUserEcs.direction || 'front', false, emoteId, true);
            }
          }
          // XP por emote enviado (throttle 10s)
          grantXP('emote_enviado', 10000);
          hapticFeedback('medium');
        }}
      />
      
      {/* Recording Manager V2 con análisis conductual avanzado */}
      {hasActiveCall && (
        <RecordingManager
          espacioId={activeWorkspace?.id || ''}
          userId={session?.user?.id || ''}
          userName={currentUser.name}
          reunionTitulo={`Reunión ${new Date().toLocaleDateString()}`}
          stream={stream}
          cargoUsuario={cargoUsuario as CargoLaboral}
          usuariosEnLlamada={usersInCall.map(u => ({ id: u.id, nombre: u.name }))}
          onRecordingStateChange={(recording) => {
            setIsRecording(recording);
            if (!recording) {
              setRecordingDuration(0);
              setConsentimientoAceptado(false);
              setTipoGrabacionActual(null);
            }
          }}
          onDurationChange={(duration) => setRecordingDuration(duration)}
          onTipoGrabacionChange={(tipo) => setTipoGrabacionActual(tipo)}
          onProcessingComplete={(resultado) => {
            log.info('✅ Análisis conductual completado', { tipoGrabacion: resultado?.tipo_grabacion, analisis: resultado?.analisis });
          }}
          headlessMode={true}
          externalTrigger={recordingTrigger}
          onExternalTriggerHandled={() => setRecordingTrigger(false)}
        />
      )}

      {/* Modal de consentimiento para usuarios evaluados */}
      <ConsentimientoPendiente
        onConsentimientoRespondido={(grabacionId, acepto) => {
          log.info('📝 Consentimiento respondido para grabación', { grabacionId, aceptado: acepto });
        }}
      />
      
      {/* GameHub ahora se controla desde la barra superior en WorkspaceLayout */}

      {/* Modal de Avatar/Perfil - Glassmorphism 2.0 */}
      {showAvatarModal && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-2"
          onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setShowAvatarModal(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowAvatarModal(false); }}
        >
          {/* Backdrop con blur profundo */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowAvatarModal(false)} />
          
          {/* Modal - responsivo y con Glassmorphism */}
          <div className="relative w-full max-w-[960px] h-[90vh] max-h-[720px] sm:max-h-[95vh] bg-[#0a0a14]/95 backdrop-blur-2xl rounded-3xl sm:rounded-2xl border border-white/[0.08] shadow-2xl shadow-violet-900/20 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Neon glow aura */}
            <div className="absolute -inset-px rounded-3xl sm:rounded-2xl bg-gradient-to-r from-violet-600/10 via-fuchsia-600/5 to-cyan-500/10 pointer-events-none" />
            
            {/* Header */}
            <div className="relative flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 flex items-center justify-center border border-violet-500/20">
                  <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-black text-white tracking-wide">Mi Perfil y Avatar</h2>
                  <p className="text-[9px] text-white/30">Personaliza tu apariencia en el espacio</p>
                </div>
              </div>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] flex items-center justify-center transition-all group border border-white/[0.06] hover:border-violet-500/20"
              >
                <svg className="w-3.5 h-3.5 text-white/30 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body - AvatarCustomizer3D */}
            <div className="relative flex-1 overflow-hidden">
               <AvatarCustomizer3D 
                onClose={() => setShowAvatarModal(false)}
                onPrepararObjeto={handlePrepararObjeto}
                modoColocacionActivo={Boolean(objetoEnColocacion)}
                modoReemplazoActivo={Boolean(isEditMode && selectedObjectId)}
              />
            </div>
          </div>
        </div>
      )}

      {objetoEnColocacion && (
        <PlacementHUD
          objectName={objetoEnColocacion.nombre}
          objectCategory={objetoEnColocacion.categoria}
          onCancel={handleCancelarColocacion}
        />
      )}

      {/* Se eliminó el PlacementToast a petición del usuario debido a problemas de renderizado */}

      {isEditMode && (
        <EditModeHUD
          onCancel={() => setIsEditMode(false)}
          onUndo={() => { void deshacer(); }}
          onRedo={() => { void rehacer(); }}
          canUndo={canUndo}
          canRedo={canRedo}
          modoActual={modoEdicionObjeto}
          onCambiarModo={setModoEdicionObjeto}
        />
      )}

      {/* Panel lateral de construcción */}
      {isEditMode && modoEdicionObjeto === 'add' && !objetoEnColocacion && (
        <BuildModePanel
          onClose={() => setIsEditMode(false)}
          onPrepararObjeto={handlePrepararObjeto}
        />
      )}

      {isEditMode && modoEdicionObjeto !== 'add' && (
        <InspectorEdicionObjeto
          objeto={objetoSeleccionado}
          modoActual={modoEdicionObjeto}
          onTransformar={handleTransformarObjeto}
        />
      )}

      {/* Toast stack — screen-space overlay, immune to camera zoom */}
      <ToastContainer />
    </div>
  );
};

export default VirtualSpace3D;
