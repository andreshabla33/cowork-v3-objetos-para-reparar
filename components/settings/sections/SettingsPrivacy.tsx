import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSection } from '../components/SettingSection';
import { t, Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface PrivacySettings {
  showOnlineStatus: boolean;
  showActivityStatus: boolean;
  allowDirectMessages: boolean;
  showLocationInSpace: boolean;
  activityHistoryEnabled: boolean;
  activityRetentionDays: number;
}

interface SettingsPrivacyProps {
  settings: PrivacySettings;
  onSettingsChange: (settings: PrivacySettings) => void;
}

export const SettingsPrivacy: React.FC<SettingsPrivacyProps> = ({
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
      visibility: { es: 'Visibilidad', en: 'Visibility', pt: 'Visibilidade' },
      communication: { es: 'Comunicación', en: 'Communication', pt: 'Comunicação' },
      history: { es: 'Historial de Actividad', en: 'Activity History', pt: 'Histórico de Atividade' }
    };
    return titles[key]?.[currentLang] || titles[key]?.['es'] || key;
  };

  const retentionOptions = [
    { value: '7', label: '7 días' },
    { value: '30', label: '30 días' },
    { value: '90', label: '90 días' },
    { value: '365', label: '1 año' },
    { value: '0', label: 'Nunca borrar' }
  ];

  const updateSetting = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? 'Privacy & Activity' : currentLang === 'pt' ? 'Privacidade e Atividade' : 'Privacidad y Actividad'}
        </h2>
        <p className="text-sm text-zinc-400">
          {currentLang === 'en' ? 'Control your visibility and activity data' : currentLang === 'pt' ? 'Controle sua visibilidade e dados de atividade' : 'Controla tu visibilidad y datos de actividad'}
        </p>
      </div>

      <SettingSection title={getTitle('visibility')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Show online status' : currentLang === 'pt' ? 'Mostrar status online' : 'Mostrar estado en línea'}
          description={currentLang === 'en' ? 'Others can see when you are connected' : currentLang === 'pt' ? 'Outros podem ver quando você está conectado' : 'Los demás pueden ver cuando estás conectado'}
          checked={settings.showOnlineStatus}
          onChange={(v) => updateSetting('showOnlineStatus', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Show activity status' : currentLang === 'pt' ? 'Mostrar status de atividade' : 'Mostrar estado de actividad'}
          description={currentLang === 'en' ? 'Show if you are available, busy, away, etc.' : currentLang === 'pt' ? 'Mostrar se você está disponível, ocupado, ausente, etc.' : 'Mostrar si estás disponible, ocupado, ausente, etc.'}
          checked={settings.showActivityStatus}
          onChange={(v) => updateSetting('showActivityStatus', v)}
        />
        <SettingToggle
          label={currentLang === 'en' ? 'Show location in space' : currentLang === 'pt' ? 'Mostrar localização no espaço' : 'Mostrar ubicación en el espacio'}
          description={currentLang === 'en' ? 'Others can see where you are on the map' : currentLang === 'pt' ? 'Outros podem ver onde você está no mapa' : 'Los demás pueden ver dónde estás en el mapa'}
          checked={settings.showLocationInSpace}
          onChange={(v) => updateSetting('showLocationInSpace', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('communication')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Allow direct messages' : currentLang === 'pt' ? 'Permitir mensagens diretas' : 'Permitir mensajes directos'}
          description={currentLang === 'en' ? 'Any member can send you private messages' : currentLang === 'pt' ? 'Qualquer membro pode enviar mensagens privadas' : 'Cualquier miembro puede enviarte mensajes privados'}
          checked={settings.allowDirectMessages}
          onChange={(v) => updateSetting('allowDirectMessages', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('history')}>
        <SettingToggle
          label={currentLang === 'en' ? 'Record activity history' : currentLang === 'pt' ? 'Registrar histórico de atividade' : 'Registrar historial de actividad'}
          description={currentLang === 'en' ? 'Save record of your activity in the space' : currentLang === 'pt' ? 'Salvar registro da sua atividade no espaço' : 'Guardar registro de tu actividad en el espacio'}
          checked={settings.activityHistoryEnabled}
          onChange={(v) => updateSetting('activityHistoryEnabled', v)}
        />
        {settings.activityHistoryEnabled && (
          <SettingDropdown
            label={currentLang === 'en' ? 'Data retention' : currentLang === 'pt' ? 'Retenção de dados' : 'Retención de datos'}
            description={currentLang === 'en' ? 'How long to keep activity history' : currentLang === 'pt' ? 'Por quanto tempo manter o histórico de atividade' : 'Cuánto tiempo conservar el historial de actividad'}
            value={settings.activityRetentionDays.toString()}
            options={retentionOptions}
            onChange={(v) => updateSetting('activityRetentionDays', parseInt(v))}
          />
        )}
      </SettingSection>

      <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">{currentLang === 'en' ? 'Privacy note' : currentLang === 'pt' ? 'Nota de privacidade' : 'Nota de privacidad'}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {currentLang === 'en' 
                ? 'Space administrators may have access to certain activity data for team management and security purposes.' 
                : currentLang === 'pt' 
                ? 'Os administradores do espaço podem ter acesso a certos dados de atividade para fins de gestão e segurança da equipe.' 
                : 'Los administradores del espacio pueden tener acceso a ciertos datos de actividad para fines de gestión y seguridad del equipo.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPrivacy;
