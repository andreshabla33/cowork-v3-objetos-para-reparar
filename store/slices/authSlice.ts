/**
 * Auth Slice — Clean Architecture Domain Store
 *
 * Maneja: sesión, usuario actual, identidad, credenciales.
 * Side effects remotos (Supabase) se delegan a orchestrators.
 */
import type { StateCreator } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { User, Role, AvatarConfig, PresenceStatus } from '../../types';

export interface AuthSlice {
  session: Session | null;
  currentUser: User;
  authFeedback: { type: 'success' | 'error'; message: string } | null;
  initialized: boolean;
  isInitializing: boolean;

  setSession: (session: Session | null) => void;
  setAuthFeedback: (feedback: { type: 'success' | 'error'; message: string } | null) => void;
  setCurrentUser: (partial: Partial<User>) => void;
  setPosition: (x: number, y: number, direction?: User['direction'], isSitting?: boolean, isMoving?: boolean) => void;
  setEmpresaId: (empresaId: string | null) => void;
  setDepartamentoId: (departamentoId: string | null) => void;
  updateAvatar: (config: AvatarConfig) => Promise<void>;
  updateStatus: (status: PresenceStatus, statusText?: string) => Promise<void>;
  syncCurrentUserMediaState: (media: { isMicOn?: boolean; isCameraOn?: boolean; isScreenSharing?: boolean }) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: (val?: boolean) => void;
  setPrivacy: (isPrivate: boolean) => void;
  togglePrivacy: () => void;
  signOut: () => Promise<void>;
}

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (set, get) => ({
  session: null,
  currentUser: {
    id: 'guest',
    name: 'Invitado',
    role: 'invitado' as Role,
    avatar: '',
    avatarConfig: {
      skinColor: '#fcd34d',
      clothingColor: '#2563eb',
      hairColor: '#4b2c20',
      accessory: 'headphones',
    },
    x: 500,
    y: 500,
    direction: 'front',
    isSitting: false,
    isOnline: true,
    isPrivate: false,
    isMicOn: false,
    isCameraOn: false,
    isScreenSharing: false,
    status: 'available' as PresenceStatus,
  },
  authFeedback: null,
  initialized: false,
  isInitializing: false,

  setSession: (session) => {
    if (session) {
      const { user } = session;
      set({
        session,
        currentUser: {
          ...get().currentUser,
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
        },
      });
    } else {
      set({ session: null });
    }
  },

  setAuthFeedback: (authFeedback) => set({ authFeedback }),

  setCurrentUser: (partial) =>
    set((state) => ({ currentUser: { ...state.currentUser, ...partial } })),

  setPosition: (x, y, direction, isSitting, isMoving) => {
    const cu = get().currentUser;
    const nextDirection = direction || cu.direction;
    const nextIsSitting = isSitting !== undefined ? isSitting : cu.isSitting;
    const nextIsMoving = isMoving !== undefined ? isMoving : cu.isMoving;
    if (
      cu.x === x &&
      cu.y === y &&
      cu.direction === nextDirection &&
      cu.isSitting === nextIsSitting &&
      cu.isMoving === nextIsMoving
    ) {
      return;
    }
    set({
      currentUser: {
        ...cu,
        x,
        y,
        direction: nextDirection,
        isSitting: nextIsSitting,
        isMoving: nextIsMoving,
      },
    });
  },

  setEmpresaId: (empresaId) =>
    set((state) => ({
      currentUser: { ...state.currentUser, empresa_id: empresaId ?? undefined },
    })),

  setDepartamentoId: (departamentoId) =>
    set((state) => ({
      currentUser: { ...state.currentUser, departamento_id: departamentoId ?? undefined },
    })),

  updateAvatar: async (config) => {
    set((state) => ({ currentUser: { ...state.currentUser, avatarConfig: config } }));
  },

  updateStatus: async (status, statusText) => {
    set((state) => ({
      currentUser: {
        ...state.currentUser,
        status,
        statusText: statusText !== undefined ? statusText : state.currentUser.statusText,
      },
    }));
  },

  syncCurrentUserMediaState: (media) =>
    set((state) => ({
      currentUser: {
        ...state.currentUser,
        isMicOn: media.isMicOn ?? state.currentUser.isMicOn,
        isCameraOn: media.isCameraOn ?? state.currentUser.isCameraOn,
        isScreenSharing: media.isScreenSharing ?? state.currentUser.isScreenSharing,
      },
    })),

  toggleMic: () =>
    set((state) => ({
      currentUser: { ...state.currentUser, isMicOn: !state.currentUser.isMicOn },
    })),

  toggleCamera: () =>
    set((state) => ({
      currentUser: { ...state.currentUser, isCameraOn: !state.currentUser.isCameraOn },
    })),

  toggleScreenShare: (val) =>
    set((state) => ({
      currentUser: {
        ...state.currentUser,
        isScreenSharing: val !== undefined ? val : !state.currentUser.isScreenSharing,
      },
    })),

  setPrivacy: (isPrivate) =>
    set((state) => ({ currentUser: { ...state.currentUser, isPrivate } })),

  togglePrivacy: () =>
    set((state) => ({
      currentUser: { ...state.currentUser, isPrivate: !state.currentUser.isPrivate },
    })),

  signOut: async () => {
    set({ session: null, initialized: true, isInitializing: false });
  },
});
