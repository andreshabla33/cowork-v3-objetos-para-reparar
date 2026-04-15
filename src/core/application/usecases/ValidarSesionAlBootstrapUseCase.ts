/**
 * @module application/usecases/ValidarSesionAlBootstrapUseCase
 *
 * Ejecuta el chequeo defensivo recomendado por la documentación oficial
 * de Supabase al iniciar la app: valida el JWT actual contra el servidor
 * y, si es stale (user borrado, token expirado, etc.), hace signOut
 * automático para dejar el cliente en estado limpio.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Application
 * ════════════════════════════════════════════════════════════════
 *
 * - Depende solo del port `IAuthRepository` (Domain).
 * - Sin imports de Supabase ni de adapters.
 * - Reutilizable desde cualquier orquestador (useBootstrapAplicacion,
 *   InvitationProcessor antes de verificar invitación, etc.).
 *
 * Contexto del bug que resuelve:
 *   Cuando un usuario es eliminado de `auth.users` pero el navegador aún
 *   guarda el JWT, el flujo de invitación falla silenciosamente
 *   (RLS rechaza queries con `auth.uid()` apuntando a un user borrado).
 *   En incógnito no pasa porque arranca con localStorage vacío.
 *
 * Doc oficial consultada:
 *   - https://supabase.com/docs/guides/auth/sessions
 *   - https://supabase.com/docs/reference/javascript/auth-getuser
 *   - https://supabase.com/docs/reference/javascript/auth-signout
 *
 * "Sessions are not proactively destroyed — the checks occur during the
 *  next refresh attempt" — Supabase docs.
 */

import type { IAuthRepository } from '../../domain/ports/IAuthRepository';
import { logger } from '@/lib/logger';

const log = logger.child('validar-sesion-bootstrap');

export interface ResultadoValidarSesionAlBootstrap {
  /** `true` si se forzó signOut porque la sesión estaba corrupta. */
  didSignOut: boolean;
  /** Motivo textual (útil para telemetría). */
  motivo?: string;
}

export class ValidarSesionAlBootstrapUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async ejecutar(): Promise<ResultadoValidarSesionAlBootstrap> {
    const resultado = await this.authRepo.validarSesionActiva();

    // No había sesión de entrada → nada que limpiar
    if (resultado.noSession) {
      return { didSignOut: false };
    }

    // Sesión válida → continuar normal
    if (resultado.valid) {
      return { didSignOut: false };
    }

    // Sesión inválida: JWT corrupto o user borrado.
    // Hacemos signOut y además limpiamos sessionStorage porque el token
    // de invitación puede estar cacheado de un flujo anterior.
    log.warn('Stale session detected at bootstrap — forcing signOut', {
      motivo: resultado.error,
    });

    await this.authRepo.cerrarSesion();

    // Limpiar también el token de invitación cacheado — si venía de un
    // flujo fallido previo, es mejor re-procesarlo desde URL fresca.
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('pendingInvitationToken');
    }

    return {
      didSignOut: true,
      motivo: resultado.error,
    };
  }
}
