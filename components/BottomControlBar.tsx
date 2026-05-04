import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { UserAvatar } from './UserAvatar';
import { AvatarConfig, PresenceStatus } from '../types';
import { SharedAudioDeviceControl, SharedCameraDeviceControl } from './media/SharedMediaDeviceControls';
import { loadAudioSettings, loadCameraSettings, saveAudioSettings, saveCameraSettings, type AudioSettings, type CameraSettings } from '@/modules/realtime-room';

interface BottomControlBarProps {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleShare: () => void;
  onToggleRecording: () => void;
  onToggleEmojis: () => void;
  onToggleChat: () => void;
  onToggleRaiseHand: () => void;
  isMicOn: boolean;
  isCamOn: boolean;
  isSharing: boolean;
  onAudioSettingsChange?: (settings: AudioSettings) => void;
  isRecording: boolean;
  recordingDuration?: number;
  showEmojis: boolean;
  showChat: boolean;
  showStatusPicker: boolean;
  onToggleStatusPicker: () => void;
  onTriggerReaction: (emoji: string) => void;
  isHandRaised: boolean;
  avatarConfig: AvatarConfig;
  showShareButton: boolean;
  showRecordingButton: boolean;
  currentStream?: MediaStream | null;
  onCameraSettingsChange?: (settings: CameraSettings) => void;
  onOpenGameHub?: () => void;
  isGameActive?: boolean;
  isGameHubOpen?: boolean;
  onToggleLock?: () => void;
  isLocked?: boolean;
  showLockButton?: boolean;
  onIrAMiEscritorio?: () => void;
  tieneMiEscritorio?: boolean;
}

