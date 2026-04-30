/**
 * @module App
 * @description Root application component with declarative route resolution.
 * Refactored from imperative if/else chain to priority-ordered route table.
 *
 * Architecture:
 * - Declarative router: lib/routing/appRouter.ts
 * - URL state: memoized with useMemo (ARC-005)
 * - ThankYouScreen: extracted component (ARC-007)
 * - Clean Architecture: zero business logic in this file
 */

import React, { lazy, Suspense, useMemo } from 'react';
import { useStore } from './store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useBootstrapAplicacion } from './hooks/app/useBootstrapAplicacion';
import { useRutasReunion } from './hooks/app/useRutasReunion';
import { seleccionarBootstrapApp } from './store/selectores';
import { ESPACIO_GLOBAL_ID } from './lib/constants';
import { resolverRutaApp } from './lib/routing/appRouter';
import type { AppRouteKey } from './lib/routing/appRouter';
import './lib/i18n-config';
import { LoginScreen } from './components/LoginScreen';
import { PantallaAccesoRecuperacionContrasena } from './components/PantallaAccesoRecuperacionContrasena';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { InvitationProcessor } from './components/invitation/InvitationProcessor';
import { OnboardingCargoView } from './components/onboarding/OnboardingCargoView';
import { ThankYouScreen } from './components/meetings/ThankYouScreen';

// ─── Lazy-loaded routes ─────────────────────────────────────────────────
const Dashboard = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })));
const WorkspaceLayout = lazy(() => import('./components/WorkspaceLayout').then((m) => ({ default: m.WorkspaceLayout })));
const OnboardingCreador = lazy(() => import('./components/onboarding/OnboardingCreador').then((m) => ({ default: m.OnboardingCreador })));
const MeetingLobby = lazy(() => import('./components/meetings/videocall/MeetingLobby').then((m) => ({ default: m.MeetingLobby })));
const MeetingRoom = lazy(() => import('./components/meetings/videocall/MeetingRoom'));
const ExploradorPublico3D = lazy(() => import('./components/marketplace/ExploradorPublico3D').then((m) => ({ default: m.ExploradorPublico3D })));

// ─── Shared loading fallback ────────────────────────────────────────────
const FallbackPantalla = () => (
  <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center gap-6">
    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
    <div className="text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 animate-pulse">Cargando módulo</p>
      <p className="text-[8px] font-bold text-zinc-700 uppercase mt-2">Preparando experiencia...</p>
    </div>
  </div>
);

const LoadingVideocall = () => (
  <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center gap-6">
    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Cargando videollamada...</p>
  </div>
);

const LoadingWorkspace = () => (
  <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center gap-6">
    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
    <div className="text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 animate-pulse">Sincronizando Workspace</p>
      <p className="text-[8px] font-bold text-zinc-700 uppercase mt-2">Cargando datos de sesión y mapas...</p>
    </div>
  </div>
);

