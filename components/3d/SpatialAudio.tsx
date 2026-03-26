'use client';

import React, { useEffect, useRef } from 'react';
import type { User } from '@/types';

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
const ROLLOFF = 0.8; // Rolloff suave para que se escuche gradualment a distancia (estilo Gather)

export const SpatialAudio: React.FC<SpatialAudioProps> = ({ tracks, usuarios, currentUser, enabled, silenciarAudio = false, speakerDeviceId }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Map<string, AudioNodes>>(new Map());

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;
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
      audio.srcObject = stream;

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

      nodesEntry.gain.gain.value = silenciarAudio ? 0 : enabled ? 1 : 1;
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
