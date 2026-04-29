/**
 * @module components/LoginScreen
 * @description Pantalla de inicio de sesión — diseño "Cowork Login" (handoff 2026-04-28).
 *
 * Mantiene la lógica real (useLoginAuth → use cases → Supabase) y solo cambia la
 * presentación: fondo animado (grid + celdas + orbes + partículas + conectores),
 * card glassmorphism, parallax sutil con el ratón, badges flotantes y meta en
 * esquinas. Las clases están aisladas con prefijo `lc-` para no colisionar con
 * el resto del design system.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { useLoginAuth } from '../hooks/auth/useLoginAuth';

export const LoginScreen: React.FC = () => {
  const {
    email, setEmail,
    password, setPassword,
    fullName, setFullName,
    loading,
    isRegister, setIsRegister,
    error, setError,
    showHelp, setShowHelp,
    showForgot, setShowForgot,
    invitacionBanner,
    authFeedback, setAuthFeedback,
    handleGuestLogin,
    handleGoogleLogin,
    handleEmailAuth,
  } = useLoginAuth();

  const [showPwd, setShowPwd] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Parallax (orbes / celdas / partículas siguen el ratón con easing).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const layers = root.querySelectorAll<HTMLElement>('.lc-orb, .lc-cell, .lc-particle');
    let mx = 0, my = 0, tx = 0, ty = 0, raf = 0;
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
  }, []);

  if (showForgot) {
    return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;
  }

  return (
    <div ref={rootRef} className="lc-root">
      {/* ── Fondo animado ────────────────────────────────────────────── */}
      <div className="lc-grid-bg" />

      <svg className="lc-connector" preserveAspectRatio="none" viewBox="0 0 1440 900" aria-hidden>
        <path d="M 100 200 Q 400 100, 700 300 T 1340 250" />
        <path d="M 80 700 Q 300 600, 600 750 T 1360 680" />
        <path d="M 1200 100 Q 1100 400, 1300 600" />
      </svg>

      <div className="lc-orb lc-orb-1" />
      <div className="lc-orb lc-orb-2" />
      <div className="lc-orb lc-orb-3" />

      <div className="lc-cell lc-c1" />
      <div className="lc-cell lc-c2" />
      <div className="lc-cell lc-c3" />
      <div className="lc-cell lc-c4" />
      <div className="lc-cell lc-c5" />
      <div className="lc-cell lc-c6" />
      <div className="lc-cell lc-c7" />
      <div className="lc-cell lc-c8" />
      <div className="lc-cell lc-c9" />

      <div className="lc-particle lc-p1" />
      <div className="lc-particle lc-p2" />
      <div className="lc-particle lc-p3" />
      <div className="lc-particle lc-p4" />
      <div className="lc-particle lc-p5" />
      <div className="lc-particle lc-p6" />

      {/* ── Esquinas (metadata) ──────────────────────────────────────── */}
      <div className="lc-corner-label">
        <span className="lc-square" />
        <span>COWORK · v2.4</span>
      </div>
      <div className="lc-corner-meta">SECURE · ENCRYPTED CHANNEL</div>

      {/* ── Badges flotantes ─────────────────────────────────────────── */}
      <div className="lc-float-badge lc-fb-1">
        <span className="lc-dot" />
        <span><b>2,418</b> personas conectadas</span>
      </div>

      <div className="lc-float-badge lc-fb-2">
        <div className="lc-avatar-stack">
          <div>MR</div>
          <div>JL</div>
          <div>+9</div>
        </div>
        <span>Tu equipo te espera</span>
      </div>

      <div className="lc-float-badge lc-fb-3">
        <span className="lc-dot lc-dot-blue" />
        <span>Última conexión <b>hace 2 días</b></span>
      </div>

      {/* ── Card ─────────────────────────────────────────────────────── */}
      <div className="lc-stage">
        <div className="lc-card">
          <div className="lc-brand">
            <div className="lc-logo">C</div>
            <h1>COWORK</h1>
            <div className="lc-tag">Virtual Collaboration Hub</div>
          </div>

          {invitacionBanner && (
            <div className="lc-banner lc-banner-info">
              <span aria-hidden>🎉</span>
              <div>
                <p className="lc-banner-title">
                  {invitacionBanner.invitadorNombre ? `${invitacionBanner.invitadorNombre} te invitó` : 'Te invitaron'} a <b>{invitacionBanner.espacioNombre}</b>
                </p>
                <p className="lc-banner-sub">
                  Crea tu cuenta con <span>{invitacionBanner.email}</span> usando Google o el formulario de abajo.
                </p>
              </div>
            </div>
          )}

          {authFeedback && (
            <div className={`lc-banner ${authFeedback.type === 'error' ? 'lc-banner-error' : 'lc-banner-success'}`}>
              <span className="lc-banner-tag">{authFeedback.type === 'error' ? '!' : '✓'}</span>
              <p className="lc-banner-title" style={{ flex: 1 }}>{authFeedback.message}</p>
              <button
                type="button"
                className="lc-banner-close"
                onClick={() => setAuthFeedback(null)}
                aria-label="Cerrar"
              >×</button>
            </div>
          )}

          {error && (
            <div className="lc-banner lc-banner-error">
              <span className="lc-banner-tag">!</span>
              <div>
                <p className="lc-banner-title">{error}</p>
                <button
                  type="button"
                  className="lc-banner-help"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  {showHelp ? 'Ocultar ayuda' : '¿Problemas para entrar?'}
                </button>
              </div>
            </div>
          )}

          {showHelp && (
            <div className="lc-help">
              <p className="lc-help-title">Guía de registro</p>
              <p>Si quieres una cuenta real, usa <strong>"Crea una aquí"</strong> debajo del formulario.</p>
              <ul>
                <li>Correo electrónico válido.</li>
                <li>Contraseña de al menos 8 caracteres.</li>
                <li>Confirma el email si el sistema lo solicita.</li>
              </ul>
            </div>
          )}

          {/* Google */}
          <button
            type="button"
            className="lc-google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="lc-g-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            <div className="lc-g-text">
              <span>{loading ? 'CONECTANDO…' : 'CONTINUAR CON GOOGLE'}</span>
              <span className="lc-g-sub">RECOMENDADO · 1 PASO, SIN CONFIRMACIÓN</span>
            </div>
          </button>

          <div className="lc-divider"><span>{isRegister ? 'O regístrate con email' : 'O entra con email'}</span></div>

          <form onSubmit={handleEmailAuth} noValidate>
            {isRegister && (
              <div className="lc-field">
                <input
                  type="text"
                  id="fullName"
                  placeholder="Nombre completo"
                  autoComplete="name"
                  required={isRegister}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <svg className="lc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
                  <path d="M12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z" />
                </svg>
              </div>
            )}

            <div className="lc-field">
              <input
                type="email"
                id="email"
                placeholder="Correo electrónico"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <svg className="lc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>

            <div className="lc-field">
              <input
                type={showPwd ? 'text' : 'password'}
                id="password"
                placeholder="Contraseña"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <svg className="lc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <button
                type="button"
                className="lc-toggle-pwd"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPwd ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {!isRegister && (
              <div className="lc-forgot">
                <button
                  type="button"
                  id="forgot-password-link"
                  onClick={() => { setError(''); setShowForgot(true); }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            <button type="submit" className="lc-primary" disabled={loading}>
              {loading ? (
                <span className="lc-spinner" aria-hidden />
              ) : (
                <>
                  <span>{isRegister ? 'CREAR CUENTA' : 'ENTRAR CON EMAIL'}</span>
                  <svg className="lc-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="lc-footer">
            <button
              type="button"
              className="lc-guest"
              onClick={handleGuestLogin}
              disabled={loading}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Explorar como invitado
            </button>
            <div className="lc-signup">
              {isRegister ? '¿Ya tienes cuenta?' : '¿Nuevo por aquí?'}{' '}
              <button type="button" onClick={() => setIsRegister(!isRegister)}>
                {isRegister ? 'Inicia sesión' : 'Crea una aquí'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{LOGIN_CSS}</style>
    </div>
  );
};

// ─── Estilos del diseño "Cowork Login" ────────────────────────────────
// Tomado del handoff (Login Cowork.html). Clases con prefijo `lc-` para
// aislarlas del resto de la app y evitar colisiones con tokens globales.
const LOGIN_CSS = `
.lc-root {
  position: fixed;
  inset: 0;
  z-index: 500;
  font-family: 'Inter', system-ui, sans-serif;
  color: #1B3A5C;
  background:
    radial-gradient(ellipse at 20% 10%, #EAF4FF 0%, transparent 55%),
    radial-gradient(ellipse at 90% 90%, #DCEBFF 0%, transparent 50%),
    linear-gradient(180deg, #F5FAFF 0%, #ECF4FF 100%);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  --lc-blue-500: #2E96F5;
  --lc-blue-600: #1E86E5;
  --lc-blue-400: #4FB0FF;
  --lc-blue-300: #8BC9FF;
  --lc-blue-100: #E0F0FF;
  --lc-blue-050: #F2F8FF;
  --lc-ink-900: #0B2240;
  --lc-ink-700: #1B3A5C;
  --lc-ink-500: #4A6485;
  --lc-ink-400: #6B83A0;
  --lc-ink-300: #9CB0CA;
}
.lc-root *, .lc-root *::before, .lc-root *::after { box-sizing: border-box; }

/* ===== GRID BACKGROUND ===== */
.lc-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(46, 150, 245, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(46, 150, 245, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 100%);
          mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 100%);
  animation: lc-grid-drift 30s linear infinite;
  pointer-events: none;
  z-index: 0;
}
@keyframes lc-grid-drift {
  from { background-position: 0 0, 0 0; }
  to   { background-position: 56px 56px, 56px 56px; }
}

/* ===== HIGHLIGHTED CELLS ===== */
.lc-cell {
  position: absolute;
  width: 56px; height: 56px;
  background: linear-gradient(135deg, rgba(46, 150, 245, 0.18), rgba(46, 150, 245, 0.04));
  border: 1px solid rgba(46, 150, 245, 0.18);
  border-radius: 4px;
  pointer-events: none;
  z-index: 0;
  animation: lc-cell-pulse 4s ease-in-out infinite;
}
.lc-c1 { top: 18%; left: 14%; animation-delay: 0s; }
.lc-c2 { top: 28%; left: 22%; animation-delay: 1.2s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
.lc-c3 { top: 70%; left: 18%; animation-delay: .6s; }
.lc-c4 { top: 22%; right: 14%; animation-delay: 2s; }
.lc-c5 { top: 60%; right: 10%; animation-delay: 1.6s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
.lc-c6 { top: 78%; right: 22%; animation-delay: .3s; }
.lc-c7 { top: 38%; left: 8%;  animation-delay: 2.4s; }
.lc-c8 { top: 12%; left: 46%; animation-delay: 1.9s; }
.lc-c9 { top: 84%; left: 50%; animation-delay: .9s; background: linear-gradient(135deg, rgba(75, 203, 255, 0.22), rgba(75, 203, 255, 0.04)); }
@keyframes lc-cell-pulse {
  0%, 100% { opacity: .4; transform: scale(1); }
  50%      { opacity: 1;  transform: scale(1.05); }
}

/* ===== ORBS ===== */
.lc-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  z-index: 1;
  opacity: .7;
}
.lc-orb-1 {
  width: 420px; height: 420px;
  background: radial-gradient(circle, #6FBBFF 0%, transparent 70%);
  top: -120px; left: -120px;
  animation: lc-orb-1 18s ease-in-out infinite;
}
.lc-orb-2 {
  width: 380px; height: 380px;
  background: radial-gradient(circle, #A8D6FF 0%, transparent 70%);
  bottom: -120px; right: -100px;
  animation: lc-orb-2 22s ease-in-out infinite;
}
.lc-orb-3 {
  width: 280px; height: 280px;
  background: radial-gradient(circle, #4FB0FF 0%, transparent 70%);
  top: 40%; left: 60%;
  opacity: .35;
  animation: lc-orb-3 26s ease-in-out infinite;
}
@keyframes lc-orb-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(60px, 80px) scale(1.1); }
}
@keyframes lc-orb-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-80px, -60px) scale(1.15); }
}
@keyframes lc-orb-3 {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(-100px, 40px); }
}

/* ===== PARTICLES ===== */
.lc-particle {
  position: absolute;
  width: 6px; height: 6px;
  background: var(--lc-blue-500);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
  box-shadow: 0 0 12px rgba(46, 150, 245, 0.6);
}
.lc-p1 { top: 20%; left: 30%; animation: lc-particle 8s ease-in-out infinite; }
.lc-p2 { top: 70%; left: 80%; width: 4px; height: 4px; animation: lc-particle 11s ease-in-out infinite reverse; }
.lc-p3 { top: 40%; left: 12%; width: 8px; height: 8px; animation: lc-particle 9s ease-in-out infinite; animation-delay: 2s; }
.lc-p4 { top: 85%; left: 35%; width: 5px; height: 5px; animation: lc-particle 13s ease-in-out infinite; animation-delay: 1s; }
.lc-p5 { top: 15%; left: 78%; width: 7px; height: 7px; animation: lc-particle 10s ease-in-out infinite reverse; animation-delay: 3s; }
.lc-p6 { top: 55%; left: 88%; width: 4px; height: 4px; animation: lc-particle 14s ease-in-out infinite; }
@keyframes lc-particle {
  0%, 100% { transform: translate(0, 0); opacity: .4; }
  50%      { transform: translate(40px, -60px); opacity: 1; }
}

/* ===== CONNECTORS ===== */
.lc-connector {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: .5;
}
.lc-connector path {
  fill: none;
  stroke: rgba(46, 150, 245, 0.3);
  stroke-width: 1;
  stroke-dasharray: 4 6;
  animation: lc-dash-flow 20s linear infinite;
}
@keyframes lc-dash-flow { to { stroke-dashoffset: -200; } }

/* ===== STAGE / CARD ===== */
.lc-stage {
  position: relative;
  z-index: 5;
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  overflow-y: auto;
}
.lc-card {
  position: relative;
  width: 420px;
  max-width: 100%;
  padding: 40px 36px 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
          backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 30px 80px -20px rgba(46, 100, 175, 0.25),
    0 8px 32px -10px rgba(46, 100, 175, 0.15);
  animation: lc-card-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lc-card::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: 24px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(46, 150, 245, 0.2) 50%, rgba(255,255,255,0.4));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}
@keyframes lc-card-in {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== HEADER ===== */
.lc-brand { text-align: center; margin-bottom: 24px; animation: lc-fade-up 0.7s 0.15s ease-out both; }
.lc-logo {
  width: 64px; height: 64px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #6FBBFF, #2E96F5 60%, #1E86E5);
  display: grid;
  place-items: center;
  color: white;
  font-weight: 800;
  font-size: 28px;
  letter-spacing: -0.02em;
  box-shadow:
    0 0 0 6px rgba(46, 150, 245, 0.12),
    0 0 0 12px rgba(46, 150, 245, 0.06),
    0 12px 32px -8px rgba(46, 150, 245, 0.55);
  position: relative;
  animation: lc-logo-float 4s ease-in-out infinite;
}
@keyframes lc-logo-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.lc-logo::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px dashed rgba(46, 150, 245, 0.35);
  animation: lc-spin 18s linear infinite;
}
@keyframes lc-spin { to { transform: rotate(360deg); } }
.lc-brand h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--lc-ink-900);
}
.lc-brand .lc-tag {
  margin-top: 6px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.32em;
  color: var(--lc-ink-400);
  text-transform: uppercase;
}

/* ===== BANNERS ===== */
.lc-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.4;
  background: rgba(255,255,255,0.6);
  border: 1px solid rgba(46, 150, 245, 0.18);
  -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
}
.lc-banner-info { background: rgba(224, 240, 255, 0.65); border-color: rgba(46, 150, 245, 0.28); color: var(--lc-ink-700); }
.lc-banner-error { background: rgba(254, 226, 226, 0.7); border-color: rgba(248, 113, 113, 0.4); color: #b91c1c; }
.lc-banner-success { background: rgba(220, 252, 231, 0.7); border-color: rgba(74, 222, 128, 0.4); color: #15803d; }
.lc-banner-title { margin: 0; font-weight: 600; }
.lc-banner-title b { color: var(--lc-ink-900); font-weight: 700; }
.lc-banner-info .lc-banner-title b { color: var(--lc-ink-900); }
.lc-banner-sub { margin: 4px 0 0; font-size: 11px; color: var(--lc-ink-500); }
.lc-banner-sub span { color: var(--lc-blue-600); font-weight: 600; }
.lc-banner-tag {
  flex-shrink: 0;
  width: 18px; height: 18px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.6);
  font-size: 10px; font-weight: 700;
}
.lc-banner-error .lc-banner-tag { background: rgba(254, 202, 202, 0.8); }
.lc-banner-success .lc-banner-tag { background: rgba(187, 247, 208, 0.8); }
.lc-banner-close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; line-height: 1; opacity: 0.5;
  padding: 0 4px; color: inherit;
}
.lc-banner-close:hover { opacity: 1; }
.lc-banner-help {
  background: none; border: none; cursor: pointer; padding: 0;
  margin-top: 4px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: inherit; opacity: 0.7; text-decoration: underline;
}
.lc-banner-help:hover { opacity: 1; }

/* ===== HELP PANEL ===== */
.lc-help {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(242, 248, 255, 0.7);
  border: 1px solid rgba(46, 150, 245, 0.16);
  font-size: 11px;
  color: var(--lc-ink-500);
}
.lc-help-title {
  margin: 0 0 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--lc-blue-600);
}
.lc-help ul { margin: 6px 0 0; padding-left: 18px; }
.lc-help li { margin: 2px 0; }

/* ===== GOOGLE BTN ===== */
.lc-google-btn {
  width: 100%;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(46, 150, 245, 0.18);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  cursor: pointer;
  font-family: inherit;
  color: var(--lc-ink-900);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
  animation: lc-fade-up 0.7s 0.25s ease-out both;
}
.lc-google-btn:hover:not(:disabled) {
  background: rgba(255,255,255, 1);
  border-color: rgba(46, 150, 245, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px -10px rgba(46, 100, 175, 0.3);
}
.lc-google-btn:disabled { opacity: 0.65; cursor: not-allowed; }
.lc-g-icon { width: 20px; height: 20px; flex-shrink: 0; }
.lc-g-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; }
.lc-g-sub {
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.15em; color: var(--lc-ink-400);
  margin-top: 3px;
}

/* ===== DIVIDER ===== */
.lc-divider {
  display: flex; align-items: center; gap: 14px;
  margin: 24px 0 18px;
  animation: lc-fade-up 0.7s 0.3s ease-out both;
}
.lc-divider::before, .lc-divider::after {
  content: ""; height: 1px; flex: 1;
  background: linear-gradient(to right, transparent, rgba(46, 150, 245, 0.25), transparent);
}
.lc-divider span {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.18em;
  color: var(--lc-ink-400);
  text-transform: uppercase;
}

/* ===== INPUTS ===== */
.lc-field {
  position: relative;
  margin-bottom: 12px;
  animation: lc-fade-up 0.7s 0.35s ease-out both;
}
.lc-field + .lc-field { animation-delay: 0.4s; }
.lc-field input {
  width: 100%;
  padding: 14px 16px 14px 44px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(46, 150, 245, 0.16);
  border-radius: 12px;
  font-family: inherit;
  font-size: 14px;
  color: var(--lc-ink-900);
  transition: all 0.25s ease;
  outline: none;
}
.lc-field input::placeholder { color: var(--lc-ink-300); }
.lc-field input:focus {
  border-color: var(--lc-blue-500);
  background: rgba(255,255,255, 0.95);
  box-shadow:
    0 0 0 4px rgba(46, 150, 245, 0.12),
    0 6px 20px -6px rgba(46, 100, 175, 0.2);
}
.lc-field .lc-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px; height: 18px;
  color: var(--lc-ink-300);
  transition: color 0.25s ease;
  pointer-events: none;
}
.lc-field input:focus + .lc-icon, .lc-field:focus-within .lc-icon { color: var(--lc-blue-500); }

.lc-toggle-pwd {
  position: absolute; right: 12px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--lc-ink-300);
  border-radius: 6px;
  display: flex;
  transition: color 0.2s, background 0.2s;
}
.lc-toggle-pwd:hover { color: var(--lc-blue-500); background: rgba(46,150,245,0.08); }

/* ===== FORGOT ===== */
.lc-forgot {
  text-align: right;
  margin: 4px 0 18px;
  animation: lc-fade-up 0.7s 0.45s ease-out both;
}
.lc-forgot button {
  background: none; border: none; cursor: pointer; padding: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.16em;
  color: var(--lc-ink-400);
  text-transform: uppercase;
  transition: color 0.2s;
}
.lc-forgot button:hover { color: var(--lc-blue-600); }

/* ===== PRIMARY BTN ===== */
.lc-primary {
  width: 100%;
  padding: 15px 18px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #4FB0FF 0%, #2E96F5 50%, #1E86E5 100%);
  color: white;
  font-family: inherit;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.08em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.4) inset,
    0 8px 24px -8px rgba(46, 150, 245, 0.6);
  animation: lc-fade-up 0.7s 0.5s ease-out both;
}
.lc-primary::before {
  content: "";
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%);
  transition: left 0.6s ease;
}
.lc-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset, 0 14px 30px -8px rgba(46, 150, 245, 0.7);
}
.lc-primary:hover:not(:disabled)::before { left: 100%; }
.lc-primary:active:not(:disabled) { transform: translateY(0); }
.lc-primary:disabled { opacity: 0.85; cursor: progress; }
.lc-primary .lc-arrow { transition: transform 0.25s ease; }
.lc-primary:hover:not(:disabled) .lc-arrow { transform: translateX(4px); }

.lc-spinner {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  animation: lc-spin 0.7s linear infinite;
}

/* ===== FOOTER ACTIONS ===== */
.lc-footer {
  margin-top: 22px;
  text-align: center;
  animation: lc-fade-up 0.7s 0.6s ease-out both;
}
.lc-guest {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.16em;
  color: var(--lc-ink-500);
  text-transform: uppercase;
  background: rgba(255,255,255,0.4);
  border: 1px solid rgba(46, 150, 245, 0.12);
  cursor: pointer;
  transition: all 0.2s;
}
.lc-guest:hover:not(:disabled) { background: rgba(255,255,255,0.8); color: var(--lc-blue-600); }
.lc-guest:disabled { opacity: 0.5; cursor: not-allowed; }

.lc-signup {
  margin-top: 16px;
  font-size: 12px;
  color: var(--lc-ink-400);
  letter-spacing: 0.02em;
}
.lc-signup button {
  background: none; padding: 0; cursor: pointer;
  color: var(--lc-blue-600);
  font-weight: 600;
  border: none;
  border-bottom: 1px dashed rgba(46, 150, 245, 0.4);
  padding-bottom: 1px;
  font-family: inherit;
  font-size: inherit;
  transition: all 0.2s;
}
.lc-signup button:hover { color: var(--lc-blue-500); border-bottom-color: var(--lc-blue-500); }

/* ===== FLOATING STATUS BADGES ===== */
.lc-float-badge {
  position: absolute;
  z-index: 4;
  padding: 10px 16px;
  background: rgba(255,255,255,0.55);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
          backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.7);
  border-radius: 12px;
  box-shadow: 0 12px 32px -10px rgba(46, 100, 175, 0.18);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--lc-ink-700);
  font-weight: 500;
  animation: lc-badge-float 6s ease-in-out infinite;
}
.lc-float-badge b { color: var(--lc-ink-900); font-weight: 700; }
.lc-float-badge .lc-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #2BD27A;
  box-shadow: 0 0 8px rgba(43, 210, 122, 0.6);
  animation: lc-dot-pulse 2s ease-in-out infinite;
}
.lc-float-badge .lc-dot-blue { background: var(--lc-blue-500); box-shadow: 0 0 8px rgba(46,150,245,0.6); }
@keyframes lc-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: .6; transform: scale(1.2); }
}
.lc-fb-1 { top: 18%; left: 8%;  animation-delay: 0s; }
.lc-fb-2 { bottom: 22%; right: 7%; animation-delay: 2s; }
.lc-fb-3 { top: 70%; left: 6%;  animation-delay: 1s; }
@keyframes lc-badge-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10px); }
}
.lc-avatar-stack { display: flex; }
.lc-avatar-stack > div {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid white;
  margin-left: -8px;
  background: linear-gradient(135deg, #4FB0FF, #1E86E5);
  color: white;
  font-size: 9px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
.lc-avatar-stack > div:first-child { margin-left: 0; }
.lc-avatar-stack > div:nth-child(2) { background: linear-gradient(135deg, #6FBBFF, #2E96F5); }
.lc-avatar-stack > div:nth-child(3) { background: linear-gradient(135deg, #A8D6FF, #4FB0FF); color: var(--lc-ink-700); }

/* ===== SHARED FADE-UP ===== */
@keyframes lc-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ===== CORNER LABELS ===== */
.lc-corner-label {
  position: absolute;
  top: 24px; left: 28px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--lc-ink-400);
  text-transform: uppercase;
  animation: lc-fade-up 0.7s 0.1s both;
}
.lc-corner-label .lc-square {
  width: 10px; height: 10px;
  background: var(--lc-blue-500);
  border-radius: 2px;
  box-shadow: 0 0 0 3px rgba(46, 150, 245, 0.18);
}
.lc-corner-meta {
  position: absolute;
  bottom: 24px; right: 28px;
  z-index: 4;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--lc-ink-400);
  text-transform: uppercase;
  animation: lc-fade-up 0.7s 0.1s both;
}

/* ===== MOBILE ===== */
@media (max-width: 720px) {
  .lc-float-badge, .lc-corner-label, .lc-corner-meta { display: none; }
  .lc-card { padding: 32px 24px 24px; }
}
`;
