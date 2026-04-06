import { logger } from '@/lib/logger';
import {
  defaultAudioSettings,
  defaultCameraSettings,
  type AudioSettings,
  type CameraSettings,
} from '../../domain/MediaSettings';

const log = logger.child('media-settings-storage');

const AUDIO_STORAGE_KEY = 'cowork_audio_settings';
const CAMERA_STORAGE_KEY = 'cowork_camera_settings';

export const loadAudioSettings = (): AudioSettings => {
  try {
    const saved = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (saved) {
      return { ...defaultAudioSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    log.error('Error loading audio settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return defaultAudioSettings;
};

export const saveAudioSettings = (settings: AudioSettings) => {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    log.error('Error saving audio settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const loadCameraSettings = (): CameraSettings => {
  try {
    const saved = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (saved) {
      return { ...defaultCameraSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    log.error('Error loading camera settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return defaultCameraSettings;
};

export const saveCameraSettings = (settings: CameraSettings) => {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    log.error('Error saving camera settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
