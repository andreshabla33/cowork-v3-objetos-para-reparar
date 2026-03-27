import type { StateCreator } from 'zustand';
import type { StoreState } from '../state';
import type { Role, Workspace } from '../../types';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

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
      const workspaces: Workspace[] = (data || []).map((workspace: any) => ({
        id: workspace.id,
        name: workspace.nombre,
        descripcion: workspace.descripcion,
        slug: workspace.slug,
        width: 2000,
        height: 2000,
        items: [],
        userRole: workspace.miembros_espacio[0]?.rol as Role,
      }));

      set({ workspaces, authFeedback: null });
      return workspaces;
    } catch (error: any) {
      log.error('Fetch workspaces failed', { error: error?.message || String(error) });
      return [];
    }
  };
};
