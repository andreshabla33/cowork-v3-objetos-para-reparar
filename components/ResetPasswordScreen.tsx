
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { confirmPasswordReset } from '../lib/authRecoveryService';

type ResetState = 'validating' | 'form' | 'success' | 'error_token';

interface ResetPasswordScreenProps {
 /** Cuando Supabase redirige con hash de error (otp_expired, access_denied),
 * el componente salta directamente al estado de error sin timeout. */
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
 * Éxito: `#access_token=...&type=recovery` (implicit flow)
 * Error: `#error=access_denied&error_code=otp_expired&...`
 *
 * Supabase establece automáticamente una sesión de recovery al detectar
 * el hash. Escuchamos el evento PASSWORD_RECOVERY a través de onAuthStateChange.
 *
 * SEGURIDAD: No permite cambiar la contraseña si no hay sesión de recovery.
 */
export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ errorFromHash = false, errorDescription }) => {
 // Si Supabase ya nos avisó del error en el hash, ir directo a error_token
 const [state, setState] = useState<ResetState>(errorFromHash ? 'error_token' : 'validating');
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [showNew, setShowNew] = useState(false);
 const [showConfirm, setShowConfirm] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [strength, setStrength] = useState(0);

 useEffect(() => {
 // Si ya sabemos que el hash trae un error, no hay nada que esperar
 if (errorFromHash) return;

 // Track mount state to prevent state updates after unmount.
 // Supabase gotrue-js docs: "Lock was not released within 5000ms" happens
 // when getSession() promise resolves after the component that called it
 // has already unmounted — the lock is held but nobody releases it.
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

 // Fallback: si la sesión ya existía antes de que el listener se montara.
 // Read synchronously from Zustand store — NO async getSession() to avoid orphaned Web Lock.
 // onAuthStateChange already syncs session to the store.
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

 // Calcular fortaleza de contraseña
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
 // Limpiar hash de la URL por seguridad
 window.history.replaceState({}, '', window.location.pathname);
 } else {
 setError(result.error || 'Error al actualizar la contraseña.');
 }

 setLoading(false);
 };

 const strengthColors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
 const strengthLabels = ['', 'Muy débil', 'Débil', 'Regular', 'Buena', 'Excelente'];

 return (
 <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#050508] p-4 overflow-y-auto">
 {/* Fondo animado */}
 <div className="absolute inset-0 overflow-hidden pointer-events-none">
 <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-[#2E96F5]/15 blur-[180px] animate-pulse" />
 <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-[#2E96F5]/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
 <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full bg-[#2E96F5]/10 blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
 <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
 </div>

 <div className="w-full max-w-md my-auto relative z-10">
 <div className="absolute -inset-1 bg-gradient-to-r from-[#4FB0FF]/20 /20 to-[#2E96F5]/20 rounded-[40px] blur-xl opacity-60" />

 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[36px] p-6 shadow-2xl">

 {/* ── Validando token ── */}
 {state === 'validating' && (
 <div className="py-8 flex flex-col items-center gap-4 animate-in fade-in">
 <div className="w-12 h-12 border-3 border-[rgba(46,150,245,0.3)]/30 border-[#2E96F5] border-t-transparent rounded-full animate-spin" />
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">
 Verificando enlace de recuperación...
 </p>
 </div>
 )}

 {/* ── Token inválido / expirado ── */}
 {state === 'error_token' && (
 <div className="space-y-5 text-center animate-in fade-in">
 <div className="relative mx-auto w-14 h-14">
 <div className="absolute -inset-2 bg-red-600/20 rounded-full blur-xl" />
 <div className="relative w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center">
 <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
 </svg>
 </div>
 </div>
 <div>
 <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-2">
 Enlace expirado o inválido
 </h1>
 <p className="text-[#4A6485] text-[11px] leading-relaxed">
 {errorDescription
 ? 'El enlace de recuperación que usaste ya no es válido.'
 : 'El enlace de recuperación no es válido, ya fue usado o ha expirado.'}
 </p>
 {/* Detalles técnicos del error de Supabase — ayuda al usuario */}
 <div className="mt-3 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
 <p className="text-red-400/70 text-[9px] font-mono leading-relaxed">
 {errorDescription
 ? `⚠ ${decodeURIComponent(errorDescription).replace(/\+/g, ' ')}`
 : '⚠ El enlace tiene una validez de 1 hora. Solicita uno nuevo.'}
 </p>
 </div>
 </div>
 <button
 id="reset-request-new-link"
 onClick={() => window.location.replace('/')}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98]"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative">Solicitar nuevo enlace</span>
 </button>
 </div>
 )}

 {/* ── Formulario nueva contraseña ── */}
 {state === 'form' && (
 <div className="space-y-5 animate-in fade-in duration-500">
 {/* Header */}
 <div className="flex flex-col items-center mb-2">
 <div className="relative group mb-3">
 <div className="absolute -inset-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
 <div className="relative w-14 h-14 bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] rounded-2xl flex items-center justify-center shadow-2xl">
 <svg className="w-7 h-7 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
 </svg>
 </div>
 </div>
 <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-1">
 Nueva Contraseña
 </h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-[0.25em]">
 Elige una contraseña segura
 </p>
 </div>

 {/* Error */}
 {error && (
 <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl animate-in slide-in-from-top-2 flex items-start gap-2">
 <div className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-bold text-xs">!</div>
 <p className="text-red-400 text-[10px] font-bold leading-tight flex-1">{error}</p>
 </div>
 )}

 <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-3">
 {/* Nueva contraseña */}
 <div className="space-y-1.5">
 <div className="relative group">
 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
 className="w-full bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E96F5]/50 focus:border-[rgba(46,150,245,0.3)]/50 transition-all placeholder:text-[#4A6485] text-[#0B2240]"
 />
 <button
 type="button"
 onClick={() => setShowNew(v => !v)}
 className="absolute inset-y-0 right-4 flex items-center opacity-30 hover:opacity-70 transition-opacity"
 tabIndex={-1}
 >
 {showNew ? (
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
 </svg>
 ) : (
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
 </svg>
 )}
 </button>
 </div>

 {/* Indicador de fortaleza */}
 {newPassword && (
 <div className="space-y-1 animate-in fade-in">
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map(i => (
 <div
 key={i}
 className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColors[strength] : 'bg-[rgba(46,150,245,0.08)]'}`}
 />
 ))}
 </div>
 <p className={`text-[9px] font-bold uppercase tracking-widest ${strength >= 4 ? 'text-emerald-400' : strength >= 3 ? 'text-[#1E86E5]' : 'text-red-400'}`}>
 {strengthLabels[strength]}
 </p>
 </div>
 )}
 </div>

 {/* Confirmar contraseña */}
 <div className="relative group">
 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
 className={`w-full bg-white/70 border rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 transition-all placeholder:text-[#4A6485] text-[#0B2240] ${
 confirmPassword && confirmPassword !== newPassword
 ? 'border-red-500/40 focus:ring-red-500/30 focus:border-red-500/40'
 : 'border-[rgba(46,150,245,0.14)] focus:ring-[#2E96F5]/50 focus:border-[rgba(46,150,245,0.3)]/50'
 }`}
 />
 <button
 type="button"
 onClick={() => setShowConfirm(v => !v)}
 className="absolute inset-y-0 right-4 flex items-center opacity-30 hover:opacity-70 transition-opacity"
 tabIndex={-1}
 >
 {showConfirm ? (
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
 </svg>
 ) : (
 <svg className="w-4 h-4 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
 </svg>
 )}
 </button>
 </div>

 {/* Requisitos */}
 <div className="p-3 bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl">
 <p className="text-[9px] font-bold uppercase tracking-wider text-[#4A6485] mb-1.5">Requisitos:</p>
 <ul className="space-y-1">
 {[
 { label: 'Al menos 8 caracteres', ok: newPassword.length >= 8 },
 { label: 'Letra mayúscula (recomendado)', ok: /[A-Z]/.test(newPassword) },
 { label: 'Número (recomendado)', ok: /[0-9]/.test(newPassword) },
 { label: 'Las contraseñas coinciden', ok: newPassword === confirmPassword && confirmPassword.length > 0 },
 ].map(req => (
 <li key={req.label} className={`flex items-center gap-1.5 text-[9px] font-medium transition-colors ${req.ok ? 'text-emerald-400' : 'text-[#6B83A0]'}`}>
 <span>{req.ok ? '✓' : '○'}</span>
 {req.label}
 </li>
 ))}
 </ul>
 </div>

 <button
 id="reset-submit-btn"
 type="submit"
 disabled={loading || newPassword !== confirmPassword || newPassword.length < 8}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative flex items-center gap-2">
 {loading ? (
 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 ) : (
 <>
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 Actualizar Contraseña
 </>
 )}
 </span>
 </button>
 </form>
 </div>
 )}

 {/* ── Éxito ── */}
 {state === 'success' && (
 <div className="space-y-5 text-center animate-in fade-in duration-500">
 <div className="relative mx-auto w-16 h-16">
 <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-[#2E96F5] rounded-full blur-xl opacity-50 animate-pulse" />
 <div className="relative w-16 h-16 bg-gradient-to-br from-emerald-500 to-[#2E96F5] rounded-full flex items-center justify-center">
 <svg className="w-8 h-8 text-[#0B2240]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 </div>
 <div>
 <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] mb-2">
 ¡Contraseña actualizada!
 </h1>
 <p className="text-[#4A6485] text-[11px] leading-relaxed">
 Tu contraseña fue cambiada exitosamente.
 Ahora puedes iniciar sesión con tu nueva contraseña.
 </p>
 </div>
 <button
 id="reset-go-login-btn"
 onClick={() => window.location.replace('/')}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98]"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative">Ir al inicio de sesión</span>
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
