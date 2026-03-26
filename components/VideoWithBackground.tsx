import React, { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react';
import type { IBackgroundSegmenter } from '@/src/core/domain/ports/IBackgroundSegmenter';
import type { IBackgroundCompositor } from '@/src/core/domain/ports/IBackgroundCompositor';
import { MediaPipeSegmenterAdapter } from '@/src/core/infrastructure/MediaPipeSegmenterAdapter';
import { WebGLBackgroundCompositor } from '@/src/core/infrastructure/WebGLBackgroundCompositor';
import { Canvas2DBackgroundCompositor } from '@/src/core/infrastructure/Canvas2DBackgroundCompositor';

export type BackgroundEffectType = 'none' | 'blur' | 'image';

/**
 * Target FPS for background processing.
 * 15 FPS is the industry standard for virtual backgrounds (Google Meet uses 15-20).
 * This balances visual quality with CPU/GPU load.
 */
const TARGET_FPS = 15;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

/**
 * Grace period (ms) between notifying the parent that the canvas stream is gone
 * and actually stopping the canvas stream tracks.
 * This gives LiveKit's replaceTrack() time to swap in the raw video track before
 * the canvas-captured track ends, preventing a black-screen flash.
 */
const TRACK_REPLACEMENT_GRACE_PERIOD_MS = 500;

interface VideoWithBackgroundProps {
  stream: MediaStream | null;
  effectType: BackgroundEffectType;
  backgroundImage?: string | null;
  blurAmount?: number;
  muted?: boolean;
  className?: string;
  onProcessedStreamReady?: (stream: MediaStream | null) => void;
  mirrorVideo?: boolean;
}

/**
 * Detect if WebGL is available for the compositor
 */
function supportsWebGL(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * VideoWithBackground — Clean Architecture Refactor v2
 * ═══════════════════════════════════════════════════════
 * 
 * Architecture:
 *   [VideoWithBackground] → depends on → [IBackgroundSegmenter] (port)
 *                         → depends on → [IBackgroundCompositor] (port)
 * 
 * Infrastructure (injected at initialization):
 *   - MediaPipeSegmenterAdapter (GPU-accelerated, 25% resolution inference)
 *   - WebGLBackgroundCompositor (single-pass shader blur) or Canvas2DBackgroundCompositor (fallback)
 * 
 * Bug fixes v2 (Mar 2026):
 *   1. Pipeline NO se destruye al cambiar effectType → solo updateConfig()
 *   2. onProcessedStreamReady se llama DESPUÉS del primer frame renderizado
 *   3. effectType removido de las dependencias del useEffect de pipeline
 *      para evitar destroy/recreate innecesario que causa pantalla negra
 */
export const VideoWithBackground = memo(({
  stream,
  effectType,
  backgroundImage,
  blurAmount = 10,
  muted = false,
  className = '',
  onProcessedStreamReady,
  mirrorVideo = false,
}: VideoWithBackgroundProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const segmenterRef = useRef<IBackgroundSegmenter | null>(null);
  const compositorRef = useRef<IBackgroundCompositor | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
  const firstFrameNotifiedRef = useRef(false);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const onProcessedStreamReadyRef = useRef(onProcessedStreamReady);
  onProcessedStreamReadyRef.current = onProcessedStreamReady;
  const effectTypeRef = useRef(effectType);
  effectTypeRef.current = effectType;
  const blurAmountRef = useRef(blurAmount);
  blurAmountRef.current = blurAmount;
  const mirrorVideoRef = useRef(mirrorVideo);
  mirrorVideoRef.current = mirrorVideo;
  const [isInitialized, setIsInitialized] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);

  // ─── Stable stream signature — only video tracks matter for background effects ─
  const streamSignature = useMemo(() => {
    if (!stream) return null;
    const videoTracks = stream.getVideoTracks();
    const trackIds = videoTracks
      .map(t => `${t.id}:${t.enabled}:${t.readyState}:${t.muted}`)
      .join('|');
    const signature = trackIds || 'no-video';
    console.log('[VideoWithBackground] Stream signature:', signature.substring(0, 100));
    return signature;
  }, [stream]);

  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Load background image ─────────────────────────────────────────
  const backgroundBitmapRef = useRef<ImageBitmap | null>(null);

  useEffect(() => {
    if (!backgroundImage || effectType !== 'image') {
      backgroundBitmapRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        backgroundBitmapRef.current = bitmap;
        compositorRef.current?.setBackgroundImage(bitmap);
      } catch {
        backgroundBitmapRef.current = null;
      }
    };
    img.src = backgroundImage;
  }, [backgroundImage, effectType]);

  // ─── Update compositor config on prop changes (NO pipeline restart) ─
  useEffect(() => {
    if (!compositorRef.current?.isReady) return;
    compositorRef.current.updateConfig({
      effectType: effectType as 'blur' | 'image',
      blurRadius: blurAmount,
      mirror: mirrorVideo,
    });
    console.log('[BG-FX] Config updated (no pipeline restart):', { effectType, blurAmount, mirrorVideo });
  }, [effectType, blurAmount, mirrorVideo]);

  // ─── Main pipeline — processes one frame and defers stream notification ─
  const processFrame = useCallback(() => {
    if (processingRef.current) return;
    const video = videoRef.current;
    const segmenter = segmenterRef.current;
    const compositor = compositorRef.current;
    if (!video || !segmenter?.isReady || !compositor?.isReady) return;
    if (video.readyState < 2) return;

    processingRef.current = true;

    try {
      const timestampMs = performance.now();

      const mask = segmenter.segment(video, timestampMs);
      if (!mask) {
        processingRef.current = false;
        return;
      }

      compositor.composite(video, mask.data, mask.width, mask.height);

      // ─── Defer processed stream notification until first frame is rendered ─
      // This prevents LiveKit from receiving an empty/black canvas track.
      // Industry best practice: Google Meet / Zoom wait for the first composited
      // frame before swapping the published track.
      if (!firstFrameNotifiedRef.current && canvasStreamRef.current) {
        firstFrameNotifiedRef.current = true;
        processedStreamRef.current = canvasStreamRef.current;
        onProcessedStreamReadyRef.current?.(canvasStreamRef.current);
        console.log('[BG-FX] First frame rendered, notifying parent with processed stream');
      }
    } catch {
      // Individual frame errors are expected during camera transitions
    }

    processingRef.current = false;
  }, []);

  // ─── Lifecycle logging ──────────────────────────────────────────────
  useEffect(() => {
    console.log('[VideoWithBackground] COMPONENT MOUNTED');
    return () => {
      console.log('[VideoWithBackground] COMPONENT UNMOUNTED');
    };
  }, []);

  // ─── Initialize pipeline (depends ONLY on stream, NOT effectType) ──
  // effectType changes are handled by updateConfig above without destroying
  // the pipeline. This eliminates the black screen flash when switching effects.
  useEffect(() => {
    console.log('[VideoWithBackground] INIT useEffect triggered, streamSignature:', streamSignature?.substring(0, 50));
    if (!stream) {
      console.log('[VideoWithBackground] Early return - no stream');
      setShowCanvas(false);
      setIsInitialized(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      const video = videoRef.current;
      if (!video) {
        if (mounted) setTimeout(init, 100);
        return;
      }

      if (!video.srcObject) {
        console.log('[VideoWithBackground] Video has no srcObject, retrying in 100ms...');
        if (mounted) setTimeout(init, 100);
        return;
      }

      // Wait for video dimensions with timeout
      let attempts = 0;
      const maxAttempts = 50;
      while (video.videoWidth === 0 && attempts < maxAttempts && mounted) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!mounted) return;

      if (video.videoWidth === 0) {
        console.error('[VideoWithBackground] Video dimensions not available after timeout');
        return;
      }

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;

      // ─── Inject Infrastructure (Dependency Injection) ───────────
      const segmenter = new MediaPipeSegmenterAdapter();
      await segmenter.initialize({
        preferGPU: true,
        inferenceScale: 0.25,
      });

      if (!mounted) {
        segmenter.dispose();
        return;
      }
      segmenterRef.current = segmenter;

      let compositor: IBackgroundCompositor;
      if (supportsWebGL()) {
        compositor = new WebGLBackgroundCompositor();
      } else {
        compositor = new Canvas2DBackgroundCompositor();
        console.warn('[BG-FX] WebGL not available, using Canvas2D fallback');
      }

      // Use current effectType ref (not stale closure) for initial config
      await compositor.initialize({
        width: w,
        height: h,
        effectType: effectTypeRef.current as 'blur' | 'image',
        blurRadius: blurAmountRef.current,
        mirror: mirrorVideoRef.current,
      });

      if (!mounted) {
        compositor.dispose();
        segmenter.dispose();
        return;
      }
      compositorRef.current = compositor;

      if (backgroundBitmapRef.current) {
        compositor.setBackgroundImage(backgroundBitmapRef.current);
      }

      // ─── Mount compositor canvas to DOM ─────────────────────────
      const compositorCanvas = compositor.getCanvas() as HTMLCanvasElement;
      outputCanvasRef.current = compositorCanvas;

      compositorCanvas.className = 'w-full h-full object-cover';
      compositorCanvas.style.display = 'block';

      if (containerRef.current) {
        const existing = containerRef.current.querySelector('canvas.bg-fx-canvas');
        if (existing) existing.remove();
        compositorCanvas.classList.add('bg-fx-canvas');
        containerRef.current.appendChild(compositorCanvas);
      }

      // ─── Create canvas stream but DON'T notify parent yet ───────
      // The parent will be notified after the first frame is rendered
      // in processFrame(). This prevents LiveKit from publishing an
      // empty/black canvas track.
      const newCanvasStream = compositorCanvas.captureStream(TARGET_FPS);
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => newCanvasStream.addTrack(track.clone()));
      canvasStreamRef.current = newCanvasStream;
      firstFrameNotifiedRef.current = false;

      // ─── Start processing loop ──────────────────────────────────
      timerRef.current = setInterval(processFrame, FRAME_INTERVAL_MS);

      if (mounted) {
        setIsInitialized(true);
        setShowCanvas(true);
        console.log('[BG-FX] Pipeline ready (waiting for first frame before notifying parent):', {
          segmenter: 'MediaPipe GPU @25%',
          compositor: supportsWebGL() ? 'WebGL shader' : 'Canvas2D fallback',
          fps: TARGET_FPS,
          resolution: `${w}×${h}`,
        });
      }
    };

    void init();

    return () => {
      mounted = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const streamToStop = processedStreamRef.current || canvasStreamRef.current;
      processedStreamRef.current = null;
      canvasStreamRef.current = null;
      firstFrameNotifiedRef.current = false;
      onProcessedStreamReadyRef.current?.(null);

      segmenterRef.current?.dispose();
      segmenterRef.current = null;

      compositorRef.current?.dispose();
      compositorRef.current = null;

      if (containerRef.current) {
        const canvas = containerRef.current.querySelector('canvas.bg-fx-canvas');
        if (canvas) canvas.remove();
      }
      outputCanvasRef.current = null;

      if (streamToStop) {
        window.setTimeout(() => {
          streamToStop.getTracks().forEach(t => t.stop());
        }, TRACK_REPLACEMENT_GRACE_PERIOD_MS);
      }

      setIsInitialized(false);
    };
  }, [streamSignature]); // effectType removed — handled by updateConfig

  // ─── Update video source ───────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    return () => {
      if (video) video.srcObject = null;
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden video element — source for segmentation */}
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        className={`w-full h-full object-cover ${showCanvas && effectType !== 'none' ? 'hidden' : ''}`}
      />

      {/* Compositor canvas is appended programmatically by the init logic */}

      {/* Loading indicator */}
      {effectType !== 'none' && !isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-white/70">Cargando efecto...</span>
          </div>
        </div>
      )}
    </div>
  );
});

VideoWithBackground.displayName = 'VideoWithBackground';

export default VideoWithBackground;
