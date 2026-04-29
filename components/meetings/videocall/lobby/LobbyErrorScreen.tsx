/**
 * @module components/meetings/videocall/lobby/LobbyErrorScreen
 *
 * Pantalla de error cuando la sala no puede cargarse.
 * Presentation layer — solo recibe el mensaje de error y lo renderiza.
 *
 * Tokens: colors.bg.primary, colors.border.subtle, colors.text, glass.card,
 *         composites.buttonSecondary, radius.card
 */

'use client';

import React from 'react';

interface LobbyErrorScreenProps {
  message: string;
}

export const LobbyErrorScreen: React.FC<LobbyErrorScreenProps> = ({ message }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-[#050508] p-6">
    {/* Fondo neon sutil */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[-30%] left-[-20%] h-[70%] w-[70%] rounded-full bg-blue-600/15 blur-[180px] animate-pulse" />
      <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
    </div>

    <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur-xl">
      {/* Icon */}
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
        <svg
          className="h-7 w-7 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h2 className="mb-2 text-lg font-bold text-white">No se puede acceder a la sala</h2>
      <p className="mb-6 text-sm leading-relaxed text-zinc-400">{message}</p>

      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 border border-white/5 px-5 py-2.5 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al inicio
      </a>
    </div>
  </div>
);
