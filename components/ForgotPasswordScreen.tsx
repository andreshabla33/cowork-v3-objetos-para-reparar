import React, { useState, useEffect, useRef, useCallback } from 'react';
import { requestPasswordReset } from '../lib/authRecoveryService';

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

const RATE_LIMIT_SECONDS = 60;

/**
 * Vista: Solicitud de recuperación de contraseña
 *
 * Capa de Interfaces — UC-1: RequestPasswordReset
 *
 * Estilos: hereda paleta y tema visual desde `styles/login-theme.css` para
 * mantener coherencia con `LoginScreen` (mismo glassmorphism, mismo fondo
 * animado, mismas variables CSS).
 */
export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const parallaxRootRef = useRef<HTMLDivElement | null>(null);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    setIsRateLimited(true);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsRateLimited(false);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Parallax suave del fondo (mismo efecto que el login).
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRateLimited) return;
    setLoading(true);
    setError(null);

    const result = await requestPasswordReset(email);

    if (result.success) {
      setSent(true);
    } else {
      const msg = result.error || 'Error al enviar el correo.';
      setError(msg);
      if (msg.toLowerCase().includes('60 segundo') || msg.toLowerCase().includes('demasiados')) {
        startCountdown(RATE_LIMIT_SECONDS);
      }
    }

    setLoading(false);
  };

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - countdown / RATE_LIMIT_SECONDS);

  return (
    <div className="cw-shell cw-forgot-shell" ref={parallaxRootRef}>
      {/* Fondo animado (idéntico al login) */}
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

      <div className="cw-corner-label">
        <span className="cw-square" />
        <span>COWORK · v2.4 · RECOVERY</span>
      </div>
      <div className="cw-corner-meta">SECURE · ENCRYPTED CHANNEL</div>

      <div className="cw-stage">
        <div className="cw-card">

          {/* Header */}
          <div className="cw-brand">
            <div className="cw-logo" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="cw-title">Recuperar contraseña</h1>
            <div className="cw-tag">Te enviaremos un enlace de acceso</div>
          </div>

          {sent ? (
            // ── Estado: correo enviado ───────────────────────────────
            <>
              <div className="cw-success-card">
                <div className="cw-success-circle">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2>¡Correo enviado!</h2>
                <p>
                  Revisa tu bandeja de entrada en <b>{email}</b>.<br />
                  El enlace expira en <b>60 minutos</b>.
                </p>
              </div>

              <p className="cw-instructions">
                ¿No lo ves? Revisa la carpeta de spam o{' '}
                <button
                  type="button"
                  className="cw-signup-link"
                  onClick={() => { setSent(false); setError(null); }}
                >
                  intenta con otro correo
                </button>.
              </p>

              <button
                id="forgot-back-after-sent"
                type="button"
                className="cw-back-btn"
                onClick={onBack}
              >
                ← Volver al inicio de sesión
              </button>
            </>
          ) : (
            // ── Estado: formulario ───────────────────────────────────
            <>
              {error && (
                <div className={`cw-alert ${isRateLimited ? 'cw-alert-warning' : 'cw-alert-error bg-red-500/10'}`}>
                  {isRateLimited ? (
                    <div className="cw-countdown-ring">
                      <svg width="40" height="40" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(229, 162, 58, 0.18)" strokeWidth="4" />
                        <circle
                          cx="24" cy="24" r={radius}
                          fill="none"
                          stroke="#E5A23A"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          style={{ transition: 'stroke-dashoffset 1s linear' }}
                        />
                      </svg>
                      <span>{countdown}s</span>
                    </div>
                  ) : (
                    <span className="cw-alert-icon" aria-hidden="true">!</span>
                  )}
                  <div className="cw-alert-body">
                    <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
                    {isRateLimited && (
                      <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: 11 }}>
                        El botón se habilitará automáticamente al terminar el contador.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <p className="cw-instructions">
                Ingresa el correo asociado a tu cuenta y te enviaremos
                un enlace para restablecer tu contraseña.
              </p>

              <form id="forgot-password-form" className="cw-form" onSubmit={handleSubmit}>
                <div className="cw-field">
                  <input
                    id="forgot-email-input"
                    type="email"
                    name="forgot-email"
                    placeholder="Correo electrónico"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    disabled={isRateLimited}
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

                <button
                  id="forgot-submit-btn"
                  type="submit"
                  className="cw-primary"
                  disabled={loading || isRateLimited}
                >
                  {loading ? (
                    <>
                      <span className="cw-spinner" aria-hidden="true" />
                      <span>ENVIANDO…</span>
                    </>
                  ) : isRateLimited ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <span>ESPERA {countdown}s PARA REINTENTAR</span>
                    </>
                  ) : (
                    <>
                      <span>ENVIAR ENLACE DE RECUPERACIÓN</span>
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

              <button
                id="forgot-back-btn"
                type="button"
                className="cw-back-btn"
                onClick={onBack}
                style={{ marginTop: 14 }}
              >
                ← Volver al inicio de sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
