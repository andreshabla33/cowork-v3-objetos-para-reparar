/**
 * @module hooks/auth/useLoginAuth
 * @description Hook that bridges LoginScreen UI with Clean Architecture use cases.
 * Manages form state, rate limiting, and delegates auth to use cases.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { InvitacionBannerData } from '@/src/core/domain/ports/IAuthRepository';
import { authRepository } from '@/src/core/infrastructure/adapters/AuthSupabaseRepository';
import { AutenticarConEmailUseCase } from '@/src/core/application/usecases/AutenticarConEmailUseCase';
import { AutenticarConOAuthUseCase } from '@/src/core/application/usecases/AutenticarConOAuthUseCase';
import { AutenticarComoInvitadoUseCase } from '@/src/core/application/usecases/AutenticarComoInvitadoUseCase';
import { BuscarInvitacionBannerUseCase } from '@/src/core/application/usecases/BuscarInvitacionBannerUseCase';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000;

// Singleton use case instances (Dependency Injection via constructor)
const autenticarConEmail = new AutenticarConEmailUseCase(authRepository);
const autenticarConOAuth = new AutenticarConOAuthUseCase(authRepository);
const autenticarComoInvitado = new AutenticarComoInvitadoUseCase(authRepository);
const buscarInvitacionBanner = new BuscarInvitacionBannerUseCase(authRepository);

export interface UseLoginAuthReturn {
  // Form state
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  fullName: string;
  setFullName: (fullName: string) => void;
  loading: boolean;
  isRegister: boolean;
  setIsRegister: (isRegister: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  showForgot: boolean;
  setShowForgot: (show: boolean) => void;
  invitacionBanner: InvitacionBannerData | null;
  authFeedback: { type: 'success' | 'error'; message: string } | null;
  setAuthFeedback: (feedback: { type: 'success' | 'error'; message: string } | null) => void;
  // Actions
  handleGuestLogin: () => Promise<void>;
  handleGoogleLogin: () => Promise<void>;
  handleEmailAuth: (e: React.FormEvent) => Promise<void>;
}

/**
 * Custom hook for LoginScreen authentication.
 * Provides form state management and delegates to Clean Architecture use cases.
 */
export function useLoginAuth(): UseLoginAuthReturn {
  const { setSession, authFeedback, setAuthFeedback } = useStore();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [invitacionBanner, setInvitacionBanner] = useState<InvitacionBannerData | null>(null);

  // Rate limiting
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // Check URL for invitation token on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      // Persistir token en sessionStorage para que sobreviva a redirects
      // (Google OAuth, confirmación por email) donde la URL pierde ?token=XYZ.
      // El viewResolver lo usa como fallback cuando el token no está en la URL.
      sessionStorage.setItem('pendingInvitationToken', token);

      void buscarInvitacionBanner.ejecutar(token).then((banner) => {
        if (banner) {
          setInvitacionBanner(banner);
          if (!email) setEmail(banner.email);
          // El usuario invitado es nuevo — activar modo registro automáticamente
          setIsRegister(true);
        }
      });
    }
  }, []);

  /**
   * Handler for guest/anonymous login.
   */
  const handleGuestLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resultado = await autenticarComoInvitado.ejecutar();
      if (resultado.error) throw new Error(resultado.error);
      if (resultado.session) setSession(resultado.session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(`No se pudo iniciar sesión como invitado. ${message}`);
    } finally {
      setLoading(false);
    }
  }, [setSession]);

  /**
   * Handler for Google OAuth login.
   */
  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthFeedback(null);
    try {
      const resultado = await autenticarConOAuth.ejecutar('google', window.location.origin);
      if (resultado.error) throw new Error(resultado.error);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error de Google: ${message}`);
      setLoading(false);
    }
  }, [setAuthFeedback]);

  /**
   * Handler for email-based login/registration.
   * Implements rate limiting and contextual error messages.
   */
  const handleEmailAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Rate limiting check
      if (lockedUntil && Date.now() < lockedUntil) {
        const secsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
        setError(`Demasiados intentos. Espera ${secsLeft}s antes de intentar de nuevo.`);
        return;
      }

      setLoading(true);
      setError(null);
      setAuthFeedback(null);

      try {
        if (isRegister) {
          // Usar window.location.href para preservar ?token=XYZ en el redirect
          // de confirmación por email. Sin esto, el link de confirmación redirige
          // al origin limpio y el token se pierde → el usuario cae en onboarding_creador.
          const resultado = await autenticarConEmail.registrar(
            email,
            password,
            fullName,
            window.location.href
          );
          if (resultado.error) throw new Error(resultado.error);
          if (resultado.session) {
            setSession(resultado.session);
          } else if (resultado.needsEmailConfirmation) {
            setAuthFeedback({
              type: 'success',
              message:
                '¡Revisa tu correo! Te enviamos un enlace de confirmación para activar tu cuenta.',
            });
            setIsRegister(false);
          }
        } else {
          const resultado = await autenticarConEmail.login(email, password);
          if (resultado.error) throw new Error(resultado.error);
          if (resultado.session) setSession(resultado.session);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
          setLoginAttempts(0);
          setError(
            `Demasiados intentos fallidos. Cuenta bloqueada por ${LOCKOUT_DURATION_MS / 1000}s.`
          );
        } else if (
          errorMessage === 'Invalid login credentials' ||
          errorMessage === 'Email not confirmed' ||
          errorMessage === 'User not found'
        ) {
          setError('Credenciales inválidas o cuenta no encontrada. Verifica tu correo y contraseña.');
        } else {
          setError('Error de autenticación. Intenta de nuevo.');
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, fullName, isRegister, lockedUntil, loginAttempts, setSession, setAuthFeedback]
  );

  return {
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
    loading,
    isRegister,
    setIsRegister,
    error,
    setError,
    showHelp,
    setShowHelp,
    showForgot,
    setShowForgot,
    invitacionBanner,
    authFeedback,
    setAuthFeedback,
    handleGuestLogin,
    handleGoogleLogin,
    handleEmailAuth,
  };
}
