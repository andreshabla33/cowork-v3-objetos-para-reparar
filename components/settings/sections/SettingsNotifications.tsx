import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingSection } from '../components/SettingSection';
import { t, Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface NotificationSettings {
  desktopNotifications: boolean;
  newMessageSound: boolean;
  nearbyUserSound: boolean;
  mentionNotifications: boolean;
}

interface SettingsNotificationsProps {
  settings: NotificationSettings;
  onSettingsChange: (settings: NotificationSettings) => void;
}

export const SettingsNotifications: React.FC<SettingsNotificationsProps> = ({
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

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const getTitle = (key: string) => {
    const titles: Record<string, Record<Language, string>> = {
      system: { es: 'Notificaciones del Sistema', en: 'System Notifications', pt: 'Notificações do Sistema' },
      sounds: { es: 'Sonidos', en: 'Sounds', pt: 'Sons' },
      mentions: { es: 'Menciones', en: 'Mentions', pt: 'Menções' }
    };
    return titles[key]?.[currentLang] || titles[key]?.['es'] || key;
  };

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {t('settings.notifications.title', currentLang)}
        </h2>
        <p className="text-sm lg:text-xs text-zinc-400">
          {t('settings.notifications.description', currentLang)}
        </p>
      </div>

      <SettingSection title={getTitle('system')}>
        <SettingToggle
          label={t('settings.notifications.desktop', currentLang)}
          description={t('settings.notifications.desktopDesc', currentLang)}
          checked={settings.desktopNotifications}
          onChange={(v) => updateSetting('desktopNotifications', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('sounds')}>
        <SettingToggle
          label={t('settings.notifications.messageSound', currentLang)}
          description={t('settings.notifications.messageSoundDesc', currentLang)}
          checked={settings.newMessageSound}
          onChange={(v) => updateSetting('newMessageSound', v)}
        />
        <SettingToggle
          label={t('settings.notifications.nearbySound', currentLang)}
          description={t('settings.notifications.nearbySoundDesc', currentLang)}
          checked={settings.nearbyUserSound}
          onChange={(v) => updateSetting('nearbyUserSound', v)}
        />
      </SettingSection>

      <SettingSection title={getTitle('mentions')}>
        <SettingToggle
          label={t('settings.notifications.mentions', currentLang)}
          description={t('settings.notifications.mentionsDesc', currentLang)}
          checked={settings.mentionNotifications}
          onChange={(v) => updateSetting('mentionNotifications', v)}
        />
      </SettingSection>
    </div>
  );
};

export default SettingsNotifications;
