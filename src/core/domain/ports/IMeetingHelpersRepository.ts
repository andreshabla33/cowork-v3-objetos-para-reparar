/**
 * @module domain/ports/IMeetingHelpersRepository
 * @description Port para queries auxiliares sobre `usuarios` y `miembros_espacio`
 * usadas en flujos de reuniones (calendario + sala + invitaciones).
 *
 * Sub-port de `IMeetingRepository` (split 2026-05-09, ITEM 17 fase B).
 *
 * Nota: estos 3 métodos son cross-feature potenciales (no exclusivos de
 * meetings). Si en el futuro se reutilizan en otros bounded contexts,
 * extraer a un `IUsuariosRepository` compartido sería el siguiente paso.
 */

import type { MiembroBasicoData } from './IMeetingRepository';

export interface IMeetingHelpersRepository {
  /** Fetch accepted workspace members (with email/nombre/avatar_url). */
  obtenerMiembrosEspacio(espacioId: string): Promise<MiembroBasicoData[]>;

  /** Fetch user info by IDs. */
  obtenerInfoUsuarios(userIds: string[]): Promise<MiembroBasicoData[]>;

  /** Get a user's job title/role in a workspace. */
  obtenerCargoUsuario(espacioId: string, usuarioId: string): Promise<string | null>;
}
