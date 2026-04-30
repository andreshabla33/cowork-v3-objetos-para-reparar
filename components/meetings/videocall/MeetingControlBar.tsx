/**
 * MeetingControlBar - Barra de controles para videollamadas LiveKit
 * 
 * Estilo Glassmorphism 2026 - Consistente con BottomControlBar del espacio virtual
 * Incluye: Mic, Cámara, Compartir pantalla, Chat, Reacciones, Grabar, Salir
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { Track, RoomEvent, type ScreenShareCaptureOptions } from 'livekit-client';
import {
  SharedAudioDeviceControl,
  SharedCameraDeviceControl,
  SharedMediaSettingsSheet,
} from '@/components/media/SharedMediaDeviceControls';
import { defaultAudioSettings, defaultCameraSettings, canShareScreenWithAudio, type CameraSettings, type AudioSettings, type PermissionState, type RecordingDiagnostics } from '@/modules/realtime-room';
import { logger } from '@/lib/logger';

const log = logger.child('meeting-control-bar');
const browserSupportsScreenShareAudio = canShareScreenWithAudio();

// ============== TIPOS ==============
export type TipoReunion = 'equipo' | 'deal' | 'entrevista';

interface MeetingControlBarProps {
  onLeave: () => void;
  onToggleMic: () => void | Promise<boolean>;
  onToggleCamera: () => void | Promise<boolean>;
  onToggleChat?: () => void;
  showChat?: boolean;
  tipoReunion?: TipoReunion;
  salaId?: string;
  reunionId?: string;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  // Grabación
  isRecording?: boolean;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onSendReaction?: (emoji: string) => void | Promise<void>;
  onToggleRaiseHand?: () => void | Promise<void>;
  isHandRaised?: boolean;
  participantCount?: number;
  currentStream?: MediaStream | null;
  cameraSettings?: CameraSettings;
  audioSettings?: AudioSettings;
  onCameraSettingsChange?: (partial: Partial<CameraSettings>) => void | Promise<boolean>;
  onAudioSettingsChange?: (partial: Partial<AudioSettings>) => void | Promise<boolean>;
  showRecordingButton?: boolean;
  canStartRecording?: boolean;
  recordingDisabledReason?: string | null;
  remoteRecordingBy?: string | null;
  recordingDiagnostics?: RecordingDiagnostics | null;
  cameraPermissionState?: PermissionState;
  microphonePermissionState?: PermissionState;
  hasMicrophoneDevice?: boolean;
  hasCameraDevice?: boolean;
  // Navegación
  onGoToVirtualSpace?: () => void;
}

// Configuración de tipos de reunión para mostrar badge
const TIPO_REUNION_CONFIG = {
  equipo: { label: 'Equipo', icon: '👥', color: 'from-[#4FB0FF] to-[#2E96F5]' },
  deal: { label: 'Cliente', icon: '💼', color: 'from-emerald-500 to-teal-500' },
  entrevista: { label: 'Candidato', icon: '🎯', color: 'from-[#4FB0FF] to-[#2E96F5]' },
};

export const MeetingControlBar: React.FC<MeetingControlBarProps> = ({
  onLeave,
  onToggleMic,
  onToggleCamera,
  onToggleChat,
  showChat = false,
  tipoReunion = 'equipo',
  salaId,
  reunionId,
  isMicEnabled: isMicEnabledProp,
  isCameraEnabled: isCameraEnabledProp,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
  onSendReaction,
  onToggleRaiseHand,
  isHandRaised = false,
  participantCount = 0,
  currentStream = null,
  cameraSettings,
  audioSettings,
  onCameraSettingsChange,
  onAudioSettingsChange,
  showRecordingButton = true,
  canStartRecording = true,
  recordingDisabledReason = null,
  remoteRecordingBy = null,
  recordingDiagnostics = null,
  cameraPermissionState = 'unknown',
  microphonePermissionState = 'unknown',
  hasMicrophoneDevice = true,
  hasCameraDevice = true,
  onGoToVirtualSpace,
}) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  
  // Estados locales
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [controlFeedback, setControlFeedback] = useState<string | null>(null);
  const [shareScreenWithAudio, setShareScreenWithAudio] = useState(browserSupportsScreenShareAudio);
  const [isCompactLayout, setIsCompactLayout] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [isMobileLayout, setIsMobileLayout] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showMobileOverflowMenu, setShowMobileOverflowMenu] = useState(false);
  const [showMobileSettingsMenu, setShowMobileSettingsMenu] = useState(false);

  // Emojis para reacciones
  const emojis = ['👍', '👎', '❤️', '👏', '😂', '😮', '😐', '🤥', '😡', '😢', '🚀', '✨'];

  const showTemporaryFeedback = useCallback((message: string) => {
    setControlFeedback(message);
    window.clearTimeout((showTemporaryFeedback as any).timeoutId);
    (showTemporaryFeedback as any).timeoutId = window.setTimeout(() => {
      setControlFeedback(null);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout((showTemporaryFeedback as any).timeoutId);
    };
  }, [showTemporaryFeedback]);

  useEffect(() => {
    const syncMobileLayout = () => {
      const nextIsCompact = window.innerWidth < 1024;
      const nextIsMobile = window.innerWidth < 768;
      setIsCompactLayout(nextIsCompact);
      setIsMobileLayout(nextIsMobile);
      if (!nextIsCompact) {
        setShowMobileSettingsMenu(false);
      }
      if (!nextIsMobile) {
        setShowMobileOverflowMenu(false);
      }
    };

    syncMobileLayout();
    window.addEventListener('resize', syncMobileLayout);
    return () => {
      window.removeEventListener('resize', syncMobileLayout);
    };
  }, []);

  useEffect(() => {
    setIsMicEnabled(isMicEnabledProp);
  }, [isMicEnabledProp]);

  useEffect(() => {
    setIsCameraEnabled(isCameraEnabledProp);
  }, [isCameraEnabledProp]);

  // Sincronizar screen share con LiveKit
  useEffect(() => {
    if (!room) return;

    const syncState = () => {
      if (localParticipant) {
        setIsScreenSharing(localParticipant.isScreenShareEnabled);
      }
    };

    room.on(RoomEvent.TrackMuted, syncState);
    room.on(RoomEvent.TrackUnmuted, syncState);
    room.on(RoomEvent.LocalTrackPublished, syncState);
    room.on(RoomEvent.LocalTrackUnpublished, syncState);
    room.on(RoomEvent.Connected, syncState);

    // Re-sync después de 1s para capturar tracks que se publican con delay
    const delaySync = setTimeout(syncState, 1000);

    return () => {
      room.off(RoomEvent.TrackMuted, syncState);
      room.off(RoomEvent.TrackUnmuted, syncState);
      room.off(RoomEvent.LocalTrackPublished, syncState);
      room.off(RoomEvent.LocalTrackUnpublished, syncState);
      room.off(RoomEvent.Connected, syncState);
      clearTimeout(delaySync);
    };
  }, [room, localParticipant]);

  // Toggle micrófono
  const toggleMic = useCallback(async () => {
    const result = await onToggleMic();
    if (result === false) {
      showTemporaryFeedback(
        !hasMicrophoneDevice
          ? 'No se encontró un micrófono compatible en este equipo. Conecta uno y vuelve a intentar.'
          : microphonePermissionState === 'denied'
          ? 'Permite el micrófono en tu navegador y vuelve a intentarlo.'
          : 'No pudimos activar el micrófono. Reintenta desde este botón.',
      );
      return;
    }
  }, [hasMicrophoneDevice, microphonePermissionState, onToggleMic, showTemporaryFeedback]);

  // Toggle cámara
  const toggleCamera = useCallback(async () => {
    const result = await onToggleCamera();
    if (result === false) {
      showTemporaryFeedback(
        !hasCameraDevice
          ? 'No se encontró una cámara compatible en este equipo. Conecta una y vuelve a intentar.'
          : cameraPermissionState === 'denied'
          ? 'Permite la cámara en tu navegador y vuelve a intentarlo.'
          : 'No pudimos activar la cámara. Reintenta desde este botón.',
      );
      return;
    }
  }, [cameraPermissionState, hasCameraDevice, onToggleCamera, showTemporaryFeedback]);

  // Toggle compartir pantalla
  const toggleScreenShare = useCallback(async () => {
    if (!localParticipant) {
      return;
    }

    const screenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

    if (!isScreenSharing && !screenShareSupported) {
      showTemporaryFeedback('Compartir pantalla no está disponible en este dispositivo.');
      return;
    }

    try {
      if (isScreenSharing) {
        await localParticipant.setScreenShareEnabled(false);
      } else {
        const screenShareOptions: ScreenShareCaptureOptions = {
          audio: shareScreenWithAudio,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',
          systemAudio: shareScreenWithAudio ? 'include' : 'exclude',
        };
        await localParticipant.setScreenShareEnabled(true, screenShareOptions);
      }
      setIsScreenSharing(!isScreenSharing);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn('Error toggling screen share', { error: errorMessage });
      setIsScreenSharing(localParticipant.isScreenShareEnabled);

      if (errorMessage && !errorMessage.toLowerCase().includes('cancel')) {
        showTemporaryFeedback(
          shareScreenWithAudio
            ? 'No fue posible compartir pantalla con audio en este navegador. Prueba compartir una pestaña del navegador para incluir audio.'
            : 'No fue posible compartir pantalla en este navegador.',
        );
      }
    }
  }, [localParticipant, isScreenSharing, shareScreenWithAudio, showTemporaryFeedback]);

  const handleCameraSettingChange = useCallback((partial: Partial<CameraSettings>) => {
    if (!onCameraSettingsChange) {
      return;
    }
    void onCameraSettingsChange(partial);
  }, [onCameraSettingsChange]);

  const handleAudioSettingChange = useCallback((partial: Partial<AudioSettings>) => {
    if (!onAudioSettingsChange) {
      return;
    }
    void onAudioSettingsChange(partial);
  }, [onAudioSettingsChange]);

  // Enviar reacción via DataChannel
  const sendReaction = useCallback(async (emoji: string) => {
    if (!onSendReaction) {
      log.warn('onSendReaction no configurado');
      return;
    }

    await onSendReaction(emoji);
  }, [onSendReaction]);

  // Manejar salida
  const handleLeave = useCallback(() => {
    if (isRecording) {
      setShowLeaveConfirm(true);
    } else {
      onLeave();
    }
  }, [isRecording, onLeave]);

  // Formatear duración de grabación
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const tipoConfig = TIPO_REUNION_CONFIG[tipoReunion];
  const mobileMenuButtonClass = 'w-full flex items-center justify-between gap-3 rounded-2xl border border-[rgba(46,150,245,0.14)] bg-white/50 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-[rgba(46,150,245,0.08)]';
  const iconButtonClass = isMobileLayout ? 'h-11 w-11 rounded-2xl touch-manipulation' : 'h-10 w-10 rounded-xl';

  return (
    <>
      {/* Barra de controles - Glassmorphism 2026 */}
      <div className="absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[200] flex flex-col items-center gap-2 px-2 md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:px-0">
        {recordingDiagnostics?.visible && (
          <div className={`max-w-[calc(100vw-2rem)] rounded-xl border px-3 py-2 text-center text-xs shadow-lg backdrop-blur-xl ${
            recordingDiagnostics.severity === 'error'
              ? 'border-red-400/30 bg-red-950/70 text-red-100'
              : recordingDiagnostics.severity === 'warn'
                ? 'border-amber-400/30 bg-[#0B2240]/35 text-amber-200'
                : recordingDiagnostics.severity === 'success'
                  ? 'border-emerald-400/30 bg-emerald-950/60 text-emerald-100'
                  : 'border-[#2E96F5]/30 bg-[#0B2240]/60 text-white'
          }`}>
            <div className="font-semibold">{recordingDiagnostics.title}</div>
            <div className="mt-0.5 opacity-90">{recordingDiagnostics.message}</div>
          </div>
        )}

        {controlFeedback && (
          <div className="max-w-[calc(100vw-2rem)] rounded-xl border border-amber-400/30 bg-[#0B2240]/35 px-3 py-2 text-center text-xs text-amber-200 shadow-lg backdrop-blur-xl">
            {controlFeedback}
          </div>
        )}

        {/* Barra Principal */}
        <div className={`flex w-full max-w-[calc(100vw-1rem)] items-center overflow-visible rounded-2xl border border-[rgba(46,150,245,0.14)] bg-black/20 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all duration-300 hover:bg-black/30 hover:border-white/20 md:w-auto md:max-w-[95vw] md:flex-nowrap ${isCompactLayout ? 'justify-between gap-2 rounded-3xl px-2 py-2' : 'flex-wrap justify-center gap-1.5'}`}>
          <div className={`hidden shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r ${tipoConfig.color} px-2.5 py-2 text-[11px] font-medium text-white shadow-lg lg:flex`}>
            <span>{tipoConfig.icon}</span>
            <span>{tipoConfig.label}</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/85">
              {participantCount} conectados
            </span>
          </div>

          <SharedAudioDeviceControl
            isEnabled={isMicEnabled}
            settings={audioSettings ?? defaultAudioSettings}
            currentStream={currentStream}
            onToggle={toggleMic}
            onSettingsChange={handleAudioSettingChange}
            dataTourStep="meeting-mic-group"
            showMenuToggle={!isCompactLayout}
          />

          <SharedCameraDeviceControl
            isEnabled={isCameraEnabled}
            settings={cameraSettings ?? defaultCameraSettings}
            currentStream={currentStream}
            onToggle={toggleCamera}
            onSettingsChange={handleCameraSettingChange}
            dataTourStep="meeting-camera-group"
            showMenuToggle={!isCompactLayout}
          />

          {isCompactLayout && (
            <button
              onClick={() => {
                setShowMobileOverflowMenu(false);
                setShowMobileSettingsMenu(true);
              }}
              className={`shrink-0 flex items-center justify-center transition-all duration-300 ${showMobileSettingsMenu ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'} ${iconButtonClass}`}
              title="Configuración de audio y cámara"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l.432.174a1 1 0 00.982-.09l.407-.293a1 1 0 011.196.08l1.06 1.06a1 1 0 01.08 1.196l-.293.407a1 1 0 00-.09.982l.174.432a1 1 0 01-.936 1.35h-.514a1 1 0 00-.95.69l-.15.45a1 1 0 01-.95.69h-1.5a1 1 0 01-.95-.69l-.15-.45a1 1 0 00-.95-.69h-.514a1 1 0 01-.936-1.35l.174-.432a1 1 0 00-.09-.982L6.87 5.92a1 1 0 01.08-1.196l1.06-1.06a1 1 0 011.196-.08l.407.293a1 1 0 00.982.09l.432-.174a1 1 0 011.35.936z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {!isCompactLayout && <div className="w-px h-6 shrink-0 bg-[rgba(46,150,245,0.08)] mx-0.5"></div>}

          {/* Compartir Pantalla */}
          <div className={`${isMobileLayout ? 'hidden' : 'flex'} items-center gap-1`} data-tour-step="meeting-share-group">
            <button
              onClick={toggleScreenShare}
              className={`${iconButtonClass} shrink-0 flex items-center justify-center transition-all duration-300 ${
                isScreenSharing ? 'bg-[#2E96F5] text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'
              }`}
              title={isScreenSharing ? "Dejar de compartir" : "Compartir pantalla"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setShareScreenWithAudio((current) => !current)}
              className={`h-10 shrink-0 rounded-xl px-2 text-[10px] font-semibold uppercase tracking-wide transition-all duration-300 ${
                shareScreenWithAudio ? 'bg-[#2E96F5]/20 text-white' : 'bg-transparent text-white/60 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'
              }`}
              title={shareScreenWithAudio ? 'Compartir con sonido del sistema' : 'Compartir sin sonido del sistema'}
            >
              Audio
            </button>
          </div>

          {!isCompactLayout && <div className="w-px h-6 shrink-0 bg-[rgba(46,150,245,0.08)] mx-0.5"></div>}

          <div className="flex items-center gap-1" data-tour-step="meeting-collaboration-group">
            {/* Chat */}
            {onToggleChat && (
              <button
                onClick={onToggleChat}
                className={`shrink-0 flex items-center justify-center transition-all duration-300 ${iconButtonClass} ${
                  showChat ? 'bg-blue-500 text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'
                }`}
                title="Chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            )}

            {/* Reacciones */}
            <div className={`${isMobileLayout ? 'hidden' : 'relative'}`} data-tour-step="meeting-reactions-btn">
              <button
                onClick={() => setShowEmojis(!showEmojis)}
                className={`${iconButtonClass} shrink-0 flex items-center justify-center transition-all duration-300 ${
                  showEmojis ? 'bg-amber-500 text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'
                }`}
                title="Reacciones"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            {onToggleRaiseHand && !isMobileLayout && (
              <button
                onClick={() => {
                  void onToggleRaiseHand();
                }}
                className={`${iconButtonClass} shrink-0 flex items-center justify-center transition-all duration-300 ${
                  isHandRaised ? 'bg-sky-500 text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'
                }`}
                title={isHandRaised ? 'Bajar la mano' : 'Levantar la mano'}
              >
                <span className="text-base leading-none">✋</span>
              </button>
            )}
          </div>

          {/* Separador antes de grabación */}
          {showRecordingButton && !isMobileLayout && <div className="w-px h-6 shrink-0 bg-[rgba(46,150,245,0.08)] mx-0.5"></div>}

          {/* Grabación */}
          {showRecordingButton && !isMobileLayout && (
            isRecording ? (
              <div data-tour-step="meeting-recording-group" className="flex shrink-0 items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-red-500/15 border border-red-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs font-mono text-red-400 tabular-nums min-w-[36px]">
                  {formatDuration(recordingDuration)}
                </span>
                <button
                  onClick={onStopRecording}
                  className="w-7 h-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                  title="Detener grabación"
                >
                  <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
                </button>
              </div>
            ) : remoteRecordingBy ? (
              <div data-tour-step="meeting-recording-group" className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs font-medium text-red-400">Grabando</span>
              </div>
            ) : (
              <button
                data-tour-step="meeting-recording-group"
                onClick={onStartRecording}
                disabled={!canStartRecording}
                className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl text-white transition-all duration-300 ${
                  canStartRecording
                    ? 'bg-white/50 hover:bg-[rgba(46,150,245,0.08)]'
                    : 'bg-white/50 text-white/40 opacity-50 cursor-not-allowed'
                }`}
                title={canStartRecording ? 'Iniciar grabación' : (recordingDisabledReason || 'La grabación requiere más de 1 participante')}
              >
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs font-medium text-white/90">Grabar</span>
              </button>
            )
          )}

          {/* Indicador para quien NO tiene botón de grabar pero alguien graba */}
          {!showRecordingButton && remoteRecordingBy && (
            <div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs font-medium text-red-400">Grabando</span>
            </div>
          )}

          {!isCompactLayout && <div className="w-px h-6 shrink-0 bg-[rgba(46,150,245,0.08)] mx-0.5"></div>}

          {/* Botón Ir al Espacio Virtual */}
          {onGoToVirtualSpace && !isMobileLayout && (
            <button
              onClick={onGoToVirtualSpace}
              className={`${iconButtonClass} shrink-0 bg-transparent text-white/70 hover:bg-[#2E96F5]/20 hover:text-[#1E86E5] flex items-center justify-center transition-all duration-300`}
              title="Ir al espacio virtual"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          )}

          {isMobileLayout && (
            <button
              onClick={() => {
                setShowMobileSettingsMenu(false);
                setShowMobileOverflowMenu((current) => !current);
              }}
              className={`h-11 w-11 shrink-0 rounded-2xl touch-manipulation flex items-center justify-center transition-all duration-300 ${showMobileOverflowMenu ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-[rgba(46,150,245,0.08)] hover:text-white'}`}
              title="Más opciones"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </button>
          )}

          {/* Botón Salir */}
          <button
            onClick={handleLeave}
            className={`shrink-0 bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-all duration-300 ${isMobileLayout ? 'h-11 w-11 rounded-2xl touch-manipulation' : 'h-10 w-10 rounded-xl'}`}
            title="Salir de la reunión"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {isMobileLayout && showMobileOverflowMenu && (
        <>
          <button type="button" aria-label="Cerrar menú" onClick={() => setShowMobileOverflowMenu(false)} className="fixed inset-0 z-[230] bg-black/35 backdrop-blur-[1px] md:hidden" />
          <div className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[240] rounded-3xl border border-[rgba(46,150,245,0.14)] bg-[#0B2240]/92 p-3 shadow-2xl backdrop-blur-2xl md:hidden">
            <div className="grid gap-2">
              <button onClick={() => { void toggleScreenShare(); setShowMobileOverflowMenu(false); }} className={mobileMenuButtonClass}>
                <span>Compartir pantalla</span>
                <span className="text-white/60">{isScreenSharing ? 'Activa' : 'Inactiva'}</span>
              </button>

              <button onClick={() => setShareScreenWithAudio((current) => !current)} className={mobileMenuButtonClass}>
                <span>Audio del sistema</span>
                <span className="text-white/60">{shareScreenWithAudio ? 'On' : 'Off'}</span>
              </button>

              <button onClick={() => { setShowEmojis((current) => !current); setShowMobileOverflowMenu(false); }} className={mobileMenuButtonClass}>
                <span>Reacciones</span>
                <span className="text-white/60">Emoji</span>
              </button>

              {onToggleRaiseHand && (
                <button onClick={() => { void onToggleRaiseHand(); setShowMobileOverflowMenu(false); }} className={mobileMenuButtonClass}>
                  <span>{isHandRaised ? 'Bajar la mano' : 'Levantar la mano'}</span>
                  <span className="text-white/60">✋</span>
                </button>
              )}

              {showRecordingButton && (
                isRecording ? (
                  <button onClick={() => { onStopRecording?.(); setShowMobileOverflowMenu(false); }} className={mobileMenuButtonClass}>
                    <span>Detener grabación</span>
                    <span className="text-red-300">{formatDuration(recordingDuration)}</span>
                  </button>
                ) : (
                  <button onClick={() => { if (canStartRecording) { onStartRecording?.(); setShowMobileOverflowMenu(false); } }} disabled={!canStartRecording} className={`${mobileMenuButtonClass} ${canStartRecording ? '' : 'opacity-50 cursor-not-allowed'}`}>
                    <span>Iniciar grabación</span>
                    <span className="text-white/60">REC</span>
                  </button>
                )
              )}

              {onGoToVirtualSpace && (
                <button onClick={() => { onGoToVirtualSpace(); setShowMobileOverflowMenu(false); }} className={mobileMenuButtonClass}>
                  <span>Ir al espacio virtual</span>
                  <span className="text-white/60">↗</span>
                </button>
              )}

            </div>
          </div>
        </>
      )}

      {isCompactLayout && (
        <SharedMediaSettingsSheet
          isOpen={showMobileSettingsMenu}
          onClose={() => setShowMobileSettingsMenu(false)}
          audioSettings={audioSettings ?? defaultAudioSettings}
          cameraSettings={cameraSettings ?? defaultCameraSettings}
          currentStream={currentStream}
          onAudioSettingsChange={handleAudioSettingChange}
          onCameraSettingsChange={handleCameraSettingChange}
          overlayClassName={`fixed inset-0 z-[240] bg-[#0B2240]/35 backdrop-blur-[1px] ${isMobileLayout ? 'md:hidden' : ''}`}
          panelClassName={`fixed z-[250] overflow-hidden rounded-[2rem] border border-[rgba(46,150,245,0.14)] bg-[#0B2240]/92 shadow-2xl backdrop-blur-2xl ${isMobileLayout ? 'inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] top-16 md:hidden' : 'bottom-24 left-1/2 top-auto w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2'}`}
        />
      )}

      {/* Emoji Picker */}
      {showEmojis && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-[260] -translate-x-1/2 animate-emoji-popup md:absolute md:bottom-24 md:left-1/2 md:z-[220] md:-translate-x-1/2">
          <div className="flex gap-0.5 rounded-xl border border-[rgba(46,150,245,0.14)] bg-black/80 px-2 py-1.5 backdrop-blur-xl shadow-2xl">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  void sendReaction(emoji);
                  setShowEmojis(false);
                }}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-lg transition-all duration-150 hover:bg-[rgba(46,150,245,0.14)] hover:scale-110 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal de confirmación si hay grabación activa */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-[#0B2240]/35 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-[#0B2240]/90 rounded-2xl p-6 max-w-sm w-full border border-[rgba(46,150,245,0.14)] shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Grabación en curso</h3>
              <p className="text-white/70 text-sm mb-6">
                Si sales ahora, la grabación se detendrá y se guardará automáticamente.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-[rgba(46,150,245,0.08)] hover:bg-[rgba(46,150,245,0.14)] rounded-xl text-white font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onStopRecording?.();
                    setTimeout(onLeave, 500);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MeetingControlBar;
