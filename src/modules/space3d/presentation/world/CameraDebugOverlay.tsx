'use client';
/**
 * @module space3d/world/CameraDebugOverlay
 *
 * HUD diagnóstico de OrbitControls — muestra distance / maxDistance / mode
 * en tiempo real. Solo se monta cuando la URL tiene `?camDebug=1`.
 *
 * USO: añadir `?camDebug=1` a la URL del browser y recargar. Ver el HUD
 * arriba a la izquierda. Permite confirmar si el fix de `maxDistance` está
 * efectivo: hacer scroll-wheel hasta el tope y observar `dist`.
 *
 * Si `dist` supera `max`, el clamp absoluto del CameraFollow está fallando.
 * Si `dist === max` y no sube, el clamp funciona correctamente.
 *
 * Clean Architecture: Presentation R3F-only. Cero deps de Domain/App.
 * Lee `controls.getDistance/maxDistance` via ref. useFrame canónico.
 *
 * Refs:
 *  - https://drei.docs.pmnd.rs/misc/html
 *  - https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export interface CameraDebugOverlayProps {
  orbitControlsRef: React.MutableRefObject<OrbitControlsType | null>;
}

const ENABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('camDebug') === '1';

export const CameraDebugOverlay: React.FC<CameraDebugOverlayProps> = ({
  orbitControlsRef,
}) => {
  const distRef = useRef<HTMLSpanElement | null>(null);
  const maxRef = useRef<HTMLSpanElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);

  useFrame(() => {
    if (!ENABLED) return;
    const controls = orbitControlsRef.current;
    if (!controls) return;
    const dist = controls.getDistance();
    const max = controls.maxDistance;
    if (distRef.current) distRef.current.textContent = dist.toFixed(2);
    if (maxRef.current) maxRef.current.textContent = Number.isFinite(max) ? max.toFixed(2) : '∞';
    if (statusRef.current) {
      const epsilon = 0.05;
      const atLimit = Number.isFinite(max) && dist >= max - epsilon;
      const overLimit = Number.isFinite(max) && dist > max + epsilon;
      statusRef.current.textContent = overLimit ? '⚠ OVER' : atLimit ? '🔒 LOCKED' : '✓ OK';
      statusRef.current.style.color = overLimit ? '#ef4444' : atLimit ? '#fbbf24' : '#10b981';
    }
  });

  if (!ENABLED) return null;

  return (
    <Html
      fullscreen
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 12,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          lineHeight: 1.5,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.15)',
          minWidth: 180,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#a5b4fc' }}>
          🎥 Cam Debug (?camDebug=1)
        </div>
        <div>
          dist:&nbsp;<span ref={distRef} style={{ color: '#fbbf24' }}>—</span>&nbsp;m
        </div>
        <div>
          max:&nbsp;&nbsp;<span ref={maxRef} style={{ color: '#a8d8e8' }}>—</span>&nbsp;m
        </div>
        <div>
          status: <span ref={statusRef} style={{ color: '#10b981' }}>—</span>
        </div>
      </div>
    </Html>
  );
};

CameraDebugOverlay.displayName = 'CameraDebugOverlay';
