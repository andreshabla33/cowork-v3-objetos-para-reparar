'use client';

/**
 * @module components/space3d/root/VirtualSpace3DStatusOverlays
 *
 * Subcomponente del root `VirtualSpace3D` que agrupa 3 overlays informativos
 * puntuales del espacio 3D:
 *
 *   - Indicador "Grabando" (top-center) — señal roja con ping durante grabación.
 *   - CTA "Solicitar acceso a zona privada" (bottom-right) — cuando el avatar
 *     está cerca de una zona de empresa ajena.
 *   - Toast de notificación de autorización (top-right) — respuesta a solicitudes
 *     de acceso, con CTA opcional para abrir canal compartido.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (descomposición F4.2b)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin lógica de negocio — render condicional + callbacks delegados al root.
 * El gating de cada overlay se centraliza aquí para mantener el root más
 * compacto.
 */

import React from 'react';
import type { ZonaEmpresa } from '@/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface NotificacionAutorizacion {
  id: string;
  titulo: string;
  mensaje?: string | null;
  tipo: string;
  datos_extra?: Record<string, unknown> | null;
}

export interface ZonaAccesoProxima {
  zona: ZonaEmpresa;
  distancia: number;
  pendiente: boolean;
}

export interface VirtualSpace3DStatusOverlaysProps {
  // Indicador de grabación
  showRecordingIndicator: boolean;

  // CTA zona privada
  zonaAccesoProxima: ZonaAccesoProxima | null;
  solicitandoAcceso: boolean;
  onSolicitarAccesoZona: () => void | Promise<void>;

  // Toast de autorización
  notificacionAutorizacion: NotificacionAutorizacion | null;
  onDismissNotificacionAutorizacion: () => void;
  onAbrirCanalCompartido: (canalId: string) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const VirtualSpace3DStatusOverlays: React.FC<VirtualSpace3DStatusOverlaysProps> = ({
  showRecordingIndicator,
  zonaAccesoProxima,
  solicitandoAcceso,
  onSolicitarAccesoZona,
  notificacionAutorizacion,
  onDismissNotificacionAutorizacion,
  onAbrirCanalCompartido,
}) => {
  return (
    <>
      {/* Indicador de grabación activa */}
      {showRecordingIndicator && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-red-500/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-red-400 text-xs font-medium">Grabando</span>
          </div>
        </div>
      )}

      {/* CTA: Solicitar acceso a zona privada */}
      {zonaAccesoProxima && (
        <div className="fixed bottom-32 right-4 z-[201] animate-slide-in">
          <div className="bg-slate-950/80 border border-slate-700/50 backdrop-blur-xl px-4 py-3 rounded-xl shadow-2xl w-64">
            <div className="text-xs text-slate-300">Estás cerca de una zona privada</div>
            <div className="text-sm text-white font-semibold">
              {zonaAccesoProxima.zona.nombre_zona ||
                zonaAccesoProxima.zona.empresa?.nombre ||
                'Zona privada'}
            </div>
            <button
              onClick={() => void onSolicitarAccesoZona()}
              disabled={zonaAccesoProxima.pendiente || solicitandoAcceso}
              className="mt-2 w-full rounded-lg bg-emerald-500/90 text-white text-xs py-2 font-semibold disabled:opacity-50"
            >
              {zonaAccesoProxima.pendiente
                ? 'Solicitud pendiente'
                : solicitandoAcceso
                  ? 'Enviando...'
                  : 'Solicitar acceso'}
            </button>
          </div>
        </div>
      )}

      {/* Toast notificaciones de autorizaciones */}
      {notificacionAutorizacion && (
        <div className="fixed top-36 right-4 z-[202] animate-slide-in">
          <div className="bg-slate-900/90 border border-slate-700/60 backdrop-blur-xl px-4 py-3 rounded-xl shadow-2xl w-72">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {notificacionAutorizacion.titulo}
                </p>
                {notificacionAutorizacion.mensaje && (
                  <p className="text-xs text-slate-300 mt-1">
                    {notificacionAutorizacion.mensaje}
                  </p>
                )}
              </div>
              <button
                onClick={onDismissNotificacionAutorizacion}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            {typeof notificacionAutorizacion.datos_extra?.canal_compartido_id === 'string' && (
              <button
                onClick={() =>
                  onAbrirCanalCompartido(
                    notificacionAutorizacion.datos_extra?.canal_compartido_id as string,
                  )
                }
                className="mt-2 w-full rounded-lg bg-sky-500/80 text-white text-xs py-2 font-semibold"
              >
                Abrir canal compartido
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
