
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
      // Activar countdown automáticamente cuando hay rate limit
      if (msg.toLowerCase().includes('60 segundo') || msg.toLowerCase().includes('demasiados')) {
        startCountdown(RATE_LIMIT_SECONDS);
      }
    }

    setLoading(false);
  };

  // Arco de progreso SVG para el countdown
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - countdown / RATE_LIMIT_SECONDS);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#050508] p-4 overflow-y-auto">
      {/* Fondo animado */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-violet-600/15 blur-[180px] animate-pulse" />
        <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="w-full max-w-md my-auto relative z-10">
        {/* Glow exterior */}
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 rounded-[40px] blur-xl opacity-60" />

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[36px] p-6 shadow-2xl">

          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative group mb-4">
              <div className="absolute -inset-2 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="relative w-14 h-14 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-2xl">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-1">
              Recuperar Contraseña
            </h1>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.3em] text-center">
              Te enviaremos un enlace de acceso
            </p>
          </div>

          {/* ── Estado: correo enviado ── */}
          {sent ? (
            <div className="space-y-5 animate-in fade-in duration-500">
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-emerald-400 font-black text-sm">¡Correo enviado!</p>
                  <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed">
                    Revisa tu bandeja de entrada en <span className="text-white font-bold">{email}</span>.<br />
                    El enlace expira en <span className="text-emerald-400 font-bold">60 minutos</span>.
                  </p>
                </div>
              </div>

              <p className="text-zinc-600 text-[10px] text-center leading-relaxed">
                ¿No lo ves? Revisa la carpeta de spam o{' '}
                <button
                  onClick={() => { setSent(false); setError(null); }}
                  className="text-violet-400 hover:text-violet-300 underline font-bold transition-colors"
                >
                  intenta con otro correo
                </button>.
              </p>

              <button
                id="forgot-back-after-sent"
                onClick={onBack}
                className="w-full py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl font-black text-[10px] text-zinc-400 hover:border-violet-500/30 hover:text-white transition-all uppercase tracking-widest"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          ) : (
            /* ── Estado: formulario ── */
            <div className="space-y-4">

              {/* Mensaje de error / rate limit */}
              {error && (
                <div className={`p-3 border rounded-xl animate-in slide-in-from-top-2 flex items-start gap-3 ${
                  isRateLimited
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  {isRateLimited ? (
                    /* Countdown circular SVG */
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
                    <p className={`text-[10px] font-bold leading-tight ${isRateLimited ? 'text-amber-400' : 'text-red-400'}`}>
                      {error}
                    </p>
                    {isRateLimited && (
                      <p className="text-amber-400/60 text-[9px] mt-1">
                        El botón se habilitará automáticamente al terminar el contador.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form id="forgot-password-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <p className="text-zinc-500 text-[11px] leading-relaxed mb-4 text-center">
                    Ingresa el correo asociado a tu cuenta y te enviaremos
                    un enlace para restablecer tu contraseña.
                  </p>

                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="w-full bg-black/40 border border-white/5 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all placeholder:text-zinc-700 text-white disabled:opacity-40"
                    />
                  </div>
                </div>

                <button
                  id="forgot-submit-btn"
                  type="submit"
                  disabled={loading || isRateLimited}
                  className="relative w-full group overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl shadow-violet-600/30 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 group-hover:opacity-100 group-disabled:opacity-0 transition-opacity duration-300" />
                  <span className="relative flex items-center gap-2">
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
                className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-widest transition-colors"
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
