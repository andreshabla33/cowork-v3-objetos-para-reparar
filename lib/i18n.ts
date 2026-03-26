// Sistema de internacionalización - Wrapper de compatibilidad para react-i18next
// Este archivo mantiene compatibilidad con el código existente mientras usa react-i18next internamente

import i18n from 'i18next';
import { useTranslation as useI18nextTranslation } from 'react-i18next';

export type Language = 'es' | 'en' | 'pt';

// Re-exportar el hook de useTranslation para uso directo
export { useTranslation } from 'react-i18next';

// Función legacy de suscripción a cambios de idioma (para compatibilidad)
export function subscribeToLanguageChange(callback: () => void): () => void {
  const handler = () => callback();
  i18n.on('languageChanged', handler);
  return () => i18n.off('languageChanged', handler);
}

// Función legacy para notificar cambios (ya no necesaria, pero mantenida para compatibilidad)
export function notifyLanguageChange(): void {
  // i18next maneja esto automáticamente
}

// Obtener idioma actual
export function getCurrentLanguage(): Language {
  return (i18n.language?.substring(0, 2) as Language) || 'es';
}

// Cambiar idioma
export function setLanguage(lang: Language): void {
  i18n.changeLanguage(lang);
  localStorage.setItem('app_language', lang);
}

// Función legacy de traducción (para compatibilidad con código existente)
export function t(key: string, _lang?: Language): string {
  const translation = i18n.t(key);
  if (translation === key) {
    return key;
  }
  return translation;
}

// Hook de traducción personalizado (wrapper)
export function useAppTranslation() {
  const { t, i18n } = useI18nextTranslation();
  
  return {
    t,
    currentLang: getCurrentLanguage(),
    changeLanguage: (lang: Language) => {
      i18n.changeLanguage(lang);
      localStorage.setItem('app_language', lang);
    },
  };
}

export default i18n;
