'use client';
/**
 * @module space3d/ui/AdminDeskHUD
 *
 * HUD admin (HTML, fuera del Canvas) para gestionar DeskAreas:
 *  - Toggle "Colocar desk" — entra al modo click-to-place. El preview 3D
 *    vive en Scene3D (DeskPlacerPreview) y sigue el cursor mientras está
 *    activo. Al hacer click sobre el piso, el state machine pasa a
 *    `asigning` y este HUD muestra el modal de asignación.
 *  - "Gestionar desks" — abre DeskManagerPanel (lista + asignar/reasignar).
 *  - Modal de asignación tras click (DeskAsignarModal).
 *
 * Visible solo para admin/super_admin/owner/creador.
 */

import React, { useEffect, useState } from 'react';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { DeskAsignarModal } from './DeskAsignarModal';
import { DeskManagerPanel } from './DeskManagerPanel';
import { useAreasEscritorio } from '@/modules/space3d/presentation/hooks/useAreasEscritorio';
import { PRESET_DESK_STANDARD } from '@/src/core/domain/entities/espacio3d/PresetDesk';

export interface AdminDeskHUDProps {
  workspaceId: string;
  miUsuarioId: string | null;
}

export const AdminDeskHUD: React.FC<AdminDeskHUDProps> = ({ workspaceId, miUsuarioId }) => {
  const deskPlacerEstado = useStore((s) => s.deskPlacerEstado);
  const deskPlacerPosicion = useStore((s) => s.deskPlacerPosicion);
  const setDeskPlacerActivo = useStore((s) => s.setDeskPlacerActivo);
  const deskPlacerCancelar = useStore((s) => s.deskPlacerCancelar);
  const deskPlacerResetTrasCommit = useStore((s) => s.deskPlacerResetTrasCommit);
  const onlineUsers = useStore((s) => s.onlineUsers);

  const { areas, colocarConPreset, asignar } = useAreasEscritorio(workspaceId, miUsuarioId);

  const [guardando, setGuardando] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Reset error al abrir modal.
  useEffect(() => {
    if (deskPlacerEstado === 'asigning') setErrorMensaje(null);
  }, [deskPlacerEstado]);

  const placerActivo = deskPlacerEstado === 'previewing' || deskPlacerEstado === 'asigning';

  const handleTogglePlacer = () => {
    if (placerActivo) {
      deskPlacerCancelar();
      setDeskPlacerActivo(false);
    } else {
      setDeskPlacerActivo(true);
    }
  };

  const handleConfirmarAsignacion = async (input: {
    nombre: string;
    asignadoAUsuarioId: string | null;
    audioAislado: boolean;
  }) => {
    if (!deskPlacerPosicion) return;
    setGuardando(true);
    setErrorMensaje(null);

    const resultado = await colocarConPreset({
      preset: PRESET_DESK_STANDARD,
      posicion: deskPlacerPosicion,
      nombre: input.nombre,
      asignadoAUsuarioId: input.asignadoAUsuarioId,
      audioAislado: input.audioAislado,
    });
    setGuardando(false);

    if (resultado.ok) {
      // Salir del modo + resetear state machine. El usuario debe volver a
      // hacer click en "Colocar desk" si quiere agregar otro.
      deskPlacerResetTrasCommit();
      setDeskPlacerActivo(false);
    } else {
      const msg =
        resultado.motivo === 'no_autorizado'
          ? 'No tienes permisos para colocar desks en este espacio.'
          : `No se pudo colocar el desk (${resultado.motivo}).`;
      setErrorMensaje(msg);
    }
  };

  const handleAsignar = async (areaId: string, usuarioId: string | null, forzar = false) => {
    const r = await asignar(areaId, usuarioId, forzar);
    return r.ok;
  };

  return (
    <>
      <div className="fixed top-24 right-4 z-[340] flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={handleTogglePlacer}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold shadow-lg transition-all ${
            placerActivo
              ? 'bg-orange-500/25 border-orange-400 text-orange-100'
              : 'bg-zinc-900/85 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
          }`}
          title={placerActivo ? 'Cancelar colocación' : 'Colocar nuevo escritorio'}
        >
          <span aria-hidden>📐</span>
          {placerActivo ? 'Cancelar' : 'Colocar desk'}
        </button>

        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-zinc-900/85 border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-semibold shadow-lg"
          title="Gestionar desks (asignar, reasignar, eliminar)"
        >
          <span aria-hidden>🪑</span>
          Gestionar desks ({areas.length})
        </button>
      </div>

      {deskPlacerEstado === 'previewing' && (
        <div className="fixed top-40 right-4 z-[340] max-w-[260px] pointer-events-none">
          <div className="px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-400/40 text-orange-100 text-[11px] shadow-lg">
            Mueve el cursor sobre el piso y haz click para colocar el desk.
          </div>
        </div>
      )}

      <DeskAsignarModal
        open={deskPlacerEstado === 'asigning'}
        miembros={onlineUsers}
        nombreDefault={`Desk #${areas.length + 1}`}
        posicion={deskPlacerPosicion}
        onConfirmar={handleConfirmarAsignacion}
        onCancelar={() => {
          deskPlacerCancelar();
          setDeskPlacerActivo(false);
        }}
        guardando={guardando}
        errorMensaje={errorMensaje}
      />

      <DeskManagerPanel
        open={panelOpen}
        areas={areas}
        onClose={() => setPanelOpen(false)}
        onAsignar={handleAsignar}
      />
    </>
  );
};

AdminDeskHUD.displayName = 'AdminDeskHUD';
