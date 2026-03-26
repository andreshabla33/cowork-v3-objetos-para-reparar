import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSlider } from '../components/SettingSlider';
import { SettingSection } from '../components/SettingSection';
import { t, Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface PerformanceSettings {
  graphicsQuality: string;
  showVideos: boolean;
  showAvatarAnimations: boolean;
  reducedMotion: boolean;
  hardwareAcceleration: boolean;
  maxVideoStreams: number;
  batterySaver: boolean;
}

interface SettingsPerformanceProps {
  settings: PerformanceSettings;
  onSettingsChange: (settings: PerformanceSettings) => void;
}

export const SettingsPerformance: React.FC<SettingsPerformanceProps> = ({
  settings,
  onSettingsChange
}) => {
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());

  // Escuchar cambios de idioma
  useEffect(() => {
    const unsubscribe = subscribeToLanguageChange(() => {
      setCurrentLang(getCurrentLanguage());
    });
    return unsubscribe;
  }, []);
  const getTitle = (key: string) => {
    const titles: Record<string, Record<Language, string>> = {
      quality: { es: 'Calidad Gráfica', en: 'Graphics Quality', pt: 'Qualidade Gráfica' },
      video: { es: 'Video', en: 'Video', pt: 'Vídeo' },
      system: { es: 'Sistema', en: 'System', pt: 'Sistema' }
    };
    return titles[key]?.[currentLang] || titles[key]?.['es'] || key;
  };

  const qualityOptions = [
    { value: 'low', label: 'Bajo - Máximo rendimiento' },
    { value: 'medium', label: 'Medio - Equilibrado' },
    { value: 'high', label: 'Alto - Mejor calidad' },
    { value: 'auto', label: 'Automático - Según conexión' }
  ];

  const videoStreamOptions = [
    { value: '4', label: '4 videos' },
    { value: '8', label: '8 videos' },
    { value: '12', label: '12 videos' },
    { value: '16', label: '16 videos (requiere buena conexión)' }
  ];

  const updateSetting = <K extends keyof PerformanceSettings>(key: K, value: PerformanceSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? 'Performance' : currentLang === 'pt' ? 'Desempenho' : 'Rendimiento'}
        </h2>
        <p className="text-sm text-zinc-400">
          {currentLang === 'en' ? 'Optimize performance based on your device and connection' : currentLang === 'pt' ? 'Otimize o desempenho com base no seu dispositivo e conexão' : 'Optimiza el rendimiento según tu dispositivo y conexión'}
        </p>
      </div>

      <SettingSection title={getTitle('quality')}>
        <SettingDropdown
          label={currentLang === 'en' ? 'Graphics quality' : currentLang === 'pt' ? 'Qualidade gráfica' : 'Calidad de gráficos'}
          description={currentLang === 'en' ? 'Adjust the visual quality of the 3D space' : currentLang === 'pt' ? 'Ajuste a qualidade visual do espaço 3D' : 'Ajusta la calidad visual del espacio 3D'}
          value={settings.graphicsQuality}
          options={qualityOptions}
          onChange={(v) => updateSetting('graphicsQuality', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Avatar animations' : currentLang === 'pt' ? 'Animações de avatar' : 'Animaciones de avatares'}
          description={currentLang === 'en' ? 'Show smooth animations on 3D avatars' : currentLang === 'pt' ? 'Mostrar animações suaves nos avatares 3D' : 'Mostrar animaciones fluidas en los avatares 3D'}
          checked={settings.showAvatarAnimations}
          onChange={(v) => updateSetting('showAvatarAnimations', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Reduced motion' : currentLang === 'pt' ? 'Movimento reduzido' : 'Movimiento reducido'}
          description={currentLang === 'en' ? 'Minimize animations and transitions' : currentLang === 'pt' ? 'Minimizar animações e transições' : 'Minimiza animaciones y transiciones'}
          checked={settings.reducedMotion}
          onChange={(v) => updateSetting('reducedMotion', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('video')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Show videos' : currentLang === 'pt' ? 'Mostrar vídeos' : 'Mostrar videos'}
          description={currentLang === 'en' ? 'View other users video feeds' : currentLang === 'pt' ? 'Ver os feeds de vídeo de outros usuários' : 'Ver los feeds de video de otros usuarios'}
          checked={settings.showVideos}
          onChange={(v) => updateSetting('showVideos', v)}
        />
        {settings.showVideos && (
          <SettingDropdown
            label={currentLang === 'en' ? 'Maximum simultaneous videos' : currentLang === 'pt' ? 'Máximo de vídeos simultâneos' : 'Máximo de videos simultáneos'}
            description={currentLang === 'en' ? 'Limit how many videos are shown at once for better performance' : currentLang === 'pt' ? 'Limite quantos vídeos são mostrados ao mesmo tempo para melhor desempenho' : 'Limita cuántos videos se muestran a la vez para mejor rendimiento'}
            value={settings.maxVideoStreams.toString()}
            options={videoStreamOptions}
            onChange={(v) => updateSetting('maxVideoStreams', parseInt(v))}
          />
        )}
      </SettingSection>

      <SettingSection title={getTitle('system')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Hardware acceleration' : currentLang === 'pt' ? 'Aceleração por hardware' : 'Aceleración por hardware'}
          description={currentLang === 'en' ? 'Use GPU for rendering (recommended)' : currentLang === 'pt' ? 'Usar GPU para renderização (recomendado)' : 'Usar GPU para renderizado (recomendado)'}
          checked={settings.hardwareAcceleration}
          onChange={(v) => updateSetting('hardwareAcceleration', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Battery saver mode' : currentLang === 'pt' ? 'Modo economia de bateria' : 'Modo ahorro de batería'}
          description={currentLang === 'en' ? 'Reduce resource consumption when using battery' : currentLang === 'pt' ? 'Reduzir consumo de recursos ao usar bateria' : 'Reduce el consumo de recursos cuando usas batería'}
          checked={settings.batterySaver}
          onChange={(v) => updateSetting('batterySaver', v)}
        />
      </SettingSection>

      <div className="mt-8 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-violet-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-violet-400">{currentLang === 'en' ? 'Performance tip' : currentLang === 'pt' ? 'Dica de desempenho' : 'Consejo de rendimiento'}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {currentLang === 'en' 
                ? 'If you experience lag or slowness, try reducing graphics quality or limiting the number of simultaneous videos.'
                : currentLang === 'pt'
                ? 'Se você experimentar lag ou lentidão, tente reduzir a qualidade gráfica ou limitar o número de vídeos simultâneos.'
                : 'Si experimentas lag o lentitud, prueba reducir la calidad gráfica o limitar el número de videos simultáneos.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPerformance;
