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

import React, { useEffect, useMemo, useState } from 'react';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { DeskAsignarModal } from './DeskAsignarModal';
import { DeskManagerPanel } from './DeskManagerPanel';
import { GenerarOficinaModal } from './GenerarOficinaModal';
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

  const { areas, colocarConPreset, asignar, generarOficinaTemplate } = useAreasEscritorio(
    workspaceId,
    miUsuarioId,
  );

  // Selectores adicionales para resolver el centro de la grilla = centro de
  // la zona-empresa del admin (si tiene una), sino fallback a (0,0).
  const zonasEmpresa = useStore((s) => s.zonasEmpresa);
  const currentUser = useStore((s) => s.currentUser);
  const centroGrilla = useMemo<{ x: number; z: number }>(() => {
    const miZona = zonasEmpresa.find(
      (z) => z.empresa_id === currentUser?.empresa_id && z.estado === 'activa',
    );
    if (!miZona) return { x: 0, z: 0 };
    return {
      x: Number(miZona.posicion_x) / 16,
      z: Number(miZona.posicion_y) / 16,
    };
  }, [zonasEmpresa, currentUser?.empresa_id]);

  // Notification bus para feedback toast post-generación.
  const addNotification = useStore((s) => s.addNotification);

  const [guardando, setGuardando] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [generarOficinaOpen, setGenerarOficinaOpen] = useState(false);
  const [generandoOficina, setGenerandoOficina] = useState(false);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);

  // Reset error al abrir modal.
  useEffect(() => {
    if (deskPlacerEstado === 'asigning') setErrorMensaje(null);
  }, [deskPlacerEstado]);

  useEffect(() => {
    if (generarOficinaOpen) setErrorGenerar(null);
  }, [generarOficinaOpen]);

  const handleConfirmarGenerarOficina = async (cantidad: number) => {
    setGenerandoOficina(true);
    setErrorGenerar(null);
    const resultado = await generarOficinaTemplate(cantidad, centroGrilla);
    setGenerandoOficina(false);

    if (resultado.errores.length === 0 && resultado.desks.length === cantidad) {
      setGenerarOficinaOpen(false);
      addNotification(
        `Oficina generada: ${resultado.desks.length} escritorios creados en grilla.`,
        'info',
      );
      return;
    }

    if (resultado.desks.length === 0) {
      const motivo = resultado.errores[0]?.motivo ?? 'error';
      setErrorGenerar(
        motivo === 'no_autorizado'
          ? 'No tienes permisos para generar la oficina en este espacio.'
          : `No se pudo generar la oficina (${motivo}).`,
      );
      return;
    }

    // Éxito parcial: cerrar modal + notification con detalle.
    setGenerarOficinaOpen(false);
    addNotification(
      `Oficina generada parcial: ${resultado.desks.length} creados, ${resultado.errores.length} fallaron.`,
      'info',
    );
  };

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

        <button
          type="button"
          onClick={() => setGenerarOficinaOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-zinc-900/85 border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-semibold shadow-lg"
          title="Generar N desks de un solo golpe (grilla automática)"
        >
          <span aria-hidden>🏢</span>
          Generar oficina
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

      <GenerarOficinaModal
        open={generarOficinaOpen}
        cantidadDefault={10}
        centroSugerido={centroGrilla}
        desksExistentes={areas.length}
        onConfirmar={(cantidad) => { void handleConfirmarGenerarOficina(cantidad); }}
        onCancelar={() => setGenerarOficinaOpen(false)}
        guardando={generandoOficina}
        errorMensaje={errorGenerar}
      />
    </>
  );
};

AdminDeskHUD.displayName = 'AdminDeskHUD';
