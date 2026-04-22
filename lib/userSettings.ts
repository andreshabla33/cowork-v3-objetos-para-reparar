// ============== UTILIDAD PARA LEER SETTINGS DEL USUARIO ==============
// Los settings se guardan en localStorage desde SettingsModal.
// Esta utilidad permite a cualquier componente leer los settings sin importar SettingsModal.

import type { Language } from './i18n';

const STORAGE_KEY = 'user_settings';

export interface UserSettings {
  general: {
    skipWelcomeScreen: boolean;
    colorMode: string;
    language: Language;
    autoUpdates: boolean;
  };
  audio: {
    selectedMicrophoneId: string;
    selectedSpeakerId: string;
    noiseReduction: boolean;
    noiseReductionLevel: string;
    echoCancellation: boolean;
    autoGainControl: boolean;
    chatSounds: boolean;
    sfxVolume: number;
  };
  video: {
    selectedCameraId: string;
    hdQuality: boolean;
    mirrorVideo: boolean;
    hideSelfView: boolean;
    autoIdleMuting: boolean;
  };
  meetings: {
    autoMuteOnJoin: boolean;
    autoCameraOffOnJoin: boolean;
    // Legacy — mantenidos para compatibilidad con localStorage existente
    enableRecordingForMembers?: boolean;
    showTranscription?: boolean;
    aiSummaryEnabled?: boolean;
    maxParticipants?: number;
    waitingRoomEnabled?: boolean;
    allowScreenShare?: boolean;
    // Métricas de análisis customizables por tipo de reunión
    analisisMetricas?: {
      rrhh_entrevista: string[];
      rrhh_one_to_one: string[];
      deals: string[];
      equipo: string[];
    };
  };
  notifications: {
    desktopNotifications: boolean;
    newMessageSound: boolean;
    nearbyUserSound: boolean;
    mentionNotifications: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    showActivityStatus: boolean;
    allowDirectMessages: boolean;
    showLocationInSpace: boolean;
    activityHistoryEnabled: boolean;
    activityRetentionDays: number;
  };
  performance: {
    graphicsQuality: string;
    showVideos: boolean;
    showAvatarAnimations: boolean;
    reducedMotion: boolean;
    hardwareAcceleration: boolean;
    maxVideoStreams: number;
    batterySaver: boolean;
  };
  space3d: {
    cameraMode: string;
    movementSpeed: number;
    cameraSensitivity: number;
    invertYAxis: boolean;
    showFloorGrid: boolean;
    showNamesAboveAvatars: boolean;
    spatialAudio: boolean;
    proximityRadius: number;
    radioInteresChunks: number;
    enableDayNightCycle?: boolean;
    /**
     * Offset over-the-shoulder de la cámara third-person:
     *  - 'center' (default, como hoy)
     *  - 'left'   (hombro izquierdo, cámara 0.3u a la derecha del avatar)
     *  - 'right'  (hombro derecho, cámara 0.3u a la izquierda del avatar)
     * Patrón cinematográfico común en GTA V, Fortnite, Witcher 3.
     * Gated por gpuRenderConfig.useDynamicFov (tier ≥ 2).
     */
    cameraShoulderMode?: 'center' | 'left' | 'right';
  };
  calendar: {
    googleConnected: boolean;
    syncEnabled: boolean;
    defaultReminder: number;
    showGoogleEvents: boolean;
    autoCreateGoogleEvent: boolean;
  };
  minimode: {
    enableMiniMode: boolean;
    miniModePosition: string;
    showVideoInMini: boolean;
    showChatInMini: boolean;
    autoMinimize: boolean;
    autoMinimizeDelay: number;
  };
  guests: {
    guestCheckInEnabled: boolean;
    requireApproval: boolean;
    guestAccessDuration: number;
    allowGuestChat: boolean;
    allowGuestVideo: boolean;
  };
  security: {
    requireLogin: boolean;
    passwordProtection: boolean;
    spacePassword: string;
    allowedDomains: string[];
    allowStaffAccess: boolean;
    twoFactorRequired: boolean;
    sessionTimeout: number;
    ipRestriction: boolean;
  };
}

