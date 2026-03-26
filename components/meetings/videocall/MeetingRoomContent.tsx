import React from 'react';
import { ChatToast } from '@/components/ChatToast';
import { VideoWithBackground } from '@/components/VideoWithBackground';
import { RecordingDiagnosticsService, type RecordingDiagnosticsSnapshot } from '@/modules/realtime-room';
import { RecordingManager } from '../recording/RecordingManager';
import { MeetingAudioRenderer } from './MeetingAudioRenderer';
import { CustomParticipantTile } from './CustomParticipantTile';
import { MeetingChatPanel } from './MeetingChatPanel';
import { MeetingControlBar } from './MeetingControlBar';
import { MeetingGuidedOnboarding } from './MeetingGuidedOnboarding';
import { MeetingGuestConsentModal } from './MeetingGuestConsentModal';
import { MeetingReactionParticleLayer } from './MeetingReactionParticleLayer';
import { MeetingTrackRenderer } from './MeetingTrackRenderer';
import { VideoLayoutManager } from './VideoLayoutManager';
import { ViewModeSelector } from './ViewModeSelector';
import { useMeetingLayoutSnapshot } from './hooks/useMeetingLayoutSnapshot';
import { useMeetingMediaBridge } from './hooks/useMeetingMediaBridge';
import { useMeetingRealtimeState } from './hooks/useMeetingRealtimeState';
import type { MeetingRoomContentProps } from './meetingRoom.types';

/**
 * How long to wait (ms) after a new video track becomes available before mounting
 * the background-effect pipeline. VideoWithBackground already retries internally
 * until the track is truly playable, so this is just a small safety buffer.
 */
const BACKGROUND_EFFECT_INITIALIZATION_DELAY_MS = 500;

