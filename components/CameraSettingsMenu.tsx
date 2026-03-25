import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceManager } from '@/modules/realtime-room';
import type { DeviceInfo } from '@/modules/realtime-room';
import { loadCameraSettings, saveCameraSettings, type CameraSettings } from '@/modules/realtime-room';

interface CameraSettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: CameraSettings) => void;
  currentStream: MediaStream | null;
  anchorPosition?: { top: number; left: number };
}

export const CameraSettingsMenu: React.FC<CameraSettingsMenuProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
  currentStream,
  anchorPosition,
}) => {
  const [settings, setSettings] = useState<CameraSettings>(loadCameraSettings);
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deviceManagerRef = useRef<DeviceManager | null>(null);

  if (!deviceManagerRef.current) {
    deviceManagerRef.current = new DeviceManager({
      onDevicesChanged: (devices) => {
        setCameras(devices.filter((device) => device.kind === 'videoinput'));
      },
    });
  }

  // Cargar lista de cámaras
  const loadCameras = useCallback(async () => {
    setIsLoadingCameras(true);
    try {
      await deviceManagerRef.current?.requestInitialPermissions({ audio: false, video: true });
      const devices = await deviceManagerRef.current?.enumerateDevices();
      const videoDevices = (devices ?? []).filter((device) => device.kind === 'videoinput');
      setCameras(videoDevices);
      
      // Si no hay cámara seleccionada, usar la actual o la primera
      if (!settings.selectedCameraId && videoDevices.length > 0) {
        const currentTrack = currentStream?.getVideoTracks()[0];
        const currentDeviceId = currentTrack?.getSettings().deviceId;
        
        setSettings(prev => ({
          ...prev,
          selectedCameraId: currentDeviceId || videoDevices[0].id
        }));
      }
    } catch (err) {
      console.error('Error loading cameras:', err);
    } finally {
      setIsLoadingCameras(false);
    }
  }, [currentStream, settings.selectedCameraId]);

  useEffect(() => {
    if (isOpen) {
      loadCameras();
    }
  }, [isOpen, loadCameras]);

  useEffect(() => {
    return () => {
      deviceManagerRef.current?.destroy();
      deviceManagerRef.current = null;
    };
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const updateSettings = (partial: Partial<CameraSettings>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    saveCameraSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleCameraChange = (deviceId: string) => {
    updateSettings({ selectedCameraId: deviceId });
  };

  const handleBackgroundEffectChange = (effect: CameraSettings['backgroundEffect']) => {
    updateSettings({ backgroundEffect: effect });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        updateSettings({ 
          backgroundEffect: 'image',
          backgroundImage: imageData 
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    updateSettings({ 
      backgroundEffect: 'none',
      backgroundImage: null 
    });
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-[100] w-72 bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        top: anchorPosition?.top ?? 'auto',
        left: anchorPosition?.left ?? 'auto',
        bottom: anchorPosition ? 'auto' : '100%',
        marginBottom: anchorPosition ? 0 : '8px',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Configuración de cámara</span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-4 max-h-[400px] overflow-y-auto">
        {/* Selector de cámara */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
            Seleccionar cámara
          </label>
          <div className="relative">
            <select
              value={settings.selectedCameraId}
              onChange={(e) => handleCameraChange(e.target.value)}
              disabled={isLoadingCameras}
              className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {cameras.length === 0 ? (
                <option value="">Cargando cámaras...</option>
              ) : (
                cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `Cámara ${cameras.indexOf(camera) + 1}`}
                  </option>
                ))
              )}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {settings.selectedCameraId && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>Cámara activa</span>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="border-t border-white/5" />

        {/* Hide self view */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </div>
            <span className="text-sm text-white">Ocultar mi vista</span>
          </div>
          <button
            onClick={() => updateSettings({ hideSelfView: !settings.hideSelfView })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.hideSelfView ? 'bg-indigo-600' : 'bg-zinc-700'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.hideSelfView ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Separador */}
        <div className="border-t border-white/5" />

        {/* Background effects */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm text-white">Efectos de fondo</span>
          </div>

          {/* Opciones de fondo */}
          <div className="grid grid-cols-3 gap-2">
            {/* Sin efecto */}
            <button
              onClick={() => handleBackgroundEffectChange('none')}
              className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center ${
                settings.backgroundEffect === 'none'
                  ? 'border-indigo-500 bg-indigo-500/20'
                  : 'border-white/10 bg-zinc-800 hover:border-white/20'
              }`}
            >
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>

            {/* Blur */}
            <button
              onClick={() => handleBackgroundEffectChange('blur')}
              className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center ${
                settings.backgroundEffect === 'blur'
                  ? 'border-indigo-500 bg-indigo-500/20'
                  : 'border-white/10 bg-zinc-800 hover:border-white/20'
              }`}
            >
              <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-400/50 to-purple-400/50 blur-sm" />
            </button>

            {/* Imagen personalizada */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center ${
                settings.backgroundEffect === 'image'
                  ? 'border-indigo-500 bg-indigo-500/20'
                  : 'border-white/10 bg-zinc-800 hover:border-white/20'
              }`}
            >
              {settings.backgroundImage ? (
                <img 
                  src={settings.backgroundImage} 
                  alt="Background" 
                  className="w-full h-full object-cover rounded-md"
                />
              ) : (
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          </div>

          {/* Labels */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <span className="text-[10px] text-white/50">Ninguno</span>
            <span className="text-[10px] text-white/50">Desenfoque</span>
            <span className="text-[10px] text-white/50">Imagen</span>
          </div>

          {/* Botón para eliminar imagen */}
          {settings.backgroundImage && (
            <button
              onClick={handleRemoveImage}
              className="w-full text-xs text-red-400 hover:text-red-300 transition-colors py-1"
            >
              Eliminar imagen de fondo
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>

        {/* Separador */}
        <div className="border-t border-white/5" />

        {/* Mirror video */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <span className="text-sm text-white">Espejo de video</span>
          </div>
          <button
            onClick={() => updateSettings({ mirrorVideo: !settings.mirrorVideo })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.mirrorVideo ? 'bg-indigo-600' : 'bg-zinc-700'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.mirrorVideo ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Info */}
        <div className="text-[10px] text-white/40 text-center pt-2">
          La configuración se guarda automáticamente
        </div>
      </div>
    </div>
  );
};

export type { CameraSettings };
export default CameraSettingsMenu;
