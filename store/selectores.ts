import type { StoreState } from './state';

export const seleccionarBootstrapApp = (state: StoreState) => ({
  session: state.session,
  setSession: state.setSession,
  view: state.view,
  setView: state.setView,
  initialize: state.initialize,
  initialized: state.initialized,
  setAuthFeedback: state.setAuthFeedback,
  fetchWorkspaces: state.fetchWorkspaces,
  setActiveWorkspace: state.setActiveWorkspace,
});

export const seleccionarEspacioVirtual2D = (state: StoreState) => ({
  currentUser: state.currentUser,
  users: state.users,
  activeWorkspace: state.activeWorkspace,
  setPosition: state.setPosition,
  toggleMic: state.toggleMic,
  toggleCamera: state.toggleCamera,
  toggleScreenShare: state.toggleScreenShare,
  togglePrivacy: state.togglePrivacy,
  setPrivacy: state.setPrivacy,
  theme: state.theme,
  addNotification: state.addNotification,
  session: state.session,
  onlineUsers: state.onlineUsers,
});

export const seleccionarSpace3DBase = (state: StoreState) => ({
  currentUser: state.currentUser,
  onlineUsers: state.onlineUsers,
  setPosition: state.setPosition,
  activeWorkspace: state.activeWorkspace,
  toggleMic: state.toggleMic,
  toggleCamera: state.toggleCamera,
  toggleScreenShare: state.toggleScreenShare,
  togglePrivacy: state.togglePrivacy,
  setPrivacy: state.setPrivacy,
  updateAvatar: state.updateAvatar,
  session: state.session,
  setActiveSubTab: state.setActiveSubTab,
  setActiveChatGroupId: state.setActiveChatGroupId,
  activeSubTab: state.activeSubTab,
  empresasAutorizadas: state.empresasAutorizadas,
  setEmpresasAutorizadas: state.setEmpresasAutorizadas,
  isEditMode: state.isEditMode,
  setIsEditMode: state.setIsEditMode,
  isDragging: state.isDragging,
  setIsDragging: state.setIsDragging,
});

export const seleccionarProcesadorInvitacion = (state: StoreState) => ({
  session: state.session,
  setAuthFeedback: state.setAuthFeedback,
  setView: state.setView,
  theme: state.theme,
  fetchWorkspaces: state.fetchWorkspaces,
});
