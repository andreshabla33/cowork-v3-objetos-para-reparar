/**
 * @module components/meetings/videocall/lobby/LobbyJoinPanel
 *
 * Panel derecho del lobby: título de la reunión, formulario de ingreso y
 * botón de unirse.
 *
 * Diseño inspirado en Google Meet + Glassmorphism 2026 del proyecto.
 *
 * Tokens usados:
 *   colors.bg.primary/tertiary, colors.text.*, colors.border.subtle/focus
 *   composites.buttonPrimary, composites.inputBase
 *   typography.heading/label, radius.button/input
 *
 * Presentation layer — recibe estado y callbacks de useLobbyState.
 */

'use client';

import React from 'react';
import type { SalaInfo } from '@/src/core/domain/entities/lobby';
import type { JoinStatusIndicator } from '@/src/core/domain/entities/lobby';

interface LobbyJoinPanelProps {
  salaInfo: SalaInfo | null;
  nombre: string;
  email: string;
  /** Oculta el campo de email cuando ya viene pre-rellenado por el token de invitación */
  hasInvitacionToken: boolean;
  joining: boolean;
  joinButtonLabel: string;
  statusIndicator: JoinStatusIndicator;
  /** Slot para LobbyStatusHints */
  statusHints?: React.ReactNode;
  onNombreChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onJoin: () => void;
}

// ── Paleta del indicador de estado ───────────────────────────────────────────
const STATUS_STYLES: Record<JoinStatusIndicator['tone'], { dot: string; text: string }> = {
  ready: { dot: 'bg-emerald-400', text: 'text-green-400' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-300' },
  error: { dot: 'bg-red-400', text: 'text-red-400' },
  preparing: { dot: 'bg-zinc-400 animate-pulse', text: 'text-zinc-500' },
};

// ── Componente ────────────────────────────────────────────────────────────────

export const LobbyJoinPanel: React.FC<LobbyJoinPanelProps> = ({
  salaInfo,
  nombre,
  email,
  hasInvitacionToken,
  joining,
  joinButtonLabel,
  statusIndicator,
  statusHints,
  onNombreChange,
  onEmailChange,
  onJoin,
}) => {
  const statusStyle = STATUS_STYLES[statusIndicator.tone];

  return (
    <div className="flex h-full flex-col justify-center p-6 sm:p-7 lg:p-8 xl:p-10 2xl:p-12">

      {/* ── Encabezado de la reunión ─────────────────────────────────── */}
      <div className="mb-6 sm:mb-8 2xl:mb-10">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Reunión programada
        </p>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-white lg:text-3xl xl:text-[2rem] 2xl:text-4xl">
          {salaInfo?.nombre ?? 'Cargando...'}
        </h1>
        {salaInfo?.organizador && (
          <p className="text-sm text-zinc-400 lg:text-base">
            Organizado por{' '}
            <span className="font-black text-white">{salaInfo.organizador}</span>
          </p>
        )}
      </div>

      {/* ── Formulario ───────────────────────────────────────────────── */}
      <form
        className="flex flex-col gap-4 lg:gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
      >
        {/* Campo de nombre */}
        <div>
          <label
            htmlFor="lobby-nombre"
            className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500"
          >
            Tu nombre
          </label>
          <input
            id="lobby-nombre"
            type="text"
            value={nombre}
            onChange={(e) => onNombreChange(e.target.value)}
            placeholder="¿Cómo te llaman?"
            autoComplete="name"
            maxLength={80}
            disabled={joining}
            className="w-full rounded-xl border border-white/5 bg-black/40 px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50 2xl:px-5 2xl:py-4 2xl:text-base"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Este nombre será visible para los demás participantes.
          </p>
        </div>

        {/* Campo de email (solo sin token de invitación) */}
        {!hasInvitacionToken && (
          <div>
            <label
              htmlFor="lobby-email"
              className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500"
            >
              Email{' '}
              <span className="normal-case tracking-normal font-normal text-zinc-600">
                (opcional)
              </span>
            </label>
            <input
              id="lobby-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              disabled={joining}
              className="w-full rounded-xl border border-white/5 bg-black/40 px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50 2xl:px-5 2xl:py-4 2xl:text-base"
            />
          </div>
        )}

        {/* Hints de estado (browser warnings, preflight, sala espera…) */}
        {statusHints && <div>{statusHints}</div>}

        {/* Botón de join — gradient primario del design system */}
        <button
          type="submit"
          disabled={joining || !nombre.trim()}
          className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 px-5 py-4 text-xs font-black uppercase tracking-wider text-white shadow-2xl shadow-violet-600/30 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 2xl:py-5 2xl:text-sm"
        >
          {/* Hover overlay */}
          <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 transition-opacity duration-300 hover:opacity-100" />
          {joining ? (
            <span className="relative flex items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
              Conectando...
            </span>
          ) : (
            <span className="relative flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {joinButtonLabel}
            </span>
          )}
        </button>
      </form>

      {/* ── Indicador de estado (preflight readiness) ─────────────── */}
      <div className="mt-5 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${statusStyle.dot}`} />
        <span className={`text-xs font-bold ${statusStyle.text}`}>
          {statusIndicator.label}
        </span>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <p className="mt-auto pt-8 text-center text-xs font-bold leading-relaxed text-zinc-500 sm:mt-8 2xl:text-sm">
        Al unirte aceptas compartir tu audio y video con los participantes
      </p>
    </div>
  );
};