export const defaultUserSettings: UserSettings = {
  general: {
    skipWelcomeScreen: false,
    colorMode: 'dark',
    language: 'es',
    autoUpdates: true
  },
  audio: {
    selectedMicrophoneId: '',
    selectedSpeakerId: '',
    noiseReduction: true,
    noiseReductionLevel: 'standard',
    echoCancellation: true,
    autoGainControl: true,
    chatSounds: true,
    sfxVolume: 70
  },
  video: {
    selectedCameraId: '',
    hdQuality: true,
    mirrorVideo: true,
    hideSelfView: false,
    autoIdleMuting: true
  },
  meetings: {
    autoMuteOnJoin: true,
    autoCameraOffOnJoin: true,
    enableRecordingForMembers: false,
    showTranscription: true,
    aiSummaryEnabled: true,
    maxParticipants: 25,
    waitingRoomEnabled: false,
    allowScreenShare: true,
    analisisMetricas: {
      rrhh_entrevista: [
        'congruencia_verbal_no_verbal',
        'nivel_nerviosismo',
        'confianza_percibida',
        'engagement_por_pregunta',
        'momentos_incomodidad',
        'prediccion_fit_cultural',
      ],
      rrhh_one_to_one: [
        'congruencia_verbal_no_verbal',
        'nivel_comodidad',
        'engagement_por_tema',
        'momentos_preocupacion',
        'señales_satisfaccion',
        'apertura_comunicacion',
      ],
      deals: [
        'momentos_interes',
        'señales_objecion',
        'engagement_por_tema',
        'señales_cierre',
        'prediccion_probabilidad_cierre',
        'puntos_dolor_detectados',
      ],
      equipo: [
        'participacion_por_persona',
        'engagement_grupal',
        'reacciones_a_ideas',
        'momentos_desconexion',
        'dinamica_grupal',
        'prediccion_adopcion_ideas',
      ],
    },
  },
  notifications: {
    desktopNotifications: true,
    newMessageSound: true,
    nearbyUserSound: false,
    mentionNotifications: true
  },
  privacy: {
    showOnlineStatus: true,
    showActivityStatus: true,
    allowDirectMessages: true,
    showLocationInSpace: true,
    activityHistoryEnabled: true,
    activityRetentionDays: 30
  },
  performance: {
    // Default 'auto' desde 2026-04-17: deriva quality del gpuTier detectado
    // al boot (tier3→high, tier2→medium, tier0/1→low) Y activa el observador
    // <AdaptivePerformanceMonitor> que baja DPR dinámicamente si los FPS
    // caen por debajo de 40 sostenidos. Usuarios con preferencia persistida
    // en localStorage mantienen su elección; solo nuevos usuarios (o tras
    // un clear de settings) entran con 'auto'.
    graphicsQuality: 'auto',
    showVideos: true,
    showAvatarAnimations: true,
    reducedMotion: false,
    hardwareAcceleration: true,
    // Raised 6→8 (2026-04-22) para pruebas con 20+ usuarios en proximidad.
    // Consistente con LiveKit selective subscription + adaptiveStream +
    // dynacast ya activos (VP9 SVC L3T3_KEY). El SubscriptionPolicyService
    // sigue aplicando tier-based quality; esto solo sube el techo de burbujas
    // visibles + suscritas simultáneamente.
    // Ref: https://docs.livekit.io/home/client/tracks/subscribe/
    maxVideoStreams: 8,
    batterySaver: false
  },
  space3d: {
    cameraMode: 'free',
    movementSpeed: 5,
    cameraSensitivity: 5,
    invertYAxis: false,
    showFloorGrid: true,
    showNamesAboveAvatars: true,
    spatialAudio: true,
    proximityRadius: 130,
    radioInteresChunks: 1,
    enableDayNightCycle: false,
    cameraShoulderMode: 'center'
  },
  calendar: {
    googleConnected: false,
    syncEnabled: true,
    defaultReminder: 15,
    showGoogleEvents: true,
    autoCreateGoogleEvent: true
  },
  minimode: {
    enableMiniMode: true,
    miniModePosition: 'bottom-right',
    showVideoInMini: true,
    showChatInMini: true,
    autoMinimize: false,
    autoMinimizeDelay: 60
  },
  guests: {
    guestCheckInEnabled: false,
    requireApproval: true,
    guestAccessDuration: 24,
    allowGuestChat: true,
    allowGuestVideo: true
  },
  security: {
    requireLogin: true,
    passwordProtection: false,
    spacePassword: '',
    allowedDomains: [],
    allowStaffAccess: true,
    twoFactorRequired: false,
    sessionTimeout: 480,
    ipRestriction: false
  }
};

