'use client';

import React, { useEffect, useRef } from 'react';
import type { User } from '@/types';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('SpatialAudio');

interface SpatialAudioProps {
  tracks: Map<string, MediaStreamTrack>;
  usuarios: User[];
  currentUser: User;
  enabled: boolean;
  silenciarAudio?: boolean;
  speakerDeviceId?: string;
}

interface AudioNodes {
  audio: HTMLAudioElement;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
}

const SCALE = 1 / 16;
const REF_DISTANCE = 1;
const MAX_DISTANCE = 25; // ~400 world units — audible a distancia media por el pasillo
const ROLLOFF = 0.8; // Rolloff suave para que se escuche gradualmente a distancia (estilo Gather)

/**
 * WeakMap context → listeners-registered guard. Sin este guard, cada llamada
 * a `ensureAudioContextRunning` agregaba 4 listeners frescos. Si un track
 * remoto llegaba antes del primer gesture, la función se llamaba 2 veces
 * (mount + track recibido), terminando con 8+ listeners simultáneos. Al
 * primer click, browser disparaba `pointerdown` + `pointerup` + `click`
 * sobre TODOS los listeners → 6+ logs idénticos en mismo ms (bug 2026-05-12).
 *
 * WeakMap permite GC del context cuando se destruye sin leak del flag.
 */
const audioContextResumeRegistered = new WeakMap<AudioContext, boolean>();

/**
 * Chrome / Safari crean todos los AudioContext en estado `suspended` hasta que
 * el usuario haya interactuado con la página. Si no llamamos a `ctx.resume()`,
 * el grafo de audio procesa muestras a cero → el participante remoto habla
 * pero no se escucha nada.
 *
 * Esta función intenta reanudar el contexto inmediatamente (si ya hubo gesto)
 * y, como fallback, registra UN solo set de listeners global one-shot en
 * `pointerdown` / `keydown` / `touchstart` / `click` que lo reanuda en la
 * primera interacción.
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
 *      "Resumes the progression of time in an audio context"
 * Ref: https://developer.chrome.com/blog/autoplay#web_audio
 */
function ensureAudioContextRunning(ctx: AudioContext): void {
  if (ctx.state === 'running') return;

  ctx.resume().catch(() => {
    // Si falla es porque todavía no hubo gesto. Esperamos uno.
  });

  if (typeof window === 'undefined') return;

  // Guard: si ya registramos listeners para este contexto, no duplicar.
  // Sin esto, llamadas repetidas a `ensureAudioContextRunning` (mount + cada
  // track remoto nuevo) agregaban 4 listeners adicionales cada una.
  if (audioContextResumeRegistered.get(ctx)) return;
  audioContextResumeRegistered.set(ctx, true);

  /**
   * Flag síncrono para evitar que múltiples eventos del MISMO gesture
   * disparen `ctx.resume()` + log antes de que el cleanup async se complete.
   * Browser sequence típica al hacer click: pointerdown → pointerup → click.
   * Sin este flag, los 3 invocaban resume + log.
   */
  let resumeDispatched = false;

  const cleanup = (): void => {
    window.removeEventListener('pointerdown', resumeOnGesture);
    window.removeEventListener('keydown', resumeOnGesture);
    window.removeEventListener('touchstart', resumeOnGesture);
    window.removeEventListener('click', resumeOnGesture);
  };

  const resumeOnGesture = (): void => {
    if (resumeDispatched) return;
    if (ctx.state === 'running') {
      cleanup();
      return;
    }
    resumeDispatched = true;
    // Cleanup SÍNCRONO antes del resume async — sin esto, los demás eventos
    // del gesture en curso (pointerup, click) re-invocaban la función.
    cleanup();
    ctx.resume()
      .then(() => {
        log.info('AudioContext resumed after user gesture', { state: ctx.state });
      })
      .catch((err) => {
        log.warn('AudioContext resume failed', { error: err instanceof Error ? err.message : String(err) });
      });
  };

  window.addEventListener('pointerdown', resumeOnGesture, { passive: true });
  window.addEventListener('keydown', resumeOnGesture);
  window.addEventListener('touchstart', resumeOnGesture, { passive: true });
  window.addEventListener('click', resumeOnGesture);
}

/**
 * Workaround de Chrome: `createMediaStreamSource` no entrega muestras al grafo
 * de audio a menos que el `MediaStream` esté también anclado a un
 * `HTMLAudioElement` que esté «reproduciendo». El elemento se mantiene en
 * `muted=true` para evitar doble salida (la salida real viene por el
 * `AudioContext`).
 *
 * Ref: https://bugs.chromium.org/p/chromium/issues/detail?id=933677
 */
