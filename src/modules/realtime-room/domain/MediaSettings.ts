export interface AudioSettings {
  selectedMicrophoneId: string;
  selectedSpeakerId: string;
  noiseReduction: boolean;
  noiseReductionLevel: string;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface CameraSettings {
  selectedCameraId: string;
  backgroundEffect: 'none' | 'blur' | 'image';
  backgroundImage: string | null;
  hideSelfView: boolean;
  mirrorVideo: boolean;
}

export const defaultAudioSettings: AudioSettings = {
  selectedMicrophoneId: '',
  selectedSpeakerId: '',
  noiseReduction: true,
  noiseReductionLevel: 'standard',
  echoCancellation: true,
  autoGainControl: true,
};

export const defaultCameraSettings: CameraSettings = {
  selectedCameraId: '',
  backgroundEffect: 'none',
  backgroundImage: null,
  hideSelfView: false,
  mirrorVideo: true,
};
