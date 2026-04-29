/**
 * UI Slice — Clean Architecture Domain Store
 *
 * Maneja: tema, vista actual, subtab, notificaciones, mini mode.
 * Puro estado de presentación, sin lógica de negocio.
 */
import type { StateCreator } from 'zustand';
import type { ThemeType } from '../../types';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'mention' | 'entry' | 'success' | 'error';
  timestamp: number;
}

export interface UISlice {
  theme: ThemeType;
  view: 'dashboard' | 'workspace' | 'invitation' | 'loading' | 'onboarding' | 'onboarding_creador' | 'reset_password';
  activeSubTab: 'space' | 'tasks' | 'miembros' | 'settings' | 'builder' | 'chat' | 'avatar' | 'calendar' | 'grabaciones' | 'metricas';
  notifications: Notification[];
  isMiniMode: boolean;
  /**
   * espacio_id pendiente para el onboarding tras aceptar invitación.
   * Evita que obtenerMiembroPendiente retorne una membresía de otro workspace
   * con rol diferente (bug ROLE-MISMATCH-001).
   */
  pendingOnboardingEspacioId: string | null;

  setTheme: (theme: ThemeType) => void;
  setView: (view: UISlice['view']) => void;
  setActiveSubTab: (tab: UISlice['activeSubTab']) => void;
  addNotification: (message: string, type?: Notification['type']) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setMiniMode: (val: boolean) => void;
  toggleMiniMode: () => void;
  setPendingOnboardingEspacioId: (id: string | null) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  theme: 'light',
  view: 'loading',
  activeSubTab: 'space',
  notifications: [],
  isMiniMode: false,
  pendingOnboardingEspacioId: null,

  setTheme: (theme) => set({ theme }),
  setView: (view) => set({ view }),
  setPendingOnboardingEspacioId: (id) => set({ pendingOnboardingEspacioId: id }),
  setActiveSubTab: (activeSubTab) => set({ activeSubTab }),

  addNotification: (message, type = 'info') =>
    set((state) => ({
      notifications: [
        { id: Math.random().toString(), message, type, timestamp: Date.now() },
        ...state.notifications,
      ].slice(0, 5),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
  setMiniMode: (val) => set({ isMiniMode: val }),
  toggleMiniMode: () => set((state) => ({ isMiniMode: !state.isMiniMode })),
});
