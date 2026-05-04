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
import { WorkspaceSidebar, MobileNavOverlay, WorkspaceContentRouter } from './layout';
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
const MonicaDockInline = lazy(() => import('./MonicaDockInline'));
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
  // Fuente única para avatares: Supabase Presence (global cross-Room).
  //
  // NOTA (2026-04-23): previamente había un gate que filtraba onlineUsers por
  // `remoteParticipantIds` de LiveKit para evitar "ghosts" de Presence CRDT
  // (peers que tardan ~30s en propagar disconnect abrupto). Con multi-Room
  // meetings (moveParticipant), ese gate borraba del mapa a cualquier peer
  // que estuviera en otra Room — exactamente el bug reportado: "no veo al
  // usuario dentro/fuera de la sala". Patrón Gather-style: Presence alimenta
  // avatares globales, LiveKit solo gobierna media (aislamiento ya hecho en
  // useProximity via remoteParticipantIds para burbujas/voz).
  // Ghosts ocasionales de 30s son costo aceptable vs. romper multi-Room.
  // Ref: https://docs.livekit.io/home/server/managing-rooms/ (moveParticipant)
  const [onlineUsersRaw, setOnlineUsersRaw] = useState<User[]>([]);

  useEffect(() => {
    setOnlineUsers(onlineUsersRaw);
  }, [onlineUsersRaw, setOnlineUsers]);

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

      {/* Sidebar Aurora GLASS (desktop: fixed, mobile: overlay).
          La estética (anchura, glass, borde, sombra) vive 100% en
          ChatSidebarContent (.ag-side*) — sin estilos por tema aquí. */}
      {!isMobile ? (
        <Suspense fallback={<FallbackPanel />}>
          <div data-tour-step="sidebar-chat" className="contents">
            <ChatPanel sidebarOnly={true} showNotifications={true} />
          </div>
        </Suspense>
      ) : mobileDrawerOpen ? (
        <>
          <div
            className="fixed inset-0 z-[200]"
            style={{ background: 'rgba(11, 34, 64, 0.35)', backdropFilter: 'blur(8px)' }}
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 w-[85vw] max-w-[320px] z-[201] animate-in slide-in-from-left duration-300 overflow-hidden"
            style={{ boxShadow: '0 24px 60px -16px rgba(11, 34, 64, 0.35)' }}
          >
            <Suspense fallback={<FallbackPanel />}>
              <ChatPanel
                sidebarOnly={true}
                showNotifications={true}
                onChannelSelect={() => setMobileDrawerOpen(false)}
              />
            </Suspense>
          </aside>
        </>
      ) : null}

      {/* Main Content Area — sin header bar (calm design: less chrome, más espacio) */}
      <main className={`flex-1 relative h-full flex flex-col min-w-0 ${s.bg}`}>
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

        {/* ── Mónica AI FAB + dock bar ────────────────────────────── */}
        {/* FAB pill — siempre visible cuando dock cerrado */}
        {activeSubTab === 'space' && !showViben && (
          <button
            type="button"
            className="ag-monica-fab"
            onClick={() => setShowViben(true)}
            aria-label="Abrir Mónica AI"
          >
            M
          </button>
        )}

        {/* Dock bar bottom-center — solo visible cuando FAB clicked */}
        {activeSubTab === 'space' && showViben && (
          <div className="ag-monica-dock" aria-label="Mónica AI">
            <div className="ag-monica-dock__bar animate-in slide-in-from-bottom-4 duration-300">
              <button
                type="button"
                className="ag-monica-dock__avatar"
                onClick={() => setShowViben(false)}
                aria-label="Cerrar Mónica AI"
              >
                <span className="ag-monica-dock__avatar-ring" />
                M
              </button>
              <Suspense fallback={
                <input
                  type="text"
                  className="ag-monica-dock__input"
                  placeholder="Cargando Mónica AI..."
                  readOnly
                />
              }>
                <MonicaDockInline onClose={() => setShowViben(false)} />
              </Suspense>
              <button type="button" className="ag-monica-dock__action" title="Escribir" aria-label="Escribir" onClick={() => {
                const el = document.querySelector<HTMLInputElement>('.ag-monica-dock__input');
                el?.focus();
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button
                type="button"
                className="ag-monica-dock__close"
                onClick={() => setShowViben(false)}
                title="Minimizar"
                aria-label="Minimizar Mónica AI"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
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
