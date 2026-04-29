import React, { useState, useEffect, useRef } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSlider } from '../components/SettingSlider';
import { SettingSection } from '../components/SettingSection';
import { t, Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';
import { DeviceManager } from '@/modules/realtime-room';
import type { DeviceInfo } from '@/modules/realtime-room';

interface AudioSettings {
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  noiseReduction: boolean;
  noiseReductionLevel: string;
  echoCancellation: boolean;
  autoGainControl: boolean;
  chatSounds: boolean;
  sfxVolume: number;
}

interface SettingsAudioProps {
  settings: AudioSettings;
  onSettingsChange: (settings: AudioSettings) => void;
}

export const SettingsAudio: React.FC<SettingsAudioProps> = ({
  settings,
  onSettingsChange
}) => {
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());
  const deviceManagerRef = useRef<DeviceManager | null>(null);

  if (!deviceManagerRef.current) {
    deviceManagerRef.current = new DeviceManager({
      onDevicesChanged: (devices) => {
        setMicrophones(devices.filter((device) => device.kind === 'audioinput'));
        setSpeakers(devices.filter((device) => device.kind === 'audiooutput'));
      },
    });
  }

  // Escuchar cambios de idioma
  useEffect(() => {
    const unsubscribe = subscribeToLanguageChange(() => {
      setCurrentLang(getCurrentLanguage());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        await deviceManagerRef.current?.requestInitialPermissions({ audio: true, video: false });
        const devices = await deviceManagerRef.current?.enumerateDevices();
        setMicrophones((devices ?? []).filter((device) => device.kind === 'audioinput'));
        setSpeakers((devices ?? []).filter((device) => device.kind === 'audiooutput'));
      } catch (err) {
        console.error('Error loading audio devices:', err);
      }
    };
    loadDevices();

    return () => {
      deviceManagerRef.current?.destroy();
      deviceManagerRef.current = null;
    };
  }, []);

  const updateSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const microphoneOptions = microphones.map(m => ({
    value: m.id,
    label: m.label || `Micrófono ${microphones.indexOf(m) + 1}`
  }));

  const speakerOptions = speakers.map(s => ({
    value: s.id,
    label: s.label || `Altavoz ${speakers.indexOf(s) + 1}`
  }));

  const noiseReductionOptions = [
    { value: 'off', label: 'Desactivado' },
    { value: 'standard', label: 'Estándar' },
    { value: 'enhanced', label: 'Mejorado' }
  ];

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-200 to-white mb-2 lg:mb-1">
          {t('settings.audio.title', currentLang)}
        </h2>
        <p className="text-sm lg:text-xs text-zinc-400">
          {t('settings.audio.description', currentLang)}
        </p>
      </div>

      <SettingSection title={currentLang === 'en' ? 'Devices' : currentLang === 'pt' ? 'Dispositivos' : 'Dispositivos'}>
        <SettingDropdown
          label={t('settings.audio.microphone', currentLang)}
          description={t('settings.audio.microphoneDesc', currentLang)}
          value={settings.selectedMicrophoneId}
          options={microphoneOptions.length > 0 ? microphoneOptions : [{ value: '', label: 'No hay dispositivos' }]}
          onChange={(v) => updateSetting('selectedMicrophoneId', v)}
        />
        <SettingDropdown
          label={t('settings.audio.speaker', currentLang)}
          description={t('settings.audio.speakerDesc', currentLang)}
          value={settings.selectedSpeakerId}
          options={speakerOptions.length > 0 ? speakerOptions : [{ value: '', label: 'No hay dispositivos' }]}
          onChange={(v) => updateSetting('selectedSpeakerId', v)}
        />
      </SettingSection>

      <SettingSection title={currentLang === 'en' ? 'Audio Processing' : currentLang === 'pt' ? 'Processamento de Áudio' : 'Procesamiento de Audio'}>
        <SettingDropdown
          label={t('settings.audio.noiseReduction', currentLang)}
          description="Suprime automáticamente el ruido de fondo"
          value={settings.noiseReduction ? settings.noiseReductionLevel : 'off'}
          options={noiseReductionOptions}
          onChange={(v) => onSettingsChange({
            ...settings,
            noiseReduction: v !== 'off',
            noiseReductionLevel: v,
          })}
        />
        <SettingToggle
          label={t('settings.audio.echoCancellation', currentLang)}
          description={t('settings.audio.echoCancellationDesc', currentLang)}
          checked={settings.echoCancellation}
          onChange={(v) => updateSetting('echoCancellation', v)}
        />
        <SettingToggle
          label={t('settings.audio.autoGain', currentLang)}
          description={t('settings.audio.autoGainDesc', currentLang)}
          checked={settings.autoGainControl}
          onChange={(v) => updateSetting('autoGainControl', v)}
        />
      </SettingSection>

      <SettingSection title={currentLang === 'en' ? 'Sounds' : currentLang === 'pt' ? 'Sons' : 'Sonidos'}>
        <SettingToggle
          label={t('settings.audio.chatSounds', currentLang)}
          description={t('settings.audio.chatSoundsDesc', currentLang)}
          checked={settings.chatSounds}
          onChange={(v) => updateSetting('chatSounds', v)}
        />
        <SettingSlider
          label={t('settings.audio.sfxVolume', currentLang)}
          description={t('settings.audio.sfxVolumeDesc', currentLang)}
          value={settings.sfxVolume}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => updateSetting('sfxVolume', v)}
        />
      </SettingSection>
    </div>
  );
};

export default SettingsAudio;
