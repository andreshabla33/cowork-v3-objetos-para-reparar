/**
 * @module components/meetings/videocall/lobby/LobbyMediaControls
 *
 * Barra de controles de media superpuesta en la parte inferior del video preview.
 * Diseño Google Meet: botones circulares centrados sobre fondo semitransparente.
 *
 * Presentation layer — delega toggle/settings a los callbacks del hook.
 */

'use client';

import React from 'react';
import {
  SharedAudioDeviceControl,
  SharedCameraDeviceControl,
} from '@/components/media/SharedMediaDeviceControls';
import {
  defaultAudioSettings,
  defaultCameraSettings,
} from '@/modules/realtime-room';
import type { AudioSettings, CameraSettings } from '@/modules/realtime-room';

interface LobbyMediaControlsProps {
  micEnabled: boolean;
  cameraEnabled: boolean;
  audioSettings: AudioSettings;
  cameraSettings: CameraSettings;
  stream: MediaStream | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onAudioSettingsChange: (partial: Partial<typeof defaultAudioSettings>) => void;
  onCameraSettingsChange: (partial: Partial<typeof defaultCameraSettings>) => void;
}

export const LobbyMediaControls: React.FC<LobbyMediaControlsProps> = ({
  micEnabled,
  cameraEnabled,
  audioSettings,
  cameraSettings,
  stream,
  onToggleMic,
  onToggleCamera,
  onAudioSettingsChange,
  onCameraSettingsChange,
}) => (
  <div className="flex justify-center px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
    {/* Pill semitransparente que contiene los controles */}
    <div className="flex items-center gap-2 rounded-full border border-[rgba(46,150,245,0.14)] bg-[rgba(46,150,245,0.08)] px-3 py-2 shadow-2xl backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-2.5">
      <SharedAudioDeviceControl
        isEnabled={micEnabled}
        settings={audioSettings ?? defaultAudioSettings}
        currentStream={stream}
        onToggle={onToggleMic}
        onSettingsChange={onAudioSettingsChange}
        dataTourStep="lobby-mic-group"
        showMenuToggle
      />
      <SharedCameraDeviceControl
        isEnabled={cameraEnabled}
        settings={cameraSettings ?? defaultCameraSettings}
        currentStream={stream}
        onToggle={onToggleCamera}
        onSettingsChange={onCameraSettingsChange}
        dataTourStep="lobby-camera-group"
        showMenuToggle
      />
    </div>
  </div>
);
