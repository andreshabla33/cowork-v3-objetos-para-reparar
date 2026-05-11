/**
 * @module components/meetings/videocall/MeetingLobby
 *
 * Lobby de reunión — componente de entrada antes de unirse a una sala LiveKit.
 *
 * Diseño inspirado en Google Meet:
 *   - Columna izquierda: preview de cámara con controles superpuestos
 *   - Columna derecha: título, nombre, botón de unirse e indicadores discretos
 *
 * Clean Architecture — Presentation layer:
 *   - Toda la lógica de estado reside en useLobbyState (hook de orquestación)
 *   - Este componente solo compone sub-componentes declarativos
 *   - Sin lógica de negocio directa
 */

'use client';

import React from 'react';
import type { PreferenciasIngresoReunion } from '@/hooks/app/useRutasReunion';
import { useLobbyState } from './hooks/useLobbyState';
import { LobbyLoadingScreen } from './lobby/LobbyLoadingScreen';
import { LobbyErrorScreen } from './lobby/LobbyErrorScreen';
import { LobbyVideoPreview } from './lobby/LobbyVideoPreview';
import { LobbyMediaControls } from './lobby/LobbyMediaControls';
import { LobbyStatusHints } from './lobby/LobbyStatusHints';
import { LobbyJoinPanel } from './lobby/LobbyJoinPanel';

// ── Props ────────────────────────────────────────────────────────────────────

interface MeetingLobbyProps {
  codigoSala?: string;
  tokenInvitacion?: string;
  onJoin: (token: string, nombre: string, preferencias?: PreferenciasIngresoReunion) => void;
  onError?: (error: string) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export const MeetingLobby: React.FC<MeetingLobbyProps> = ({
  codigoSala,
  tokenInvitacion,
  onJoin,
  onError,
}) => {
  const {
    // Sala
    salaInfo,
    loading,
    joining,
    error,
    // Media
    cameraEnabled,
    micEnabled,
    stream,
    audioSettings,
    cameraSettings,
    localVideoTrackForBg,
    // Preflight / join readiness
    joinMediaSummary,
    statusIndicator,
    joinButtonLabel,
    preflightFeedback,
    // Formulario
    nombre,
    setNombre,
    email,
    setEmail,
    // Browser
    browserInfo,
    // Handlers
    handleToggleCamera,
    handleToggleMic,
    handleAudioSettingsChange,
    handleCameraSettingsChange,
    handleJoin,
  } = useLobbyState({ codigoSala, tokenInvitacion, onJoin, onError });

  // ── Estados de carga y error ───────────────────────────────────────────────
  if (loading) return <LobbyLoadingScreen />;
  if (error && !salaInfo) return <LobbyErrorScreen message={error} />;

  // ── Layout principal ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#050508] p-4 sm:p-6 lg:p-8">

      {/* Container de dos columnas (Google Meet style).
          max-h limita la altura total para que nunca desborde el viewport. */}
      <div className="relative w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
        <div className="grid max-h-[calc(100svh-2rem)] grid-cols-1 overflow-hidden rounded-2xl border border-[rgba(46,150,245,0.14)] shadow-2xl backdrop-blur-xl sm:max-h-[calc(100svh-3rem)] lg:grid-cols-[1fr_380px] lg:max-h-[calc(100svh-4rem)] xl:grid-cols-[1fr_420px] 2xl:grid-cols-[1fr_480px]">

          {/* ── Columna izquierda: video preview ─────────────────────── */}
          <div className="relative min-h-[240px] bg-white/60 lg:min-h-0">
            <LobbyVideoPreview
              stream={stream}
              cameraEnabled={cameraEnabled}
              cameraSettings={cameraSettings}
              localVideoTrackForBg={localVideoTrackForBg}
              nombreInicial={nombre}
              joining={joining}
            >
              {/* Controles superpuestos en la parte inferior */}
              <LobbyMediaControls
                micEnabled={micEnabled}
                cameraEnabled={cameraEnabled}
                audioSettings={audioSettings}
                cameraSettings={cameraSettings}
                stream={stream}
                onToggleMic={handleToggleMic}
                onToggleCamera={handleToggleCamera}
                onAudioSettingsChange={handleAudioSettingsChange}
                onCameraSettingsChange={handleCameraSettingsChange}
              />
            </LobbyVideoPreview>
          </div>

          {/* ── Columna derecha: formulario de ingreso ────────────────── */}
          <div className="border-t border-[rgba(46,150,245,0.14)] bg-white/60 overflow-y-auto lg:border-l lg:border-t-0">
            <LobbyJoinPanel
              salaInfo={salaInfo}
              nombre={nombre}
              email={email}
              hasInvitacionToken={Boolean(tokenInvitacion)}
              joining={joining}
              joinButtonLabel={joinButtonLabel}
              statusIndicator={statusIndicator}
              onNombreChange={setNombre}
              onEmailChange={setEmail}
              onJoin={handleJoin}
              statusHints={
                <LobbyStatusHints
                  browserInfo={browserInfo}
                  error={error}
                  preflightFeedback={preflightFeedback}
                  salaEspera={salaInfo?.configuracion.sala_espera}
                  joinMediaSummary={joinMediaSummary}
                />
              }
            />
          </div>

        </div>
      </div>
    </div>
  );
};
