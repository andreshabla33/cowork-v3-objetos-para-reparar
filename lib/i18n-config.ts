// Configuración de i18next para internacionalización
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Idiomas soportados
export const supportedLanguages = ['es', 'en', 'pt'] as const;
export type Language = typeof supportedLanguages[number];

// Configuración de i18next
i18n
  // Carga traducciones desde archivos JSON
  .use(HttpBackend)
  // Detecta el idioma del navegador
  .use(LanguageDetector)
  // Bindings para React
  .use(initReactI18next)
  // Inicialización
  .init({
    // Idioma por defecto
    fallbackLng: 'es',
    
    // Idiomas soportados
    supportedLngs: supportedLanguages,
    
    // Debug en desarrollo
    debug: import.meta.env.DEV,
    
    // Namespace por defecto
    defaultNS: 'translation',
    
    // Configuración del backend (carga de archivos)
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    // Configuración del detector de idioma
    detection: {
      // Orden de detección
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Clave en localStorage
      lookupLocalStorage: 'app_language',
      // Guardar idioma detectado
      caches: ['localStorage'],
    },
    
    // Interpolación
    interpolation: {
      // React ya escapa el contenido
      escapeValue: false,
    },
    
    // Opciones de React
    react: {
      useSuspense: true,
    },
  });

// Función para cambiar idioma
export const changeLanguage = async (lng: Language): Promise<void> => {
  await i18n.changeLanguage(lng);
  localStorage.setItem('app_language', lng);
};

// Función para obtener idioma actual
export const getCurrentLanguage = (): Language => {
  return (i18n.language as Language) || 'es';
};

export default i18n;