function forceAudioElementPlayback(audio: HTMLAudioElement): void {
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((err) => {
      // `NotAllowedError` es esperable antes del primer gesto; reintentaremos
      // cuando se monte otra pista o cuando el contexto se reanude.
      if (err?.name !== 'NotAllowedError') {
        log.warn('HTMLAudioElement play() failed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}

export const SpatialAudio: React.FC<SpatialAudioProps> = ({ tracks, usuarios, currentUser, enabled, silenciarAudio = false, speakerDeviceId }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Map<string, AudioNodes>>(new Map());

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      log.info('AudioContext created', { state: audioContextRef.current.state });
    }

    const ctx = audioContextRef.current;
    ensureAudioContextRunning(ctx);

    const nodes = nodesRef.current;

    // Posicionar listener en el usuario actual
    const lx = (currentUser.x || 0) * SCALE;
    const lz = (currentUser.y || 0) * SCALE;
    if (ctx.listener.positionX) {
      ctx.listener.positionX.value = lx;
      ctx.listener.positionY.value = 0;
      ctx.listener.positionZ.value = lz;
    } else {
      ctx.listener.setPosition(lx, 0, lz);
    }

    tracks.forEach((track, usuarioId) => {
      const existing = nodes.get(usuarioId);
      if (existing && existing.stream.getAudioTracks()[0] === track) return;

      if (existing) {
        existing.audio.srcObject = null;
        existing.source.disconnect();
        existing.gain.disconnect();
        existing.panner.disconnect();
        nodes.delete(usuarioId);
      }

      const stream = new MediaStream([track]);
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = true;
      // `playsInline` evita que iOS Safari abra el reproductor fullscreen.
      audio.setAttribute('playsinline', 'true');
      audio.srcObject = stream;
      forceAudioElementPlayback(audio);

      const source = ctx.createMediaStreamSource(stream);
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = REF_DISTANCE;
      panner.maxDistance = MAX_DISTANCE;
      panner.rolloffFactor = ROLLOFF;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 1;

      const gain = ctx.createGain();

      source.connect(panner).connect(gain).connect(ctx.destination);

      nodes.set(usuarioId, { audio, stream, source, panner, gain });

      log.info('Remote audio attached', {
        usuarioId,
        trackId: track.id,
        ctxState: ctx.state,
        totalRemoteAudios: nodes.size,
      });

      // Un track nuevo es una buena oportunidad para reintentar el resume()
      // por si el contexto seguía suspended por falta de gesto.
      ensureAudioContextRunning(ctx);
    });

    nodes.forEach((value, usuarioId) => {
      if (!tracks.has(usuarioId)) {
        value.audio.srcObject = null;
        value.source.disconnect();
        value.gain.disconnect();
        value.panner.disconnect();
        nodes.delete(usuarioId);
      }
    });

    return () => {};
  }, [tracks, currentUser.x, currentUser.y]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    // Actualizar posición del listener
    const lx = (currentUser.x || 0) * SCALE;
    const lz = (currentUser.y || 0) * SCALE;
    if (ctx.listener.positionX) {
      ctx.listener.positionX.value = lx;
      ctx.listener.positionY.value = 0;
      ctx.listener.positionZ.value = lz;
    } else {
      ctx.listener.setPosition(lx, 0, lz);
    }

    const nodes = nodesRef.current;
    usuarios.forEach((usuario) => {
      const nodesEntry = nodes.get(usuario.id);
      if (!nodesEntry) return;

      const ux = (usuario.x || 0) * SCALE;
      const uz = (usuario.y || 0) * SCALE;

      if (nodesEntry.panner.positionX) {
        nodesEntry.panner.positionX.value = ux;
        nodesEntry.panner.positionY.value = 0;
        nodesEntry.panner.positionZ.value = uz;
      } else {
        nodesEntry.panner.setPosition(ux, 0, uz);
      }

      // `silenciarAudio` = usuario local en status no-disponible → sin audio.
      // `enabled` (space3dSettings.spatialAudio) controla si hay *spatialización*,
      // no el volumen: cuando esté apagado seguimos escuchando al remoto pero sin
      // panning/atenuación por distancia. El panner bypass se implementaría
      // reconectando la fuente directamente al destino; de momento preservamos el
      // comportamiento previo para no cambiar la experiencia del usuario.
      nodesEntry.gain.gain.value = silenciarAudio ? 0 : 1;
    });
  }, [usuarios, currentUser.x, currentUser.y, enabled, silenciarAudio]);

  useEffect(() => {
    const ctx = audioContextRef.current as (AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    if (!ctx || typeof ctx.setSinkId !== 'function') {
      return;
    }

    ctx.setSinkId(speakerDeviceId || 'default').catch(() => undefined);
  }, [speakerDeviceId]);

  useEffect(() => {
    return () => {
      nodesRef.current.forEach((value) => {
        value.audio.srcObject = null;
        value.source.disconnect();
        value.gain.disconnect();
        value.panner.disconnect();
      });
      nodesRef.current.clear();
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  return null;
};
