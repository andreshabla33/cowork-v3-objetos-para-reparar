/**
 * @module core/domain/ports/IWorkspaceBootstrapRepository
 * @description Domain port for workspace bootstrap queries during app initialization.
 *
 * Clean Architecture: Domain layer — pure interface, no Supabase deps.
 *
 * Problem solved:
 *   fetchWorkspaces took 4.8s due to RLS policies evaluated per-row
 *   (es_miembro_de_espacio(id) + invitados_ver_espacio EXISTS subquery).
 *   The SQL optimization (SECURITY DEFINER functions) makes the same
 *   PostgREST query fast (<200ms), but the domain port ensures the
 *   workspace loading contract is decoupled from Supabase infrastructure.
 *
 * Ref: Supabase RLS Performance Best Practices
 *   https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Role enum must match the database values exactly */
export type WorkspaceRole = 'super_admin' | 'admin' | 'moderador' | 'miembro' | 'invitado';

/** Workspace data returned by the bootstrap query */
export interface WorkspaceBootstrapData {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly slug: string | null;
  readonly userRole: WorkspaceRole;
}

// ─── Port Interface ─────────────────────────────────────────────────────────

export interface IWorkspaceBootstrapRepository {
  /**
   * Fetch all accepted workspaces for the authenticated user.
   *
   * Implementation note: The Supabase adapter uses the same PostgREST query
   * as before, but the underlying RLS policies now use SECURITY DEFINER
   * functions (private.get_user_workspace_ids) for O(1) per-statement
   * evaluation instead of O(N) per-row.
   *
   * @param userId  Authenticated user's UUID
   * @returns       Array of workspace data with user's role in each
   */
  fetchUserWorkspaces(userId: string): Promise<WorkspaceBootstrapData[]>;
}
