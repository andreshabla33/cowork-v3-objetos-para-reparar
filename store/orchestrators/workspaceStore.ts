import type { StateCreator } from 'zustand';
import type { StoreState } from '../state';
import type { Role, Workspace } from '../../types';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { toUndefined } from '../../src/core/domain/utils/nullSafe';

const log = logger.child('workspace-store');

type StoreSet = Parameters<StateCreator<StoreState>>[0];
type StoreGet = Parameters<StateCreator<StoreState>>[1];

export const createFetchWorkspacesAction = (
  set: StoreSet,
  get: StoreGet,
): StoreState['fetchWorkspaces'] => {
  return async () => {
    const { session } = get();
    const userId = session?.user?.id;
    if (!userId) {
      log.debug('No userId, returning empty');
      return [];
    }

    try {
      log.debug('Fetching workspaces', { userId });
      const { data, error } = await supabase
        .from('espacios_trabajo')
        .select('id, nombre, descripcion, slug, miembros_espacio!inner (rol, aceptado)')
        .eq('miembros_espacio.usuario_id', userId)
        .eq('miembros_espacio.aceptado', true);

      if (error) {
        log.error('Supabase error', { message: error.message, code: error.code });
        throw error;
      }

      log.info('Workspaces fetched', { count: data?.length || 0 });
      interface WorkspaceRow {
        id: string;
        nombre: string;
        descripcion: string | null;
        slug: string | null;
        miembros_espacio: Array<{ rol: Role; aceptado: boolean }>;
      }

      // Clean Arch boundary: Supabase (null) → Domain (undefined) via toUndefined.
      // Fix P0 — Domain drift del plan 34919757.
      const workspaces: Workspace[] = (data as WorkspaceRow[] || []).map((workspace) => ({
        id: workspace.id,
        name: workspace.nombre,
        descripcion: toUndefined(workspace.descripcion),
        slug: toUndefined(workspace.slug),
        width: 2000,
        height: 2000,
        items: [],
        userRole: workspace.miembros_espacio[0]?.rol,
      }));

      set({ workspaces, authFeedback: null });
      return workspaces;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Fetch workspaces failed', { error: message });
      return [];
    }
  };
};
