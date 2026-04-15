/**
 * @module domain/ports/IAuthRepository
 * @description Port interface for authentication operations.
 * Decouples auth logic from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — Auth API (signInWithPassword, signUp, signInAnonymously, signInWithOAuth).
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

import type { Session } from '@supabase/supabase-js';

export interface ResultadoAuth {
  session: Session | null;
  needsEmailConfirmation?: boolean;
  error?: string;
}

/**
 * Resultado de validar la sesión activa contra el servidor.
 *
 * - `valid === true`: JWT presente y aceptado por auth server (user existe).
 * - `valid === false`: JWT inválido/expirado/user borrado → hacer signOut.
 * - `noSession === true`: no hay sesión (ni localStorage ni cookies) → OK.
 */
export interface ResultadoValidacionSesion {
  valid: boolean;
  noSession?: boolean;
  error?: string;
}

export interface InvitacionBannerData {
  email: string;
  espacioNombre: string;
  invitadorNombre: string;
  rol: string;
}

export interface IAuthRepository {
  /**
   * Sign in with email and password.
   */
  signInWithPassword(email: string, password: string): Promise<ResultadoAuth>;

  /**
   * Register a new user with email, password, and full name.
   * May require email confirmation depending on Supabase settings.
   */
  signUp(email: string, password: string, fullName: string, redirectUrl: string): Promise<ResultadoAuth>;

  /**
   * Sign in anonymously as a guest.
   */
  signInAnonymously(): Promise<ResultadoAuth>;

  /**
   * Sign in with OAuth provider (e.g., Google).
   * Redirects the browser — no session returned here.
   */
  signInWithOAuth(provider: 'google', redirectTo: string): Promise<ResultadoAuth>;

  /**
   * Query the invitations_pendientes table for banner display data.
   * Returns invitation metadata or null if not found / already used.
   */
  buscarInvitacionPorTokenHash(tokenHash: string): Promise<InvitacionBannerData | null>;

  /**
   * Valida la sesión activa contra el servidor de auth.
   *
   * Implementaciones deben llamar al endpoint oficial que VERIFICA el JWT
   * contra el registro real (no solo el cache local). En Supabase esto es
   * `supabase.auth.getUser()` — según la [doc oficial de sesiones]
   * (https://supabase.com/docs/guides/auth/sessions), los JWT no se
   * destruyen proactivamente cuando un user es borrado; solo el siguiente
   * intento de verificación puede detectarlo.
   */
  validarSesionActiva(): Promise<ResultadoValidacionSesion>;

  /**
   * Cierra la sesión del usuario actual — borra JWT del localStorage,
   * cookies y emite `SIGNED_OUT` a los listeners. Idempotente.
   */
  cerrarSesion(): Promise<void>;
}
