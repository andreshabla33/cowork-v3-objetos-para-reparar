/**
 * @module components/WorkspaceLayout
 * @description Orchestrator component for the workspace view.
 *
 * Clean Architecture role: **Composition Root / Orchestrator**.
 * - Reads global state from the store
 * - Wires Application-layer hooks (useWorkspaceData, usePresenceChannels, usePresenceLifecycle)
 * - Delegates ALL presentation to child layout components (WorkspaceSidebar, WorkspaceHeader, etc.)
 * - Contains zero inline markup beyond top-level composition
 *
 * Ref: react.dev "Thinking in React" — a component should do one thing.
 *      This component's one thing is *composing* the workspace layout.
 *
 * Refactored 2026-04-13: extracted 825-line monolith into 6 focused modules.
 */

import React, { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import type { User } from '../types';
import { useStore } from '../store/useStore';
import { getThemeStyles } from '@/lib/theme';
import { MiniModeOverlay } from './MiniModeOverlay';
import { NotificationToast } from './ui/NotificationToast';
import { ProductTour } from './onboarding/ProductTour';
import { WorkspaceSidebar, WorkspaceHeader, MobileNavOverlay, WorkspaceContentRouter } from './layout';
import { getSettingsSection } from '../lib/userSettings';
import { cargarMetricasEspacio } from '../lib/metricasAnalisis';
import { Language, getCurrentLanguage, subscribeToLanguageChange } from '../lib/i18n';
import { useIdleDetection } from '../hooks/useIdleDetection';
import { useLogoutUser } from '../hooks/app/useLogoutUser';
import { useWorkspaceData } from '../hooks/workspace/useWorkspaceData';
import { usePresenceChannels } from '../hooks/workspace/usePresenceChannels';
import { usePresenceLifecycle } from '../hooks/workspace/usePresenceLifecycle';
import type { ThemeType } from '../types';
import type { GameInvitationData, PendingGameInvitation } from '../types/workspace';

const VirtualSpace3D = lazy(() => import('./VirtualSpace3D'));
const ChatPanel = lazy(() => import('./ChatPanel').then(m => ({ default: m.ChatPanel })));
const VibenAssistant = lazy(() => import('./VibenAssistant').then(m => ({ default: m.VibenAssistant })));
const GameHub = lazy(() => import('./games').then(m => ({ default: m.GameHub })));
const GameInvitationNotification = lazy(() => import('./games').then(m => ({ default: m.GameInvitationNotification })));
const SettingsModal = lazy(() => import('./settings/SettingsModal'));

const FallbackPanel = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex flex-col items-center gap-4 text-zinc-500">
      <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando módulo</p>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ORCHESTRATOR ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const WorkspaceLayout: React.FC = () => {
  // ── Store ──────────────────────────────────────────────────────────────
  const {
    activeWorkspace, activeSubTab, setActiveSubTab, setActiveWorkspace,
    currentUser, theme, setTheme, setView, session,
    setOnlineUsers, unreadChatCount, clearUnreadChat,
    userRoleInActiveWorkspace, setMiniMode, isMiniMode,
    setEmpresaId, setDepartamentoId, setEmpresasAutorizadas,
  } = useStore();
  // LiveKit-authoritative participant set — race-free gate to filter ghosts
  // out of `onlineUsers`. Supabase Presence CRDT takes ~30s to propagate
  // abrupt disconnects; LiveKit mutates remoteParticipants synchronously
  // before emitting ParticipantDisconnected (livekit/client-sdk-js Room.ts).
  const remoteParticipantIds = useStore((s) => s.remoteParticipantIds);

  // Raw presence output — filtered below before being pushed to the store.
  const [onlineUsersRaw, setOnlineUsersRaw] = useState<User[]>([]);

  useEffect(() => {
    // Warm-up: if LiveKit is not connected yet, don't gate — a bootstrap user
    // still needs to see their roster populate from Presence alone.
    const filtered = remoteParticipantIds.size === 0
      ? onlineUsersRaw
      : onlineUsersRaw.filter((u) => u.id === currentUser.id || remoteParticipantIds.has(u.id));
    setOnlineUsers(filtered);
  }, [onlineUsersRaw, remoteParticipantIds, currentUser.id, setOnlineUsers]);

  // ── Local UI state ─────────────────────────────────────────────────────
  const [showViben, setShowViben] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGameHub, setShowGameHub] = useState(false);
  const [isPlayingGame, setIsPlayingGame] = useState(false);
  const [pendingGameInvitation, setPendingGameInvitation] = useState<PendingGameInvitation | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());

  // ── Application-layer hooks (Clean Architecture) ───────────────────────
  useWorkspaceData({
    activeWorkspaceId: activeWorkspace?.id,
    userId: session?.user?.id,
    session,
    currentUserEmpresaId: currentUser.empresa_id ?? null,
    onEmpresaIdLoaded: setEmpresaId,
    onDepartamentoIdLoaded: setDepartamentoId,
    onAutorizacionesLoaded: setEmpresasAutorizadas,
  });

  const { syncPresenceByChunk, updatePresenceInChannels, forceRetrackAll, cleanup, checkChannelHealth, untrackAll } =
    usePresenceChannels({
      activeWorkspaceId: activeWorkspace?.id,
      userId: session?.user?.id,
      currentUser,
      sessionAccessToken: session?.access_token,
      onOnlineUsersChange: setOnlineUsersRaw,
    });

  usePresenceLifecycle({
    activeWorkspaceId: activeWorkspace?.id,
    userId: session?.user?.id,
    currentUser,
    syncPresenceByChunk,
    updatePresenceInChannels,
    forceRetrackAll,
    cleanup,
    checkChannelHealth,
  });

  const { logout, isLoggingOut } = useLogoutUser();
  useIdleDetection();

  // ── Register untrackAll globally so top-level page exit handler can call it ──
  // This avoids React unmount races: untrackAll is set ONCE on mount,
  // and persists even as React tears down. The page exit listener in index.tsx
  // will call it unconditionally.
  useEffect(() => {
    if ((window as any).__setUntrackFn) {
      (window as any).__setUntrackFn(untrackAll);
    }
  }, [untrackAll]);

  // ── Side effects (non-presence) ────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) { setMobileDrawerOpen(false); setMobileMenuOpen(false); }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) { setMobileDrawerOpen(false); setMobileMenuOpen(false); }
  }, [activeSubTab, isMobile]);

  useEffect(() => {
    const miniSettings = getSettingsSection('minimode');
    if (!miniSettings.enableMiniMode) return;
    setMiniMode(activeSubTab !== 'space');
  }, [activeSubTab, setMiniMode]);

  useEffect(() => {
    const unsub = subscribeToLanguageChange(() => setCurrentLang(getCurrentLanguage()));
    return unsub;
  }, []);

  useEffect(() => {
    const perf = getSettingsSection('performance');
    document.documentElement.classList.toggle('reduce-motion', !!perf.reducedMotion);
  }, []);

  useEffect(() => { if (!activeWorkspace) setView('dashboard'); }, [activeWorkspace, setView]);
  useEffect(() => { if (activeWorkspace?.id) cargarMetricasEspacio(activeWorkspace.id); }, [activeWorkspace?.id]);

  // ── Callbacks ──────────────────────────────────────────────────────────
  const handleGameInvitationAccepted = useCallback((invitacion: GameInvitationData, partidaId: string) => {
    setPendingGameInvitation({ invitacion, partidaId });
    setShowGameHub(true);
  }, []);

  const isAdmin = userRoleInActiveWorkspace === 'super_admin' || userRoleInActiveWorkspace === 'admin';

  // ── Guard ──────────────────────────────────────────────────────────────
  if (!activeWorkspace) return null;

  // ── Theme (Infrastructure) ─────────────────────────────────────────────
  const s = getThemeStyles(theme);

  // ── Render (Composition only — zero inline markup) ─────────────────────
  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-all duration-500 ${s.bg} ${s.text}`}>
      {/* Global Sidebar (desktop) */}
      <WorkspaceSidebar
        theme={theme} styles={s}
        activeSubTab={activeSubTab} currentLang={currentLang}
        userName={currentUser.name} userProfilePhoto={currentUser.profilePhoto}
        userStatus={currentUser.status} unreadChatCount={unreadChatCount}
        isLoggingOut={isLoggingOut}
        onNavigate={setActiveSubTab} onClearUnreadChat={clearUnreadChat}
        onOpenSettings={() => setShowSettings(true)}
        onNavigateToDashboard={() => setView('dashboard')}
        onNavigateToAvatar={() => setActiveSubTab('avatar')}
        onLogout={logout}
      />

      {/* Sidebar Chat Drawer (desktop: fixed, mobile: overlay) */}
      {!isMobile ? (
        <aside className={`w-[260px] ${s.sidebar} flex flex-col shrink-0 border-r ${s.border} z-90 shadow-2xl relative overflow-hidden`} data-tour-step="sidebar-chat">
          {theme === 'arcade' && <div className="absolute top-0 left-0 w-full h-1 bg-[#00ff41] animate-pulse" />}
          <Suspense fallback={<FallbackPanel />}><ChatPanel sidebarOnly={true} showNotifications={true} /></Suspense>
        </aside>
      ) : mobileDrawerOpen ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm" onClick={() => setMobileDrawerOpen(false)} />
          <aside className={`fixed inset-y-0 left-0 w-[85vw] max-w-[320px] ${s.sidebar} flex flex-col z-[201] shadow-2xl border-r ${s.border} animate-in slide-in-from-left duration-300 overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-xs font-black uppercase tracking-wider opacity-60">{activeWorkspace.name}</span>
              <button onClick={() => setMobileDrawerOpen(false)} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<FallbackPanel />}><ChatPanel sidebarOnly={true} showNotifications={true} onChannelSelect={() => setMobileDrawerOpen(false)} /></Suspense>
            </div>
          </aside>
        </>
      ) : null}

      {/* Main Content Area */}
      <main className={`flex-1 relative h-full flex flex-col min-w-0 ${s.bg}`}>
        <WorkspaceHeader
          theme={theme} styles={s} activeSubTab={activeSubTab} currentLang={currentLang}
          onThemeChange={(t) => setTheme(t as ThemeType)}
          onOpenGameHub={() => setShowGameHub(true)}
          onToggleViben={() => setShowViben(prev => !prev)}
        />

        <div className="flex-1 relative overflow-hidden">
          {/* VirtualSpace3D always mounted (keeps WebRTC/LiveKit alive) */}
          <div
            className={activeSubTab === 'space' ? 'h-full w-full' : 'absolute inset-0 pointer-events-none'}
            style={activeSubTab !== 'space' ? { visibility: 'hidden' } : undefined}
            data-tour-step="space-canvas"
          >
            <Suspense fallback={<FallbackPanel />}>
              <VirtualSpace3D theme={theme} isGameHubOpen={showGameHub} isPlayingGame={isPlayingGame} />
            </Suspense>
          </div>

          {activeSubTab !== 'space' && (
            <WorkspaceContentRouter
              activeSubTab={activeSubTab} theme={theme} styles={s} currentLang={currentLang}
              isMobile={isMobile}
              workspaceName={activeWorkspace.name} workspaceId={activeWorkspace.id}
              isAdmin={isAdmin} isLoggingOut={isLoggingOut}
              onNavigateToSpace={() => setActiveSubTab('space')}
              onLogout={logout}
            />
          )}
        </div>

        {/* Floating panels */}
        {showViben && (
          <div className="fixed bottom-4 right-4 z-[200] w-[calc(100vw-2rem)] sm:w-[340px] flex flex-col items-end pointer-events-none">
            <div className="w-full pointer-events-auto animate-in slide-in-from-right-4 duration-500">
              <Suspense fallback={<FallbackPanel />}><VibenAssistant onClose={() => setShowViben(false)} /></Suspense>
            </div>
          </div>
        )}

        {showGameHub && (
          <Suspense fallback={<FallbackPanel />}>
            <GameHub
              isOpen={showGameHub}
              onClose={() => { setShowGameHub(false); setIsPlayingGame(false); setPendingGameInvitation(null); }}
              espacioId={activeWorkspace.id} currentUserId={session?.user?.id}
              currentUserName={currentUser.name} pendingInvitation={pendingGameInvitation}
              onPendingInvitationHandled={() => setPendingGameInvitation(null)}
              onGamePlayingChange={setIsPlayingGame}
            />
          </Suspense>
        )}

        {activeWorkspace.id && session?.user?.id && (
          <Suspense fallback={null}>
            <GameInvitationNotification userId={session.user.id} espacioId={activeWorkspace.id} onAccept={handleGameInvitationAccepted} />
          </Suspense>
        )}

        {isMobile && (
          <MobileNavOverlay
            theme={theme} styles={s} isMenuOpen={mobileMenuOpen} unreadChatCount={unreadChatCount}
            onToggleMenu={() => { setMobileMenuOpen(!mobileMenuOpen); if (mobileDrawerOpen) setMobileDrawerOpen(false); }}
            onNavigate={setActiveSubTab} onClearUnreadChat={clearUnreadChat}
            onOpenGameHub={() => setShowGameHub(true)} onOpenSettings={() => setShowSettings(true)}
            onOpenDrawer={() => setMobileDrawerOpen(true)}
          />
        )}
      </main>

      {/* Global overlays */}
      {showSettings && (
        <Suspense fallback={<FallbackPanel />}>
          <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} workspaceId={activeWorkspace.id} isAdmin={isAdmin} currentTheme={theme} onThemeChange={(t) => setTheme(t as ThemeType)} />
        </Suspense>
      )}
      <MiniModeOverlay />
      <NotificationToast />
      {activeWorkspace.id && session?.user?.id && activeSubTab === 'space' && (
        <ProductTour espacioId={activeWorkspace.id} userId={session.user.id} rol={userRoleInActiveWorkspace || 'miembro'} />
      )}
    </div>
  );
};
