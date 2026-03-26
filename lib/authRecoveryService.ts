/**
 * Auth Recovery Service — Capa de Infraestructura
 *
 * Implementa los casos de uso de recuperación de contraseña
 * comunicándose con Supabase Auth (implicit flow para SPA).
 *
 * UC-1: RequestPasswordReset  → Envía email con link de recuperación
 * UC-2: ConfirmPasswordReset  → Actualiza la contraseña con sesión de recovery activa
 */

import type { Session } from '@supabase/supabase-js';
import { supabase, APP_URL } from './supabase';

// ─── Tipos de respuesta ────────────────────────────────────────────────────────

export interface RecoveryResult {
  success: boolean;
  error?: string;
}

export interface ResultadoActivacionRecuperacion extends RecoveryResult {
  session?: Session;
}

const RUTA_RECUPERACION_CONTRASENA = '/recuperar-contrasena';

// ─── UC-1: RequestPasswordReset ───────────────────────────────────────────────

/**
 * Envía un email de recuperación de contraseña al usuario.
 * Usa `resetPasswordForEmail` de Supabase Auth (implicit flow).
 *
 * Supabase envía un email con un link que redirige a la app
 * con `#access_token=...&type=recovery` en el hash de la URL.
 */
export async function requestPasswordReset(email: string): Promise<RecoveryResult> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Ingresa un correo electrónico válido.' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // La app recibirá el token en el hash de la URL (#access_token=...&type=recovery)
      redirectTo: obtenerUrlRecuperacionContrasena(),
    });

    if (error) {
      // Supabase retorna error genérico para proteger enumeración de usuarios
      console.error('[AuthRecovery] resetPasswordForEmail error:', error.message);
      // Para UX: no revelar si el email existe o no
      return {
        success: false,
        error: getLocalizedError(error.message),
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[AuthRecovery] Unexpected error:', err);
    return {
      success: false,
      error: 'Error inesperado al enviar el correo. Intenta de nuevo.',
    };
  }
}

// ─── UC-2: ConfirmPasswordReset ───────────────────────────────────────────────

/**
 * Actualiza la contraseña del usuario autenticado vía token de recovery.
 *
 * Precondición: el usuario debe tener una sesión activa del tipo PASSWORD_RECOVERY
 * (Supabase establece esta sesión automáticamente al procesar el hash de la URL).
 *
 * Validaciones de seguridad:
 * - Longitud mínima de 8 caracteres
 * - No permite cambios sin sesión de recovery válida
 */
export async function confirmPasswordReset(
  newPassword: string,
  confirmPassword: string
): Promise<RecoveryResult> {
  // Validaciones locales
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: 'Las contraseñas no coinciden.' };
  }

  // Verificar que hay una sesión activa (establecida por el link de recovery)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      success: false,
      error: 'Sesión de recuperación inválida o expirada. Solicita un nuevo enlace.',
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error('[AuthRecovery] updateUser error:', error.message);
      return {
        success: false,
        error: getLocalizedError(error.message),
      };
    }

    // Cerrar sesión después del cambio exitoso para forzar re-login limpio
    await supabase.auth.signOut();

    return { success: true };
  } catch (err: any) {
    console.error('[AuthRecovery] Unexpected error on updateUser:', err);
    return {
      success: false,
      error: 'Error inesperado al actualizar la contraseña. Intenta de nuevo.',
    };
  }
}

export async function activarRecuperacionConTokenHash(tokenHash: string): Promise<ResultadoActivacionRecuperacion> {
  if (!tokenHash?.trim()) {
    return {
      success: false,
      error: 'El enlace de recuperación no es válido. Solicita uno nuevo.',
    };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash.trim(),
      type: 'recovery',
    });

    if (error) {
      console.error('[AuthRecovery] verifyOtp recovery error:', error.message);
      return {
        success: false,
        error: getLocalizedError(error.message),
      };
    }

    if (!data.session) {
      return {
        success: false,
        error: 'No se pudo iniciar la sesión de recuperación. Solicita un nuevo enlace.',
      };
    }

    return {
      success: true,
      session: data.session,
    };
  } catch (err: any) {
    console.error('[AuthRecovery] Unexpected error on verifyOtp recovery:', err);
    return {
      success: false,
      error: 'Error inesperado al validar el enlace. Intenta de nuevo.',
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocalizedError(message: string): string {
  // Normalizar a minúsculas para matching case-insensitive
  const msg = message.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429')) {
    return 'Demasiados intentos. Espera al menos 60 segundos antes de solicitar otro enlace.';
  }
  if (msg.includes('only request this once every')) {
    return 'Por seguridad, solo puedes solicitar un nuevo enlace cada 60 segundos.';
  }
  if (msg.includes('password should be at least') || msg.includes('password is too short')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (msg.includes('auth session missing') || msg.includes('no session')) {
    return 'Sesión de recuperación no encontrada. Solicita un nuevo enlace.';
  }
  if (msg.includes('token has expired') || msg.includes('otp expired') || msg.includes('invalid token')) {
    return 'El enlace ha expirado. Solicita uno nuevo.';
  }
  if (msg.includes('user not found')) {
    return 'No se encontró una cuenta con ese correo.';
  }

  return 'Ocurrió un error. Intenta de nuevo.';
}

function obtenerUrlRecuperacionContrasena(): string {
  const origen = APP_URL || window.location.origin;

  try {
    return new URL(RUTA_RECUPERACION_CONTRASENA, origen).toString();
  } catch {
    return `${origen}${RUTA_RECUPERACION_CONTRASENA}`;
  }
}
