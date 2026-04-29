
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
 * El usuario ingresa su email y recibe un link de recuperación.
 * Incluye manejo visual de rate limit con countdown de 60s.
 */
export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - countdown / RATE_LIMIT_SECONDS);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-gradient-to-br from-[#EEF4FC] via-sky-50 to-sky-50 p-4 overflow-y-auto">

      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-300/25 to-sky-400/10 blur-[120px] animate-orb-float" />
        <div className="absolute -bottom-48 -right-40 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-sky-600/20 to-sky-200/8 blur-[130px] animate-orb-float-slow" />
        <div className="absolute top-1/3 right-[5%] w-[280px] h-[280px] rounded-full bg-gradient-to-br from-sky-200/20 to-transparent blur-[80px] animate-orb-float-alt" />
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'radial-gradient(circle, #0ea5e9 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <div className="w-full max-w-md my-auto relative z-10">
        <div className="relative bg-white/75 backdrop-blur-2xl border border-white/60 rounded-[40px] p-8 shadow-[0_32px_64px_rgba(14,40,90,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] animate-auth-in">
          {/* top sheen */}
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent rounded-full" />

          {/* Header */}
          <div className="flex flex-col items-center mb-7">
            <div className="relative group mb-5">
              <div className="absolute -inset-3 bg-gradient-to-br from-sky-400/40 to-sky-600/20 rounded-[28px] blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-700 animate-pulse" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-600 rounded-[22px] flex items-center justify-center shadow-[0_8px_24px_rgba(14,165,233,0.45)]">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 mb-1.5">
              Recuperar Contraseña
            </h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.35em] text-center">
              Te enviaremos un enlace de acceso
            </p>
          </div>

          {/* ── Estado: correo enviado ── */}
          {sent ? (
            <div className="space-y-5">
              <div className="p-5 bg-emerald-50/80 border border-emerald-200/70 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-emerald-600 font-black text-sm">¡Correo enviado!</p>
                  <p className="text-slate-500 text-[11px] mt-1 leading-relaxed">
                    Revisa tu bandeja de entrada en <span className="text-slate-800 font-bold">{email}</span>.<br />
                    El enlace expira en <span className="text-emerald-600 font-bold">60 minutos</span>.
                  </p>
                </div>
              </div>

              <p className="text-slate-400 text-[10px] text-center leading-relaxed">
                ¿No lo ves? Revisa la carpeta de spam o{' '}
                <button
                  onClick={() => { setSent(false); setError(null); }}
                  className="text-sky-600 hover:text-sky-700 underline font-bold transition-colors"
                >
                  intenta con otro correo
                </button>.
              </p>

              <button
                id="forgot-back-after-sent"
                onClick={onBack}
                className="w-full py-3 bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-2xl font-black text-[10px] text-slate-500 hover:bg-white/90 hover:border-sky-300/50 hover:text-slate-700 transition-all duration-200 uppercase tracking-widest"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          ) : (
            /* ── Estado: formulario ── */
            <div className="space-y-4">

              {error && (
                <div className={`p-3.5 border rounded-2xl flex items-start gap-3 ${
                  isRateLimited
                    ? 'bg-amber-50/80 border-amber-200/70'
                    : 'bg-red-50/80 border-red-200/70'
                }`}>
                  {isRateLimited ? (
                    <div className="shrink-0 relative w-10 h-10">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="4" />
                        <circle
                          cx="24" cy="24" r={radius}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          style={{ transition: 'stroke-dashoffset 1s linear' }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-amber-400 font-black text-[10px]">
                        {countdown}s
                      </span>
                    </div>
                  ) : (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-bold text-xs mt-0.5">!</div>
                  )}
                  <div className="flex-1">
                    <p className={`text-[10px] font-bold leading-tight ${isRateLimited ? 'text-amber-600' : 'text-red-600'}`}>
                      {error}
                    </p>
                    {isRateLimited && (
                      <p className="text-amber-500 text-[9px] mt-1">
                        El botón se habilitará automáticamente al terminar el contador.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form id="forgot-password-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <p className="text-slate-500 text-[11px] leading-relaxed mb-4 text-center">
                    Ingresa el correo asociado a tu cuenta y te enviaremos
                    un enlace para restablecer tu contraseña.
                  </p>

                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-35 group-focus-within:opacity-80 transition-opacity duration-200">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
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
                      className="w-full bg-white/60 backdrop-blur-sm border border-slate-200/70 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200/60 focus:border-sky-400/60 focus:bg-white/90 transition-all duration-200 placeholder:text-slate-400/70 text-slate-800 disabled:opacity-40"
                    />
                  </div>
                </div>

                <button
                  id="forgot-submit-btn"
                  type="submit"
                  disabled={loading || isRateLimited}
                  className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all duration-200 shadow-[0_4px_15px_rgba(14,165,233,0.30)] hover:shadow-[0_8px_24px_rgba(14,165,233,0.40)] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  <span className="flex items-center gap-2">
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : isRateLimited ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Espera {countdown}s para reintentar
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Enviar Enlace de Recuperación
                      </>
                    )}
                  </span>
                </button>
              </form>

              <button
                id="forgot-back-btn"
                onClick={onBack}
                className="w-full text-center text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest transition-colors duration-150"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
