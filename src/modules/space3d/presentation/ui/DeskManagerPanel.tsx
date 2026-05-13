'use client';
/**
 * @module space3d/ui/DeskManagerPanel
 *
 * Panel admin que lista todos los desks del espacio y permite:
 *  - Pre-asignar un desk a un miembro (dropdown).
 *  - Re-asignar (forzar — libera el reclamo previo automáticamente).
 *  - Quitar la asignación (volver a "sin pre-asignar").
 *  - Eliminar el desk.
 *
 * Inspirado en el "Desk Manager" de Gather. Visual minimalista con tabla
 * filterable por nombre / ocupante.
 *
 * El caller (AdminDeskHUD) provee `areas` + `onAsignar` (el adapter Supabase
 * se llama vía el hook `useAreasEscritorio`).
 */

import React, { useMemo, useState } from 'react';
import type { AreaEscritorio } from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';

export interface DeskManagerPanelProps {
  open: boolean;
  areas: AreaEscritorio[];
  onClose: () => void;
  /** Asigna (forzar=true reemplaza la reclamación actual). */
  onAsignar: (areaId: string, usuarioId: string | null, forzar?: boolean) => Promise<boolean>;
}

export const DeskManagerPanel: React.FC<DeskManagerPanelProps> = ({
  open,
  areas,
  onClose,
  onAsignar,
}) => {
  const onlineUsers = useStore((s) => s.onlineUsers);
  const [filtro, setFiltro] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Lookup de nombre por id (memoizado).
  const usuariosPorId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const u of onlineUsers) map.set(u.id, { id: u.id, name: u.name });
    return map;
  }, [onlineUsers]);

  const areasFiltradas = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return areas;
    return areas.filter((a) => {
      const ocupanteId = a.reclamado_por_usuario_id ?? a.asignado_a_usuario_id;
      const ocupante = ocupanteId ? usuariosPorId.get(ocupanteId)?.name ?? '' : '';
      return a.nombre.toLowerCase().includes(f) || ocupante.toLowerCase().includes(f);
    });
  }, [areas, filtro, usuariosPorId]);

  if (!open) return null;

  const handleAsignar = async (areaId: string, usuarioId: string | null, forzar = false) => {
    setBusyId(areaId);
    await onAsignar(areaId, usuarioId, forzar);
    setBusyId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-labelledby="desk-manager-title"
        className="w-[640px] max-w-[94vw] max-h-[80vh] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl text-zinc-100 flex flex-col"
      >
        <header className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 id="desk-manager-title" className="text-base font-semibold">Gestor de escritorios</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="px-5 pt-4">
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nombre o miembro..."
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {areasFiltradas.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-8">
              {areas.length === 0 ? 'Aún no hay desks designados. Usa "Designar desk" para crear el primero.' : 'Sin resultados.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {areasFiltradas.map((a) => {
                const ocupanteId = a.reclamado_por_usuario_id ?? a.asignado_a_usuario_id;
                const ocupante = ocupanteId ? usuariosPorId.get(ocupanteId) : null;
                const reclamado = !!a.reclamado_por_usuario_id;
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.nombre}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {a.bbox.ancho.toFixed(1)}×{a.bbox.alto.toFixed(1)}m
                          {a.audio_aislado && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              Audio aislado
                            </span>
                          )}
                          {ocupante && (
                            <span className="ml-2 text-zinc-400">
                              · {reclamado ? 'reclamado por' : 'reservado para'} <span className="text-zinc-200">{ocupante.name}</span>
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <select
                          value={a.asignado_a_usuario_id ?? ''}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            // Si hay un reclamo activo, forzar reasignación.
                            void handleAsignar(a.id, val, reclamado);
                          }}
                          disabled={busyId === a.id}
                          className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 disabled:opacity-50 max-w-[140px]"
                        >
                          <option value="">Sin pre-asignar</option>
                          {onlineUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-500">
          {areas.length} desk{areas.length === 1 ? '' : 's'} en este espacio
        </footer>
      </div>
    </div>
  );
};

DeskManagerPanel.displayName = 'DeskManagerPanel';
