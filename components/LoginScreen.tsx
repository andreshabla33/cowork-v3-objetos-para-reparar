/**
 * @module components/LoginScreen
 * @description Login/Register screen — pure presentation component.
 * All auth logic delegated to useLoginAuth hook (Clean Architecture).
 *
 * Architecture:
 * - Zero direct Supabase imports
 * - useLoginAuth → Use Cases → IAuthRepository port → Supabase adapter
 * - Rate limiting and anti-enumeration handled in hook layer
 */

import React from 'react';
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

  // Mostrar pantalla de recuperación de contraseña
  if (showForgot) {
    return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#050508] p-4 lg:p-3 overflow-y-auto">
      {/* Fondo con gradientes neon animados */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-violet-600/15 blur-[180px] animate-pulse" />
        <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full bg-fuchsia-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        {/* Grid pattern sutil */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Card principal con glassmorphism 2026 - Optimizado */}
      <div className="w-full max-w-md lg:max-w-sm md:max-w-xs my-auto relative z-10">
        {/* Glow exterior */}
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[36px] lg:rounded-[28px] p-6 lg:p-5 md:p-4 shadow-2xl">
          {/* Header con logo gaming style - Compacto */}
          <div className="flex flex-col items-center mb-6 lg:mb-5">
            {/* Logo con glow neon */}
            <div className="relative group mb-4 lg:mb-3">
              <div className="absolute -inset-2 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="relative w-14 h-14 lg:w-12 lg:h-12 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 rounded-2xl flex items-center justify-center font-black text-3xl lg:text-2xl text-white shadow-2xl transform rotate-3 group-hover:rotate-0 group-hover:scale-105 transition-all duration-500">
                C
              </div>
            </div>
            {/* Título con efecto gradient */}
            <h1 className="text-3xl lg:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-1">
              COWORK
            </h1>
            <p className="text-zinc-500 text-[9px] lg:text-[8px] font-bold uppercase tracking-[0.4em]">Virtual Collaboration Hub</p>
          </div>

        {invitacionBanner && (
          <div className="mb-4 lg:mb-3 p-3 lg:p-2.5 bg-violet-500/10 border border-violet-500/30 rounded-xl animate-in slide-in-from-top-2">
            <div className="flex items-start gap-2">
              <span className="text-lg">🎉</span>
              <div className="flex-1">
                <p className="text-violet-300 text-[10px] lg:text-[9px] font-black leading-tight">
                  {invitacionBanner.invitadorNombre ? `${invitacionBanner.invitadorNombre} te invitó` : 'Te invitaron'} a <span className="text-white">{invitacionBanner.espacioNombre}</span>
                </p>
                <p className="text-zinc-500 text-[9px] lg:text-[8px] font-bold mt-0.5">
                  Crea tu cuenta con <span className="text-violet-400">{invitacionBanner.email}</span> usando Google o el formulario de abajo
                </p>
              </div>
            </div>
          </div>
        )}

        {authFeedback && (
          <div className={`mb-4 lg:mb-3 p-3 lg:p-2.5 rounded-xl animate-in slide-in-from-top-2 flex items-start gap-2 ${
            authFeedback.type === 'error'
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-green-500/10 border border-green-500/30 text-green-400'
          }`}>
            <div className={`shrink-0 w-5 h-5 lg:w-4 lg:h-4 rounded-full flex items-center justify-center font-bold text-[10px] lg:text-[9px] ${
              authFeedback.type === 'error' ? 'bg-red-500/20' : 'bg-green-500/20'
            }`}>{authFeedback.type === 'error' ? '!' : '✓'}</div>
            <p className="text-[10px] lg:text-[9px] font-bold leading-tight flex-1">{authFeedback.message}</p>
            <button onClick={() => setAuthFeedback(null)} className="opacity-50 hover:opacity-100 text-sm">×</button>
          </div>
        )}

        {error && (
          <div className="mb-4 lg:mb-3 p-3 lg:p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl animate-in slide-in-from-top-2">
            <div className="flex gap-2">
              <div className="shrink-0 w-6 h-6 lg:w-5 lg:h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-bold text-xs lg:text-[10px]">!</div>
              <div className="flex-1">
                <p className="text-red-400 text-[10px] lg:text-[9px] font-bold leading-tight">{error}</p>
                <button onClick={() => setShowHelp(!showHelp)} className="mt-1.5 text-[9px] lg:text-[8px] text-red-500 underline font-black uppercase tracking-widest hover:text-red-300">
                  {showHelp ? 'Ocultar Ayuda' : '¿Problemas para entrar?'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showHelp && (
          <div className="mb-5 lg:mb-4 p-4 lg:p-3 bg-zinc-950 border border-indigo-500/30 rounded-2xl text-[9px] lg:text-[8px] text-zinc-400 space-y-3 lg:space-y-2 animate-in fade-in duration-300">
            <p className="text-indigo-400 font-black uppercase tracking-[0.2em]">⚠️ Guía de Registro:</p>
            <p>Para usar una cuenta de correo real, debes usar el modo <strong>"Crea una aquí"</strong> en la parte inferior.</p>
            <div className="space-y-1.5">
              <p className="font-bold text-white italic">Requisitos:</p>
              <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                <li>Correo electrónico válido.</li>
                <li>Contraseña de al menos 8 caracteres.</li>
                <li>Confirmar el email si el sistema lo solicita.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── LOGIN-UX-REDESIGN (2026-04-14) ─────────────────────────────
            Jerarquía visual: Google = primario (arriba, glassmorphism con
            colores Google), email+password = secundario (abajo, estilo más
            discreto), invitado = terciario (link). Mejores prácticas B2B
            SaaS — Linear/Notion/Figma — reducen fricción sin excluir a
            usuarios sin cuenta Google. Toda la lógica del hook intacta. */}

        {/* ── PRIMARIO: Continuar con Google ─────────────────────────── */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="group relative w-full flex items-center justify-center gap-3 lg:gap-2.5 overflow-hidden backdrop-blur-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/20 hover:border-white/30 text-white py-4 lg:py-3.5 px-5 rounded-2xl font-black text-sm lg:text-xs transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-black/30"
        >
          {/* Glow interior al hover */}
          <span className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-fuchsia-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          {/* Google G multicolor oficial */}
          <svg className="relative w-5 h-5 lg:w-[18px] lg:h-[18px] shrink-0" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
          </svg>
          <div className="relative flex flex-col items-start">
            <span className="uppercase tracking-[0.15em]">
              {loading ? 'Conectando…' : 'Continuar con Google'}
            </span>
            <span className="text-[8px] lg:text-[7px] font-bold normal-case tracking-wider text-zinc-400 group-hover:text-violet-300 transition-colors">
              Recomendado · 1 paso, sin confirmación por correo
            </span>
          </div>
          {loading && (
            <div className="relative w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </button>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div className="my-5 lg:my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <span className="text-[9px] lg:text-[8px] font-black text-zinc-500 uppercase tracking-[0.25em]">
            {isRegister ? 'o regístrate con email' : 'o entra con email'}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* ── SECUNDARIO: Email + contraseña ──────────────────────────── */}
        <form onSubmit={handleEmailAuth} className="space-y-2.5 lg:space-y-2">
          {isRegister && (
            <div className="relative group animate-in slide-in-from-top-2 duration-300">
              <div className="absolute inset-y-0 left-4 lg:left-3 flex items-center pointer-events-none opacity-30 group-focus-within:opacity-100 transition-opacity">
                 <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <input
                type="text"
                name="name"
                placeholder="Nombre Completo"
                required={isRegister}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                autoComplete="name"
                className="w-full bg-black/30 backdrop-blur-sm border border-white/[0.06] rounded-xl pl-11 lg:pl-9 pr-4 lg:pr-3 py-3 lg:py-2.5 text-xs lg:text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-zinc-600 text-white"
              />
            </div>
          )}

          <div className="relative group">
            <div className="absolute inset-y-0 left-4 lg:left-3 flex items-center pointer-events-none opacity-30 group-focus-within:opacity-100 transition-opacity">
               <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <input
              type="email"
              name="email"
              placeholder="Correo electrónico"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-black/30 backdrop-blur-sm border border-white/[0.06] rounded-xl pl-11 lg:pl-9 pr-4 lg:pr-3 py-3 lg:py-2.5 text-xs lg:text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-zinc-600 text-white"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-4 lg:left-3 flex items-center pointer-events-none opacity-30 group-focus-within:opacity-100 transition-opacity">
               <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="w-full bg-black/30 backdrop-blur-sm border border-white/[0.06] rounded-xl pl-11 lg:pl-9 pr-4 lg:pr-3 py-3 lg:py-2.5 text-xs lg:text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all placeholder:text-zinc-600 text-white"
            />
          </div>

          {/* Enlace ¿Olvidaste tu contraseña? — solo en modo login */}
          {!isRegister && (
            <div className="flex justify-end pt-0.5">
              <button
                id="forgot-password-link"
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-[9px] lg:text-[8px] text-zinc-500 hover:text-violet-400 font-bold uppercase tracking-widest transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {/* CTA de email — secundario (menos peso visual que Google) */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-violet-500/40 text-zinc-200 hover:text-white px-5 py-2.5 lg:py-2 rounded-xl font-black text-[10px] lg:text-[9px] uppercase tracking-[0.15em] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 lg:w-3 lg:h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? 'Crear cuenta con email' : 'Entrar con email'}</span>
                <svg className="w-3 h-3 lg:w-2.5 lg:h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </>
            )}
          </button>
        </form>

        {/* ── TERCIARIO: invitado + toggle login/register ─────────────── */}
        <div className="mt-6 lg:mt-5 pt-4 lg:pt-3 border-t border-white/[0.04] flex flex-col items-center gap-2.5 lg:gap-2">
          <button
            onClick={handleGuestLogin}
            disabled={loading}
            className="flex items-center gap-1.5 text-[9px] lg:text-[8px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            <svg className="w-3 h-3 lg:w-2.5 lg:h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Explorar como invitado
          </button>
          <p className="text-center text-[9px] lg:text-[8px] text-zinc-600 font-bold uppercase tracking-widest">
            {isRegister ? '¿Ya tienes cuenta?' : '¿Nuevo por aquí?'}
            <button onClick={() => setIsRegister(!isRegister)} className="ml-2 text-violet-400 font-black hover:text-violet-300 transition-colors underline decoration-2 underline-offset-4">
              {isRegister ? 'Inicia Sesión' : 'Crea una aquí'}
            </button>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
};
