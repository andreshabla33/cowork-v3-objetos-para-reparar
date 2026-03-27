import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSlider } from '../components/SettingSlider';
import { SettingSection } from '../components/SettingSection';
import { Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface Space3DSettings {
  cameraMode: string;
  movementSpeed: number;
  cameraSensitivity: number;
  invertYAxis: boolean;
  showFloorGrid: boolean;
  showNamesAboveAvatars: boolean;
  spatialAudio: boolean;
  proximityRadius: number;
  radioInteresChunks: number;
}

interface SettingsSpace3DProps {
  settings: Space3DSettings;
  onSettingsChange: (settings: Space3DSettings) => void;
}

export const SettingsSpace3D: React.FC<SettingsSpace3DProps> = ({
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
      camera: { es: 'Cámara', en: 'Camera', pt: 'Câmera' },
      movement: { es: 'Movimiento', en: 'Movement', pt: 'Movimento' },
      visualization: { es: 'Visualización', en: 'Visualization', pt: 'Visualização' },
      spatialAudio: { es: 'Audio Espacial', en: 'Spatial Audio', pt: 'Áudio Espacial' }
    };
    return titles[key]?.[currentLang] || titles[key]?.['es'] || key;
  };

  const cameraModeOptions = [
    { value: 'free', label: currentLang === 'en' ? 'Free' : currentLang === 'pt' ? 'Livre' : 'Libre' },
    { value: 'fixed', label: currentLang === 'en' ? 'Fixed' : currentLang === 'pt' ? 'Fixa' : 'Fija' },
    { value: 'follow', label: currentLang === 'en' ? 'Follow avatar' : currentLang === 'pt' ? 'Seguir avatar' : 'Seguir avatar' }
  ];

  const updateSetting = <K extends keyof Space3DSettings>(key: K, value: Space3DSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? '3D Space' : currentLang === 'pt' ? 'Espaço 3D' : 'Espacio 3D'}
        </h2>
        <p className="text-sm text-zinc-400">
          {currentLang === 'en' ? 'Configure the 3D virtual space experience' : currentLang === 'pt' ? 'Configure a experiência do espaço virtual 3D' : 'Configura la experiencia del espacio virtual 3D'}
        </p>
      </div>

      <SettingSection title={getTitle('camera')}>
        <SettingDropdown
          label={currentLang === 'en' ? 'Camera mode' : currentLang === 'pt' ? 'Modo de câmera' : 'Modo de cámara'}
          description={currentLang === 'en' ? 'How the camera behaves in the space' : currentLang === 'pt' ? 'Como a câmera se comporta no espaço' : 'Cómo se comporta la cámara en el espacio'}
          value={settings.cameraMode}
          options={cameraModeOptions}
          onChange={(v) => updateSetting('cameraMode', v)}
        />
        <SettingSlider
          label={currentLang === 'en' ? 'Camera sensitivity' : currentLang === 'pt' ? 'Sensibilidade da câmera' : 'Sensibilidad de cámara'}
          description={currentLang === 'en' ? 'Camera rotation speed' : currentLang === 'pt' ? 'Velocidade de rotação da câmera' : 'Velocidad de rotación de la cámara'}
          value={settings.cameraSensitivity}
          min={1}
          max={10}
          onChange={(v) => updateSetting('cameraSensitivity', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Invert Y axis' : currentLang === 'pt' ? 'Inverter eixo Y' : 'Invertir eje Y'}
          description={currentLang === 'en' ? 'Invert vertical camera movement' : currentLang === 'pt' ? 'Inverter o movimento vertical da câmera' : 'Invierte el movimiento vertical de la cámara'}
          checked={settings.invertYAxis}
          onChange={(v) => updateSetting('invertYAxis', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('movement')}>
        <SettingSlider
          label={currentLang === 'en' ? 'Movement speed' : currentLang === 'pt' ? 'Velocidade de movimento' : 'Velocidad de movimiento'}
          description={currentLang === 'en' ? 'How fast your avatar moves' : currentLang === 'pt' ? 'Quão rápido seu avatar se move' : 'Qué tan rápido se mueve tu avatar'}
          value={settings.movementSpeed}
          min={1}
          max={10}
          onChange={(v) => updateSetting('movementSpeed', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('visualization')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Show floor grid' : currentLang === 'pt' ? 'Mostrar grade do chão' : 'Mostrar grid del suelo'}
          description={currentLang === 'en' ? 'Show the grid on the floor of the space' : currentLang === 'pt' ? 'Mostrar a grade no chão do espaço' : 'Muestra la cuadrícula en el piso del espacio'}
          checked={settings.showFloorGrid}
          onChange={(v) => updateSetting('showFloorGrid', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Show names above avatars' : currentLang === 'pt' ? 'Mostrar nomes sobre avatares' : 'Mostrar nombres sobre avatares'}
          description={currentLang === 'en' ? 'Show user names above their avatars' : currentLang === 'pt' ? 'Mostrar os nomes dos usuários sobre seus avatares' : 'Muestra el nombre de los usuarios sobre sus avatares'}
          checked={settings.showNamesAboveAvatars}
          onChange={(v) => updateSetting('showNamesAboveAvatars', v)}
        />
        <SettingSlider
          label={currentLang === 'en' ? 'Chunk interest radius' : currentLang === 'pt' ? 'Raio de interesse por chunk' : 'Radio de interés por chunk'}
          description={currentLang === 'en' ? 'How many chunks around you are actively rendered/connected' : currentLang === 'pt' ? 'Quantos chunks ao redor são renderizados/conectados' : 'Cuántos chunks alrededor se renderizan/conectan'}
          value={settings.radioInteresChunks}
          min={1}
          max={3}
          step={1}
          unit="chunks"
          onChange={(v) => updateSetting('radioInteresChunks', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('spatialAudio')}>
        <SettingToggle
          label={currentLang === 'en' ? '3D Spatial audio' : currentLang === 'pt' ? 'Áudio espacial 3D' : 'Audio espacial 3D'}
          description={currentLang === 'en' ? 'Sound changes based on user positions' : currentLang === 'pt' ? 'O som muda com base nas posições dos usuários' : 'El sonido cambia según la posición de los usuarios'}
          checked={settings.spatialAudio}
          onChange={(v) => updateSetting('spatialAudio', v)}
        />
        <SettingSlider
          label={currentLang === 'en' ? 'Proximity radius' : currentLang === 'pt' ? 'Raio de proximidade' : 'Radio de proximidad'}
          description={currentLang === 'en' ? 'Distance at which you can hear other users' : currentLang === 'pt' ? 'Distância em que você pode ouvir outros usuários' : 'Distancia a la que puedes escuchar a otros usuarios'}
          value={settings.proximityRadius}
          min={50}
          max={300}
          step={10}
          unit="u"
          onChange={(v) => updateSetting('proximityRadius', v)}
        />
      </SettingSection>
    </div>
  );
};

export default SettingsSpace3D;
