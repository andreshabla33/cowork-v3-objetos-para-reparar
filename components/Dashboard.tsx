/**
 * @module components/Dashboard
 * @description Menú principal de espacios — diseño Aurora GLASS.
 *
 * Aplica tendencias 2026–2027:
 *   - Spatial UI · Liquid Glass (capas con z-depth real)
 *   - Calm Design (1 acción principal, jerarquía clara, mucho aire)
 *   - AI-Native readiness (slot copiloto reservado abajo a la derecha)
 *   - Gamified Presence (status pills sutiles, no agresivos)
 *
 * Toda la estética vive en `styles/aurora-glass.css` (clases `.ag-*`).
 * Cero hardcoding de colores: cambiar tema = cambiar `data-theme` en <html>.
 *
 * Fondo animado: mismas capas y parallax que `LoginScreen` (clases `.cw-*` en
 * `styles/login-theme.css`), coherente con el inicio de sesión.
 */

import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Role } from '../types';
import { AICopilotSlot } from './ui/AICopilotSlot';

export const Dashboard: React.FC = () => {
  const { workspaces, setActiveWorkspace, currentUser, signOut, setAuthFeedback, authFeedback } = useStore(
    useShallow(s => ({
      workspaces: s.workspaces,
      setActiveWorkspace: s.setActiveWorkspace,
      currentUser: s.currentUser,
      signOut: s.signOut,
      setAuthFeedback: s.setAuthFeedback,
      authFeedback: s.authFeedback,
    }))
  );
  const parallaxRootRef = useRef<HTMLDivElement | null>(null);

  const totalEspacios = workspaces.length;

  // Parallax sutil del fondo (misma lógica que `LoginScreen`).
  useEffect(() => {
    const root = parallaxRootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layers = Array.from(
      root.querySelectorAll<HTMLElement>('.cw-orb, .cw-cell, .cw-particle')
    );
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      tx += (mx - tx) * 0.04;
      ty += (my - ty) * 0.04;
      layers.forEach((el, i) => {
        const depth = ((i % 4) + 1) * 6;
        el.style.translate = `${tx * depth}px ${ty * depth}px`;
      });
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={parallaxRootRef}
      className="cw-page-shell relative min-h-screen overflow-x-hidden"
    >
      <LoginStyleBackdrop />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-24 pt-10 lg:px-8">
        <DashboardHeader
          userName={currentUser?.name ?? 'Usuario'}
          totalEspacios={totalEspacios}
          onSignOut={signOut}
        />

        {authFeedback && (
          <FeedbackBanner
            type={authFeedback.type}
            message={authFeedback.message}
            onDismiss={() => setAuthFeedback(null)}
          />
        )}

        <section className="mt-10 ag-anim-up" aria-labelledby="espacios-heading">
          <header className="mb-6 flex items-end justify-between gap-4">
            <div>
              <span className="ag-eyebrow">Tus espacios</span>
              <h2 id="espacios-heading" className="ag-h2">
                Elige dónde continuar
              </h2>
            </div>
            <span className="ag-pill ag-pill--neutral">
              <span className="ag-pill__dot" aria-hidden="true" />
              {totalEspacios} {totalEspacios === 1 ? 'espacio' : 'espacios'}
            </span>
          </header>

          {workspaces.length === 0 && !authFeedback ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((ws: any) => (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  onOpen={() => setActiveWorkspace(ws, ws.userRole)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <AICopilotSlot
        label="Asistente Cowork"
        hint="IA · próximamente"
        onOpen={() => {
          // Reservado: aquí abrirá el copiloto contextual.
          // Mantener vacío hasta integración (AI-Native readiness).
        }}
      />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   Fondo estilo Login — grid animado, orbes, celdas, partículas, conectores SVG
   (markup alineado con `LoginScreen` / `styles/login-theme.css`)
   ──────────────────────────────────────────────────────────────────────── */
const LoginStyleBackdrop: React.FC = () => (
  <div
    className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    aria-hidden="true"
  >
    <div className="cw-grid-bg" />

    <svg
      className="cw-connector"
      preserveAspectRatio="none"
      viewBox="0 0 1440 900"
      aria-hidden="true"
    >
      <path d="M 100 200 Q 400 100, 700 300 T 1340 250" />
      <path d="M 80 700 Q 300 600, 600 750 T 1360 680" />
      <path d="M 1200 100 Q 1100 400, 1300 600" />
    </svg>

    <div className="cw-orb cw-orb--1" />
    <div className="cw-orb cw-orb--2" />
    <div className="cw-orb cw-orb--3" />

    {(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] as const).map((c, i) => (
      <div
        key={c}
        className={`cw-cell cw-cell--${c}${i % 3 === 1 ? ' cw-cell--alt' : ''}`}
      />
    ))}

    {(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const).map((p) => (
      <div key={p} className={`cw-particle cw-particle--${p}`} />
    ))}
  </div>
);

/* ────────────────────────────────────────────────────────────────────────
   Header del menú — branding, saludo, acción Salir
   ──────────────────────────────────────────────────────────────────────── */
interface DashboardHeaderProps {
  userName: string;
  totalEspacios: number;
  onSignOut: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ userName, onSignOut }) => (
  <header className="ag-anim-up flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
    <div className="flex items-center gap-4">
      <div className="ag-logo" aria-hidden="true">C</div>
      <div>
        <span className="ag-eyebrow">Cowork · Aurora</span>
        <h1 className="ag-h1">
          Hola, <span style={{ color: 'var(--cw-blue-600)' }}>{userName}</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--cw-ink-500)' }}>
          ¿Dónde quieres trabajar hoy?
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        className="ag-btn ag-btn--ghost"
        onClick={onSignOut}
      >
        Cerrar sesión
      </button>
    </div>
  </header>
);

/* ────────────────────────────────────────────────────────────────────────
   Banner feedback — calm, no invasivo
   ──────────────────────────────────────────────────────────────────────── */
interface FeedbackBannerProps {
  type: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}

const FeedbackBanner: React.FC<FeedbackBannerProps> = ({ type, message, onDismiss }) => {
  const isError = type === 'error';
  return (
    <div
      role="status"
      className="ag-anim-fade mt-6 flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 backdrop-blur"
      style={{
        background: isError ? 'rgba(224, 70, 74, 0.08)' : 'rgba(43, 210, 122, 0.10)',
        borderColor: isError ? 'rgba(224, 70, 74, 0.25)' : 'rgba(43, 210, 122, 0.30)',
        color: isError ? '#B11E22' : '#137A45',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold"
          style={{
            background: isError ? 'rgba(224, 70, 74, 0.18)' : 'rgba(43, 210, 122, 0.20)',
          }}
        >
          {isError ? '!' : '✓'}
        </span>
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button
        type="button"
        className="ag-btn ag-btn--ghost ag-btn--icon"
        aria-label="Cerrar aviso"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   Workspace card — Liquid Glass, microfísica suave, jerarquía calm
   ──────────────────────────────────────────────────────────────────────── */
interface WorkspaceCardProps {
  workspace: {
    id: string;
    name?: string;
    userRole?: string;
  };
  onOpen: () => void;
}

const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace, onOpen }) => {
  const initial = (workspace.name?.charAt(0) ?? 'W').toUpperCase();
  const role = workspace.userRole ?? 'member';
  const roleLabel = role.replace(/_/g, ' ');

  return (
    <button
      type="button"
      onClick={onOpen}
      className="ag-card ag-card--interactive ag-anim-up text-left"
      aria-label={`Entrar a ${workspace.name ?? 'espacio'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="ag-logo ag-logo--sm" aria-hidden="true">
          {initial}
        </div>
        <span className="ag-pill ag-pill--active">
          <span className="ag-pill__dot" aria-hidden="true" />
          Activo
        </span>
      </div>

      <h3 className="ag-card__title mt-5 truncate" title={workspace.name}>
        {workspace.name ?? 'Espacio'}
      </h3>
      <p className="ag-card__subtitle">
        Última visita · hoy
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <RoleBadge role={role} label={roleLabel} />
        <span
          className="ag-btn ag-btn--secondary ag-btn--sm"
          aria-hidden="true"
        >
          Entrar
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
};

const RoleBadge: React.FC<{ role: string; label: string }> = ({ role, label }) => {
  const variant =
    role === Role.SUPER_ADMIN || role === Role.ADMIN ? 'info' : 'neutral';
  return (
    <span className={`ag-pill ag-pill--${variant}`}>
      <span className="ag-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   Empty state — calm, una acción mental clara: pedir invitación
   ──────────────────────────────────────────────────────────────────────── */
const EmptyState: React.FC = () => (
  <div className="ag-surface ag-surface--ring ag-anim-up flex flex-col items-center gap-5 px-6 py-16 text-center">
    <div className="ag-logo ag-logo--lg" aria-hidden="true">∅</div>
    <div>
      <h3 className="ag-h2">Aún no perteneces a un espacio</h3>
      <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--cw-ink-500)' }}>
        Pide a tu administrador una invitación. En cuanto la aceptes,
        verás aquí tu primer espacio listo para entrar.
      </p>
    </div>
    <a
      className="ag-btn ag-btn--secondary"
      href="mailto:?subject=Invitación a Cowork"
    >
      Solicitar invitación
    </a>
  </div>
);
