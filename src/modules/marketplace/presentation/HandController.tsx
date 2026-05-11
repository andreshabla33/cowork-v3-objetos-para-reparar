'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useHandTracking } from '@/src/modules/marketplace/presentation/useHandTracking';
import type { HandLandmarkerOutput } from '@/src/core/infrastructure/mediapipe/HandLandmarkerAdapter';

// ═══════════════════════════════════════════════════════════════════
// Hand Gesture Controller v5.0 — MediaPipe Tasks Vision
// One-Euro Filter smoothing + State Machine + adaptive thresholds.
// Adapted from: github.com/andreshabla33/mediapipe3D
// Doc oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
// ═══════════════════════════════════════════════════════════════════

export type GestureType = 'pinch_drag' | 'pinch_zoom' | 'tap' | 'open' | 'fist' | 'two_hands' | 'none';

export interface GestureData {
  x: number;
  y: number;
  pinchDistance: number;
  handedness: 'left' | 'right';
  deltaX: number;
  deltaY: number;
  indexX: number;
  indexY: number;
}

interface HandControllerProps {
  onGesture: (gesture: GestureType, data: GestureData) => void;
  onPointerMove?: (x: number, y: number) => void;
  enabled?: boolean;
}

// ── One-Euro Filter (Meta Quest / Apple Vision Pro standard) ──────
class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, t: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(t - this.tPrev, 0.001);
    this.tPrev = t;
    const dx = (x - this.xPrev) / dt;
    const adx = this.alpha(this.dCutoff, dt);
    const dxSmooth = adx * dx + (1 - adx) * this.dxPrev;
    this.dxPrev = dxSmooth;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmooth);
    const a = this.alpha(cutoff, dt);
    const xSmooth = a * x + (1 - a) * this.xPrev;
    this.xPrev = xSmooth;
    return xSmooth;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

// ── Gesture State Machine ────────────────────────────────────────
type GestureState = 'idle' | 'pinching' | 'dragging' | 'zooming' | 'open_hand' | 'fist_hand' | 'two_hands';

const FRAMES_TO_CONFIRM = 3;
const FRAMES_TO_EXIT = 10;
const PINCH_THRESHOLD = 0.07;
const DRAG_THRESHOLD = 0.006;
const ZOOM_THRESHOLD = 0.035;
const THROTTLE_MS = 50;

const TAP_MAX_DURATION_MS = 400;
const TAP_MAX_MOVEMENT = 0.015;

type Landmark = { x: number; y: number; z: number };

