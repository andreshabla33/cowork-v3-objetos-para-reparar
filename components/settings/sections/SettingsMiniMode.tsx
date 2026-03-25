import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSection } from '../components/SettingSection';
import { Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface MiniModeSettings {
  enableMiniMode: boolean;
  miniModePosition: string;
  showVideoInMini: boolean;
  showChatInMini: boolean;
  autoMinimize: boolean;
  autoMinimizeDelay: number;
}

interface SettingsMiniModeProps {
  settings: MiniModeSettings;
  onSettingsChange: (settings: MiniModeSettings) => void;
}

export const SettingsMiniMode: React.FC<SettingsMiniModeProps> = ({
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

  const updateSetting = <K extends keyof MiniModeSettings>(key: K, value: MiniModeSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const positionOptions = [
    { value: 'bottom-right', label: currentLang === 'en' ? 'Bottom right corner' : currentLang === 'pt' ? 'Canto inferior direito' : 'Esquina inferior derecha' },
    { value: 'bottom-left', label: currentLang === 'en' ? 'Bottom left corner' : currentLang === 'pt' ? 'Canto inferior esquerdo' : 'Esquina inferior izquierda' },
    { value: 'top-right', label: currentLang === 'en' ? 'Top right corner' : currentLang === 'pt' ? 'Canto superior direito' : 'Esquina superior derecha' },
    { value: 'top-left', label: currentLang === 'en' ? 'Top left corner' : currentLang === 'pt' ? 'Canto superior esquerdo' : 'Esquina superior izquierda' }
  ];

  const delayOptions = [
    { value: '30', label: currentLang === 'en' ? '30 seconds' : currentLang === 'pt' ? '30 segundos' : '30 segundos' },
    { value: '60', label: currentLang === 'en' ? '1 minute' : currentLang === 'pt' ? '1 minuto' : '1 minuto' },
    { value: '120', label: currentLang === 'en' ? '2 minutes' : currentLang === 'pt' ? '2 minutos' : '2 minutos' },
    { value: '300', label: currentLang === 'en' ? '5 minutes' : currentLang === 'pt' ? '5 minutos' : '5 minutos' }
  ];

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? 'Mini Mode' : currentLang === 'pt' ? 'Modo Mini' : 'Mini Mode'}
        </h2>
        <p className="text-sm text-zinc-400">
          {currentLang === 'en' ? 'Configure compact mode for when working in other applications' : currentLang === 'pt' ? 'Configure o modo compacto para quando trabalhar em outras aplicações' : 'Configura el modo compacto para cuando trabajas en otras aplicaciones'}
        </p>
      </div>

      <SettingSection title={currentLang === 'en' ? 'Compact Mode' : currentLang === 'pt' ? 'Modo Compacto' : 'Modo Compacto'}>
        <SettingToggle
          label={currentLang === 'en' ? 'Enable Mini Mode' : currentLang === 'pt' ? 'Habilitar Modo Mini' : 'Habilitar Mini Mode'}
          description={currentLang === 'en' ? 'Show a small floating window when minimizing the space' : currentLang === 'pt' ? 'Mostrar uma pequena janela flutuante ao minimizar o espaço' : 'Muestra una ventana flotante pequeña cuando minimizas el espacio'}
          checked={settings.enableMiniMode}
          onChange={(v) => updateSetting('enableMiniMode', v)}
        />
        {settings.enableMiniMode && (
          <>
            <SettingDropdown
              label={currentLang === 'en' ? 'Window position' : currentLang === 'pt' ? 'Posição da janela' : 'Posición de la ventana'}
              description={currentLang === 'en' ? 'Where the floating window will appear on your screen' : currentLang === 'pt' ? 'Onde a janela flutuante aparecerá na sua tela' : 'Dónde aparecerá la ventana flotante en tu pantalla'}
              value={settings.miniModePosition}
              options={positionOptions}
              onChange={(v) => updateSetting('miniModePosition', v)}
            />
          </>
        )}
      </SettingSection>

      {settings.enableMiniMode && (
        <>
          <SettingSection title={currentLang === 'en' ? 'Mini Mode Content' : currentLang === 'pt' ? 'Conteúdo do Modo Mini' : 'Contenido del Mini Mode'}>
            <SettingToggle
              label={currentLang === 'en' ? 'Show video' : currentLang === 'pt' ? 'Mostrar vídeo' : 'Mostrar video'}
              description={currentLang === 'en' ? 'See your colleagues videos in mini mode' : currentLang === 'pt' ? 'Ver os vídeos dos seus colegas no modo mini' : 'Ver los videos de tus compañeros en modo mini'}
              checked={settings.showVideoInMini}
              onChange={(v) => updateSetting('showVideoInMini', v)}
            />
            <SettingToggle
              label={currentLang === 'en' ? 'Show chat' : currentLang === 'pt' ? 'Mostrar chat' : 'Mostrar chat'}
              description={currentLang === 'en' ? 'View chat messages in mini mode' : currentLang === 'pt' ? 'Ver mensagens de chat no modo mini' : 'Ver mensajes de chat en modo mini'}
              checked={settings.showChatInMini}
              onChange={(v) => updateSetting('showChatInMini', v)}
            />
          </SettingSection>

          <SettingSection title={currentLang === 'en' ? 'Automation' : currentLang === 'pt' ? 'Automação' : 'Automatización'}>
            <SettingToggle
              label={currentLang === 'en' ? 'Auto minimize' : currentLang === 'pt' ? 'Minimizar automaticamente' : 'Minimizar automáticamente'}
              description={currentLang === 'en' ? 'Switch to mini mode when tab is not active' : currentLang === 'pt' ? 'Mudar para modo mini quando a aba não estiver ativa' : 'Cambiar a mini mode cuando la pestaña no está activa'}
              checked={settings.autoMinimize}
              onChange={(v) => updateSetting('autoMinimize', v)}
            />
            {settings.autoMinimize && (
              <SettingDropdown
                label={currentLang === 'en' ? 'Wait time' : currentLang === 'pt' ? 'Tempo de espera' : 'Tiempo de espera'}
                description={currentLang === 'en' ? 'Time of inactivity before minimizing' : currentLang === 'pt' ? 'Tempo de inatividade antes de minimizar' : 'Tiempo de inactividad antes de minimizar'}
                value={settings.autoMinimizeDelay.toString()}
                options={delayOptions}
                onChange={(v) => updateSetting('autoMinimizeDelay', parseInt(v))}
              />
            )}
          </SettingSection>
        </>
      )}
    </div>
  );
};

export default SettingsMiniMode;
