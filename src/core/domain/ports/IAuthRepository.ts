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
}
