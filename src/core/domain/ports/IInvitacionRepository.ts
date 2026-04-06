/**
 * @module domain/ports/IInvitacionRepository
 * @description Port (interface) for invitation data access.
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — typed queries with JOIN support.
 */

import type { InvitacionInfo } from '../entities/invitation';

/** Payload for accepting an invitation (upserting workspace membership) */
export interface AceptarInvitacionPayload {
  espacio_id: string;
  usuario_id: string;
  rol: string;
  empresa_id: string;
  aceptado: boolean;
  aceptado_en: string;
  onboarding_completado: boolean;
}

export interface IInvitacionRepository {
  /**
   * Find a valid invitation by its token hash.
   * Returns null if not found, already used, or expired.
   */
  buscarPorTokenHash(tokenHash: string): Promise<{
    data: InvitacionInfo | null;
    estado: 'valido' | 'usado' | 'expirado' | 'error';
  }>;

  /**
   * Accept an invitation: upsert the membership and mark the invitation as used.
   */
  aceptar(payload: AceptarInvitacionPayload, tokenHash: string): Promise<void>;
}
