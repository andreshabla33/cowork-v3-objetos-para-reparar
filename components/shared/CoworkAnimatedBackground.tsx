/**
 * @module components/shared/CoworkAnimatedBackground
 * @description Capa de fondo animada compartida — toma la estética del
 * LoginScreen (grid + celdas + orbes + partículas + conectores + corner
 * labels) y la expone como un layer reutilizable que se monta dentro de
 * un contenedor `relative`.
 *
 * Las clases usan el prefijo `cwbg-` para no chocar con el resto del
 * design system y con las clases `lc-` que usa LoginScreen.
 */

'use client';

import React, { useEffect, useRef } from 'react';

interface CoworkAnimatedBackgroundProps {
  /**
   * Cómo se posiciona el layer:
   *  - `absolute` (default): se ancla dentro del padre `relative`. Útil
   *    para páginas que ya viven dentro de un layout (ej. Dashboard).
   *  - `fixed`: ocupa toda la viewport — útil para overlays full-screen.
   */
  positioning?: 'absolute' | 'fixed';
  /** Mostrar las etiquetas decorativas en las esquinas. */
  showCornerLabels?: boolean;
  cornerLabel?: string;
  cornerMeta?: string;
  /** Activa parallax sutil de orbes/celdas/partículas con el ratón. */
  enableParallax?: boolean;
  className?: string;
}

export const CoworkAnimatedBackground: React.FC<CoworkAnimatedBackgroundProps> = ({
  positioning = 'absolute',
  showCornerLabels = true,
  cornerLabel = 'COWORK · v2.4',
  cornerMeta = 'VIRTUAL HUB · ONLINE',
  enableParallax = true,
  className = '',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enableParallax) return;
    const root = rootRef.current;
    if (!root) return;
    const layers = root.querySelectorAll<HTMLElement>('.cwbg-orb, .cwbg-cell, .cwbg-particle');
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      tx += (mx - tx) * 0.04;
      ty += (my - ty) * 0.04;
      layers.forEach((el, i) => {
        const depth = ((i % 4) + 1) * 6;
        el.style.translate = `${tx * depth}px ${ty * depth}px`;
      });
      raf = requestAnimationFrame(tick);
    };
    document.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [enableParallax]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`cwbg-root cwbg-${positioning} ${className}`}
    >
      <div className="cwbg-grid-bg" />

      <svg className="cwbg-connector" preserveAspectRatio="none" viewBox="0 0 1440 900" aria-hidden>
        <path d="M 100 200 Q 400 100, 700 300 T 1340 250" />
        <path d="M 80 700 Q 300 600, 600 750 T 1360 680" />
        <path d="M 1200 100 Q 1100 400, 1300 600" />
      </svg>

      <div className="cwbg-orb cwbg-orb-1" />
      <div className="cwbg-orb cwbg-orb-2" />
      <div className="cwbg-orb cwbg-orb-3" />

      <div className="cwbg-cell cwbg-c1" />
      <div className="cwbg-cell cwbg-c2" />
      <div className="cwbg-cell cwbg-c3" />
      <div className="cwbg-cell cwbg-c4" />
      <div className="cwbg-cell cwbg-c5" />
      <div className="cwbg-cell cwbg-c6" />
      <div className="cwbg-cell cwbg-c7" />
      <div className="cwbg-cell cwbg-c8" />
      <div className="cwbg-cell cwbg-c9" />

      <div className="cwbg-particle cwbg-p1" />
      <div className="cwbg-particle cwbg-p2" />
      <div className="cwbg-particle cwbg-p3" />
      <div className="cwbg-particle cwbg-p4" />
      <div className="cwbg-particle cwbg-p5" />
      <div className="cwbg-particle cwbg-p6" />

      {showCornerLabels && (
        <>
          <div className="cwbg-corner-label">
            <span className="cwbg-square" />
            <span>{cornerLabel}</span>
          </div>
          <div className="cwbg-corner-meta">{cornerMeta}</div>
        </>
      )}

      <style>{CWBG_CSS}</style>
    </div>
  );
};