export function createDefaultUserSettings(): UserSettings {
  return JSON.parse(JSON.stringify(defaultUserSettings)) as UserSettings;
}

// Deep merge: combina defaults con valores guardados preservando nuevas keys en subsecciones
export function deepMergeSettings<T extends Record<string, any>>(defaults: T, overrides: Record<string, any>): T {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides) {
      const defaultVal = defaults[key];
      const overrideVal = overrides[key];
      if (
        defaultVal !== null && overrideVal !== null &&
        typeof defaultVal === 'object' && typeof overrideVal === 'object' &&
        !Array.isArray(defaultVal) && !Array.isArray(overrideVal)
      ) {
        (result as any)[key] = deepMergeSettings(defaultVal, overrideVal);
      } else {
        (result as any)[key] = overrideVal;
      }
    }
  }
  return result;
}

// Leer todos los settings
export function getUserSettings(): UserSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return deepMergeSettings(defaultUserSettings, parsed);
    }
  } catch (e) {
    console.error('Error loading user settings:', e);
  }
  return createDefaultUserSettings();
}

// Leer una sección específica
export function getSettingsSection<K extends keyof UserSettings>(section: K): UserSettings[K] {
  const settings = getUserSettings();
  return settings[section];
}

// Suscribirse a cambios de settings (usa storage event para cross-tab)
const listeners: Set<() => void> = new Set();

export function subscribeToSettings(callback: () => void): () => void {
  listeners.add(callback);
  
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      listeners.forEach(cb => cb());
    }
  };
  window.addEventListener('storage', handleStorage);
  
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', handleStorage);
  };
}

// Notificar a listeners locales (mismo tab) cuando se guardan settings
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key: string, value: string) {
  originalSetItem(key, value);
  if (key === STORAGE_KEY) {
    listeners.forEach(cb => cb());
  }
};

// Helpers para constraints de audio/video basados en settings
export function getAudioConstraints(): MediaTrackConstraints {
  const audio = getSettingsSection('audio');
  const constraints: MediaTrackConstraints = {
    echoCancellation: audio.echoCancellation,
    autoGainControl: audio.autoGainControl,
    noiseSuppression: audio.noiseReduction,
  };
  if (audio.selectedMicrophoneId) {
    constraints.deviceId = { exact: audio.selectedMicrophoneId };
  }
  return constraints;
}

export function getVideoConstraints(): MediaTrackConstraints {
  const video = getSettingsSection('video');
  const constraints: MediaTrackConstraints = {};
  if (video.selectedCameraId) {
    constraints.deviceId = { exact: video.selectedCameraId };
  }
  if (video.hdQuality) {
    constraints.width = { ideal: 1920, min: 1280 };
    constraints.height = { ideal: 1080, min: 720 };
    constraints.frameRate = { ideal: 30, max: 30 };
  } else {
    constraints.width = { ideal: 1280, min: 640 };
    constraints.height = { ideal: 720, min: 480 };
    constraints.frameRate = { ideal: 24, max: 30 };
  }
  return constraints;
}

// Helper para saber si mic/cam deben estar apagados al entrar
export function getMeetingJoinDefaults(): { muteOnJoin: boolean; cameraOffOnJoin: boolean } {
  const meetings = getSettingsSection('meetings');
  return {
    muteOnJoin: meetings.autoMuteOnJoin,
    cameraOffOnJoin: meetings.autoCameraOffOnJoin
  };
}

// Helper para settings de espacio 3D
export function getSpace3DSettings() {
  return getSettingsSection('space3d');
}

// Helper para settings de notificaciones
export function getNotificationSettings() {
  return getSettingsSection('notifications');
}

// Solicitar permiso de notificaciones desktop
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  const notif = getSettingsSection('notifications');
  if (!notif.desktopNotifications) return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Enviar notificación desktop
export function sendDesktopNotification(title: string, body: string, icon?: string) {
  const notif = getSettingsSection('notifications');
  if (!notif.desktopNotifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: icon || '/favicon.ico' });
}
