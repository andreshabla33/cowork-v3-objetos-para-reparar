/**
 * @module core/infrastructure/adapters/WorkspaceBootstrapSupabaseAdapter
 * @description Infrastructure adapter: Fetch user workspaces via Supabase PostgREST.
 *
 * Clean Architecture: Infrastructure layer — implements IWorkspaceBootstrapRepository.
 *
 * Performance optimization applied at SQL level:
 *   RLS policies on `espacios_trabajo` now use SECURITY DEFINER functions
 *   (private.get_user_workspace_ids) wrapped in SELECT, enabling the
 *   Postgres optimizer to cache the result as an initPlan.
 *
 *   Before: 4.8s (es_miembro_de_espacio() evaluated per-row)
 *   After:  <200ms (single SECURITY DEFINER call, cached per-statement)
 *
 * Ref: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices
 */

import { supabase } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';
import type {
  IWorkspaceBootstrapRepository,
  WorkspaceBootstrapData,
  WorkspaceRole,
} from '../../domain/ports/IWorkspaceBootstrapRepository';

const log = logger.child('workspace-bootstrap-adapter');

/** Raw row shape from PostgREST inner join */
interface WorkspaceRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  slug: string | null;
  miembros_espacio: Array<{ rol: WorkspaceRole; aceptado: boolean }>;
}

export class WorkspaceBootstrapSupabaseAdapter implements IWorkspaceBootstrapRepository {
  async fetchUserWorkspaces(userId: string): Promise<WorkspaceBootstrapData[]> {
    try {
      log.debug('Fetching workspaces', { userId });

      const { data, error } = await supabase
        .from('espacios_trabajo')
        .select('id, nombre, descripcion, slug, miembros_espacio!inner(rol, aceptado)')
        .eq('miembros_espacio.usuario_id', userId)
        .eq('miembros_espacio.aceptado', true);

      if (error) {
        log.error('Supabase error', { message: error.message, code: error.code });
        throw error;
      }

      const rows = (data as WorkspaceRow[]) ?? [];
      log.info('Workspaces fetched', { count: rows.length });

      return rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        descripcion: row.descripcion,
        slug: row.slug,
        userRole: row.miembros_espacio[0]?.rol ?? 'miembro',
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Fetch workspaces failed', { error: message });
      return [];
    }
  }
}
