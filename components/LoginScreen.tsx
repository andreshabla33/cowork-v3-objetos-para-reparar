/**
 * @module components/LoginScreen
 * @description Pantalla de inicio de sesión — diseño "Cowork Glassmorphism Blue"
 *
 * Toda la estética (paleta, glassmorphism, animaciones del fondo, badges,
 * etc.) vive en `styles/login-theme.css` para que sea fácil iterar sin tocar
 * componentes. Acá solo hay markup + cableado al hook de autenticación.
 *
 * Architecture:
 * - Zero direct Supabase imports
 * - useLoginAuth → Use Cases → IAuthRepository port → Supabase adapter
 * - Rate limiting and anti-enumeration handled in hook layer
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

  const [showPassword, setShowPassword] = useState(false);
  const parallaxRootRef = useRef<HTMLDivElement | null>(null);

  // Parallax sutil del fondo siguiendo el mouse.
  useEffect(() => {
    const root = parallaxRootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layers = Array.from(
      root.querySelectorAll<HTMLElement>('.cw-orb, .cw-cell, .cw-particle')
    );
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
  }, []);

  if (showForgot) {
    return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;
  }

  return (
    <div className="cw-shell" ref={parallaxRootRef}>
      {/* ── Fondo animado ─────────────────────────────────────────────── */}
      <div className="cw-grid-bg" aria-hidden="true" />

      <svg
        className="cw-connector"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
        aria-hidden="true"
      >
        <path d="M 100 200 Q 400 100, 700 300 T 1340 250" />
        <path d="M 80 700 Q 300 600, 600 750 T 1360 680" />
        <path d="M 1200 100 Q 1100 400, 1300 600" />
      </svg>

      <div className="cw-orb cw-orb--1" aria-hidden="true" />
      <div className="cw-orb cw-orb--2" aria-hidden="true" />
      <div className="cw-orb cw-orb--3" aria-hidden="true" />

      {(['c1','c2','c3','c4','c5','c6','c7','c8','c9'] as const).map((c, i) => (
        <div
          key={c}
          className={`cw-cell cw-cell--${c}${i % 3 === 1 ? ' cw-cell--alt' : ''}`}
          aria-hidden="true"
        />
      ))}

      {(['p1','p2','p3','p4','p5','p6'] as const).map(p => (
        <div key={p} className={`cw-particle cw-particle--${p}`} aria-hidden="true" />
      ))}

      {/* ── Esquinas decorativas ───────────────────────────────────────── */}
      <div className="cw-corner-label">
        <span className="cw-square" />
        <span>COWORK · v2.4</span>
      </div>
      <div className="cw-corner-meta">SECURE · ENCRYPTED CHANNEL</div>

      {/* ── Badges flotantes ──────────────────────────────────────────── */}
      <div className="cw-float-badge cw-float-badge--1">
        <span className="cw-dot" />
        <span><b>2,418</b> personas conectadas</span>
      </div>
      <div className="cw-float-badge cw-float-badge--2">
        <div className="cw-avatar-stack">
          <div>MR</div><div>JL</div><div>+9</div>
        </div>
        <span>Tu equipo te espera</span>
      </div>
      <div className="cw-float-badge cw-float-badge--3">
        <span className="cw-dot cw-dot--blue" />
        <span>Última conexión <b>hace 2 días</b></span>
      </div>

      {/* ── Card principal ─────────────────────────────────────────────── */}
      <div className="cw-stage">
        <div className="cw-card">

          {/* Brand */}
          <div className="cw-brand">
            <div className="cw-logo">C</div>
            <h1 className="cw-title">COWORK</h1>
            <div className="cw-tag">Virtual Collaboration Hub</div>
          </div>

          {/* Banner de invitación */}
          {invitacionBanner && (
            <div className="cw-alert cw-alert-info bg-violet-500/10">
              <span className="cw-alert-icon" aria-hidden="true">★</span>
              <div className="cw-alert-body">
                <p style={{ margin: 0 }}>
                  {invitacionBanner.invitadorNombre
                    ? `${invitacionBanner.invitadorNombre} te invitó`
                    : 'Te invitaron'} a <b>{invitacionBanner.espacioNombre}</b>
                </p>
                <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 11 }}>
                  Crea tu cuenta con <b>{invitacionBanner.email}</b> usando Google o el formulario de abajo.
                </p>
              </div>
            </div>
          )}

          {/* Feedback genérico (success/error) */}
          {authFeedback && (
            <div
              className={`cw-alert ${
                authFeedback.type === 'error'
                  ? 'cw-alert-error bg-red-500/10'
                  : 'cw-alert-success bg-green-500/10'
              }`}
            >
              <span className="cw-alert-icon" aria-hidden="true">
                {authFeedback.type === 'error' ? '!' : '✓'}
              </span>
              <p className="cw-alert-body" style={{ margin: 0 }}>{authFeedback.message}</p>
              <button
                type="button"
                className="cw-alert-close"
                aria-label="Cerrar"
                onClick={() => setAuthFeedback(null)}
              >×</button>
            </div>
          )}

          {/* Error de autenticación */}
          {error && (
            <div className="cw-alert cw-alert-error bg-red-500/10">
              <span className="cw-alert-icon" aria-hidden="true">!</span>
              <div className="cw-alert-body">
                <p style={{ margin: 0 }}>{error}</p>
                <button
                  type="button"
                  className="cw-help-toggle"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  {showHelp ? 'Ocultar ayuda' : '¿Problemas para entrar?'}
                </button>
              </div>
            </div>
          )}

          {showHelp && (
            <div className="cw-help-box">
              <p className="cw-help-title">Guía de registro</p>
              <p style={{ margin: '0 0 6px' }}>
                Para usar una cuenta de correo real debes usar el modo
                <strong> "Crea una aquí"</strong> en la parte inferior.
              </p>
              <strong>Requisitos:</strong>
              <ul>
                <li>Correo electrónico válido.</li>
                <li>Contraseña de al menos 8 caracteres.</li>
                <li>Confirmar el email si el sistema lo solicita.</li>
              </ul>
            </div>
          )}

          {/* ── Botón Google (primario) ─────────────────────────────── */}
          <button
            type="button"
            className="cw-google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg
              className="cw-g-icon"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            <div className="cw-g-text">
              <span>{loading ? 'CONECTANDO…' : 'CONTINUAR CON GOOGLE'}</span>
              <span className="cw-g-sub">RECOMENDADO · 1 PASO, SIN CONFIRMACIÓN</span>
            </div>
            {loading && <span className="cw-spinner" aria-hidden="true" />}
          </button>

          {/* Divider */}
          <div className="cw-divider">
            <span>{isRegister ? 'O regístrate con email' : 'O entra con email'}</span>
          </div>

          {/* ── Formulario email ────────────────────────────────────── */}
          <form className="cw-form" onSubmit={handleEmailAuth}>
            {isRegister && (
              <div className="cw-field">
                <input
                  type="text"
                  name="name"
                  placeholder="Nombre completo"
                  required={isRegister}
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                />
                <svg
                  className="cw-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}

            <div className="cw-field">
              <input
                type="email"
                name="email"
                placeholder="Correo electrónico"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
              <svg
                className="cw-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>

            <div className="cw-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Contraseña"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              <svg
                className="cw-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <button
                type="button"
                className="cw-toggle-pwd"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword(p => !p)}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {!isRegister && (
              <div className="cw-forgot">
                <button
                  id="forgot-password-link"
                  type="button"
                  onClick={() => {
                    setError(null);
                    setShowForgot(true);
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            <button
              type="submit"
              className="cw-primary"
              id="submitBtn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="cw-spinner" aria-hidden="true" />
                  <span>{isRegister ? 'CREANDO CUENTA…' : 'AUTENTICANDO…'}</span>
                </>
              ) : (
                <>
                  <span>{isRegister ? 'CREAR CUENTA CON EMAIL' : 'ENTRAR CON EMAIL'}</span>
                  <svg
                    className="cw-arrow"
                    width="16" height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* ── Footer (invitado + signup toggle) ───────────────────── */}
          <div className="cw-footer">
            <button
              type="button"
              className="cw-guest"
              onClick={handleGuestLogin}
              disabled={loading}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Explorar como invitado
            </button>
            <div className="cw-signup">
              {isRegister ? '¿Ya tienes cuenta?' : '¿Nuevo por aquí?'}
              <button
                type="button"
                className="cw-signup-link"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? 'Inicia Sesión' : 'Crea una aquí'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