export const MeetingRoomContent: React.FC<MeetingRoomContentProps> = ({
  theme,
  isHost,
  isExternalGuest = false,
  tokenInvitacion,
  onLeave,
  onRetryConnection,
  tipoReunion,
  salaId,
  reunionId,
  initialCameraEnabled,
  initialMicrophoneEnabled,
  showChat,
  onToggleChat,
  espacioId,
  userId,
  userName,
  userAvatar,
  cargoUsuario,
  invitadosExternos = [],
  guestPermissions = { allowChat: true, allowVideo: true },
  recoveryState,
}) => {
  const recordingDiagnosticsService = React.useMemo(() => new RecordingDiagnosticsService(), []);
  const [recordingDiagnosticsSnapshot, setRecordingDiagnosticsSnapshot] = React.useState<RecordingDiagnosticsSnapshot | null>(null);
  const [isConnectedPopoverOpen, setIsConnectedPopoverOpen] = React.useState(false);
  const [backgroundEffectReady, setBackgroundEffectReady] = React.useState(false);
  const connectedPopoverRef = React.useRef<HTMLDivElement | null>(null);
  const prevVideoTrackIdRef = React.useRef<string | null>(null);
  const {
    room,
    localParticipant,
    chatMessages,
    send,
    isSending,
    remoteRecording,
    reactions,
    viewMode,
    setViewMode,
    effectiveViewMode,
    pinnedParticipantId,
    chatNotifications,
    dismissChatNotification,
    openChatNotification,
    isRecording,
    recordingDuration,
    recordingTrigger,
    setRecordingTrigger,
    guestConsentRequest,
    localStream,
    canStartRecording,
    recordingDisabledReason,
    canShowChat,
    raisedHandParticipantIds,
    isLocalHandRaised,
    handleSendReaction,
    handleToggleRaiseHand,
    handleToggleRecording,
    handleRecordingStateChange,
    setRecordingDuration,
    validTracks,
    videoTracks,
    screenShareTrack,
    speakerIdentity,
    speakerBubbleParticipant,
    optimizacion,
    handleTogglePinnedParticipant,
    handleMuteRemoteParticipant,
    handleRequestGuestConsent,
    handleGuestConsentResponse,
    usuariosEnLlamada,
    preselectedTipoGrabacion,
  } = useMeetingRealtimeState({
    salaId,
    tokenInvitacion,
    tipoReunion,
    userName,
    userAvatar,
    userId,
    espacioId,
    isExternalGuest,
    guestPermissions,
    showChat,
    onToggleChat,
    invitadosExternos,
  });
  const { mediaState, cameraSettings, audioSettings, isLocalVideoProcessed, videoBackgroundKey, updateCameraSettings, updateAudioSettings, toggleMicrophone, toggleCamera, setProcessedStream } = useMeetingMediaBridge({
    room,
    initialCameraEnabled,
    initialMicrophoneEnabled,
  });
  const recordingDiagnostics = React.useMemo(
    () => recordingDiagnosticsService.build(recordingDiagnosticsSnapshot),
    [recordingDiagnosticsService, recordingDiagnosticsSnapshot],
  );
  const connectedParticipants = React.useMemo(() => {
    const names = new Set<string>();

    if (localParticipant?.name || userName) {
      names.add(localParticipant?.name || userName);
    }

    usuariosEnLlamada.forEach((participant) => {
      if (participant.nombre) {
        names.add(participant.nombre);
      }
    });

    return Array.from(names);
  }, [localParticipant?.name, userName, usuariosEnLlamada]);
  const speakerBubbleTrack = React.useMemo(() => {
    if (!speakerBubbleParticipant) {
      return null;
    }

    return validTracks.find((track) => track.participant?.identity === speakerBubbleParticipant.identity) ?? null;
  }, [speakerBubbleParticipant, validTracks]);
  const showRecoveryBanner = recoveryState && recoveryState.phase !== 'connected';
  const { layoutSnapshot } = useMeetingLayoutSnapshot({
    validTracks,
    localParticipantIdentity: localParticipant?.identity,
    hideSelfView: cameraSettings.hideSelfView,
    keepSelfViewVisible: Boolean(screenShareTrack),
    effectiveViewMode,
    speakerIdentity,
    screenShareTrack,
  });

  React.useEffect(() => {
    if (effectiveViewMode !== 'gallery') {
      setIsConnectedPopoverOpen(false);
    }
  }, [effectiveViewMode]);

  React.useEffect(() => {
    // Check if video track actually changed (not just mic/audio)
    const videoTrack = mediaState.stream?.getVideoTracks()[0];
    const currentVideoTrackId = videoTrack?.id || null;
    const hasVideoTrack = !!videoTrack;

    // Only reset if video track actually changed or effect type changed
    const videoTrackChanged = prevVideoTrackIdRef.current !== currentVideoTrackId;
    const shouldBeReady = !!(
      room
      && room.state === 'connected'
      && mediaState.desiredCameraEnabled
      && hasVideoTrack
      && cameraSettings.backgroundEffect !== 'none'
    );

    if (!shouldBeReady) {
      setBackgroundEffectReady(false);
      prevVideoTrackIdRef.current = currentVideoTrackId;
      return;
    }

    // If video track changed or we're becoming ready, set a delay
    if (videoTrackChanged || !backgroundEffectReady) {
      const timer = window.setTimeout(() => {
        setBackgroundEffectReady(true);
        prevVideoTrackIdRef.current = currentVideoTrackId;
      }, BACKGROUND_EFFECT_INITIALIZATION_DELAY_MS);

      return () => {
        window.clearTimeout(timer);
        // Don't set ready to false here - let it stay ready until conditions truly fail
      };
    }
  }, [cameraSettings.backgroundEffect, mediaState.desiredCameraEnabled, mediaState.stream, room, videoBackgroundKey]);

  React.useEffect(() => {
    if (!isConnectedPopoverOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (connectedPopoverRef.current && !connectedPopoverRef.current.contains(target)) {
        setIsConnectedPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isConnectedPopoverOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <style>{`
        .lk-grid-layout {
          height: 100% !important;
          padding: 8px !important;
          gap: 8px !important;
          background: transparent !important;
        }
        .lk-participant-tile {
          border-radius: 12px !important;
          overflow: hidden !important;
          background: #18181b !important;
        }
        .lk-participant-placeholder {
          background: linear-gradient(135deg, #27272a 0%, #18181b 100%) !important;
        }
        .lk-participant-name {
          background: rgba(0,0,0,0.6) !important;
          backdrop-filter: blur(8px) !important;
          padding: 4px 10px !important;
          border-radius: 6px !important;
          font-size: 12px !important;
        }
      `}</style>

      {backgroundEffectReady && mediaState.desiredCameraEnabled && mediaState.stream && mediaState.stream.getVideoTracks().length > 0 && cameraSettings.backgroundEffect !== 'none' && (
        <div className="absolute h-0 w-0 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
          <VideoWithBackground
            key={videoBackgroundKey}
            stream={mediaState.stream}
            effectType={cameraSettings.backgroundEffect}
            backgroundImage={cameraSettings.backgroundImage}
            blurAmount={12}
            muted={true}
            className="w-full h-full object-cover"
            onProcessedStreamReady={setProcessedStream}
            mirrorVideo={cameraSettings.mirrorVideo}
          />
        </div>
      )}

      <MeetingGuidedOnboarding
        userId={userId}
        isExternalGuest={isExternalGuest}
        showRecordingStep={Boolean(isHost || !isExternalGuest)}
      />

      <MeetingAudioRenderer speakerDeviceId={audioSettings.selectedSpeakerId || undefined} />

      {showRecoveryBanner && (
        <div className="absolute inset-x-0 top-0 z-[120] flex flex-col gap-2 p-3 pointer-events-none">
          {showRecoveryBanner && recoveryState && (
            <div className={`pointer-events-auto flex items-center justify-between rounded-xl border px-4 py-3 text-sm backdrop-blur-md ${recoveryState.phase === 'error' ? 'border-red-500/40 bg-red-500/15 text-red-100' : recoveryState.phase === 'degraded' ? 'border-amber-500/40 bg-amber-500/15 text-amber-50' : 'border-indigo-500/40 bg-indigo-500/15 text-indigo-50'}`}>
              <div>
                <div className="font-semibold">
                  {recoveryState.phase === 'reconnecting' ? `Reconectando (${recoveryState.reconnectAttempt}/${recoveryState.maxReconnectAttempts})` : recoveryState.phase === 'degraded' ? 'Conexión inestable' : recoveryState.phase === 'error' ? 'Recuperación detenida' : 'Conectando'}
                </div>
                {recoveryState.recoveryMessage && (
                  <div className="text-xs opacity-80 mt-1">{recoveryState.recoveryMessage}</div>
                )}
              </div>
              {(recoveryState.phase === 'error' || recoveryState.phase === 'degraded') && onRetryConnection && (
                <button
                  type="button"
                  onClick={onRetryConnection}
                  className="ml-4 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Reintentar ahora
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="absolute left-2 top-2 z-[100] md:left-4 md:top-4">
        <ViewModeSelector
          currentMode={effectiveViewMode}
          onChange={setViewMode}
          hasScreenShare={!!screenShareTrack}
          participantCount={videoTracks.length}
        />
      </div>

      {effectiveViewMode === 'speaker' && !screenShareTrack && speakerBubbleParticipant && speakerBubbleParticipant.identity !== speakerIdentity && (
        <div className="pointer-events-none absolute right-2 top-16 z-[110] w-32 rounded-[1.2rem] border border-white/10 bg-zinc-950/76 p-2 text-white shadow-2xl backdrop-blur-xl md:right-4 md:top-4 md:w-40 md:rounded-[1.4rem] md:p-2.5">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Intervención breve</div>
          <div className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-zinc-900">
            <div className="aspect-[5/4]">
              {speakerBubbleTrack ? (
                <CustomParticipantTile
                  trackRef={speakerBubbleTrack}
                  localMirrorVideo={cameraSettings.mirrorVideo}
                  localVideoProcessed={isLocalVideoProcessed}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 px-3 text-center text-sm font-semibold text-white/90">
                  {speakerBubbleParticipant.name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {effectiveViewMode === 'gallery' && connectedParticipants.length > 0 && (
        <div ref={connectedPopoverRef} className="absolute right-2 top-2 z-[110] md:right-4 md:top-4">
          <button
            data-tour-step="meeting-connected-badge"
            type="button"
            onClick={() => setIsConnectedPopoverOpen((current) => !current)}
            className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border border-white/10 bg-zinc-950/78 px-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl transition-colors hover:bg-zinc-900/88 md:h-10 md:min-w-[2.5rem]"
            title="Ver conectados"
          >
            {connectedParticipants.length}
          </button>

          {isConnectedPopoverOpen && (
            <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-zinc-950/90 p-3 text-white shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Conectados</div>
                <div className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  {connectedParticipants.length}
                </div>
              </div>
              <div className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1 text-sm text-white/82">
                {connectedParticipants.map((participantName) => (
                  <div key={participantName} className="truncate rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    {participantName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div data-tour-step="meeting-stage" className={`h-full w-full pb-24 transition-all duration-300 md:pb-20 ${showChat ? 'pr-0 md:pr-80' : ''}`}>
        <VideoLayoutManager
          layoutModel={layoutSnapshot}
          optimizacion={optimizacion}
          renderParticipant={(track) => (
            <CustomParticipantTile
              trackRef={track}
              isPinned={track.participant?.identity === pinnedParticipantId}
              isHandRaised={Boolean(track.participant?.identity && raisedHandParticipantIds.has(track.participant.identity))}
              onTogglePin={(participant) => {
                void handleTogglePinnedParticipant(participant.identity);
              }}
              onToggleRemoteMute={handleMuteRemoteParticipant}
              canModerateAudio={true}
              localMirrorVideo={cameraSettings.mirrorVideo}
              localVideoProcessed={isLocalVideoProcessed}
            />
          )}
          renderScreenShare={(track) => (
            <MeetingTrackRenderer
              track={track?.publication && ('isSubscribed' in track.publication ? track.publication.isSubscribed : true)
                ? track.publication.track
                : null}
              className="h-full w-full object-contain"
            />
          )}
        />
      </div>

      {canShowChat && (
        <MeetingChatPanel
          isOpen={showChat}
          messages={chatMessages}
          isSending={isSending}
          localParticipantIdentity={localParticipant?.identity}
          onClose={onToggleChat}
          onSendMessage={send}
        />
      )}

      {canShowChat && chatNotifications.length > 0 && (
        <ChatToast
          notifications={chatNotifications}
          onDismiss={dismissChatNotification}
          onOpen={openChatNotification}
          theme={theme}
        />
      )}

      <MeetingReactionParticleLayer reactions={reactions} />

      <MeetingControlBar
        onLeave={onLeave || (() => {})}
        onToggleMic={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onToggleChat={onToggleChat}
        showChat={showChat}
        tipoReunion={tipoReunion}
        salaId={salaId}
        reunionId={reunionId}
        isMicEnabled={mediaState.desiredMicrophoneEnabled}
        isCameraEnabled={mediaState.desiredCameraEnabled}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={handleToggleRecording}
        onStopRecording={handleToggleRecording}
        onSendReaction={handleSendReaction}
        onToggleRaiseHand={handleToggleRaiseHand}
        isHandRaised={isLocalHandRaised}
        showRecordingButton={isHost || !isExternalGuest}
        canStartRecording={canStartRecording}
        recordingDisabledReason={recordingDisabledReason}
        remoteRecordingBy={!isRecording && remoteRecording?.isRecording ? remoteRecording.by : null}
        recordingDiagnostics={recordingDiagnostics}
        participantCount={optimizacion.totalParticipantesVideo || videoTracks.length}
        currentStream={mediaState.stream}
        cameraSettings={cameraSettings}
        audioSettings={audioSettings}
        onCameraSettingsChange={updateCameraSettings}
        onAudioSettingsChange={updateAudioSettings}
        cameraPermissionState={mediaState.preflightCheck.camera}
        microphonePermissionState={mediaState.preflightCheck.microphone}
        onGoToVirtualSpace={!isExternalGuest ? onLeave : undefined}
      />

      {(isHost || !isExternalGuest) && (
        <RecordingManager
          espacioId={espacioId}
          userId={userId}
          userName={userName}
          cargoUsuario={cargoUsuario}
          reunionTitulo={`Videollamada ${tipoReunion} - ${new Date().toLocaleDateString('es-ES')}`}
          stream={localStream}
          usuariosEnLlamada={usuariosEnLlamada}
          canStartRecording={canStartRecording}
          onRecordingStateChange={handleRecordingStateChange}
          onDurationChange={setRecordingDuration}
          onDiagnosticsSnapshotChange={setRecordingDiagnosticsSnapshot}
          onProcessingComplete={(resultado) => {
            console.log('✅ Análisis conductual completado en videollamada:', resultado?.tipo_grabacion);
          }}
          preselectedTipoGrabacion={preselectedTipoGrabacion}
          headlessMode={true}
          externalTrigger={recordingTrigger}
          onExternalTriggerHandled={() => setRecordingTrigger(false)}
          onRequestGuestConsent={handleRequestGuestConsent}
        />
      )}

      <MeetingGuestConsentModal
        request={guestConsentRequest}
        isExternalGuest={isExternalGuest}
        onRespond={handleGuestConsentResponse}
      />
    </div>
  );
};

export default MeetingRoomContent;
