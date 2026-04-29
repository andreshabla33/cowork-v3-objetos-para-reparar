
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { confirmPasswordReset } from '../lib/authRecoveryService';

type ResetState = 'validating' | 'form' | 'success' | 'error_token';

interface ResetPasswordScreenProps {
  /** Cuando Supabase redirige con hash de error (otp_expired, access_denied),
   *  el componente salta directamente al estado de error sin timeout. */
  errorFromHash?: boolean;
  /** Descripción del error del hash de Supabase (e.g. "Email link is invalid or has expired") */
  errorDescription?: string;
}

/**
 * Vista: Establecer nueva contraseña
 *
 * Capa de Interfaces — UC-2: ConfirmPasswordReset
 *
 * Esta pantalla se muestra cuando Supabase redirige al usuario con:
 *   Éxito:  `#access_token=...&type=recovery` (implicit flow)
 *   Error:  `#error=access_denied&error_code=otp_expired&...`
 *
 * Supabase establece automáticamente una sesión de recovery al detectar
 * el hash. Escuchamos el evento PASSWORD_RECOVERY a través de onAuthStateChange.
 *
 * SEGURIDAD: No permite cambiar la contraseña si no hay sesión de recovery.
 */
export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ errorFromHash = false, errorDescription }) => {
  const [state, setState] = useState<ResetState>(errorFromHash ? 'error_token' : 'validating');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strength, setStrength] = useState(0);

  useEffect(() => {
    if (errorFromHash) return;

    let isMounted = true;
    let timeoutId: number | null = null;

    const marcarTokenInvalido = () => {
      if (!isMounted) return;
      setState(prev => prev === 'validating' ? 'error_token' : prev);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        setState('form');
      }
    });

    const storeSession = useStore.getState().session;
    if (storeSession) {
      if (timeoutId !== null) { window.clearTimeout(timeoutId); }
      setState('form');
    } else {
      timeoutId = window.setTimeout(marcarTokenInvalido, 2000);
    }

    return () => {
      isMounted = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!newPassword) { setStrength(0); return; }
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    setStrength(score);
  }, [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await confirmPasswordReset(newPassword, confirmPassword);

    if (result.success) {
      setState('success');
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      setError(result.error || 'Error al actualizar la contraseña.');
    }

    setLoading(false);
  };

  const strengthColors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
  const strengthLabels = ['', 'Muy débil', 'Débil', 'Regular', 'Buena', 'Excelente'];

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

          {/* ── Validando token ── */}
          {state === 'validating' && (
            <div className="py-10 flex flex-col items-center gap-5">
              <div className="w-14 h-14 rounded-full border-2 border-sky-200 border-t-sky-500 animate-spin" />
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest text-center">
                Verificando enlace de recuperación...
              </p>
            </div>
          )}

          {/* ── Token inválido / expirado ── */}
          {state === 'error_token' && (
            <div className="space-y-6 text-center">
              <div className="mx-auto w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center shadow-sm">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 mb-2">
                  Enlace expirado o inválido
                </h1>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  {errorDescription
                    ? 'El enlace de recuperación que usaste ya no es válido.'
                    : 'El enlace de recuperación no es válido, ya fue usado o ha expirado.'}
                </p>
                <div className="mt-3 p-3 bg-red-50/80 border border-red-200/60 rounded-xl">
                  <p className="text-red-500 text-[9px] font-mono leading-relaxed">
                    {errorDescription
                      ? `⚠ ${decodeURIComponent(errorDescription).replace(/\+/g, ' ')}`
                      : '⚠ El enlace tiene una validez de 1 hora. Solicita uno nuevo.'}
                  </p>
                </div>
              </div>
              <button
                id="reset-request-new-link"
                onClick={() => window.location.replace('/')}
                className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all duration-200 shadow-[0_4px_15px_rgba(14,165,233,0.30)] hover:shadow-[0_8px_24px_rgba(14,165,233,0.40)] hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Solicitar nuevo enlace
              </button>
            </div>
          )}

          {/* ── Formulario nueva contraseña ── */}
          {state === 'form' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center mb-2">
                <div className="relative group mb-4">
                  <div className="absolute -inset-3 bg-gradient-to-br from-sky-400/40 to-sky-600/20 rounded-[28px] blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-700 animate-pulse" />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-600 rounded-[22px] flex items-center justify-center shadow-[0_8px_24px_rgba(14,165,233,0.45)]">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-800 mb-1.5">
                  Nueva Contraseña
                </h1>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">
                  Elige una contraseña segura
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-red-50/80 border border-red-200/70 rounded-2xl flex items-start gap-2.5">
                  <div className="shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-500 font-bold text-xs">!</div>
                  <p className="text-red-600 text-[10px] font-bold leading-tight flex-1">{error}</p>
                </div>
              )}

              <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-35 group-focus-within:opacity-80 transition-opacity duration-200">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      id="reset-new-password"
                      type={showNew ? 'text' : 'password'}
                      name="new-password"
                      placeholder="Nueva contraseña"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full bg-white/60 backdrop-blur-sm border border-slate-200/70 rounded-2xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200/60 focus:border-sky-400/60 focus:bg-white/90 transition-all duration-200 placeholder:text-slate-400/70 text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(v => !v)}
                      className="absolute inset-y-0 right-4 flex items-center opacity-35 hover:opacity-70 transition-opacity duration-150"
                      tabIndex={-1}
                    >
                      {showNew ? (
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColors[strength] : 'bg-slate-200'}`}
                          />
                        ))}
                      </div>
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${strength >= 4 ? 'text-emerald-600' : strength >= 3 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {strengthLabels[strength]}
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-35 group-focus-within:opacity-80 transition-opacity duration-200">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <input
                    id="reset-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    name="confirm-password"
                    placeholder="Confirmar contraseña"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`w-full bg-white/60 backdrop-blur-sm border rounded-2xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:bg-white/90 transition-all duration-200 placeholder:text-slate-400/70 text-slate-800 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-300/70 focus:ring-red-200/60 focus:border-red-400/60'
                        : 'border-slate-200/70 focus:ring-sky-200/60 focus:border-sky-400/60'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute inset-y-0 right-4 flex items-center opacity-35 hover:opacity-70 transition-opacity duration-150"
                    tabIndex={-1}
                  >
                    {showConfirm ? (
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="p-3.5 bg-white/50 backdrop-blur-sm border border-slate-200/60 rounded-2xl">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">Requisitos:</p>
                  <ul className="space-y-1.5">
                    {[
                      { label: 'Al menos 8 caracteres', ok: newPassword.length >= 8 },
                      { label: 'Letra mayúscula (recomendado)', ok: /[A-Z]/.test(newPassword) },
                      { label: 'Número (recomendado)', ok: /[0-9]/.test(newPassword) },
                      { label: 'Las contraseñas coinciden', ok: newPassword === confirmPassword && confirmPassword.length > 0 },
                    ].map(req => (
                      <li key={req.label} className={`flex items-center gap-2 text-[9px] font-medium transition-colors duration-200 ${req.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black transition-all duration-200 ${req.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {req.ok ? '✓' : '○'}
                        </span>
                        {req.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  id="reset-submit-btn"
                  type="submit"
                  disabled={loading || newPassword !== confirmPassword || newPassword.length < 8}
                  className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all duration-200 shadow-[0_4px_15px_rgba(14,165,233,0.30)] hover:shadow-[0_8px_24px_rgba(14,165,233,0.40)] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Actualizar Contraseña
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── Éxito ── */}
          {state === 'success' && (
            <div className="space-y-6 text-center">
              <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-sm">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-emerald-600 mb-2">
                  ¡Contraseña actualizada!
                </h1>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Tu contraseña fue cambiada exitosamente.
                  Ahora puedes iniciar sesión con tu nueva contraseña.
                </p>
              </div>
              <button
                id="reset-go-login-btn"
                onClick={() => window.location.replace('/')}
                className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all duration-200 shadow-[0_4px_15px_rgba(14,165,233,0.30)] hover:shadow-[0_8px_24px_rgba(14,165,233,0.40)] hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
