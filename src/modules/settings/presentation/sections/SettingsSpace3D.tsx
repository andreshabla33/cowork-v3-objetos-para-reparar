import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSlider } from '../components/SettingSlider';
import { SettingSection } from '../components/SettingSection';
import { Language, getCurrentLanguage, subscribeToLanguageChange } from '@/core/infrastructure/i18n/i18n';
import type { CameraMode } from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';

interface Space3DSettings {
  cameraMode: CameraMode;
  movementSpeed: number;
  cameraSensitivity: number;
  showFloorGrid: boolean;
  showNamesAboveAvatars: boolean;
  spatialAudio: boolean;
  proximityRadius: number;
  radioInteresChunks: number;
  /** OTS offset cámara — 'center' | 'left' | 'right'. Tier 2 feature. */
  cameraShoulderMode?: 'center' | 'left' | 'right';
  /**
   * P4: multiplicador LOD avatares (0.5–1.5). 1.0 = baseline tier.
   * <1.0 = más performance, >1.0 = más calidad visual.
   */
  lodDistanceMultiplier?: number;
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

  const cameraModeOptions: Array<{ value: CameraMode; label: string }> = [
    {
      value: 'isometric',
      label: currentLang === 'en'
        ? 'Game view (recommended)'
        : currentLang === 'pt'
          ? 'Vista de jogo (recomendada)'
          : 'Vista de juego (recomendada)',
    },
    {
      value: 'free',
      label: currentLang === 'en' ? 'Free (rotate 360°)' : currentLang === 'pt' ? 'Livre (rotação 360°)' : 'Libre (rotación 360°)',
    },
  ];

  const shoulderOptions = [
    { value: 'center', label: currentLang === 'en' ? 'Centered' : currentLang === 'pt' ? 'Centralizado' : 'Centrado' },
    { value: 'left', label: currentLang === 'en' ? 'Left shoulder' : currentLang === 'pt' ? 'Ombro esquerdo' : 'Hombro izquierdo' },
    { value: 'right', label: currentLang === 'en' ? 'Right shoulder' : currentLang === 'pt' ? 'Ombro direito' : 'Hombro derecho' }
  ];

  const updateSetting = <K extends keyof Space3DSettings>(key: K, value: Space3DSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#E0F0FF] to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? '3D Space' : currentLang === 'pt' ? 'Espaço 3D' : 'Espacio 3D'}
        </h2>
        <p className="text-sm text-[#4A6485]">
          {currentLang === 'en' ? 'Configure the 3D virtual space experience' : currentLang === 'pt' ? 'Configure a experiência do espaço virtual 3D' : 'Configura la experiencia del espacio virtual 3D'}
        </p>
      </div>

      <SettingSection title={getTitle('camera')}>
        <SettingDropdown
          label={currentLang === 'en' ? 'Camera mode' : currentLang === 'pt' ? 'Modo de câmera' : 'Modo de cámara'}
          description={currentLang === 'en' ? 'How the camera behaves in the space' : currentLang === 'pt' ? 'Como a câmera se comporta no espaço' : 'Cómo se comporta la cámara en el espacio'}
          value={settings.cameraMode}
          options={cameraModeOptions}
          onChange={(v) => updateSetting('cameraMode', v as CameraMode)}
        />
        <SettingSlider
          label={currentLang === 'en' ? 'Camera sensitivity' : currentLang === 'pt' ? 'Sensibilidade da câmera' : 'Sensibilidad de cámara'}
          description={currentLang === 'en' ? 'Camera rotation speed' : currentLang === 'pt' ? 'Velocidade de rotação da câmera' : 'Velocidad de rotación de la cámara'}
          value={settings.cameraSensitivity}
          min={1}
          max={10}
          onChange={(v) => updateSetting('cameraSensitivity', v)}
        />
        <SettingDropdown
          label={currentLang === 'en' ? 'Shoulder view (cinematic)' : currentLang === 'pt' ? 'Vista sobre o ombro (cinematográfica)' : 'Vista sobre el hombro (cinematográfica)'}
          description={currentLang === 'en' ? 'Offset camera to one side for a cinematic over-the-shoulder look' : currentLang === 'pt' ? 'Descentraliza a câmera para um visual cinematográfico sobre o ombro' : 'Descentra la cámara a un lado para un look cinematográfico'}
          value={settings.cameraShoulderMode ?? 'center'}
          options={shoulderOptions}
          onChange={(v) => updateSetting('cameraShoulderMode', v as 'center' | 'left' | 'right')}
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
        <SettingSlider
          label={currentLang === 'en'
            ? 'Avatar LOD quality (tradeoff)'
            : currentLang === 'pt'
              ? 'Qualidade LOD de avatares (tradeoff)'
              : 'Calidad LOD de avatares (tradeoff)'}
          description={currentLang === 'en'
            ? '0.5×: aggressive (more performance) — 1.5×: generous (more visual fidelity at distance)'
            : currentLang === 'pt'
              ? '0,5×: agressivo (mais performance) — 1,5×: generoso (mais qualidade à distância)'
              : '0.5×: agresivo (más rendimiento) — 1.5×: generoso (más detalle a distancia)'}
          value={settings.lodDistanceMultiplier ?? 1.0}
          min={0.5}
          max={1.5}
          step={0.1}
          unit="×"
          onChange={(v) => updateSetting('lodDistanceMultiplier', v)}
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
