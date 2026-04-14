'use client';

/**
 * @module components/space3d/root/VirtualSpace3DStatusBanners
 *
 * Subcomponente del root `VirtualSpace3D` que agrupa los 6 banners de
 * estado y notificación social del espacio 3D:
 *
 *   - Showroom mode (banner superior cuando el espacio está en demo)
 *   - Conversación próxima bloqueada (banner rojo en llamada activa)
 *   - Incoming wave (notificación "X te está saludando")
 *   - Incoming nudge (notificación "X quiere tu atención")
 *   - Incoming invite (notificación "X te invita — Ir / cerrar")
 *   - Follow mode activo (banner "Siguiendo a X")
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (descomposición F4.2)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin lógica de negocio: render condicional + prop-drilling. Cada banner
 * está gated por su propia condición. Las interacciones (cerrar, aceptar)
 * se delegan al root vía callbacks.
 */

import React from 'react';
import type { User } from '@/types';

// ─── Tipos de incoming messages ───────────────────────────────────────────────

interface IncomingWave {
  from: string;
  fromName: string;
}
interface IncomingNudge {
  from: string;
  fromName: string;
}
interface IncomingInvite {
  from: string;
  fromName: string;
  x?: number;
  z?: number;
}

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface VirtualSpace3DStatusBannersProps {
  // Showroom
  showroomMode: boolean;
  showroomNombreVisitante?: string;
  showroomDuracionMin: number;

  // Proximity block
  hasActiveCall: boolean;
  conversacionProximaBloqueada: { nombre: string } | null;

  // Wave
  incomingWave: IncomingWave | null;
  onDismissWave: () => void;

  // Nudge
  incomingNudge: IncomingNudge | null;
  onDismissNudge: () => void;

  // Invite
  incomingInvite: IncomingInvite | null;
  onAcceptInvite: () => void;
  onDismissInvite: () => void;

  // Follow mode
  followTargetId: string | null;
  onStopFollow: () => void;
  usuariosEnChunks: User[];
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const VirtualSpace3DStatusBanners: React.FC<VirtualSpace3DStatusBannersProps> = ({
  showroomMode,
  showroomNombreVisitante,
  showroomDuracionMin,
  hasActiveCall,
  conversacionProximaBloqueada,
  incomingWave,
  onDismissWave,
  incomingNudge,
  onDismissNudge,
  incomingInvite,
  onAcceptInvite,
  onDismissInvite,
  followTargetId,
  onStopFollow,
  usuariosEnChunks,
}) => {
  return (
    <>
      {/* Banner Showroom Mode */}
      {showroomMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600/90 to-indigo-600/90 backdrop-blur-xl border border-white/20 shadow-2xl">
          <span className="text-lg">🏢</span>
          <div>
            <p className="text-white text-sm font-bold">
              Modo Demo{showroomNombreVisitante ? ` — ${showroomNombreVisitante}` : ''}
            </p>
            <p className="text-white/60 text-[10px]">
              Exploración del espacio virtual ({showroomDuracionMin} min)
            </p>
          </div>
        </div>
      )}

      {/* Banner de proximidad: conversación bloqueada por otro usuario */}
      {hasActiveCall && !showroomMode && conversacionProximaBloqueada && (
        <div className="absolute top-4 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-red-950/80 border-red-500/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <span className="text-sm">🔒</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">Conversación bloqueada</p>
                <p className="text-white/50 text-[9px]">
                  {conversacionProximaBloqueada.nombre} está en conversación privada
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notificación de Wave entrante */}
      {incomingWave && (
        <div className="fixed top-16 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingWave.fromName}</p>
                <p className="text-white/50 text-[9px]">te está saludando 👋</p>
              </div>
              <button
                onClick={onDismissWave}
                className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg
                  className="w-2.5 h-2.5 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación de Nudge entrante */}
      {incomingNudge && (
        <div className="fixed top-32 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-pink-500/15 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-pink-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingNudge.fromName}</p>
                <p className="text-white/50 text-[9px]">quiere tu atención 🔔</p>
              </div>
              <button
                onClick={onDismissNudge}
                className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg
                  className="w-2.5 h-2.5 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación de Invite entrante */}
      {incomingInvite && (
        <div className="fixed top-48 right-4 z-[201] animate-slide-in">
          <div className="backdrop-blur-xl rounded-2xl border shadow-2xl overflow-hidden bg-slate-950/80 border-slate-600/40">
            <div className="flex items-center gap-2 px-3.5 py-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3.5 h-3.5 text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{incomingInvite.fromName}</p>
                <p className="text-white/50 text-[9px]">te invita a unirte 📍</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={onAcceptInvite}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30"
                >
                  Ir
                </button>
                <button
                  onClick={onDismissInvite}
                  className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <svg
                    className="w-2.5 h-2.5 text-white/50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Follow Mode activo */}
      {followTargetId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[201]">
          <div className="bg-violet-600/80 backdrop-blur-xl text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 border border-violet-400/30">
            <svg
              className="w-4 h-4 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <span className="text-xs font-bold">
              Siguiendo a {usuariosEnChunks.find((u) => u.id === followTargetId)?.name || 'usuario'}
            </span>
            <button
              onClick={onStopFollow}
              className="ml-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-bold transition-colors"
            >
              Dejar de seguir
            </button>
          </div>
        </div>
      )}
    </>
  );
};
