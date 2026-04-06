/**
 * Workspace Slice — Clean Architecture Domain Store
 *
 * Maneja: workspaces, workspace activo, items del espacio, zona de empresa.
 * Side effects remotos (Supabase) se delegan a orchestrators/workspaceStore.
 */
import type { StateCreator } from 'zustand';
import type { Workspace, Role, SpaceItem, ZonaEmpresa } from '../../types';
import type { UISlice } from './uiSlice';

interface WorkspaceSliceDependencies {
  authFeedback: { type: 'success' | 'error'; message: string } | null;
  view: UISlice['view'];
  activeSubTab: UISlice['activeSubTab'];
}

const STORAGE_WS_KEY = 'cowork_active_workspace_id';

export interface WorkspaceSlice {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  userRoleInActiveWorkspace: Role | null;
  zonasEmpresa: ZonaEmpresa[];
  empresasAutorizadas: string[];

  setWorkspaces: (workspaces: Workspace[]) => void;
  fetchWorkspaces: () => Promise<Workspace[]>;
  setActiveWorkspace: (workspace: Workspace | null, role?: Role) => void;
  setZonasEmpresa: (zonas: ZonaEmpresa[]) => void;
  setEmpresasAutorizadas: (empresas: string[]) => void;
  addSpaceItem: (item: SpaceItem) => void;
  updateSpaceItem: (id: string, updates: Partial<SpaceItem>) => void;
  removeSpaceItem: (id: string) => void;
}

export const createWorkspaceSlice: StateCreator<WorkspaceSliceDependencies & WorkspaceSlice, [], [], WorkspaceSlice> = (set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  userRoleInActiveWorkspace: null,
  zonasEmpresa: [],
  empresasAutorizadas: [],

  setWorkspaces: (workspaces) => set({ workspaces }),
  setZonasEmpresa: (zonas) => set({ zonasEmpresa: zonas }),
  setEmpresasAutorizadas: (empresas) => set({ empresasAutorizadas: empresas }),

  // Implementación real se inyecta desde orchestrators/workspaceStore
  fetchWorkspaces: async () => [],


  setActiveWorkspace: (workspace, role) => {
    if (workspace) {
      const current = get().activeWorkspace;
      const isSameWorkspace = current?.id === workspace.id;
      localStorage.setItem(STORAGE_WS_KEY, workspace.id);
      set({
        activeWorkspace: workspace,
        userRoleInActiveWorkspace: role || (workspace as Workspace & { userRole?: Role }).userRole || null,
        view: 'workspace',
        ...(isSameWorkspace ? {} : { activeSubTab: 'space' }),
      });
    } else {
      localStorage.removeItem(STORAGE_WS_KEY);
      set({ activeWorkspace: null, userRoleInActiveWorkspace: null, view: 'dashboard' });
    }
  },

  addSpaceItem: (item) =>
    set((state) => {
      if (!state.activeWorkspace) return state;
      return {
        activeWorkspace: {
          ...state.activeWorkspace,
          items: [...state.activeWorkspace.items, item],
        },
      };
    }),

  updateSpaceItem: (id, updates) =>
    set((state) => {
      if (!state.activeWorkspace) return state;
      return {
        activeWorkspace: {
          ...state.activeWorkspace,
          items: state.activeWorkspace.items.map((i) =>
            i.id === id ? { ...i, ...updates } : i,
          ),
        },
      };
    }),

  removeSpaceItem: (id) =>
    set((state) => {
      if (!state.activeWorkspace) return state;
      return {
        activeWorkspace: {
          ...state.activeWorkspace,
          items: state.activeWorkspace.items.filter((i) => i.id !== id),
        },
      };
    }),
});
