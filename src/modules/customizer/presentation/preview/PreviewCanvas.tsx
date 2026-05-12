/**
 * @module customizer/preview/PreviewCanvas
 * @description Reusable R3F Canvas wrapper for 3D previews.
 * Handles WebGL lifecycle, capture bridge, and Suspense.
 *
 * Clean Architecture: Infrastructure (Presentation) — R3F rendering primitive.
 * Ref: R3F docs — Canvas is the root, components inside manage their own state.
 * Ref: Three.js dispose guide — forceContextLoss + dispose on unmount.
 */

import React, { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';

/** Captures current frame as PNG blob when captureToken changes. */
const PreviewCaptureBridge = ({
  captureToken,
  onCapture,
}: {
  captureToken: number | null;
  onCapture: (blob: Blob) => void;
}) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (captureToken === null) return;
    let cancelled = false;

    const capture = () => {
      gl.render(scene, camera);
      gl.domElement.toBlob((blob) => {
        if (!cancelled && blob) onCapture(blob);
      }, 'image/png');
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(capture);
    } else {
      capture();
    }

    return () => { cancelled = true; };
  }, [camera, captureToken, gl, onCapture, scene]);

  return null;
};

/**
 * Cleans up WebGL context on unmount to prevent memory leaks.
 *
 * Dispose order (Three.js r170+ best practice):
 *   1. gl.dispose() — libera texturas, geometrías, programas internos de Three.js
 *   2. forceContextLoss() — libera el contexto WebGL del navegador (slot GPU)
 *
 * Guard layered:
 *   - isContextLost() check evita el path obvio
 *   - try/catch absorbe el edge case donde getContext() reporta sano pero la
 *     extensión WEBGL_lose_context ya considera el context dead. Sin esto se
 *     loggea "INVALID_OPERATION: loseContext: context already lost" en
 *     unmount durante presión GPU (logs 2026-05-12).
 */
const PreviewRendererLifecycle = () => {
  const { gl } = useThree();

  useEffect(() => {
    return () => {
      gl.dispose();

      const ctx = gl.getContext();
      const isAlreadyLost = ctx && typeof ctx.isContextLost === 'function' && ctx.isContextLost();

      if (!isAlreadyLost && typeof gl.forceContextLoss === 'function') {
        try {
          gl.forceContextLoss();
        } catch {
          // Race: context murió entre el check y el call (raro bajo presión GPU).
          // Benign — el slot se libera de igual forma cuando el GC corra.
        }
      }
    };
  }, [gl]);

  return null;
};

export interface PreviewCanvasProps {
  cameraFov: number;
  cameraPosition: [number, number, number];
  captureToken: number | null;
  children: React.ReactNode;
  fallback: React.ReactNode;
  onCapture: (blob: Blob) => void;
  frameloop?: 'always' | 'demand';
  pixelRatio?: number | [number, number];
  powerPreference?: WebGLPowerPreference;
  shadows?: boolean;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  cameraFov,
  cameraPosition,
  captureToken,
  children,
  fallback,
  onCapture,
  frameloop = 'demand',
  pixelRatio = [1, 1.5],
  powerPreference = 'high-performance',
  shadows = false,
}) => (
  <Canvas
    frameloop={frameloop}
    shadows={shadows}
    dpr={pixelRatio}
    camera={{ position: cameraPosition, fov: cameraFov }}
    gl={{ alpha: true, antialias: true, powerPreference, failIfMajorPerformanceCaveat: false }}
    onCreated={({ gl }) => { gl.setClearColor('#000000', 0); }}
  >
    <PreviewRendererLifecycle />
    <PreviewCaptureBridge captureToken={captureToken} onCapture={onCapture} />
    <Suspense fallback={fallback}>{children}</Suspense>
  </Canvas>
);