// Configuración de estados con iconos y colores (estilo 2026)
const STATUS_CONFIG = {
  [PresenceStatus.AVAILABLE]: { color: '#22c55e', icon: '●', label: 'Disponible' },
  [PresenceStatus.BUSY]: { color: '#ef4444', icon: '◉', label: 'Ocupado' },
  [PresenceStatus.AWAY]: { color: '#f59e0b', icon: '◐', label: 'Ausente' },
  [PresenceStatus.DND]: { color: '#8b5cf6', icon: '⊘', label: 'No molestar' },
};

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  onToggleMic,
  onToggleCam,
  onToggleShare,
  onToggleRecording,
  onToggleEmojis,
  onToggleChat,
  onToggleRaiseHand,
  isMicOn,
  isCamOn,
  isSharing,
  isRecording,
  recordingDuration = 0,
  showEmojis,
  showChat,
  showStatusPicker,
  onToggleStatusPicker,
  onTriggerReaction,
  isHandRaised,
  avatarConfig,
  showShareButton,
  showRecordingButton,
  currentStream,
  onCameraSettingsChange,
  onAudioSettingsChange,
  onOpenGameHub,
  isGameActive = false,
  isGameHubOpen = false,
  onToggleLock,
  isLocked = false,
  showLockButton = false,
  onIrAMiEscritorio,
  tieneMiEscritorio = false,
}) => {
  const { currentUser, updateStatus, isEditMode, setIsEditMode } = useStore();
  const emojis = ['👍', '🔥', '❤️', '👏', '😂', '😮', '🚀', '✨'];
  
  const currentStatus = currentUser.status || PresenceStatus.AVAILABLE;
  const statusConfig = STATUS_CONFIG[currentStatus];

  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(loadCameraSettings);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings);
  const updateCameraSettings = (partial: Partial<CameraSettings>) => {
    const newSettings = { ...cameraSettings, ...partial };
    setCameraSettings(newSettings);
    saveCameraSettings(newSettings);
    onCameraSettingsChange?.(newSettings);
  };

  const updateAudioSettings = (partial: Partial<AudioSettings>) => {
    const newSettings = { ...audioSettings, ...partial };
    setAudioSettings(newSettings);
    saveAudioSettings(newSettings);
    console.log('🎤 Audio settings updated:', newSettings);
    onAudioSettingsChange?.(newSettings);
  };

  // Estado para el menú de construcción
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  const buildMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú de construcción al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buildMenuRef.current && !buildMenuRef.current.contains(e.target as Node)) {
        setShowBuildMenu(false);
      }
    };
    if (showBuildMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBuildMenu]);

  // Ocultar completamente cuando el GameHub está abierto (menú o jugando)
  if (isGameHubOpen) return null;

  return (
    <div className={`absolute z-[200] transition-all duration-500 ease-out ${
      isGameActive 
        ? 'left-3 top-1/2 -translate-y-1/2 flex flex-col items-start gap-2' 
        : 'bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-2'
    }`} onClick={(e) => e.stopPropagation()}>
      {/* Barra Principal Glassmorphism 2026 - Adaptativa: horizontal (normal) / vertical (juego) */}
      <div className={`${isGameActive ? 'flex flex-col' : 'flex'} items-center gap-1.5 p-1.5 rounded-2xl border border-[rgba(46,150,245,0.18)] bg-[rgba(11,34,64,0.24)] backdrop-blur-2xl shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_32px_-8px_rgba(11,34,64,0.35)] transition-all duration-500 hover:bg-[rgba(11,34,64,0.32)] hover:border-[rgba(46,150,245,0.34)] hover:shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_12px_40px_-8px_rgba(11,34,64,0.42)]`}>
        
        {/* Foto de usuario con indicador de estado */}
        <div className="relative">
          <button 
            onClick={onToggleStatusPicker}
            className={`w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center border border-white/5 hover:border-white/20 transition-colors cursor-pointer ${isGameActive ? 'mb-0' : 'mr-1'}`}
          >
            <UserAvatar
              name={currentUser.name}
              profilePhoto={currentUser.profilePhoto}
              size="sm"
            />
          </button>
          {/* Indicador de estado actual */}
          <div 
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black/50"
            style={{ backgroundColor: statusConfig.color }}
          />
          
          {/* Status Picker Popup - Iconos minimalistas 2026 */}
          {showStatusPicker && (
            <div className="absolute bottom-full left-0 mb-2 animate-emoji-popup">
              <div className="p-1.5 bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 flex flex-col gap-1">
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <button
                    key={status}
                    onClick={() => {
                      updateStatus(status as PresenceStatus);
                      onToggleStatusPicker();
                    }}
                    className={`
                      w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all duration-150
                      hover:bg-white/20 hover:scale-110 active:scale-90
                      ${currentStatus === status ? 'bg-white/15 ring-1 ring-white/30' : ''}
                    `}
                    title={config.label}
                  >
                    <span style={{ color: config.color }}>{config.icon}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <SharedAudioDeviceControl
          isEnabled={isMicOn}
          settings={audioSettings}
          currentStream={currentStream}
          onToggle={onToggleMic}
          onSettingsChange={updateAudioSettings}
          dataTourStep="mic-btn"
          showMenuToggle={!isGameActive}
        />

        <SharedCameraDeviceControl
          isEnabled={isCamOn}
          settings={cameraSettings}
          currentStream={currentStream}
          onToggle={onToggleCam}
          onSettingsChange={updateCameraSettings}
          dataTourStep="cam-btn"
          showMenuToggle={!isGameActive}
        />

        {showShareButton && !isGameActive && (
          <>
            <div className={`${isGameActive ? 'h-px w-6' : 'w-px h-6'} bg-white/10 mx-0.5`}></div>

            {/* Compartir Pantalla */}
            <ControlButton 
              onClick={onToggleShare} 
              isActive={isSharing} 
              activeColor="bg-indigo-500 text-white" 
              inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              icon={<IconScreen on={isSharing} />}
              tooltip={isSharing ? "Dejar de compartir" : "Compartir pantalla"}
            />
          </>
        )}

        {/* Bloquear conversación (solo visible cuando hay usuarios en proximidad) */}
        {showLockButton && onToggleLock && !isGameActive && (
          <ControlButton 
            onClick={onToggleLock} 
            isActive={isLocked} 
            activeColor="bg-amber-500 text-white" 
            inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            icon={<IconLock on={isLocked} />}
            tooltip={isLocked ? "Desbloquear conversación" : "Bloquear conversación (privada)"}
          />
        )}

        <div className={`${isGameActive ? 'h-px w-6' : 'w-px h-6'} bg-white/10 mx-0.5`}></div>

        {/* Chat */}
        <div data-tour-step="chat-btn">
        <ControlButton 
          onClick={onToggleChat} 
          isActive={showChat} 
          activeColor="bg-blue-500 text-white" 
          inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
          icon={<IconChat />}
          tooltip="Chat"
        />
        </div>

        {/* Reacciones */}
        <div className="relative">
          <ControlButton 
            onClick={onToggleEmojis} 
            isActive={showEmojis} 
            activeColor="bg-amber-500 text-white" 
            inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            icon={<IconReaction />}
            tooltip="Reacciones"
          />
        </div>

        <ControlButton 
          onClick={onToggleRaiseHand} 
          isActive={isHandRaised} 
          activeColor="bg-sky-500 text-white" 
          inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
          icon={<IconRaiseHand />}
          tooltip={isHandRaised ? 'Bajar la mano' : 'Levantar la mano'}
        />

        {/* Ir a mi escritorio */}
        {tieneMiEscritorio && onIrAMiEscritorio && (
          <ControlButton 
            onClick={onIrAMiEscritorio} 
            isActive={false} 
            activeColor="bg-indigo-500 text-white" 
            inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            icon={<IconDesk />}
            tooltip="Ir a mi escritorio"
          />
        )}

        {/* Menú de Construcción */}
        <div className="relative" ref={buildMenuRef}>
          <ControlButton 
            onClick={() => setShowBuildMenu(!showBuildMenu)} 
            isActive={isEditMode} 
            activeColor="bg-amber-500 text-white" 
            inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            icon={<IconEditMode on={isEditMode} />}
            tooltip="Modo construcción"
          />
          
          {showBuildMenu && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    setIsEditMode(true);
                    useStore.getState().setModoEdicionObjeto('mover');
                    setShowBuildMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isEditMode && useStore.getState().modoEdicionObjeto !== 'add'
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-lg">🏗️</span>
                  <div className="flex flex-col items-start">
                    <span>Editar objetos</span>
                    <span className="text-[9px] text-white/40">Mover, rotar o eliminar</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsEditMode(true);
                    useStore.getState().setModoEdicionObjeto('add');
                    setShowBuildMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isEditMode && useStore.getState().modoEdicionObjeto === 'add'
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-lg">📦</span>
                  <div className="flex flex-col items-start">
                    <span>Agregar objetos</span>
                    <span className="text-[9px] text-white/40">Catálogo de mobiliario</span>
                  </div>
                </button>

                {isEditMode && (
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      setShowBuildMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors mt-1 border-t border-white/5"
                  >
                    <span>✕</span> Salir del modo edición
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mini Juegos - Ocultar si ya estamos en un juego */}
        {onOpenGameHub && !isGameActive && (
          <ControlButton 
            onClick={onOpenGameHub} 
            isActive={false} 
            activeColor="bg-violet-500 text-white" 
            inactiveColor="bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            icon={<IconGamepad />}
            tooltip="Mini Juegos"
          />
        )}

        {showRecordingButton && !isGameActive && (
          <>
            <div className={`${isGameActive ? 'h-px w-6' : 'w-px h-6'} bg-white/10 mx-0.5`}></div>

            {isRecording ? (<div data-tour-step="recording-btn">
              <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-red-500/15 border border-red-500/30">
                {/* Punto rojo parpadeante */}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                {/* Timer */}
                <span className="text-xs font-mono text-red-400 tabular-nums min-w-[36px]">
                  {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(recordingDuration % 60).padStart(2, '0')}
                </span>
                {/* Botón Stop */}
                <button
                  onClick={onToggleRecording}
                  className="w-7 h-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                  title="Detener grabación"
                >
                  <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
                </button>
              </div>
            </div>) : (
              <button data-tour-step="recording-btn"
                onClick={onToggleRecording}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all duration-300"
              >
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs font-medium text-white/90">Grabar</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Emoji Picker Popup - Minimalista (NO cierra al hacer clic para spam rápido) */}
      {showEmojis && (
        <div className={`absolute animate-emoji-popup ${
          isGameActive 
            ? 'left-full top-1/2 -translate-y-1/2 ml-2' 
            : 'bottom-full left-1/2 -translate-x-1/2 mb-2'
        }`}>
          <div className={`px-2 py-1.5 bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 ${isGameActive ? 'flex flex-col gap-0.5' : 'flex gap-0.5'}`}>
            {emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onTriggerReaction(emoji)}
                className="w-7 h-7 flex items-center justify-center text-lg rounded-lg transition-all duration-150 hover:bg-white/20 hover:scale-110 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponente de botón genérico - Más compacto
const ControlButton = ({ onClick, isActive, activeColor, inactiveColor, icon, tooltip }: any) => (
  <div className="relative group/btn">
    <button
      onClick={onClick}
      className={`
        w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300
        ${isActive ? activeColor : inactiveColor}
      `}
    >
      {icon}
    </button>
    {/* Tooltip */}
    <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-50">
      <div className="bg-black/90 backdrop-blur-md text-white text-[10px] font-medium px-2 py-1 rounded-lg border border-white/10 whitespace-nowrap shadow-xl">
        {tooltip}
      </div>
    </div>
  </div>
);

const IconScreen = ({ on }: { on: boolean }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    {!on && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />}
  </svg>
);

const IconReaction = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconChat = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const IconDesk = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 6v4h16V6M6 10v8M18 10v8M4 14h16" />
  </svg>
);

const IconEditMode = ({ on }: { on: boolean }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {on ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M15 3l6 6M10 14L21 3" />
    )}
  </svg>
);

const IconGamepad = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);

const IconMiniMode = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 14H14V20M4 10H10V4M14 10L21 3M3 21L10 14" />
  </svg>
);

const IconRaiseHand = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
  </svg>
);

const IconLock = ({ on }: { on: boolean }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {on 
      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    }
  </svg>
);
