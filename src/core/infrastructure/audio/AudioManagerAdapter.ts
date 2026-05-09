import { getSettingsSection } from '@/lib/userSettings';

export type PosicionAudio3D = {
  x: number;
  z: number;
};

export type OpcionesSonidoEspacial = {
  sourceId?: string;
  position?: PosicionAudio3D;
  listenerPosition?: PosicionAudio3D;
  debounceMs?: number;
};

type RegistroActivo = {
  cleanup: () => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type PerfilEspacial = {
  gain: number;
  pan: number;
  lowpassHz: number;
};

type AjustesAudio = {
  sfxVolume?: number;
  chatSounds?: boolean;
};

type AjustesNotificaciones = {
  newMessageSound?: boolean;
  nearbyUserSound?: boolean;
};

type AjustesEspacio3D = {
  spatialAudio?: boolean;
  proximityRadius?: number;
};

class AudioManager {
  private ctx: AudioContext | null = null;
  private audioReady = false;
  private lastEventAt = new Map<string, number>();
  private activos = new Map<string, RegistroActivo>();
  private readonly distanciaMaxima = 24;

  constructor() {
    if (typeof window !== 'undefined') {
      const resumeAudio = () => {
        this.audioReady = true;
        void this.ensureContext();
        window.removeEventListener('click', resumeAudio, true);
        window.removeEventListener('keydown', resumeAudio, true);
        window.removeEventListener('touchstart', resumeAudio, true);
      };
      window.addEventListener('click', resumeAudio, true);
      window.addEventListener('keydown', resumeAudio, true);
      window.addEventListener('touchstart', resumeAudio, true);
    }
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended' && this.audioReady) {
      await this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private getAudioSettings() {
    const audio = (getSettingsSection('audio') || {}) as AjustesAudio;
    const notifications = (getSettingsSection('notifications') || {}) as AjustesNotificaciones;
    const space3d = (getSettingsSection('space3d') || {}) as AjustesEspacio3D;
    return {
      sfxVolume: Math.max(0, Math.min(1, Number(audio.sfxVolume ?? 70) / 100)),
      chatSounds: Boolean(audio.chatSounds ?? true),
      newMessageSound: Boolean(notifications.newMessageSound ?? true),
      nearbyUserSound: Boolean(notifications.nearbyUserSound ?? true),
      spatialAudio: Boolean(space3d.spatialAudio ?? true),
      proximityRadius: Math.max(8, Number(space3d.proximityRadius ?? 180) / 16),
    };
  }

  private shouldSkip(eventKey: string, debounceMs: number) {
    const now = Date.now();
    const last = this.lastEventAt.get(eventKey) || 0;
    if (now - last < debounceMs) return true;
    this.lastEventAt.set(eventKey, now);
    return false;
  }

  private stopChannel(channelKey: string) {
    const activo = this.activos.get(channelKey);
    if (!activo) return;
    if (activo.timeoutId) clearTimeout(activo.timeoutId);
    activo.cleanup();
    this.activos.delete(channelKey);
  }

  private trackChannel(channelKey: string, cleanup: () => void, durationMs: number) {
    this.stopChannel(channelKey);
    const timeoutId = setTimeout(() => {
      cleanup();
      this.activos.delete(channelKey);
    }, durationMs + 120);
    this.activos.set(channelKey, { cleanup, timeoutId });
  }

  private quantize(value?: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'na';
    return value.toFixed(1);
  }

  private getSpatialProfile(position?: PosicionAudio3D, listenerPosition?: PosicionAudio3D): PerfilEspacial {
    const settings = this.getAudioSettings();
    if (!settings.spatialAudio || !position || !listenerPosition) {
      return { gain: 1, pan: 0, lowpassHz: 14000 };
    }

    const dx = position.x - listenerPosition.x;
    const dz = position.z - listenerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const maxDistance = Math.max(this.distanciaMaxima, settings.proximityRadius * 1.6);
    const normalized = Math.max(0, Math.min(1, distance / maxDistance));
    const gain = Math.pow(1 - normalized, 1.7);
    const pan = Math.max(-1, Math.min(1, dx / (maxDistance * 0.65)));
    const lowpassHz = 2200 + (1 - normalized) * 10800;

    return { gain, pan, lowpassHz };
  }

  private connectScene(ctx: AudioContext, baseVolume: number, profile?: PerfilEspacial) {
    const master = ctx.createGain();
    master.gain.setValueAtTime(baseVolume * (profile?.gain ?? 1), ctx.currentTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(profile?.lowpassHz ?? 14000, ctx.currentTime);

    if (typeof StereoPannerNode !== 'undefined') {
      const panner = new StereoPannerNode(ctx, { pan: profile?.pan ?? 0 });
      master.connect(lowpass).connect(panner).connect(ctx.destination);
    } else {
      master.connect(lowpass).connect(ctx.destination);
    }

    return master;
  }

  private safeStop(node: AudioScheduledSourceNode | null, when: number) {
    if (!node) return;
    try {
      node.stop(when);
    } catch {}
  }

  private beep(ctx: AudioContext, target: AudioNode, options: {
    type: OscillatorType;
    startAt: number;
    duration: number;
    fromHz: number;
    toHz: number;
    attack: number;
    peak: number;
    releaseFloor?: number;
  }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const releaseFloor = options.releaseFloor ?? 0.0001;
    osc.type = options.type;
    osc.frequency.setValueAtTime(options.fromHz, options.startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.toHz), options.startAt + options.duration);
    gain.gain.setValueAtTime(0.0001, options.startAt);
    gain.gain.linearRampToValueAtTime(options.peak, options.startAt + options.attack);
    gain.gain.exponentialRampToValueAtTime(releaseFloor, options.startAt + options.duration);
    osc.connect(gain).connect(target);
    osc.start(options.startAt);
    this.safeStop(osc, options.startAt + options.duration);
    return () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
  }

  private noise(ctx: AudioContext, target: AudioNode, options: {
    startAt: number;
    duration: number;
    peak: number;
    centerHz: number;
    q?: number;
  }) {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * options.duration));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.12;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.centerHz, options.startAt);
    filter.Q.setValueAtTime(options.q ?? 1.2, options.startAt);
    gain.gain.setValueAtTime(options.peak, options.startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.startAt + options.duration);
    source.buffer = noiseBuffer;
    source.connect(filter).connect(gain).connect(target);
    source.start(options.startAt);
    this.safeStop(source, options.startAt + options.duration);
    return () => {
      try {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };
  }

  private async playPreset(channelKey: string, build: (ctx: AudioContext) => { cleanup: () => void; durationMs: number }) {
    const ctx = await this.ensureContext();
    if (!ctx) return false;
    const scene = build(ctx);
    this.trackChannel(channelKey, scene.cleanup, scene.durationMs);
    return true;
  }

  async playTeleport(options: OpcionesSonidoEspacial = {}) {
    const settings = this.getAudioSettings();
    const dedupKey = `teleport:${options.sourceId ?? 'anon'}:${this.quantize(options.position?.x)}:${this.quantize(options.position?.z)}`;
    if (this.shouldSkip(dedupKey, options.debounceMs ?? 650)) return false;

    const profile = this.getSpatialProfile(options.position, options.listenerPosition);
    if (profile.gain < 0.04) return false;

    return this.playPreset(`teleport:${options.sourceId ?? 'anon'}`, (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.42, profile);
      const cleanups = [
        this.beep(ctx, target, { type: 'triangle', startAt: now, duration: 0.22, fromHz: 220, toHz: 520, attack: 0.03, peak: 0.11 }),
        this.noise(ctx, target, { startAt: now + 0.02, duration: 0.18, peak: 0.045, centerHz: 1800, q: 0.9 }),
        this.beep(ctx, target, { type: 'sine', startAt: now + 0.08, duration: 0.28, fromHz: 480, toHz: 920, attack: 0.04, peak: 0.085 }),
        this.beep(ctx, target, { type: 'sine', startAt: now + 0.24, duration: 0.26, fromHz: 760, toHz: 320, attack: 0.03, peak: 0.06 }),
      ];
      return {
        durationMs: 560,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }

  async playWave() {
    const settings = this.getAudioSettings();
    return this.playPreset('ui:wave', (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.26);
      const cleanups = [
        this.beep(ctx, target, { type: 'sine', startAt: now, duration: 0.11, fromHz: 540, toHz: 700, attack: 0.02, peak: 0.08 }),
        this.beep(ctx, target, { type: 'sine', startAt: now + 0.09, duration: 0.15, fromHz: 700, toHz: 620, attack: 0.02, peak: 0.065 }),
      ];
      return {
        durationMs: 260,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }

  async playNudge() {
    const settings = this.getAudioSettings();
    return this.playPreset('ui:nudge', (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.3);
      const cleanups = [
        this.beep(ctx, target, { type: 'triangle', startAt: now, duration: 0.16, fromHz: 460, toHz: 360, attack: 0.015, peak: 0.12 }),
        this.beep(ctx, target, { type: 'sine', startAt: now, duration: 0.1, fromHz: 230, toHz: 180, attack: 0.01, peak: 0.05 }),
      ];
      return {
        durationMs: 200,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }

  async playInvite() {
    const settings = this.getAudioSettings();
    return this.playPreset('ui:invite', (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.24);
      const cleanups = [
        this.beep(ctx, target, { type: 'sine', startAt: now, duration: 0.12, fromHz: 520, toHz: 660, attack: 0.02, peak: 0.07 }),
        this.beep(ctx, target, { type: 'sine', startAt: now + 0.1, duration: 0.14, fromHz: 660, toHz: 780, attack: 0.02, peak: 0.08 }),
        this.beep(ctx, target, { type: 'sine', startAt: now + 0.2, duration: 0.18, fromHz: 780, toHz: 980, attack: 0.025, peak: 0.09 }),
      ];
      return {
        durationMs: 420,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }

  async playChatNotification() {
    const settings = this.getAudioSettings();
    if (!settings.chatSounds || !settings.newMessageSound) return false;
    return this.playPreset('ui:chat', (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.2);
      const cleanups = [
        this.beep(ctx, target, { type: 'sine', startAt: now, duration: 0.12, fromHz: 840, toHz: 1120, attack: 0.02, peak: 0.055 }),
        this.beep(ctx, target, { type: 'triangle', startAt: now + 0.07, duration: 0.18, fromHz: 1120, toHz: 980, attack: 0.02, peak: 0.045 }),
      ];
      return {
        durationMs: 260,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }

  async playObjectInteraction() {
    const settings = this.getAudioSettings();
    return this.playPreset('ui:object', (ctx) => {
      const now = ctx.currentTime;
      const target = this.connectScene(ctx, settings.sfxVolume * 0.18);
      const cleanups = [
        this.beep(ctx, target, { type: 'triangle', startAt: now, duration: 0.08, fromHz: 620, toHz: 780, attack: 0.01, peak: 0.05 }),
        this.noise(ctx, target, { startAt: now, duration: 0.06, peak: 0.012, centerHz: 2400, q: 1.6 }),
      ];
      return {
        durationMs: 140,
        cleanup: () => {
          cleanups.forEach((fn) => fn());
          try {
            target.disconnect();
          } catch {}
        },
      };
    });
  }
}

export const audioManager = new AudioManager();