export function HandController({ onGesture, onPointerMove, enabled = true }: HandControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const filterXRef = useRef(new OneEuroFilter(0.4, 0.5, 1.0));
  const filterYRef = useRef(new OneEuroFilter(0.4, 0.5, 1.0));
  const filterDistRef = useRef(new OneEuroFilter(1.5, 0.001, 1.0));

  const stateRef = useRef<GestureState>('idle');
  const candidateRef = useRef<{ state: GestureState; frames: number }>({ state: 'idle', frames: 0 });
  const lastEmitRef = useRef<number>(0);
  const lastGestureRef = useRef<GestureType>('none');

  const prevPosRef = useRef<{ x: number; y: number } | null>(null);
  const prevDistRef = useRef<number>(0);
  const accumZoomRef = useRef<number>(0);
  const accumMoveRef = useRef<number>(0);
  const pinchStartTimeRef = useRef<number>(0);
  const pinchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onPointerMoveRef = useRef(onPointerMove);
  onPointerMoveRef.current = onPointerMove;

  const [handDetected, setHandDetected] = useState(false);
  const [activeGesture, setActiveGesture] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [status, setStatus] = useState<string>('Iniciando...');

  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  const transitionTo = useCallback((target: GestureState): boolean => {
    if (stateRef.current === target) {
      candidateRef.current = { state: target, frames: 0 };
      return true;
    }
    const isSticky = stateRef.current === 'dragging' || stateRef.current === 'zooming';
    const required = isSticky ? FRAMES_TO_EXIT : FRAMES_TO_CONFIRM;
    if (candidateRef.current.state === target) {
      candidateRef.current.frames++;
      if (candidateRef.current.frames >= required) {
        stateRef.current = target;
        candidateRef.current = { state: target, frames: 0 };
        return true;
      }
      return false;
    }
    candidateRef.current = { state: target, frames: 1 };
    return false;
  }, []);

  const emitGesture = useCallback((gesture: GestureType, data: GestureData) => {
    const now = Date.now();
    if (gesture === lastGestureRef.current && now - lastEmitRef.current < THROTTLE_MS) return;
    lastEmitRef.current = now;
    lastGestureRef.current = gesture;
    onGestureRef.current(gesture, data);
  }, []);

  const resetFilters = useCallback(() => {
    filterXRef.current.reset();
    filterYRef.current.reset();
    filterDistRef.current.reset();
    prevPosRef.current = null;
    prevDistRef.current = 0;
    accumZoomRef.current = 0;
    accumMoveRef.current = 0;
  }, []);

  const drawHand = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    width: number,
    height: number,
    state: GestureState
  ) => {
    const color = state === 'dragging' ? '#FF6B35'
      : state === 'zooming' ? '#FFD700'
      : state === 'pinching' ? '#FF9500'
      : '#00FF88';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
    ];
    for (const [i, j] of connections) {
      ctx.beginPath();
      ctx.moveTo(landmarks[i].x * width, landmarks[i].y * height);
      ctx.lineTo(landmarks[j].x * width, landmarks[j].y * height);
      ctx.stroke();
    }
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (state === 'dragging' || state === 'zooming' || state === 'pinching') {
      for (const idx of [4, 8]) {
        ctx.beginPath();
        ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 10, 0, 2 * Math.PI);
        ctx.strokeStyle = state === 'dragging' ? '#FF3333' : '#FFD700';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();
  }, []);

  // ── Camera lifecycle: getUserMedia + stream attach to video element ──
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const setup = async () => {
      try {
        setStatus('Cargando modelo de manos...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al inicializar la cámara');
      }
    };

    setup();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [enabled]);

  // ── Detection results → gesture state machine ──
  const handleResult = useCallback((result: HandLandmarkerOutput) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const hands = result.landmarks;

    if (!hands || hands.length === 0) {
      setHandDetected(false);
      setActiveGesture('');
      if (stateRef.current !== 'idle') {
        stateRef.current = 'idle';
        resetFilters();
      }
      if (lastGestureRef.current !== 'none') {
        emitGesture('none', { x: 0.5, y: 0.5, pinchDistance: 0, handedness: 'right', deltaX: 0, deltaY: 0, indexX: 0.5, indexY: 0.5 });
      }
      return;
    }

    setHandDetected(true);
    const t = performance.now() / 1000;

    // Two hands check
    if (hands.length >= 2) {
      const h1 = hands[0];
      const h2 = hands[1];
      const open1 = [8, 12, 16, 20].every((i) => h1[i].y < h1[i - 2].y);
      const open2 = [8, 12, 16, 20].every((i) => h2[i].y < h2[i - 2].y);
      if (open1 && open2) {
        if (transitionTo('two_hands')) {
          setActiveGesture('Pantalla completa');
          emitGesture('two_hands', { x: 0.5, y: 0.5, pinchDistance: 0, handedness: 'right', deltaX: 0, deltaY: 0, indexX: 0.5, indexY: 0.5 });
        }
        return;
      }
    }

    // Single hand processing
    const lm = hands[0];
    const palmCenter = lm[9];
    const pinchDistRaw = Math.sqrt(
      (lm[8].x - lm[4].x) ** 2 + (lm[8].y - lm[4].y) ** 2
    );
    const fingersUp = [
      lm[8].y < lm[6].y, lm[12].y < lm[10].y,
      lm[16].y < lm[14].y, lm[20].y < lm[18].y
    ];
    const openCount = fingersUp.filter(Boolean).length;

    const sx = filterXRef.current.filter(palmCenter.x, t);
    const sy = filterYRef.current.filter(palmCenter.y, t);
    const sd = filterDistRef.current.filter(pinchDistRaw, t);

    const isPinching = sd < PINCH_THRESHOLD;

    const indexTip = lm[8];
    if (onPointerMoveRef.current) {
      onPointerMoveRef.current(1 - indexTip.x, indexTip.y);
    }

    drawHand(ctx, lm, canvas.width, canvas.height, stateRef.current);

    if (isPinching) {
      if (stateRef.current !== 'pinching' && stateRef.current !== 'dragging' && stateRef.current !== 'zooming') {
        if (transitionTo('pinching')) {
          prevPosRef.current = { x: sx, y: sy };
          prevDistRef.current = sd;
          accumZoomRef.current = 0;
          accumMoveRef.current = 0;
          pinchStartTimeRef.current = Date.now();
          pinchStartPosRef.current = { x: sx, y: sy };
          setActiveGesture('Pellizco');
        }
      } else if (prevPosRef.current) {
        const dx = sx - prevPosRef.current.x;
        const dy = sy - prevPosRef.current.y;
        const movement = Math.sqrt(dx * dx + dy * dy);
        accumMoveRef.current += movement;
        accumZoomRef.current += sd - prevDistRef.current;

        if (stateRef.current === 'dragging') {
          setActiveGesture('Rotando');
          emitGesture('pinch_drag', {
            x: sx, y: sy, pinchDistance: sd, handedness: 'right',
            deltaX: dx, deltaY: dy, indexX: 1 - indexTip.x, indexY: indexTip.y
          });
          accumZoomRef.current = 0;
          accumMoveRef.current = 0;
        } else if (stateRef.current === 'zooming') {
          setActiveGesture('Zoom');
          emitGesture('pinch_zoom', {
            x: sx, y: sy, pinchDistance: sd, handedness: 'right',
            deltaX: 0, deltaY: accumZoomRef.current, indexX: 1 - indexTip.x, indexY: indexTip.y
          });
          accumZoomRef.current = 0;
          accumMoveRef.current = 0;
        } else {
          const movementReady = accumMoveRef.current > DRAG_THRESHOLD;
          const zoomReady = Math.abs(accumZoomRef.current) > ZOOM_THRESHOLD;

          if (movementReady && (!zoomReady || accumMoveRef.current / DRAG_THRESHOLD > Math.abs(accumZoomRef.current) / ZOOM_THRESHOLD)) {
            if (transitionTo('dragging')) {
              setActiveGesture('Rotando');
              emitGesture('pinch_drag', {
                x: sx, y: sy, pinchDistance: sd, handedness: 'right',
                deltaX: dx, deltaY: dy, indexX: 1 - indexTip.x, indexY: indexTip.y
              });
              accumZoomRef.current = 0;
              accumMoveRef.current = 0;
            }
          } else if (zoomReady) {
            if (transitionTo('zooming')) {
              setActiveGesture('Zoom');
              emitGesture('pinch_zoom', {
                x: sx, y: sy, pinchDistance: sd, handedness: 'right',
                deltaX: 0, deltaY: accumZoomRef.current, indexX: 1 - indexTip.x, indexY: indexTip.y
              });
              accumZoomRef.current = 0;
              accumMoveRef.current = 0;
            }
          }
        }

        prevPosRef.current = { x: sx, y: sy };
        prevDistRef.current = sd;
      }
    } else if (stateRef.current === 'pinching') {
      const elapsed = Date.now() - pinchStartTimeRef.current;
      const totalMove = Math.sqrt(
        (sx - pinchStartPosRef.current.x) ** 2 +
        (sy - pinchStartPosRef.current.y) ** 2
      );
      if (elapsed < TAP_MAX_DURATION_MS && totalMove < TAP_MAX_MOVEMENT) {
        stateRef.current = 'idle';
        resetFilters();
        setActiveGesture('Seleccionar');
        const tapData: GestureData = {
          x: sx, y: sy, pinchDistance: sd, handedness: 'right',
          deltaX: 0, deltaY: 0,
          indexX: 1 - indexTip.x, indexY: indexTip.y,
        };
        onGestureRef.current('tap', tapData);
        lastGestureRef.current = 'tap';
        lastEmitRef.current = Date.now();
      } else {
        stateRef.current = 'idle';
        resetFilters();
      }
    } else if (stateRef.current === 'dragging' || stateRef.current === 'zooming') {
      const exitTarget = openCount >= 4 ? 'open_hand' as GestureState : 'fist_hand' as GestureState;
      if (!transitionTo(exitTarget)) {
        if (stateRef.current === 'dragging') {
          emitGesture('pinch_drag', {
            x: sx, y: sy, pinchDistance: sd, handedness: 'right',
            deltaX: 0, deltaY: 0, indexX: 1 - indexTip.x, indexY: indexTip.y
          });
        }
      } else {
        resetFilters();
        setActiveGesture(exitTarget === 'open_hand' ? 'Soltar' : 'Pausa');
        emitGesture(exitTarget === 'open_hand' ? 'open' : 'fist', {
          x: palmCenter.x, y: palmCenter.y, pinchDistance: pinchDistRaw,
          handedness: 'right', deltaX: 0, deltaY: 0, indexX: 1 - indexTip.x, indexY: indexTip.y
        });
      }
    } else if (openCount >= 4) {
      if (transitionTo('open_hand')) {
        resetFilters();
        setActiveGesture('Soltar');
        emitGesture('open', {
          x: palmCenter.x, y: palmCenter.y, pinchDistance: pinchDistRaw,
          handedness: 'right', deltaX: 0, deltaY: 0, indexX: 1 - indexTip.x, indexY: indexTip.y
        });
      }
    } else {
      if (transitionTo('fist_hand')) {
        resetFilters();
        setActiveGesture('Pausa');
        emitGesture('fist', {
          x: palmCenter.x, y: palmCenter.y, pinchDistance: pinchDistRaw,
          handedness: 'right', deltaX: 0, deltaY: 0, indexX: 1 - indexTip.x, indexY: indexTip.y
        });
      }
    }
  }, [transitionTo, emitGesture, drawHand, resetFilters]);

  // ── Hand-tracking driver (init adapter + rAF loop). ──
  const { ready, error: trackingError } = useHandTracking({
    videoRef,
    enabled,
    onResult: handleResult,
  });

  useEffect(() => {
    if (trackingError) setError(trackingError);
  }, [trackingError]);

  useEffect(() => {
    if (ready) setStatus('');
  }, [ready]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
      <div className="relative w-64 h-48 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl shadow-black/50 bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <div className={`absolute bottom-0 left-0 right-0 px-3 py-1.5 text-center text-xs font-bold backdrop-blur-sm ${
          error ? 'bg-red-500/80 text-white' :
          handDetected ? 'bg-green-500/80 text-white' :
          status ? 'bg-yellow-500/80 text-black' :
          'bg-zinc-900/80 text-zinc-400'
        }`}>
          {error
            ? `⚠️ ${error}`
            : status
              ? `⏳ ${status}`
              : handDetected
                ? `✋ ${activeGesture || 'Mano detectada'}`
                : '👤 Esperando mano...'}
        </div>
      </div>
    </div>
  );
}
