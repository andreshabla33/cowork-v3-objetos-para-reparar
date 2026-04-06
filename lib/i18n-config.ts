/**
 * @module lib/i18n-config
 * Configuración de i18next para internacionalización.
 *
 * Clean Architecture: Capa de infraestructura (inicialización de librería externa).
 * Ref: https://www.i18next.com/misc/migration-guide
 *
 * NOTA: Si ves "using deprecated parameters for the initialization function",
 * proviene del plugin i18next-browser-languagedetector al detectar idioma.
 * Fix: actualizar a i18next-browser-languagedetector@8+ que usa la nueva API.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Idiomas soportados
export const supportedLanguages = ['es', 'en', 'pt'] as const;
export type Language = typeof supportedLanguages[number];

// Configuración de i18next — se usa la API de objeto único (no callback) según docs v23+
i18n
  // Carga traducciones desde archivos JSON
  .use(HttpBackend)
  // Detecta el idioma del navegador
  .use(LanguageDetector)
  // Bindings para React
  .use(initReactI18next)
  // init() con objeto único — patrón correcto según docs i18next v23+
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