const CWBG_CSS = `
.cwbg-root {
  pointer-events: none;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
  --cwbg-blue-500: #2E96F5;
  --cwbg-blue-600: #1E86E5;
  --cwbg-blue-400: #4FB0FF;
  --cwbg-blue-300: #8BC9FF;
  --cwbg-ink-400: #6B83A0;
  --cwbg-ink-500: #4A6485;
  background:
    radial-gradient(ellipse at 20% 10%, #EAF4FF 0%, transparent 55%),
    radial-gradient(ellipse at 90% 90%, #DCEBFF 0%, transparent 50%),
    linear-gradient(180deg, #F5FAFF 0%, #ECF4FF 100%);
}
.cwbg-absolute { position: absolute; inset: 0; z-index: 0; }
.cwbg-fixed { position: fixed; inset: 0; z-index: 0; }
.cwbg-root *, .cwbg-root *::before, .cwbg-root *::after { box-sizing: border-box; pointer-events: none; }

/* ===== GRID ===== */
.cwbg-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(46, 150, 245, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(46, 150, 245, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 100%);
          mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 100%);
  animation: cwbg-grid-drift 30s linear infinite;
}
@keyframes cwbg-grid-drift {
  from { background-position: 0 0, 0 0; }
  to   { background-position: 56px 56px, 56px 56px; }
}

/* ===== CELLS ===== */
.cwbg-cell {
  position: absolute;
  width: 56px; height: 56px;
  background: linear-gradient(135deg, rgba(46, 150, 245, 0.18), rgba(46, 150, 245, 0.04));
  border: 1px solid rgba(46, 150, 245, 0.18);
  border-radius: 4px;
  animation: cwbg-cell-pulse 4s ease-in-out infinite;
}
.cwbg-c1 { top: 18%; left: 14%; animation-delay: 0s; }
.cwbg-c2 { top: 28%; left: 22%; animation-delay: 1.2s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
.cwbg-c3 { top: 70%; left: 18%; animation-delay: .6s; }
.cwbg-c4 { top: 22%; right: 14%; animation-delay: 2s; }
.cwbg-c5 { top: 60%; right: 10%; animation-delay: 1.6s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
.cwbg-c6 { top: 78%; right: 22%; animation-delay: .3s; }
.cwbg-c7 { top: 38%; left: 8%;  animation-delay: 2.4s; }
.cwbg-c8 { top: 12%; left: 46%; animation-delay: 1.9s; }
.cwbg-c9 { top: 84%; left: 50%; animation-delay: .9s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
@keyframes cwbg-cell-pulse {
  0%, 100% { opacity: .4; transform: scale(1); }
  50%      { opacity: 1;  transform: scale(1.05); }
}

/* ===== ORBS ===== */
.cwbg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: .7;
}
.cwbg-orb-1 {
  width: 420px; height: 420px;
  background: radial-gradient(circle, #6FBBFF 0%, transparent 70%);
  top: -120px; left: -120px;
  animation: cwbg-orb-1 18s ease-in-out infinite;
}
.cwbg-orb-2 {
  width: 380px; height: 380px;
  background: radial-gradient(circle, #A8D6FF 0%, transparent 70%);
  bottom: -120px; right: -100px;
  animation: cwbg-orb-2 22s ease-in-out infinite;
}
.cwbg-orb-3 {
  width: 280px; height: 280px;
  background: radial-gradient(circle, #4FB0FF 0%, transparent 70%);
  top: 40%; left: 60%;
  opacity: .35;
  animation: cwbg-orb-3 26s ease-in-out infinite;
}
@keyframes cwbg-orb-1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,80px) scale(1.1); } }
@keyframes cwbg-orb-2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-80px,-60px) scale(1.15); } }
@keyframes cwbg-orb-3 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-100px,40px); } }

/* ===== PARTICLES ===== */
.cwbg-particle {
  position: absolute;
  width: 6px; height: 6px;
  background: var(--cwbg-blue-500);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(46, 150, 245, 0.6);
}
.cwbg-p1 { top: 20%; left: 30%; animation: cwbg-particle 8s ease-in-out infinite; }
.cwbg-p2 { top: 70%; left: 80%; width: 4px; height: 4px; animation: cwbg-particle 11s ease-in-out infinite reverse; }
.cwbg-p3 { top: 40%; left: 12%; width: 8px; height: 8px; animation: cwbg-particle 9s ease-in-out infinite; animation-delay: 2s; }
.cwbg-p4 { top: 85%; left: 35%; width: 5px; height: 5px; animation: cwbg-particle 13s ease-in-out infinite; animation-delay: 1s; }
.cwbg-p5 { top: 15%; left: 78%; width: 7px; height: 7px; animation: cwbg-particle 10s ease-in-out infinite reverse; animation-delay: 3s; }
.cwbg-p6 { top: 55%; left: 88%; width: 4px; height: 4px; animation: cwbg-particle 14s ease-in-out infinite; }
@keyframes cwbg-particle {
  0%, 100% { transform: translate(0, 0); opacity: .4; }
  50%      { transform: translate(40px, -60px); opacity: 1; }
}

/* ===== CONNECTORS ===== */
.cwbg-connector {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  opacity: .5;
}
.cwbg-connector path {
  fill: none;
  stroke: rgba(46, 150, 245, 0.3);
  stroke-width: 1;
  stroke-dasharray: 4 6;
  animation: cwbg-dash-flow 20s linear infinite;
}
@keyframes cwbg-dash-flow { to { stroke-dashoffset: -200; } }

/* ===== CORNER LABELS ===== */
.cwbg-corner-label {
  position: absolute;
  top: 24px; left: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--cwbg-ink-400);
  text-transform: uppercase;
  animation: cwbg-fade-up 0.7s 0.1s both;
}
.cwbg-corner-label .cwbg-square {
  width: 10px; height: 10px;
  background: var(--cwbg-blue-500);
  border-radius: 2px;
  box-shadow: 0 0 0 3px rgba(46, 150, 245, 0.18);
}
.cwbg-corner-meta {
  position: absolute;
  bottom: 24px; right: 28px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--cwbg-ink-400);
  text-transform: uppercase;
  animation: cwbg-fade-up 0.7s 0.1s both;
}

/* ===== SHARED KEYFRAMES (re-utilizables fuera del bg) ===== */
@keyframes cwbg-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cwbg-spin { to { transform: rotate(360deg); } }
@keyframes cwbg-logo-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

/* ===== MOBILE ===== */
@media (max-width: 720px) {
  .cwbg-corner-label, .cwbg-corner-meta { display: none; }
}
`;
