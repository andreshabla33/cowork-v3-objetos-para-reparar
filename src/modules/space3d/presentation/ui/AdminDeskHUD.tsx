'use client';
/**
 * @module space3d/ui/AdminDeskHUD
 *
 * HUD admin para gestionar DeskAreas (estilo Gather Desk Manager):
 *  - Toggle "Designar desk" — entra al modo drag-to-create. El state machine
 *    vive en el `editorSlice`; Scene3D wired los pointer handlers al floor.
 *  - Botón "Gestionar desks" — abre el `DeskManagerPanel` (lista + asignar
 *    / reasignar / eliminar).
 *  - Modal de naming — aparece cuando el state machine pasa a 'naming' (tras
 *    soltar el drag); confirma o cancela el commit al servidor.
 *
 * Visible solo para admin/super_admin/owner/creador.
 */

import React, { useEffect, useState } from 'react';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { DeskNamingModal } from './DeskNamingModal';
import { DeskManagerPanel } from './DeskManagerPanel';
import { useAreasEscritorio } from '@/modules/space3d/presentation/hooks/useAreasEscritorio';

export interface AdminDeskHUDProps {
  workspaceId: string;
  miUsuarioId: string | null;
}

export const AdminDeskHUD: React.FC<AdminDeskHUDProps> = ({ workspaceId, miUsuarioId }) => {
  const isDesignandoDesk = useStore((s) => s.isDesignandoDesk);
  const setIsDesignandoDesk = useStore((s) => s.setIsDesignandoDesk);
  const designerEstado = useStore((s) => s.designerEstado);
  const designerInicio = useStore((s) => s.designerInicio);
  const designerFin = useStore((s) => s.designerFin);
  const designerCancelar = useStore((s) => s.designerCancelar);

  // Reusamos el hook pa designar (mantiene una sola suscripción realtime —
  // si Scene3D también lo llama, son canales hermanos en el mismo espacio:
  // benign). El admin panel además necesita la LISTA de desks → consume el
  // mismo hook que ya provee `areas`.
  const { areas, designar, asignar } = useAreasEscritorio(workspaceId, miUsuarioId);

  const [guardando, setGuardando] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Reset error al volver a abrir el modal de naming.
  useEffect(() => {
    if (designerEstado === 'naming') setErrorMensaje(null);
  }, [designerEstado]);

  // bbox para el modal (mismo cálculo que Scene3D usa para el preview).
  const bboxModal = (() => {
    if (!designerInicio || !designerFin) return null;
    const ancho = Math.abs(designerFin.x - designerInicio.x);
    const alto = Math.abs(designerFin.z - designerInicio.z);
    return { ancho, alto };
  })();

  const handleConfirmarNaming = async (nombre: string, audioAislado: boolean) => {
    if (!designerInicio || !designerFin) return;
    setGuardando(true);
    setErrorMensaje(null);
    const minX = Math.min(designerInicio.x, designerFin.x);
    const maxX = Math.max(designerInicio.x, designerFin.x);
    const minZ = Math.min(designerInicio.z, designerFin.z);
    const maxZ = Math.max(designerInicio.z, designerFin.z);
    const ancho = maxX - minX;
    const alto = maxZ - minZ;
    const bbox = { centroX: minX + ancho / 2, centroZ: minZ + alto / 2, ancho, alto };

    const resultado = await designar({ bbox, nombre, audioAislado });
    setGuardando(false);

    if (resultado.ok) {
      // Salir del modo + resetear designer (el estado vuelve a idle).
      designerCancelar();
      setIsDesignandoDesk(false);
    } else {
      const msg =
        resultado.motivo === 'no_autorizado'
          ? 'No tienes permisos para designar áreas en este espacio.'
          : `No se pudo designar el área (${resultado.motivo}).`;
      setErrorMensaje(msg);
    }
  };

  const handleCancelarNaming = () => {
    designerCancelar();
  };

  const handleToggleDesigning = () => {
    setIsDesignandoDesk(!isDesignandoDesk);
  };

  const handleAsignar = async (areaId: string, usuarioId: string | null, forzar = false) => {
    const r = await asignar(areaId, usuarioId, forzar);
    return r.ok;
  };

  return (
    <>
      {/* Botones flotantes admin */}
      <div className="fixed top-24 right-4 z-[340] flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={handleToggleDesigning}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold shadow-lg transition-all ${
            isDesignandoDesk
              ? 'bg-orange-500/25 border-orange-400 text-orange-100'
              : 'bg-zinc-900/85 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
          }`}
          title={isDesignandoDesk ? 'Cancelar designación' : 'Designar nuevo escritorio'}
        >
          <span aria-hidden>📐</span>
          {isDesignandoDesk ? 'Cancelar' : 'Designar desk'}
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

      {isDesignandoDesk && designerEstado === 'idle' && (
        <div className="fixed top-40 right-4 z-[340] max-w-[260px] pointer-events-none">
          <div className="px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-400/40 text-orange-100 text-[11px] shadow-lg">
            Arrastra sobre el piso para dibujar el rectángulo del nuevo desk.
          </div>
        </div>
      )}

      <DeskNamingModal
        open={designerEstado === 'naming'}
        bbox={bboxModal}
        nombreDefault={`Desk #${areas.length + 1}`}
        onConfirmar={handleConfirmarNaming}
        onCancelar={handleCancelarNaming}
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