// ─── Route component map ────────────────────────────────────────────────
const App: React.FC = () => {
  const { session, setSession, view, setView, initialize, initialized, setAuthFeedback, fetchWorkspaces, setActiveWorkspace } = useStore(
    useShallow(seleccionarBootstrapApp)
  );
  const {
    directSalaId, inMeeting, meetingNombre, meetingToken,
    preferenciasIngresoReunion, showThankYou,
    cerrarAgradecimiento, iniciarLobbyInvitacion, mostrarAgradecimiento, salirSalaDirecta,
  } = useRutasReunion();

  useBootstrapAplicacion({ initialize, setSession, setView, setAuthFeedback });

  // ─── Memoized URL parsing (ARC-005) ──────────────────────────────────
  const urlState = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return {
      pathname: window.location.pathname,
      tipoRecuperacion: searchParams.get('type'),
      tokenHashRecuperacion: searchParams.get('token_hash'),
      confirmationUrl: searchParams.get('confirmation_url'),
      isRecoveryError:
        hashParams.get('error') === 'access_denied' &&
        (hashParams.get('error_code') === 'otp_expired' ||
         hashParams.get('error_code') === 'otp_disabled' ||
         (hashParams.get('error_description')?.toLowerCase().includes('expired') ?? false) ||
         (hashParams.get('error_description')?.toLowerCase().includes('invalid') ?? false)),
      errorDescription: hashParams.get('error_description') ?? undefined,
    };
  }, []);

  // ─── Declarative route resolution (ARC-006) ──────────────────────────
  const route: AppRouteKey = resolverRutaApp({
    session, initialized, view,
    pathname: urlState.pathname,
    tipoRecuperacion: urlState.tipoRecuperacion,
    tokenHashRecuperacion: urlState.tokenHashRecuperacion,
    confirmationUrl: urlState.confirmationUrl,
    isRecoveryError: urlState.isRecoveryError,
    showThankYou, meetingToken, inMeeting, directSalaId,
  });

  // ─── Route rendering ─────────────────────────────────────────────────
  switch (route) {
    case 'reset_password':
      return <ResetPasswordScreen />;

    case 'recovery_redirect':
      return (
        <PantallaAccesoRecuperacionContrasena
          tokenHash={urlState.tokenHashRecuperacion}
          confirmationUrl={urlState.confirmationUrl}
          onSesionRecuperacionLista={(nextSession) => {
            setSession(nextSession);
            setView('reset_password');
          }}
        />
      );

    case 'recovery_error':
      return <ResetPasswordScreen errorFromHash={true} errorDescription={urlState.errorDescription} />;

    case 'explorar':
      return <Suspense fallback={<FallbackPantalla />}><ExploradorPublico3D /></Suspense>;

    case 'thank_you':
      return <ThankYouScreen onClose={cerrarAgradecimiento} />;

    case 'meeting_lobby':
      return (
        <Suspense fallback={<FallbackPantalla />}>
          <MeetingLobby
            tokenInvitacion={meetingToken!}
            onJoin={iniciarLobbyInvitacion}
            onError={(error) => {
              // Inline log — App.tsx has no logger instance (pure composition layer)
              // The error is already logged inside MeetingLobby
              void error;
            }}
          />
        </Suspense>
      );

    case 'meeting_room':
      return (
        <Suspense fallback={<FallbackPantalla />}>
          <div className="fixed inset-0 z-[1000] bg-black">
            <MeetingRoom
              salaId=""
              tokenInvitacion={meetingToken!}
              nombreInvitado={meetingNombre}
              preferenciasIngreso={preferenciasIngresoReunion}
              onLeave={mostrarAgradecimiento}
            />
          </div>
        </Suspense>
      );

    case 'direct_sala_auth':
      return (
        <Suspense fallback={<FallbackPantalla />}>
          <div className="fixed inset-0 z-[1000] bg-black">
            <MeetingRoom salaId={directSalaId!} onLeave={salirSalaDirecta} />
          </div>
        </Suspense>
      );

    case 'direct_sala_loading':
      return <LoadingVideocall />;

    case 'direct_sala_login':
    case 'login':
      return <LoginScreen />;

    default:
      // Authenticated app shell — Aurora GLASS (tema base claro).
      // El fondo atmosférico vive en `aurora-glass.css` (.ag-app-shell aplicado al body).
      return (
        <div className="min-h-screen font-inter" style={{ color: 'var(--cw-ink-700)' }}>
          {route === 'app_loading' && <LoadingWorkspace />}

          {route === 'dashboard' && (
            <Suspense fallback={<FallbackPantalla />}><Dashboard /></Suspense>
          )}

          {route === 'workspace' && (
            <Suspense fallback={<FallbackPantalla />}><WorkspaceLayout /></Suspense>
          )}

          {route === 'invitation' && <InvitationProcessor />}
          {route === 'onboarding' && <OnboardingCargoView />}

          {route === 'onboarding_creador' && session && (
            <Suspense fallback={<FallbackPantalla />}>
              <OnboardingCreador
                userId={session.user.id}
                userEmail={session.user.email || ''}
                userName={session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Usuario'}
                onComplete={async () => {
                  const workspaces = await fetchWorkspaces();
                  const espacioGlobal = workspaces.find((ws) => ws.id === ESPACIO_GLOBAL_ID) || workspaces[0];
                  if (espacioGlobal) {
                    setActiveWorkspace(espacioGlobal, espacioGlobal.userRole);
                    setView('workspace');
                    return;
                  }
                  setView('dashboard');
                }}
              />
            </Suspense>
          )}
        </div>
      );
  }
};

export default App;
