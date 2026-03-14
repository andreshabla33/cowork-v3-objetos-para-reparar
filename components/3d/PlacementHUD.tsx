'use client';

import React, { useEffect, useState } from 'react';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { ModoEdicionObjeto } from '@/store/useStore';

interface PlacementHUDProps {
  /** Nombre del objeto pendiente de colocar */
  objectName: string;
  objectCategory: string;
  /** Llamado al presionar el botón de cancelar del HUD */
  onCancel: () => void;
}

/**
 * Hito 4 – HUD overlay que aparece cuando el usuario está en modo de colocación.
 * Muestra: nombre del objeto, categoría, instrucciones, y botón de cancelar.
 * Animación: slide-up al aparecer, fade-out al cancelar.
 */
export const PlacementHUD: React.FC<PlacementHUDProps> = ({ objectName, objectCategory, onCancel }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[400] flex justify-center p-4 pointer-events-none transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-5'
      }`}
    >
      <div className="flex items-center gap-3 p-2 pr-3 rounded-2xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] pointer-events-auto max-w-md">
        {/* Icono */}
        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-lg flex-shrink-0 animate-pulse">
          📦
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-bold truncate">{objectName}</p>
          <p className="text-indigo-300/70 text-[10px] font-semibold uppercase tracking-wider truncate">
            {objectCategory || 'Objeto'} · Colocando
          </p>
        </div>

        {/* Atajos */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <kbd className="bg-white/10 border border-white/15 rounded px-1.5 py-px text-indigo-200 text-[9px] font-mono font-bold">Clic</kbd>
            <span className="text-white/40 text-[9px]">Colocar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="bg-white/10 border border-white/15 rounded px-1.5 py-px text-indigo-200 text-[9px] font-mono font-bold">ESC</kbd>
            <span className="text-white/40 text-[9px]">Cancelar</span>
          </div>
        </div>

        {/* Botón cancelar */}
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/25 text-red-300/80 text-sm flex items-center justify-center flex-shrink-0 transition-colors hover:bg-red-500/30"
          title="Cancelar colocación (ESC)"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

interface InspectorEdicionObjetoProps {
  objeto: EspacioObjeto | null;
  modoActual: ModoEdicionObjeto;
}

const formatearNumero = (valor?: number | null) => {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return '—';
  return valor.toFixed(2);
};

export const InspectorEdicionObjeto: React.FC<InspectorEdicionObjetoProps> = ({ objeto, modoActual }) => {
  return (
    <div className="fixed top-24 right-4 z-[390] w-[280px] rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/70">Inspector</div>
          <div className="text-sm font-bold text-white">{objeto?.nombre || 'Sin selección'}</div>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
          {modoActual}
        </div>
      </div>

      {objeto ? (
        <div className="space-y-3 text-[12px] text-white/80">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-2">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Tipo</div>
              <div className="mt-1 font-semibold text-white">{objeto.tipo || 'objeto'}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Interacción</div>
              <div className="mt-1 font-semibold text-white">{objeto.interaccion_tipo || 'ninguna'}</div>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Posición</div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>X {formatearNumero(objeto.posicion_x)}</div>
              <div>Y {formatearNumero(objeto.posicion_y)}</div>
              <div>Z {formatearNumero(objeto.posicion_z)}</div>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Transformación</div>
            <div className="space-y-1 text-[11px]">
              <div>Rotación Y {formatearNumero(((objeto.rotacion_y || 0) * 180) / Math.PI)}°</div>
              <div>Escala X {formatearNumero(objeto.escala_x)}</div>
              <div>Escala Y {formatearNumero(objeto.escala_y)}</div>
              <div>Escala Z {formatearNumero(objeto.escala_z)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-[11px] text-cyan-100/85">
            {modoActual === 'mover' && 'Arrastra sobre el piso para reposicionar el objeto con snap.'}
            {modoActual === 'rotar' && 'Arrastra alrededor del objeto para orientar la rotación de forma continua.'}
            {modoActual === 'escalar' && 'Arrastra alejándote o acercándote al objeto para ajustar su escala uniforme.'}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white/5 p-3 text-[12px] text-white/60">
          Selecciona un objeto para ver su metadata y editarlo con mayor precisión.
        </div>
      )}
    </div>
  );
};

// ── Toast de confirmación de colocación ──────────────────────────────────────

interface PlacementToastProps {
  objectName: string;
  onDone: () => void;
}

/**
 * Toast efímero que aparece 2s tras colocar un objeto.
 * Entra con scale bounce, sale con fade + slide-down.
 */
export const PlacementToast: React.FC<PlacementToastProps> = ({ objectName, onDone }) => {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 1800);
    const t3 = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const phaseClasses = {
    enter: 'opacity-0 scale-90 translate-y-3',
    visible: 'opacity-100 scale-100 translate-y-0',
    exit: 'opacity-0 scale-95 translate-y-2',
  };

  return (
    <div
      className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-[500] transition-all duration-300 origin-bottom ${phaseClasses[phase]}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] whitespace-nowrap">
        <span className="text-base">✅</span>
        <span className="text-white text-[13px] font-semibold">{objectName}</span>
      </div>
    </div>
  );
};

// ── Hito 8: UI Modo Edición ──────────────────────────────────────────────────

interface EditModeHUDProps {
  onCancel: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  modoActual?: ModoEdicionObjeto;
  onCambiarModo?: (modo: ModoEdicionObjeto) => void;
}

export const EditModeHUD: React.FC<EditModeHUDProps> = ({ onCancel, onUndo, onRedo, canUndo = false, canRedo = false, modoActual = 'mover', onCambiarModo }) => {
  const modos: Array<{ modo: ModoEdicionObjeto; etiqueta: string; icono: string }> = [
    { modo: 'mover', etiqueta: 'Mover', icono: '✥' },
    { modo: 'rotar', etiqueta: 'Rotar', icono: '⟳' },
    { modo: 'escalar', etiqueta: 'Escalar', icono: '⬚' },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-[400] flex justify-center p-4 pointer-events-none animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3 py-2 px-4 rounded-2xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-white text-[13px] font-bold">Modo Edición</span>
        </div>

        <div className="w-px h-5 bg-white/10" />

        <div className="flex gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-[11px]">Modo</span>
            <span className="text-xs text-amber-200">{modoActual}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-[11px]">Click objeto</span>
            <span className="text-xs">⚙️</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-[11px]">Deshacer</span>
            <kbd className="bg-white/10 border border-white/15 rounded px-1.5 py-px text-indigo-200 text-[9px] font-mono font-bold">Ctrl/Cmd+Z</kbd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-[11px]">Rehacer</span>
            <kbd className="bg-white/10 border border-white/15 rounded px-1.5 py-px text-indigo-200 text-[9px] font-mono font-bold">Ctrl/Cmd+Shift+Z</kbd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {modos.map(({ modo, etiqueta, icono }) => {
            const activo = modoActual === modo;
            return (
              <button
                key={modo}
                onClick={() => onCambiarModo?.(modo)}
                className={`min-w-[72px] rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${activo ? 'bg-amber-500/20 border-amber-400/35 text-amber-100' : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10'}`}
                title={etiqueta}
              >
                <span className="mr-1 text-[12px]">{icono}</span>
                {etiqueta}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center text-white text-sm transition-colors ${canUndo ? 'bg-indigo-600/80 border-indigo-400/40 hover:bg-indigo-500' : 'bg-white/5 border-white/10 text-white/25 cursor-not-allowed'}`}
            title="Deshacer"
          >
            ↶
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center text-white text-sm transition-colors ${canRedo ? 'bg-cyan-600/80 border-cyan-400/40 hover:bg-cyan-500' : 'bg-white/5 border-white/10 text-white/25 cursor-not-allowed'}`}
            title="Rehacer"
          >
            ↷
          </button>
        </div>

        <button
          onClick={onCancel}
          className="ml-2 px-3 py-1 rounded-xl bg-amber-400/15 border border-amber-400/25 text-amber-400 text-xs font-semibold transition-colors hover:bg-amber-400/25"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

interface EditModeToastProps {
  message: string;
  icon?: string;
  onDone: () => void;
}

export const EditModeToast: React.FC<EditModeToastProps> = ({ message, icon = '✅', onDone }) => {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 1800);
    const t3 = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const phaseClasses = {
    enter: 'opacity-0 scale-90 -translate-y-3',
    visible: 'opacity-100 scale-100 translate-y-0',
    exit: 'opacity-0 scale-95 -translate-y-2',
  };

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-[500] transition-all duration-300 origin-top ${phaseClasses[phase]}`}
    >
      <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] whitespace-nowrap">
        <span className="text-sm">{icon}</span>
        <span className="text-white text-[13px] font-semibold">{message}</span>
      </div>
    </div>
  );
};
