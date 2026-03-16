'use client';

import React, { useRef, useEffect, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, PerformanceMonitor } from '@react-three/drei';
import { Room, Track } from 'livekit-client';
import { User, PresenceStatus } from '@/types';
import { RecordingManager } from './meetings/recording/RecordingManager';
import { ConsentimientoPendiente } from './meetings/recording/ConsentimientoPendiente';
import { BottomControlBar } from './BottomControlBar';
import { saveCameraSettings, type CameraSettings } from './CameraSettingsMenu';
import { saveAudioSettings, type AudioSettings } from './BottomControlBar';
import { AvatarCustomizer3D } from './AvatarCustomizer3D';
import { SpatialAudio } from './3d/SpatialAudio';
import { type GpuInfo } from '@/lib/gpuCapabilities';
import { MobileJoystick, type JoystickInput } from './3d/MobileJoystick';
import { EmoteWheel } from './3d/EmoteWheel';
import { DayNightCycle } from './3d/DayNightCycle';
import { hapticFeedback } from '@/lib/mobileDetect';
import { GamificacionPanel } from './GamificacionPanel';
import { useSpace3D } from '@/hooks/space3d';
import { useEspacioObjetos, type EspacioObjeto, type TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
import { useHistorialEdicion } from '@/hooks/space3d/useHistorialEdicion';
import { useOcupacionAsientos } from '@/hooks/space3d/useOcupacionAsientos';
import { setBroadcastSoundFunctions } from '@/hooks/space3d/useBroadcast';
import { XP_POR_ACCION } from '@/lib/gamificacion';
import { useStore } from '@/store/useStore';
// GameHub ahora se importa en WorkspaceLayout
import { EditModeHUD, EditModeToast, InspectorEdicionObjeto, PlacementHUD, PlacementToast } from './3d/PlacementHUD';
import type { CatalogoObjeto3D, ObjetoPreview3D } from '@/types/objetos3d';
import type { AsientoRuntime3D } from './space3d/asientosRuntime';
import { normalizarInteraccionConfigObjeto, resolverDestinoTeleportObjeto, resolverDisplayObjeto, resolverUseObjeto, type DisplayRuntimeNormalizado3D } from './space3d/interaccionesObjetosRuntime';

import { themeColors, TELEPORT_DISTANCE, USAR_LIVEKIT, playWaveSound, playNudgeSound, playInviteSound } from './space3d/shared';


import { Minimap, StableVideo, Avatar, RemoteAvatarInterpolated, RemoteUsers, CameraFollow, AvatarScreenProjector, TeleportEffect, Player, Scene, AdaptiveFrameloop, VideoHUD, ScreenSpaceProfileCard, statusColors, type VirtualSpace3DProps } from './space3d/InternalComponents';

const VirtualSpace3D: React.FC<VirtualSpace3DProps> = ({ theme = 'dark', isGameHubOpen = false, isPlayingGame = false, showroomMode = false, showroomDuracionMin = 5, showroomNombreVisitante }) => {
  // ========== Domain Hook Facade ==========
  const s = useSpace3D({ theme, isGameHubOpen, isPlayingGame, showroomMode, showroomDuracionMin, showroomNombreVisitante });
  const addNotification = useStore((state) => state.addNotification);

  // Store
  const { currentUser, onlineUsers, setPosition, activeWorkspace, toggleMic, toggleCamera, toggleScreenShare, togglePrivacy, setPrivacy, session, setActiveSubTab, setActiveChatGroupId, activeSubTab, empresasAutorizadas, setEmpresasAutorizadas, isEditMode, setIsEditMode, isDragging, setIsDragging } = s;

  const [editToastMessage, setEditToastMessage] = React.useState<string | null>(null);
  const [objetoEnColocacion, setObjetoEnColocacion] = React.useState<ObjetoPreview3D | null>(null);
  const [placementToastName, setPlacementToastName] = React.useState<string | null>(null);
  const [ultimoObjetoColocadoId, setUltimoObjetoColocadoId] = React.useState<string | null>(null);
  const setSelectedObjectId = useStore((state) => state.setSelectedObjectId);
  const selectedObjectId = useStore((state) => state.selectedObjectId);
  const modoEdicionObjeto = useStore((state) => state.modoEdicionObjeto);
  const setModoEdicionObjeto = useStore((state) => state.setModoEdicionObjeto);
  const dragSeleccionRef = useRef<string | null>(null);
  const prevIsDraggingRef = useRef(false);

  // Top-level state
  const { moveTarget, setMoveTarget, teleportTarget, setTeleportTarget, showAvatarModal, setShowAvatarModal, showEmoteWheel, setShowEmoteWheel, showGamificacion, setShowGamificacion, cargoUsuario, incomingNudge, setIncomingNudge, incomingInvite, setIncomingInvite, mobileInputRef, isMobile, cardScreenPosRef, realtimePositionsRef, grantXP, handleAcceptInvite } = s;

  // Settings
  const { gpuRenderConfig, gpuInfo, userMoveSpeed, userRunSpeed, userProximityRadius, maxDpr, minDpr, adaptiveDpr, setAdaptiveDpr, enableDayNightCycle, cameraSettings, setCameraSettings, audioSettings, setAudioSettings } = s.settings;
  const space3dSettings = s.settings.space3dSettings as any;
  const performanceSettings = s.settings.performanceSettings as any;

  // Chunks
  const { currentUserEcs, onlineUsersEcs, usuariosEnChunks, usuariosParaConexion, usuariosParaMinimapa, chunkActual, ecsStateRef, interpolacionWorkerRef, posicionesInterpoladasRef, setPositionEcs, chunkVecinosRef, usuariosVisiblesRef } = s.chunks;

  // Recording
  const { isRecording, setIsRecording, recordingDuration, setRecordingDuration, consentimientoAceptado, setConsentimientoAceptado, tipoGrabacionActual, setTipoGrabacionActual, recordingTrigger, setRecordingTrigger, handleToggleRecording } = s.recording;

  // Notifications
  const { notificacionAutorizacion, setNotificacionAutorizacion, zonasEmpresa, zonaAccesoProxima, handleSolicitarAccesoZona, solicitandoAcceso, setZonaColisionadaId } = s.notifications;

  // Media
  const { stream, setStream, processedStream, setProcessedStream, screenStream, setScreenStream, activeStreamRef, activeScreenRef, effectiveStream, effectiveStreamRef, handleToggleScreenShare, crearAudioProcesado, limpiarAudioProcesado } = s.media;

  // LiveKit
  const { livekitRoomRef, livekitConnected, remoteAudioTracks, speakingUsers, publicarTrackLocal, sincronizarTracksLocales, enviarDataLivekit } = s.livekit;
  const remoteStreams = s.livekit.remoteStreams;
  const remoteScreenStreams = s.livekit.remoteScreenStreams;

  // Proximity
  const { usersInCall, usersInCallIds, hasActiveCall, usersInAudioRange, usersInAudioRangeIds, userDistances, remoteStreamsRouted, remoteScreenStreamsRouted, conversacionBloqueada, conversacionProximaBloqueada } = s.proximity;

  // Broadcast
  const { broadcastMovement, bloquearConversacion, handleSendMessage, handleTriggerReaction, showEmojis, setShowEmojis, showChat, setShowChat, showStatusPicker, setShowStatusPicker, chatInput, setChatInput, localMessage, remoteMessages, localReactions, remoteReaction, incomingWave, setIncomingWave } = s.broadcast;

  // WebRTC
  const { peerConnectionsRef, webrtcChannelRef } = s.webrtc;

  // Interactions
  const { selectedRemoteUser, setSelectedRemoteUser, followTargetId, setFollowTargetId, followTargetIdRef, handleClickRemoteAvatar, avatarInteractionsMemo, handleWaveUser, handleInviteUser, handleFollowUser } = s.interactions;

  // Objetos persistentes (escritorios reclamables)
  const { objetos: espacioObjetos, crearObjetoDesdeCatalogo, reclamarObjeto, liberarObjeto, actualizarTransformacionObjeto, moverObjeto, rotarObjeto, eliminarObjeto, restaurarObjeto, spawnPersonal, miEscritorio } = useEspacioObjetos(
    activeWorkspace?.id || null,
    session?.user?.id || null
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
    onNotificar: setEditToastMessage,
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

  const ejecutarTeleportObjeto = useCallback((objeto: EspacioObjeto) => {
    const config = normalizarInteraccionConfigObjeto(objeto.interaccion_config);
    const destino = resolverDestinoTeleportObjeto(objeto, config);
    const playerX = (currentUserEcs?.x || 400) / 16;
    const playerZ = (currentUserEcs?.y || 400) / 16;
    const dx = destino.x - playerX;
    const dz = destino.z - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (destino.modo === 'teleport') {
      setMoveTarget(null);
      setTeleportTarget({ x: destino.x, z: destino.z });
    } else if (destino.modo === 'caminar') {
      setTeleportTarget(null);
      setMoveTarget({ x: destino.x, z: destino.z });
    } else if (dist > TELEPORT_DISTANCE) {
      setMoveTarget(null);
      setTeleportTarget({ x: destino.x, z: destino.z });
    } else {
      setTeleportTarget(null);
      setMoveTarget({ x: destino.x, z: destino.z });
    }

    hapticFeedback('medium');
  }, [currentUserEcs, setMoveTarget, setTeleportTarget]);

  const handleInteraccionObjeto = useCallback((objeto: EspacioObjeto, asiento: AsientoRuntime3D | null) => {
    const tipoInteraccion = (objeto.interaccion_tipo || '').trim().toLowerCase();
    const config = normalizarInteraccionConfigObjeto(objeto.interaccion_config);

    if (tipoInteraccion === 'sit' && asiento) {
      if (asiento.objetoId) {
        const ocupacion = ocupacionesAsientosPorObjetoId.get(asiento.objetoId);
        if (ocupacion && ocupacion.usuario_id !== session?.user?.id) {
          addNotification('Ese asiento está ocupado actualmente.', 'info');
          return;
        }
      }

      const destinoX = asiento.posicion.x;
      const destinoZ = asiento.posicion.z;
      const playerX = (currentUserEcs?.x || 400) / 16;
      const playerZ = (currentUserEcs?.y || 400) / 16;
      const dx = destinoX - playerX;
      const dz = destinoZ - playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > TELEPORT_DISTANCE) {
        setMoveTarget(null);
        setTeleportTarget({ x: destinoX, z: destinoZ });
      } else {
        setTeleportTarget(null);
        setMoveTarget({ x: destinoX, z: destinoZ });
      }
      hapticFeedback('light');
      return;
    }

    if (tipoInteraccion === 'teleport') {
      ejecutarTeleportObjeto(objeto);
      return;
    }

    if (tipoInteraccion === 'display') {
      const displayConfig = resolverDisplayObjeto(config);
      const ejecuto = ejecutarDestinoVisual(
        displayConfig,
        objeto.interaccion_label || (objeto.nombre ? `Mostrando ${objeto.nombre}.` : null)
      );
      if (!ejecuto) {
        addNotification(objeto.interaccion_label || 'Interacción visual configurada sin destino válido.', 'info');
      }
      hapticFeedback('light');
      return;
    }

    if (tipoInteraccion === 'use') {
      const useConfig = resolverUseObjeto(config);
      let ejecuto = ejecutarDestinoVisual(
        useConfig,
        objeto.interaccion_label || (objeto.nombre ? `Usaste ${objeto.nombre}.` : null)
      );

      if (useConfig.xpAccion && useConfig.xpAccion in XP_POR_ACCION) {
        grantXP(useConfig.xpAccion as keyof typeof XP_POR_ACCION, useConfig.cooldownMs || 10000);
        ejecuto = true;
      }

      if (!ejecuto) {
        addNotification(objeto.interaccion_label || 'Interacción de uso configurada sin acción válida.', 'info');
      }

      hapticFeedback('medium');
      return;
    }

    if (tipoInteraccion) {
      addNotification(objeto.interaccion_label || `Interacción ${tipoInteraccion} aún no soportada por el dispatcher.`, 'info');
      return;
    }
  }, [addNotification, currentUserEcs, ejecutarDestinoVisual, ejecutarTeleportObjeto, grantXP, ocupacionesAsientosPorObjetoId, session?.user?.id, setMoveTarget, setTeleportTarget]);

  const handlePrepararObjeto = useCallback((catalogo: CatalogoObjeto3D) => {
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
  }, [currentUserEcs?.x, currentUserEcs?.y, setIsEditMode]);

  const handleCancelarColocacion = useCallback(() => {
    setObjetoEnColocacion(null);
  }, []);

  const handleActualizarObjetoEnColocacion = useCallback((x: number, y: number, z: number) => {
    setObjetoEnColocacion((prev) => prev ? { ...prev, posicion_x: x, posicion_y: y, posicion_z: z } : prev);
  }, []);

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
    setEditToastMessage(`Objeto ${objetoEnColocacion.nombre} listo para edición`);
    setUltimoObjetoColocadoId(creado.id);
    setObjetoEnColocacion(null);
    setIsEditMode(true);
    setSelectedObjectId(creado.id);
  }, [crearObjetoDesdeCatalogo, objetoEnColocacion, registrarCreacion, setIsEditMode, setSelectedObjectId]);

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
      setEditToastMessage('Objeto rotado');
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
      setEditToastMessage('Objeto eliminado');
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

  useEffect(() => {
    if (!objetoEnColocacion) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setObjetoEnColocacion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [objetoEnColocacion]);

  useEffect(() => {
    if (!ultimoObjetoColocadoId) return;
    const timeout = window.setTimeout(() => setUltimoObjetoColocadoId(null), 900);
    return () => window.clearTimeout(timeout);
  }, [ultimoObjetoColocadoId]);

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
  const orbitControlsRef = useRef<any>(null);

  // Función para resetear la vista de la cámara (OrbitControls API)
  const handleResetView = useCallback(() => {
    const controls = orbitControlsRef.current;
    if (!controls) return;
    const playerX = (currentUser.x || 400) / 16;
    const playerZ = (currentUser.y || 400) / 16;
    // OrbitControls: mover target al jugador y reposicionar la cámara
    controls.target.set(playerX, 0, playerZ);
    controls.object.position.set(playerX, 15, playerZ + 15);
    controls.update();
  }, [currentUser.x, currentUser.y]);

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
    } catch (err) {
      console.error('[DnD] Error procesando drop de objeto:', err);
    }
  }, [handlePrepararObjeto]);

  return (
    <div className="w-full h-full relative bg-black" onClick={handleCanvasClick} onDragOver={handleDragOver} onDrop={handleDrop}>
      {USAR_LIVEKIT && (
        <SpatialAudio
          tracks={remoteAudioTracks}
          usuarios={[...usersInCall, ...usersInAudioRange]}
          currentUser={currentUserEcs}
          enabled={!!space3dSettings.spatialAudio}
          silenciarAudio={currentUser.status !== PresenceStatus.AVAILABLE}
        />
      )}
      <Canvas
        frameloop="demand"
        shadows={gpuRenderConfig ? gpuRenderConfig.shadows : performanceSettings.graphicsQuality !== 'low'}
        dpr={adaptiveDpr}
        gl={{ 
          antialias: gpuRenderConfig ? gpuRenderConfig.antialias : performanceSettings.graphicsQuality !== 'low',
          powerPreference: gpuRenderConfig ? gpuRenderConfig.powerPreference : (performanceSettings.batterySaver ? 'low-power' : 'default'),
          failIfMajorPerformanceCaveat: false
        }}
        onCreated={({ gl }) => {
          console.log(`Canvas created | GPU Tier: ${gpuInfo?.tier ?? '?'} | API: ${gpuInfo?.api ?? '?'} | Renderer: ${gpuInfo?.renderer ?? '?'}`);
          gl.setClearColor(themeColors[theme] || '#000000');
          if (gpuRenderConfig) {
            gl.toneMappingExposure = gpuRenderConfig.toneMappingExposure;
          }
        }}
      >
        <AdaptiveFrameloop />
        <AvatarScreenProjector
          selectedUserId={selectedRemoteUser?.id || null}
          ecsStateRef={ecsStateRef}
          screenPosRef={cardScreenPosRef}
          onlineUsers={usuariosEnChunks}
        />
        <PerformanceMonitor
          onDecline={() => {
            setAdaptiveDpr((prev) => Math.max(minDpr, prev - 0.25));
          }}
          onIncline={() => {
            setAdaptiveDpr((prev) => Math.min(maxDpr, prev + 0.25));
          }}
        />
        <Suspense fallback={null}>
          <Scene
            currentUser={currentUserEcs}
            onlineUsers={usuariosEnChunks}
            setPosition={setPositionEcs}
            theme={theme}
            orbitControlsRef={orbitControlsRef}
            stream={stream}
            remoteStreams={remoteStreamsRouted}
            showVideoBubbles={true}
            localMessage={localMessage}
            remoteMessages={remoteMessages}
            localReactions={localReactions}
            remoteReaction={remoteReaction}
            onClickAvatar={() => setShowAvatarModal(true)}
            moveTarget={moveTarget}
            onReachTarget={() => setMoveTarget(null)}
            teleportTarget={teleportTarget}
            onTeleportDone={() => {
              setTeleportTarget(null);
              // Forzar re-sincronización de tracks LiveKit tras teleport
              // El teleport mueve al usuario lejos → sale de proximidad → tracks se despublican
              // Al llegar al destino, necesitamos re-publicar inmediatamente
              if (USAR_LIVEKIT && livekitConnected) {
                setTimeout(() => {
                  sincronizarTracksLocales().catch(() => {});
                  console.log('[LIVEKIT] Re-sincronizando tracks tras teleport');
                }, 800);
              }
            }}
            showFloorGrid={space3dSettings.showFloorGrid}
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
            onReclamarObjeto={reclamarObjeto}
            onLiberarObjeto={liberarObjeto}
            ocupacionesAsientosPorObjetoId={ocupacionesAsientosPorObjetoId}
            onInteractuarObjeto={handleInteraccionObjeto}
            onOcuparAsiento={handleOcuparAsiento}
            onLiberarAsiento={handleLiberarAsiento}
            onRefrescarAsiento={handleRefrescarAsiento}
            onMoverObjeto={moverObjeto}
            onRotarObjeto={handleRotarObjeto}
            onTransformarObjeto={handleTransformarObjeto}
            onEliminarObjeto={handleEliminarObjeto}
            objetoEnColocacion={objetoEnColocacion}
            onActualizarObjetoEnColocacion={handleActualizarObjetoEnColocacion}
            onConfirmarObjetoEnColocacion={handleConfirmarObjetoEnColocacion}
            ultimoObjetoColocadoId={ultimoObjetoColocadoId}
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
          camOn={currentUser.isCameraOn}
          sharingOn={currentUser.isScreenSharing}
          isPrivate={currentUser.isPrivate}
          usersInCall={usersInCall}
          stream={stream}
          screenStream={screenStream}
          remoteStreams={remoteStreamsRouted}
          remoteScreenStreams={remoteScreenStreamsRouted}
          remoteReaction={remoteReaction}
          onWaveUser={handleWaveUser}
          currentReaction={localReactions.length > 0 ? localReactions[localReactions.length - 1].emoji : null}
          theme={theme}
          speakingUsers={speakingUsers}
          userDistances={userDistances}
          muteRemoteAudio={currentUser.status !== PresenceStatus.AVAILABLE}
          cameraSettings={cameraSettings}
          onProcessedStreamReady={setProcessedStream}
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
        onToggleMic={toggleMic}
        onToggleCam={toggleCamera}
        onToggleShare={handleToggleScreenShare}
        onToggleRecording={handleToggleRecording}
        onToggleEmojis={() => { setShowEmojis(!showEmojis); setShowChat(false); setShowStatusPicker(false); }}
        onToggleChat={() => { setShowChat(!showChat); setShowEmojis(false); setShowStatusPicker(false); }}
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
        avatarConfig={currentUser.avatarConfig!}
        showShareButton={usersInCall.length > 0}
        showRecordingButton={usersInCall.length > 0}
        onToggleLock={bloquearConversacion}
        isLocked={conversacionBloqueada}
        showLockButton={usersInCall.length > 0 && !conversacionProximaBloqueada}
        currentStream={stream}
        onCameraSettingsChange={(newSettings) => {
          setCameraSettings(newSettings);
          saveCameraSettings(newSettings);
        }}
        onAudioSettingsChange={async (newSettings) => {
          setAudioSettings(newSettings);
          saveAudioSettings(newSettings);
          
          // Aplicar cambios de micrófono en tiempo real si hay stream activo
          if (activeStreamRef.current && newSettings.selectedMicrophoneId) {
            try {
              console.log('🎤 Applying new microphone:', newSettings.selectedMicrophoneId);
              const newAudioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: newSettings.selectedMicrophoneId },
                  noiseSuppression: newSettings.noiseReduction,
                  echoCancellation: newSettings.echoCancellation,
                  autoGainControl: newSettings.autoGainControl,
                }
              });
              
              const newAudioTrack = newAudioStream.getAudioTracks()[0];
              const oldAudioTrack = activeStreamRef.current.getAudioTracks()[0];
              
              if (oldAudioTrack && newAudioTrack) {
                // Reemplazar track en el stream local
                activeStreamRef.current.removeTrack(oldAudioTrack);
                activeStreamRef.current.addTrack(newAudioTrack);
                oldAudioTrack.stop();
                
                // Reemplazar en LiveKit si está conectado
                if (USAR_LIVEKIT && livekitRoomRef.current?.state === 'connected') {
                  const finalTrack = newSettings.noiseReduction
                    ? (await crearAudioProcesado(newAudioTrack, newSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : 'standard')) || newAudioTrack
                    : newAudioTrack;
                  await publicarTrackLocal(finalTrack, 'audio');
                  finalTrack.enabled = currentUser.isMicOn;
                  console.log('🎤 LiveKit audio track updated with new settings');
                }
                // Reemplazar en conexiones peer (path non-LiveKit)
                peerConnectionsRef.current.forEach(async (pc, peerId) => {
                  const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                  if (audioSender) {
                    await audioSender.replaceTrack(newAudioTrack);
                    console.log('🎤 Replaced audio track for peer', peerId);
                  }
                });
                
                // Aplicar procesamiento de audio para stream local (path non-LiveKit)
                if (!USAR_LIVEKIT) {
                  const nivel = newSettings.noiseReductionLevel === 'enhanced' ? 'enhanced' : 'standard';
                  if (newSettings.noiseReduction) {
                    const processedTrack = await crearAudioProcesado(newAudioTrack, nivel);
                    if (processedTrack) {
                      activeStreamRef.current.removeTrack(newAudioTrack);
                      activeStreamRef.current.addTrack(processedTrack);
                    }
                  } else {
                    limpiarAudioProcesado();
                  }
                }
                newAudioTrack.enabled = currentUser.isMicOn;
                console.log('🎤 New microphone applied successfully');
              }
            } catch (err) {
              console.error('Error applying new microphone:', err);
            }
          }
        }}
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
          cargoUsuario={cargoUsuario as any}
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
            console.log('✅ Análisis conductual completado:', resultado?.tipo_grabacion, resultado?.analisis);
          }}
          headlessMode={true}
          externalTrigger={recordingTrigger}
          onExternalTriggerHandled={() => setRecordingTrigger(false)}
        />
      )}

      {/* Modal de consentimiento para usuarios evaluados */}
      <ConsentimientoPendiente
        onConsentimientoRespondido={(grabacionId, acepto) => {
          console.log(`📝 Consentimiento ${acepto ? 'aceptado' : 'rechazado'} para grabación:`, grabacionId);
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

      {/* --- Hito 8: Edit Mode UI --- */}
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

      {isEditMode && (
        <InspectorEdicionObjeto objeto={objetoSeleccionado} modoActual={modoEdicionObjeto} onTransformar={handleTransformarObjeto} />
      )}

      {/* Se eliminó el EditModeToast a petición del usuario debido a problemas de renderizado */}
    </div>
  );
};

export default VirtualSpace3D;
