import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignOutAction } from '../../../store/orchestrators/authStore';
import { createFetchWorkspacesAction } from '../../../store/orchestrators/workspaceStore';
import { createInitializeAction } from '../../../store/orchestrators/initializeStore';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
};

describe('store orchestrators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  it('createSignOutAction clears workspace persistence and resets critical state', async () => {
    mockSupabase.auth.signOut.mockResolvedValueOnce({ error: null });

    const set = vi.fn();
    const action = createSignOutAction(set as any, {
      storageWorkspaceKey: 'cowork_active_workspace_id',
    });

    await action();

    expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith('cowork_active_workspace_id');
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        session: null,
        view: 'dashboard',
        activeWorkspace: null,
        workspaces: [],
        initialized: true,
        isInitializing: false,
      }),
    );
  });

  it('createFetchWorkspacesAction returns [] when there is no authenticated user', async () => {
    const set = vi.fn();
    const get = vi.fn(() => ({ session: null }));
    const action = createFetchWorkspacesAction(set as any, get as any);

    const result = await action();

    expect(result).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('createFetchWorkspacesAction maps supabase rows into workspace domain shape', async () => {
    const set = vi.fn();
    const get = vi.fn(() => ({ session: { user: { id: 'user-1' } } }));

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
    };

    query.select.mockReturnValue(query);
    query.eq.mockImplementationOnce(() => query);
    query.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'ws-1',
          nombre: 'Workspace 1',
          descripcion: 'Desc',
          slug: 'workspace-1',
          miembros_espacio: [{ rol: 'admin' }],
        },
      ],
      error: null,
    });

    mockSupabase.from.mockReturnValue(query);

    const action = createFetchWorkspacesAction(set as any, get as any);
    const result = await action();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'ws-1',
        name: 'Workspace 1',
        width: 2000,
        height: 2000,
      }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ workspaces: expect.any(Array), authFeedback: null }),
    );
  });

  it('createInitializeAction returns early when initialization is already running', async () => {
    const set = vi.fn();
    const get = vi.fn(() => ({
      isInitializing: true,
      initialized: false,
      activeWorkspace: null,
      view: 'loading',
    }));

    const action = createInitializeAction(set as any, get as any, {
      initialAvatar: {
        skinColor: '#fcd34d',
        clothingColor: '#6366f1',
        hairColor: '#4b2c20',
        accessory: 'headphones',
      },
      storageWorkspaceKey: 'cowork_active_workspace_id',
    });

    await action();

    expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
