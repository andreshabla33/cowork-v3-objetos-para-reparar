import React from 'react';
import type { AudioSettings, CameraSettings } from '@/modules/realtime-room';

interface AudioDeviceControlProps {
  isEnabled: boolean;
  settings: AudioSettings;
  currentStream?: MediaStream | null;
  onToggle: () => void | Promise<unknown>;
  onSettingsChange: (partial: Partial<AudioSettings>) => void;
  dataTourStep?: string;
  showMenuToggle?: boolean;
}

interface CameraDeviceControlProps {
  isEnabled: boolean;
  settings: CameraSettings;
  currentStream?: MediaStream | null;
  onToggle: () => void | Promise<unknown>;
  onSettingsChange: (partial: Partial<CameraSettings>) => void;
  dataTourStep?: string;
  showMenuToggle?: boolean;
}

const selectionIcon = (
  <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

interface SharedAudioSettingsPanelProps {
  settings: AudioSettings;
  currentStream?: MediaStream | null;
  onSettingsChange: (partial: Partial<AudioSettings>) => void;
}

interface SharedCameraSettingsPanelProps {
  settings: CameraSettings;
  currentStream?: MediaStream | null;
  onSettingsChange: (partial: Partial<CameraSettings>) => void;
}

export const SharedAudioSettingsPanel: React.FC<SharedAudioSettingsPanelProps> = ({
  settings,
  currentStream,
  onSettingsChange,
}) => {
  const [microphones, setMicrophones] = React.useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = React.useState<MediaDeviceInfo[]>([]);
  const activeMicrophoneId = currentStream?.getAudioTracks()[0]?.getSettings().deviceId;
  const effectiveSelectedMicrophoneId = settings.selectedMicrophoneId || activeMicrophoneId || '';

  React.useEffect(() => {
    const loadAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');
        const audioOutputs = devices.filter((device) => device.kind === 'audiooutput');
        setMicrophones(audioInputs);
        setSpeakers(audioOutputs);
      } catch (error) {
        console.error('Error loading audio devices:', error);
      }
    };

    void loadAudioDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadAudioDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadAudioDevices);
    };
  }, [currentStream]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs lg:text-[11px] font-medium text-white/50 px-1 mb-2">Seleccionar micrófono</div>
        {microphones.length > 0 ? microphones.map((mic) => (
          <button
            key={mic.deviceId}
            onClick={() => onSettingsChange({ selectedMicrophoneId: mic.deviceId })}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
              effectiveSelectedMicrophoneId === mic.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {effectiveSelectedMicrophoneId === mic.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={`truncate ${effectiveSelectedMicrophoneId !== mic.deviceId ? 'ml-3' : ''}`}>
              {mic.label || `Micrófono ${mic.deviceId.slice(0, 8)}`}
            </span>
          </button>
        )) : (
          <div className="text-xs text-white/40 px-3 py-2">No detectamos micrófonos disponibles todavía.</div>
        )}
      </div>

      <div className="border-t border-white/10" />

      <div>
        <div className="text-xs lg:text-[11px] font-medium text-white/50 px-1 mb-2">Seleccionar altavoz</div>
        {speakers.length > 0 ? speakers.map((speaker) => (
          <button
            key={speaker.deviceId}
            onClick={() => onSettingsChange({ selectedSpeakerId: speaker.deviceId })}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
              settings.selectedSpeakerId === speaker.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {settings.selectedSpeakerId === speaker.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={`truncate ${settings.selectedSpeakerId !== speaker.deviceId ? 'ml-3' : ''}`}>
              {speaker.label || `Altavoz ${speaker.deviceId.slice(0, 8)}`}
            </span>
          </button>
        )) : (
          <div className="text-xs text-white/40 px-3 py-2">Tu navegador no soporta selección de altavoces</div>
        )}
      </div>

      <div className="border-t border-white/10" />

      <button
        onClick={() => onSettingsChange({ noiseReduction: !settings.noiseReduction })}
        className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span>Reducción de ruido</span>
        </div>
        <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.noiseReduction ? 'bg-violet-500' : 'bg-zinc-600'}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseReduction ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>

      <button
        onClick={() => onSettingsChange({ echoCancellation: !settings.echoCancellation })}
        className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span>Cancelación de eco</span>
        </div>
        <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.echoCancellation ? 'bg-violet-500' : 'bg-zinc-600'}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.echoCancellation ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>

      <button
        onClick={() => onSettingsChange({ autoGainControl: !settings.autoGainControl })}
        className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>Control automático de ganancia</span>
        </div>
        <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.autoGainControl ? 'bg-violet-500' : 'bg-zinc-600'}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoGainControl ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>
    </div>
  );
};

