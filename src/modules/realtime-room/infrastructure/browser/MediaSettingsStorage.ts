import {
  defaultAudioSettings,
  defaultCameraSettings,
  type AudioSettings,
  type CameraSettings,
} from '../../domain/MediaSettings';

const AUDIO_STORAGE_KEY = 'cowork_audio_settings';
const CAMERA_STORAGE_KEY = 'cowork_camera_settings';

export const loadAudioSettings = (): AudioSettings => {
  try {
    const saved = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (saved) {
      return { ...defaultAudioSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('Error loading audio settings:', error);
  }
  return defaultAudioSettings;
};

export const saveAudioSettings = (settings: AudioSettings) => {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving audio settings:', error);
  }
};

export const loadCameraSettings = (): CameraSettings => {
  try {
    const saved = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (saved) {
      return { ...defaultCameraSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('Error loading camera settings:', error);
  }
  return defaultCameraSettings;
};

export const saveCameraSettings = (settings: CameraSettings) => {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving camera settings:', error);
  }
};
