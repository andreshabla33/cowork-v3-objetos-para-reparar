/**
 * @module application/usecases/EnviarInvitacionUseCase
 * Caso de uso: Enviar una invitación de workspace a un usuario por email.
 *
 * Clean Architecture (REMEDIATION-007b):
 *  - Application Layer: orquesta el dominio sin conocer Supabase ni fetch directo.
 *  - Valida el email y el rol antes de delegar al repositorio.
 *  - Normaliza el email a minúsculas.
 *
 * @see domain/ports/IEnviarInvitacionRepository.ts — contrato del port
 * @see infrastructure/adapters/EnviarInvitacionSupabaseRepository.ts — implementación
 */

import type {
  IEnviarInvitacionRepository,
  EnviarInvitacionInput,
  EnviarInvitacionResult,
  RolInvitacion,
} from '../../domain/ports/IEnviarInvitacionRepository';

const ROLES_VALIDOS: readonly RolInvitacion[] = ['miembro', 'moderador', 'admin'];

export class EnviarInvitacionUseCase {
  constructor(private readonly repo: IEnviarInvitacionRepository) {}

  async ejecutar(input: EnviarInvitacionInput): Promise<EnviarInvitacionResult> {
    // ── Validaciones de dominio ──────────────────────────────────────────────
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { exito: false, mensaje: 'Correo electrónico inválido.' };
    }

    if (!input.espacioId) {
      return { exito: false, mensaje: 'El ID del espacio es requerido.' };
    }

    const rol = input.rol ?? 'miembro';
    if (!ROLES_VALIDOS.includes(rol)) {
      return { exito: false, mensaje: `Rol inválido: ${String(rol)}. Valores válidos: ${ROLES_VALIDOS.join(', ')}.` };
    }

    // ── Delegar al puerto de infraestructura ─────────────────────────────────
    return this.repo.enviar({
      ...input,
      email,
      rol,
      nombreInvitado: input.nombreInvitado?.trim() || undefined,
    });
  }
}