export const SharedCameraSettingsPanel: React.FC<SharedCameraSettingsPanelProps> = ({
  settings,
  currentStream,
  onSettingsChange,
}) => {
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeCameraId = currentStream?.getVideoTracks()[0]?.getSettings().deviceId;
  const effectiveSelectedCameraId = settings.selectedCameraId || activeCameraId || '';

  React.useEffect(() => {
    const loadCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        setCameras(videoDevices);
      } catch (error) {
        console.error('Error loading cameras:', error);
      }
    };

    void loadCameras();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadCameras);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadCameras);
    };
  }, [currentStream]);

  const handleImageUpload = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onSettingsChange({
        backgroundEffect: 'image',
        backgroundImage: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  }, [onSettingsChange]);

  return (
    <>
      <div className="p-3 border-b border-white/5">
        <div className="text-xs lg:text-[11px] font-medium text-white/50 mb-2">Seleccionar cámara</div>
        {cameras.length > 0 ? cameras.map((camera) => (
          <button
            key={camera.deviceId}
            onClick={() => onSettingsChange({ selectedCameraId: camera.deviceId })}
            className={`w-full text-left px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors flex items-center gap-2 ${
              effectiveSelectedCameraId === camera.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            {effectiveSelectedCameraId === camera.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={effectiveSelectedCameraId !== camera.deviceId ? 'ml-2' : ''}>
              {camera.label || `Cámara ${cameras.indexOf(camera) + 1}`}
            </span>
          </button>
        )) : (
          <div className="text-xs text-white/40 px-3 py-2">No detectamos cámaras disponibles todavía.</div>
        )}
      </div>

      <div className="p-2">
        <button
          onClick={() => onSettingsChange({ hideSelfView: !settings.hideSelfView })}
          className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            <span>Ocultar mi vista</span>
          </div>
          <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.hideSelfView ? 'bg-violet-500' : 'bg-zinc-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.hideSelfView ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>

        <div className="space-y-1">
          <div className="text-xs lg:text-[11px] font-medium text-white/50 px-3 pt-2">Efectos de fondo</div>
          <button
            onClick={() => onSettingsChange({ backgroundEffect: 'none', backgroundImage: null })}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
              settings.backgroundEffect === 'none' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {settings.backgroundEffect === 'none' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={settings.backgroundEffect !== 'none' ? 'ml-3' : ''}>Ninguno</span>
          </button>
          <button
            onClick={() => onSettingsChange({ backgroundEffect: 'blur' })}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
              settings.backgroundEffect === 'blur' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {settings.backgroundEffect === 'blur' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={settings.backgroundEffect !== 'blur' ? 'ml-3' : ''}>Desenfoque</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
              settings.backgroundEffect === 'image' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {settings.backgroundEffect === 'image' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
            <span className={settings.backgroundEffect !== 'image' ? 'ml-3' : ''}>
              {settings.backgroundImage ? 'Cambiar imagen...' : 'Subir imagen...'}
            </span>
          </button>
        </div>

        <button
          onClick={() => onSettingsChange({ mirrorVideo: !settings.mirrorVideo })}
          className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>Espejo de video</span>
          </div>
          <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.mirrorVideo ? 'bg-violet-500' : 'bg-zinc-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.mirrorVideo ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
    </>
  );
};

export const SharedAudioDeviceControl: React.FC<AudioDeviceControlProps> = ({
  isEnabled,
  settings,
  currentStream,
  onToggle,
  onSettingsChange,
  dataTourStep,
  showMenuToggle = true,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [microphones, setMicrophones] = React.useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = React.useState<MediaDeviceInfo[]>([]);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const activeMicrophoneId = currentStream?.getAudioTracks()[0]?.getSettings().deviceId;
  const effectiveSelectedMicrophoneId = settings.selectedMicrophoneId || activeMicrophoneId || '';

  // Optimistic UI internal state para evitar percepción de lag al hacer clic
  const [optimisticEnabled, setOptimisticEnabled] = React.useState(isEnabled);
  React.useEffect(() => { setOptimisticEnabled(isEnabled); }, [isEnabled]);
  
  const handleToggle = () => {
    setOptimisticEnabled(!optimisticEnabled);
    void onToggle();
  };

  React.useEffect(() => {
    const loadAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');
        const audioOutputs = devices.filter((device) => device.kind === 'audiooutput');
        setMicrophones(audioInputs);
        setSpeakers(audioOutputs);
      } catch (error) {
        console.error('Error loading audio devices:', error);
      }
    };

    if (isOpen) {
      void loadAudioDevices();
    }
  }, [currentStream, isOpen]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef} data-tour-step={dataTourStep}>
      {showMenuToggle ? (
        <div className="flex items-center">
          <button
            onClick={handleToggle}
            className={`w-9 h-9 rounded-l-xl flex items-center justify-center transition-all duration-300 ${
              optimisticEnabled ? 'bg-zinc-700 text-white' : 'bg-red-500/90 text-white animate-pulse-slow'
            }`}
            title={optimisticEnabled ? 'Silenciar' : 'Activar micrófono'}
          >
            <IconMic on={optimisticEnabled} />
          </button>
          <button
            onClick={() => setIsOpen((current) => !current)}
            className={`w-5 h-9 rounded-r-xl flex items-center justify-center transition-all duration-300 border-l border-white/10 ${
              optimisticEnabled ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-red-500/90 text-white hover:bg-red-600'
            }`}
            title="Configuración de audio"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={handleToggle}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
            optimisticEnabled ? 'bg-zinc-700 text-white' : 'bg-red-500/90 text-white animate-pulse-slow'
          }`}
          title={optimisticEnabled ? 'Silenciar' : 'Activar micrófono'}
        >
          <IconMic on={optimisticEnabled} />
        </button>
      )}

      {showMenuToggle && isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 lg:w-64 bg-zinc-900/95 backdrop-blur-xl rounded-xl lg:rounded-lg border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="p-3 space-y-3">
            <div>
              <div className="text-xs lg:text-[11px] font-medium text-white/50 px-1 mb-2">Seleccionar micrófono</div>
              {microphones.length > 0 ? microphones.map((mic) => (
                <button
                  key={mic.deviceId}
                  onClick={() => onSettingsChange({ selectedMicrophoneId: mic.deviceId })}
                  className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
                    effectiveSelectedMicrophoneId === mic.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  {effectiveSelectedMicrophoneId === mic.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                  <span className={`truncate ${effectiveSelectedMicrophoneId !== mic.deviceId ? 'ml-3' : ''}`}>
                    {mic.label || `Micrófono ${mic.deviceId.slice(0, 8)}`}
                  </span>
                </button>
              )) : (
                <div className="text-xs text-white/40 px-3 py-2">No detectamos micrófonos disponibles todavía.</div>
              )}
            </div>

            <div className="border-t border-white/10" />

            <div>
              <div className="text-xs lg:text-[11px] font-medium text-white/50 px-1 mb-2">Seleccionar altavoz</div>
              {speakers.length > 0 ? speakers.map((speaker) => (
                <button
                  key={speaker.deviceId}
                  onClick={() => onSettingsChange({ selectedSpeakerId: speaker.deviceId })}
                  className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
                    settings.selectedSpeakerId === speaker.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  {settings.selectedSpeakerId === speaker.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                  <span className={`truncate ${settings.selectedSpeakerId !== speaker.deviceId ? 'ml-3' : ''}`}>
                    {speaker.label || `Altavoz ${speaker.deviceId.slice(0, 8)}`}
                  </span>
                </button>
              )) : (
                <div className="text-xs text-white/40 px-3 py-2">Tu navegador no soporta selección de altavoces</div>
              )}
            </div>

            <div className="border-t border-white/10" />

            <button
              onClick={() => onSettingsChange({ noiseReduction: !settings.noiseReduction })}
              className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span>Reducción de ruido</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.noiseReduction ? 'bg-violet-500' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.noiseReduction ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <button
              onClick={() => onSettingsChange({ echoCancellation: !settings.echoCancellation })}
              className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span>Cancelación de eco</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.echoCancellation ? 'bg-violet-500' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.echoCancellation ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <button
              onClick={() => onSettingsChange({ autoGainControl: !settings.autoGainControl })}
              className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Control automático de ganancia</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.autoGainControl ? 'bg-violet-500' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoGainControl ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SharedCameraDeviceControl: React.FC<CameraDeviceControlProps> = ({
  isEnabled,
  settings,
  currentStream,
  onToggle,
  onSettingsChange,
  dataTourStep,
  showMenuToggle = true,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Optimistic UI internal state para evitar percepción de lag
  const [optimisticEnabled, setOptimisticEnabled] = React.useState(isEnabled);
  React.useEffect(() => { setOptimisticEnabled(isEnabled); }, [isEnabled]);
  
  const handleToggle = () => {
    setOptimisticEnabled(!optimisticEnabled);
    void onToggle();
  };

  // Derive active camera device ID from the live stream for UI display.
  // This avoids calling onSettingsChange during camera initialization which
  // triggers notifyStateChange() and disrupts the LiveKit track publish.
  const activeDeviceId = currentStream?.getVideoTracks()[0]?.getSettings().deviceId;
  const effectiveSelectedCameraId = settings.selectedCameraId || activeDeviceId || '';

  React.useEffect(() => {
    const loadCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        setCameras(videoDevices);
        // NO auto-selection here. The effectiveSelectedCameraId derived from
        // the active stream handles display. onSettingsChange is only called
        // when the user explicitly picks a camera from the list.
      } catch (error) {
        console.error('Error loading cameras:', error);
      }
    };

    if (isOpen) {
      void loadCameras();
    }
  }, [currentStream, isOpen]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleImageUpload = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onSettingsChange({
        backgroundEffect: 'image',
        backgroundImage: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  }, [onSettingsChange]);

  return (
    <div className="relative" ref={menuRef} data-tour-step={dataTourStep}>
      {showMenuToggle ? (
        <div className="flex items-center">
          <button
            onClick={handleToggle}
            className={`w-9 h-9 rounded-l-xl flex items-center justify-center transition-all duration-300 ${
              optimisticEnabled ? 'bg-zinc-700 text-white' : 'bg-red-500/90 text-white animate-pulse-slow'
            }`}
            title={optimisticEnabled ? 'Apagar cámara' : 'Activar cámara'}
          >
            <IconCam on={optimisticEnabled} />
          </button>
          <button
            onClick={() => setIsOpen((current) => !current)}
            className={`w-5 h-9 rounded-r-xl flex items-center justify-center transition-all duration-300 border-l border-white/10 ${
              optimisticEnabled ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-red-500/90 text-white hover:bg-red-600'
            }`}
            title="Configuración de cámara"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={handleToggle}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
            optimisticEnabled ? 'bg-zinc-700 text-white' : 'bg-red-500/90 text-white animate-pulse-slow'
          }`}
          title={optimisticEnabled ? 'Apagar cámara' : 'Activar cámara'}
        >
          <IconCam on={optimisticEnabled} />
        </button>
      )}

      {showMenuToggle && isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 lg:w-56 bg-zinc-900/95 backdrop-blur-xl rounded-xl lg:rounded-lg border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="p-3 border-b border-white/5">
            <div className="text-xs lg:text-[11px] font-medium text-white/50 mb-2">Seleccionar cámara</div>
            {cameras.length > 0 ? cameras.map((camera) => (
              <button
                key={camera.deviceId}
                onClick={() => onSettingsChange({ selectedCameraId: camera.deviceId })}
                className={`w-full text-left px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors flex items-center gap-2 ${
                  effectiveSelectedCameraId === camera.deviceId ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {effectiveSelectedCameraId === camera.deviceId ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                <span className={effectiveSelectedCameraId !== camera.deviceId ? 'ml-2' : ''}>
                  {camera.label || `Cámara ${cameras.indexOf(camera) + 1}`}
                </span>
              </button>
            )) : (
              <div className="text-xs text-white/40 px-3 py-2">No detectamos cámaras disponibles todavía.</div>
            )}
          </div>

          <div className="p-2">
            <button
              onClick={() => onSettingsChange({ hideSelfView: !settings.hideSelfView })}
              className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <span>Ocultar mi vista</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.hideSelfView ? 'bg-violet-500' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.hideSelfView ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <div className="space-y-1">
              <div className="text-xs lg:text-[11px] font-medium text-white/50 px-3 pt-2">Efectos de fondo</div>
              <button
                onClick={() => onSettingsChange({ backgroundEffect: 'none', backgroundImage: null })}
                className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
                  settings.backgroundEffect === 'none' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
                }`}
              >
                {settings.backgroundEffect === 'none' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                <span className={settings.backgroundEffect !== 'none' ? 'ml-3' : ''}>Ninguno</span>
              </button>
              <button
                onClick={() => onSettingsChange({ backgroundEffect: 'blur' })}
                className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
                  settings.backgroundEffect === 'blur' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
                }`}
              >
                {settings.backgroundEffect === 'blur' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                <span className={settings.backgroundEffect !== 'blur' ? 'ml-3' : ''}>Desenfoque</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex items-center gap-3 px-3 py-2 lg:py-1.5 rounded-lg text-sm lg:text-xs transition-colors ${
                  settings.backgroundEffect === 'image' ? 'bg-violet-500/20 text-white' : 'text-white/70 hover:bg-white/5'
                }`}
              >
                {settings.backgroundEffect === 'image' ? selectionIcon : <span className="w-4 h-4 flex-shrink-0" />}
                <span className={settings.backgroundEffect !== 'image' ? 'ml-3' : ''}>
                  {settings.backgroundImage ? 'Cambiar imagen...' : 'Subir imagen...'}
                </span>
              </button>
            </div>

            <button
              onClick={() => onSettingsChange({ mirrorVideo: !settings.mirrorVideo })}
              className="w-full flex items-center justify-between px-3 py-2.5 lg:py-2 rounded-lg text-sm lg:text-xs text-white/80 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Espejo de video</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings.mirrorVideo ? 'bg-violet-500' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.mirrorVideo ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>

        </div>
      )}

      {/* File input OUTSIDE the isOpen conditional so it persists when
          the click-outside handler closes the menu while the native OS
          file dialog is open. Without this, the input is destroyed and
          the onChange never fires. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
};

const IconMic = ({ on }: { on: boolean }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {on ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />}
  </svg>
);

const IconCam = ({ on }: { on: boolean }) => (
  <svg className="w-5 h-5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    {on ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="0" d="M15.75 8.25a.75.75 0 01.75.75c0 1.12-.492 2.126-1.27 2.812a.75.75 0 11-1.004-1.124A2.25 2.25 0 0015 9a.75.75 0 01.75-.75zM4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z M19.5 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875v-6.75z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2zM3 3l18 18" />
    )}
  </svg>
);
