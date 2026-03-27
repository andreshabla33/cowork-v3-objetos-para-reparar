export interface ProcessedAudioTrackHandle {
  sourceTrack: MediaStreamTrack;
  track: MediaStreamTrack;
  dispose: () => void;
}

export async function createProcessedAudioTrack(
  sourceTrack: MediaStreamTrack,
  level: 'standard' | 'enhanced',
): Promise<ProcessedAudioTrackHandle | null> {
  const context = new AudioContext();
  const audioStream = new MediaStream([sourceTrack]);
  const source = context.createMediaStreamSource(audioStream);

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = level === 'enhanced' ? 120 : 80;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = level === 'enhanced' ? -35 : -28;
  compressor.knee.value = 30;
  compressor.ratio.value = level === 'enhanced' ? 12 : 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const gain = context.createGain();
  gain.gain.value = level === 'enhanced' ? 1.1 : 1.0;

  const destination = context.createMediaStreamDestination();
  source.connect(highpass).connect(compressor).connect(gain).connect(destination);

  const processedTrack = destination.stream.getAudioTracks()[0];
  if (!processedTrack) {
    try {
      source.disconnect();
    } catch {
      undefined;
    }
    try {
      destination.disconnect();
    } catch {
      undefined;
    }
    await context.close().catch(() => undefined);
    sourceTrack.stop();
    return null;
  }

  return {
    sourceTrack,
    track: processedTrack,
    dispose: () => {
      processedTrack.stop();
      sourceTrack.stop();
      try {
        source.disconnect();
      } catch {
        undefined;
      }
      try {
        highpass.disconnect();
      } catch {
        undefined;
      }
      try {
        compressor.disconnect();
      } catch {
        undefined;
      }
      try {
        gain.disconnect();
      } catch {
        undefined;
      }
      try {
        destination.disconnect();
      } catch {
        undefined;
      }
      void context.close().catch(() => undefined);
    },
  };
}
