import React, { useState, useEffect } from 'react';
import { SettingToggle } from '../components/SettingToggle';
import { SettingDropdown } from '../components/SettingDropdown';
import { SettingSection } from '../components/SettingSection';
import { googleCalendar } from '../../../lib/googleCalendar';
import { Language, getCurrentLanguage, subscribeToLanguageChange } from '../../../lib/i18n';

interface CalendarSettings {
  googleConnected: boolean;
  syncEnabled: boolean;
  defaultReminder: number;
  showGoogleEvents: boolean;
  autoCreateGoogleEvent: boolean;
}

interface SettingsCalendarProps {
  settings: CalendarSettings;
  onSettingsChange: (settings: CalendarSettings) => void;
}

export const SettingsCalendar: React.FC<SettingsCalendarProps> = ({
  settings,
  onSettingsChange
}) => {
  const [googleConnected, setGoogleConnected] = useState(googleCalendar.isConnected());
  const [syncing, setSyncing] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());

  // Escuchar cambios de idioma
  useEffect(() => {
    const unsubscribe = subscribeToLanguageChange(() => {
      setCurrentLang(getCurrentLanguage());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setGoogleConnected(googleCalendar.isConnected());
  }, []);

  const updateSetting = <K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const connectGoogle = () => {
    window.location.href = googleCalendar.getAuthUrl();
  };

  const disconnectGoogle = () => {
    googleCalendar.removeToken();
    setGoogleConnected(false);
    updateSetting('googleConnected', false);
  };

  const reminderOptions = [
    { value: '5', label: '5 minutos antes' },
    { value: '10', label: '10 minutos antes' },
    { value: '15', label: '15 minutos antes' },
    { value: '30', label: '30 minutos antes' },
    { value: '60', label: '1 hora antes' }
  ];

  return (
    <div>
      <div className="mb-8 lg:mb-6">
        <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2 lg:mb-1">
          {currentLang === 'en' ? 'Calendar' : currentLang === 'pt' ? 'Calendário' : 'Calendario'}
        </h2>
        <p className="text-sm text-zinc-400">
          {currentLang === 'en' ? 'Configure calendar sync and preferences' : currentLang === 'pt' ? 'Configure a sincronização e preferências do calendário' : 'Configura la sincronización y preferencias de calendario'}
        </p>
      </div>

      <SettingSection title={currentLang === 'en' ? 'Google Calendar' : currentLang === 'pt' ? 'Google Calendar' : 'Google Calendar'}>
        <div className="py-4 border-b border-white/[0.05]">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-white">{currentLang === 'en' ? 'Connect Google Calendar' : currentLang === 'pt' ? 'Conectar Google Calendar' : 'Conectar Google Calendar'}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {currentLang === 'en' ? 'Sync your events and create meetings with Google Meet' : currentLang === 'pt' ? 'Sincronize seus eventos e crie reuniões com Google Meet' : 'Sincroniza tus eventos y crea reuniones con Google Meet'}
              </p>
            </div>
            {googleConnected ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  {currentLang === 'en' ? 'Connected' : currentLang === 'pt' ? 'Conectado' : 'Conectado'}
                </div>
                <button
                  onClick={disconnectGoogle}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-all"
                >
                  {currentLang === 'en' ? 'Disconnect' : currentLang === 'pt' ? 'Desconectar' : 'Desconectar'}
                </button>
              </div>
            ) : (
              <button
                onClick={connectGoogle}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                </svg>
                {currentLang === 'en' ? 'Connect' : currentLang === 'pt' ? 'Conectar' : 'Conectar'}
              </button>
            )}
          </div>
        </div>

        {googleConnected && (
          <>
            <SettingToggle
              label={currentLang === 'en' ? 'Show Google events' : currentLang === 'pt' ? 'Mostrar eventos do Google' : 'Mostrar eventos de Google'}
              description={currentLang === 'en' ? 'Show your Google Calendar events in Cowork calendar' : currentLang === 'pt' ? 'Mostrar seus eventos do Google Calendar no calendário do Cowork' : 'Muestra tus eventos de Google Calendar en el calendario de Cowork'}
              checked={settings.showGoogleEvents}
              onChange={(v) => updateSetting('showGoogleEvents', v)}
            />
            <SettingToggle
              label={currentLang === 'en' ? 'Auto-create events in Google' : currentLang === 'pt' ? 'Criar eventos no Google automaticamente' : 'Crear eventos en Google automáticamente'}
              description={currentLang === 'en' ? 'When creating a meeting in Cowork, also create it in Google Calendar' : currentLang === 'pt' ? 'Ao criar uma reunião no Cowork, também crie no Google Calendar' : 'Al crear una reunión en Cowork, también se crea en Google Calendar'}
              checked={settings.autoCreateGoogleEvent}
              onChange={(v) => updateSetting('autoCreateGoogleEvent', v)}
            />
          </>
        )}
      </SettingSection>

      <SettingSection title={currentLang === 'en' ? 'Reminders' : currentLang === 'pt' ? 'Lembretes' : 'Recordatorios'}>
        <SettingDropdown
          label={currentLang === 'en' ? 'Default reminder' : currentLang === 'pt' ? 'Lembrete padrão' : 'Recordatorio predeterminado'}
          description={currentLang === 'en' ? 'Time before meeting to receive notification' : currentLang === 'pt' ? 'Tempo antes da reunião para receber notificação' : 'Tiempo antes de la reunión para recibir notificación'}
          value={settings.defaultReminder.toString()}
          options={reminderOptions}
          onChange={(v) => updateSetting('defaultReminder', parseInt(v))}
        />
      </SettingSection>

      <SettingSection title={currentLang === 'en' ? 'Sync' : currentLang === 'pt' ? 'Sincronização' : 'Sincronización'}>
        <SettingToggle
          label={currentLang === 'en' ? 'Auto sync' : currentLang === 'pt' ? 'Sincronização automática' : 'Sincronización automática'}
          description={currentLang === 'en' ? 'Keep calendar synced in real-time' : currentLang === 'pt' ? 'Mantenha o calendário sincronizado em tempo real' : 'Mantener el calendario sincronizado en tiempo real'}
          checked={settings.syncEnabled}
          onChange={(v) => updateSetting('syncEnabled', v)}
        />
      </SettingSection>
    </div>
  );
};

export default SettingsCalendar;
