'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EspacioObjeto, TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
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
  onTransformar?: (id: string, cambios: TransformacionObjetoInput) => Promise<boolean>;
}

const formatearNumero = (valor?: number | null) => {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return '—';
  return valor.toFixed(2);
};

const ESCALA_MIN = 0.1;
const ESCALA_MAX = 5;
const ESCALA_PASO = 0.05;
const ESCALA_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

interface EscalaSliderProps {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
}

const EscalaSlider: React.FC<EscalaSliderProps> = ({ label, color, value, onChange }) => {
  const clamp = (v: number) => Math.round(Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, v)) * 100) / 100;

  return (
    <div className="flex items-center gap-2">
      <span className={`w-4 text-[11px] font-bold ${color}`}>{label}</span>
      <button
        onClick={() => onChange(clamp(value - ESCALA_PASO))}
        className="w-6 h-6 rounded-lg bg-white/10 border border-white/10 text-white/70 text-[11px] flex items-center justify-center hover:bg-white/20 active:bg-white/25 transition-colors"
      >−</button>
      <input
        type="range"
        min={ESCALA_MIN}
        max={ESCALA_MAX}
        step={ESCALA_PASO}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="flex-1 h-1.5 accent-indigo-400 cursor-pointer"
      />
      <button
        onClick={() => onChange(clamp(value + ESCALA_PASO))}
        className="w-6 h-6 rounded-lg bg-white/10 border border-white/10 text-white/70 text-[11px] flex items-center justify-center hover:bg-white/20 active:bg-white/25 transition-colors"
      >+</button>
      <span className="w-10 text-right text-[10px] font-mono text-white/80">{value.toFixed(2)}</span>
    </div>
  );
};

export const InspectorEdicionObjeto: React.FC<InspectorEdicionObjetoProps> = ({ objeto, modoActual, onTransformar }) => {
  const [escalaUniforme, setEscalaUniforme] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aplicarEscala = useCallback((cambios: TransformacionObjetoInput) => {
    if (!objeto || !onTransformar) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void onTransformar(objeto.id, cambios);
    }, 60);
  }, [objeto, onTransformar]);

  const handleEscalaX = useCallback((v: number) => {
    if (escalaUniforme) {
      aplicarEscala({ escala_x: v, escala_y: v, escala_z: v });
    } else {
      aplicarEscala({ escala_x: v });
    }
  }, [aplicarEscala, escalaUniforme]);

  const handleEscalaY = useCallback((v: number) => {
    if (escalaUniforme) {
      aplicarEscala({ escala_x: v, escala_y: v, escala_z: v });
    } else {
      aplicarEscala({ escala_y: v });
    }
  }, [aplicarEscala, escalaUniforme]);

  const handleEscalaZ = useCallback((v: number) => {
    if (escalaUniforme) {
      aplicarEscala({ escala_x: v, escala_y: v, escala_z: v });
    } else {
      aplicarEscala({ escala_z: v });
    }
  }, [aplicarEscala, escalaUniforme]);

  const handlePreset = useCallback((v: number) => {
    aplicarEscala({ escala_x: v, escala_y: v, escala_z: v });
  }, [aplicarEscala]);

  const handleAlturaY = useCallback((delta: number) => {
    if (!objeto || !onTransformar) return;
    const next = Math.round(Math.max(0, (objeto.posicion_y ?? 0) + delta) * 100) / 100;
    void onTransformar(objeto.id, { posicion_y: next });
  }, [objeto, onTransformar]);

  const handleRotacion = useCallback((delta: number) => {
    if (!objeto || !onTransformar) return;
    const next = ((objeto.rotacion_y || 0) + delta) % (Math.PI * 2);
    void onTransformar(objeto.id, { rotacion_y: next });
  }, [objeto, onTransformar]);

  const escX = objeto?.escala_x ?? 1;
  const escY = objeto?.escala_y ?? 1;
  const escZ = objeto?.escala_z ?? 1;

  return (
    <div className="fixed top-24 right-4 z-[390] w-[300px] rounded-2xl border border-white/[0.08] bg-black/35 backdrop-blur-2xl shadow-[0_12px_48px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.04)_inset] select-none overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/[0.06] to-transparent border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-300/60">Inspector</div>
            <div className="text-[13px] font-bold text-white mt-0.5">{objeto?.nombre || 'Sin selección'}</div>
          </div>
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
            {modoActual}
          </div>
        </div>
      </div>

      <div className="p-4">
      {objeto ? (
        <div className="space-y-4 text-[12px] text-white/80">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Tipo</div>
              <div className="mt-1 font-semibold text-white text-[12px]">{objeto.tipo || 'objeto'}</div>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Interacción</div>
              <div className="mt-1 font-semibold text-white text-[12px]">{objeto.interaccion_tipo || 'ninguna'}</div>
            </div>
          </div>

          {/* ── Posición ── */}
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5">
            <div className="mb-2.5 text-[9px] uppercase tracking-wider text-white/35 font-medium">Posición</div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div className="text-center">
                <span className="text-red-400/70 font-bold text-[10px]">X</span>
                <span className="ml-1 font-mono text-white/80">{formatearNumero(objeto.posicion_x)}</span>
              </div>
              <div className="text-center">
                <span className="text-green-400/70 font-bold text-[10px]">Y</span>
                <span className="ml-1 font-mono text-white/80">{formatearNumero(objeto.posicion_y)}</span>
              </div>
              <div className="text-center">
                <span className="text-blue-400/70 font-bold text-[10px]">Z</span>
                <span className="ml-1 font-mono text-white/80">{formatearNumero(objeto.posicion_z)}</span>
              </div>
            </div>
            {onTransformar && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3">
                <span className="text-[10px] text-white/40 font-medium">Altura Y</span>
                <button
                  onClick={() => handleAlturaY(-0.1)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/70 text-[13px] flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-all"
                >−</button>
                <button
                  onClick={() => handleAlturaY(0.1)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/70 text-[13px] flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-all"
                >+</button>
                <button
                  onClick={() => { if (objeto && onTransformar) void onTransformar(objeto.id, { posicion_y: 0 }); }}
                  className="ml-auto px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/45 hover:text-white/80 hover:bg-white/10 transition-all font-medium"
                >Reset</button>
              </div>
            )}
          </div>

          {/* ── Rotación ── */}
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Rotación</span>
              <span className="text-[11px] font-mono text-white/60 bg-white/[0.04] px-2 py-0.5 rounded-md">{formatearNumero(((objeto.rotacion_y || 0) * 180) / Math.PI)}°</span>
            </div>
            {onTransformar && (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => handleRotacion(-Math.PI / 12)}
                  className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/65 text-[11px] font-medium hover:bg-white/15 hover:text-white/90 active:bg-white/20 transition-all"
                >-15°</button>
                <button
                  onClick={() => handleRotacion(-Math.PI / 4)}
                  className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/65 text-[11px] font-medium hover:bg-white/15 hover:text-white/90 active:bg-white/20 transition-all"
                >-45°</button>
                <button
                  onClick={() => handleRotacion(Math.PI / 4)}
                  className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/65 text-[11px] font-medium hover:bg-white/15 hover:text-white/90 active:bg-white/20 transition-all"
                >+45°</button>
                <button
                  onClick={() => handleRotacion(Math.PI / 12)}
                  className="h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/65 text-[11px] font-medium hover:bg-white/15 hover:text-white/90 active:bg-white/20 transition-all"
                >+15°</button>
              </div>
            )}
          </div>

          {/* ── Escala ── */}
          <div className="rounded-xl bg-indigo-500/[0.06] border border-indigo-400/[0.12] p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-indigo-200/60 font-bold">Escala</span>
              {onTransformar && (
                <button
                  onClick={() => setEscalaUniforme((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all ${
                    escalaUniforme
                      ? 'bg-indigo-500/20 border-indigo-400/25 text-indigo-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.08]'
                  }`}
                >
                  {escalaUniforme ? '🔗 Uniforme' : '📐 Por eje'}
                </button>
              )}
            </div>

            {onTransformar ? (
              <div className="space-y-2.5">
                {escalaUniforme ? (
                  <EscalaSlider label="U" color="text-indigo-300" value={escX} onChange={handleEscalaX} />
                ) : (
                  <>
                    <EscalaSlider label="X" color="text-red-400" value={escX} onChange={handleEscalaX} />
                    <EscalaSlider label="Y" color="text-green-400" value={escY} onChange={handleEscalaY} />
                    <EscalaSlider label="Z" color="text-blue-400" value={escZ} onChange={handleEscalaZ} />
                  </>
                )}

                <div className="mt-3 pt-3 border-t border-indigo-400/[0.08] flex flex-wrap gap-1.5">
                  {ESCALA_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePreset(preset)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                        Math.abs(escX - preset) < 0.01 && Math.abs(escY - preset) < 0.01 && Math.abs(escZ - preset) < 0.01
                          ? 'bg-indigo-500/25 border-indigo-400/35 text-indigo-100 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                          : 'bg-white/[0.04] border-white/[0.08] text-white/55 hover:bg-white/10 hover:text-white/80'
                      }`}
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2"><span className="text-red-400/70 font-bold">X</span> <span className="font-mono">{formatearNumero(escX)}</span></div>
                <div className="flex items-center gap-2"><span className="text-green-400/70 font-bold">Y</span> <span className="font-mono">{formatearNumero(escY)}</span></div>
                <div className="flex items-center gap-2"><span className="text-blue-400/70 font-bold">Z</span> <span className="font-mono">{formatearNumero(escZ)}</span></div>
              </div>
            )}
          </div>

          {/* ── Tip contextual ── */}
          <div className="rounded-xl border border-cyan-400/[0.1] bg-cyan-400/[0.04] p-3 text-[11px] text-cyan-100/75 leading-relaxed">
            <span className="text-cyan-300/60 mr-1">💡</span>
            {modoActual === 'mover' && 'Arrastra sobre el piso para reposicionar el objeto con snap.'}
            {modoActual === 'rotar' && 'Arrastra alrededor del objeto para orientar la rotación de forma continua.'}
            {modoActual === 'escalar' && 'Arrastra alejándote o acercándote al objeto para ajustar su escala uniforme.'}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-center">
          <div className="text-[20px] mb-2 opacity-40">🎯</div>
          <div className="text-[12px] text-white/50 leading-relaxed">
            Selecciona un objeto para ver su metadata y editarlo con mayor precisión.
          </div>
        </div>
      )}
      </div>
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
  const modos: Array<{ modo: ModoEdicionObjeto; etiqueta: string; icono: string; desc: string }> = [
    { modo: 'mover', etiqueta: 'Mover', icono: '✥', desc: 'Arrastra objetos' },
    { modo: 'rotar', etiqueta: 'Rotar', icono: '⟳', desc: 'Gira objetos' },
    { modo: 'escalar', etiqueta: 'Escalar', icono: '⬚', desc: 'Cambia tamaño' },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-[400] flex justify-center px-4 pt-4 pointer-events-none animate-in fade-in slide-in-from-top duration-300">
      <div className="flex flex-col gap-0 rounded-2xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_48px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset] pointer-events-auto overflow-hidden">

        {/* ── Fila superior: Título + Atajos ── */}
        <div className="flex items-center justify-between gap-6 px-5 py-2.5 bg-gradient-to-r from-amber-500/[0.06] to-transparent border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-amber-400/40 animate-ping" />
            </div>
            <span className="text-white text-sm font-bold tracking-wide">Modo Edición</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-white/35 text-[10px]">Seleccionar</span>
              <kbd className="bg-white/[0.07] border border-white/10 rounded-md px-1.5 py-0.5 text-white/50 text-[9px] font-mono">Click</kbd>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/35 text-[10px]">Deshacer</span>
              <kbd className="bg-white/[0.07] border border-white/10 rounded-md px-1.5 py-0.5 text-white/50 text-[9px] font-mono">Ctrl+Z</kbd>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/35 text-[10px]">Rehacer</span>
              <kbd className="bg-white/[0.07] border border-white/10 rounded-md px-1.5 py-0.5 text-white/50 text-[9px] font-mono">Ctrl+Shift+Z</kbd>
            </div>
          </div>
        </div>

        {/* ── Fila inferior: Herramientas + Acciones ── */}
        <div className="flex items-center gap-6 px-6 py-3.5">

          {/* Botones de modo */}
          <div className="flex items-center gap-4">
            {modos.map(({ modo, etiqueta, icono }) => {
              const activo = modoActual === modo;
              return (
                <button
                  key={modo}
                  onClick={() => onCambiarModo?.(modo)}
                  className={`group relative flex items-center gap-2 min-w-[88px] rounded-xl border px-3.5 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
                    activo
                      ? 'bg-amber-500/20 border-amber-400/30 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.12)]'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/55 hover:bg-white/[0.08] hover:text-white/80 hover:border-white/15'
                  }`}
                  title={etiqueta}
                >
                  <span className={`text-[15px] transition-transform duration-200 ${activo ? 'scale-110' : 'group-hover:scale-105'}`}>{icono}</span>
                  {etiqueta}
                </button>
              );
            })}
          </div>

          {/* Separador vertical */}
          <div className="w-px h-8 bg-white/[0.08]" />

          {/* Deshacer / Rehacer */}
          <div className="flex items-center gap-2">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-[15px] transition-all duration-200 ${
                canUndo
                  ? 'bg-indigo-500/15 border-indigo-400/25 text-indigo-200 hover:bg-indigo-500/25 hover:shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/20 cursor-not-allowed'
              }`}
              title="Deshacer (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-[15px] transition-all duration-200 ${
                canRedo
                  ? 'bg-cyan-500/15 border-cyan-400/25 text-cyan-200 hover:bg-cyan-500/25 hover:shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/20 cursor-not-allowed'
              }`}
              title="Rehacer (Ctrl+Shift+Z)"
            >
              ↷
            </button>
          </div>

          {/* Separador vertical */}
          <div className="w-px h-8 bg-white/[0.08]" />

          {/* Cerrar */}
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-400/20 text-red-300 text-[12px] font-semibold transition-all duration-200 hover:bg-red-500/20 hover:border-red-400/30 hover:shadow-[0_0_12px_rgba(239,68,68,0.1)]"
          >
            <span className="text-[13px]">✕</span>
            Cerrar
          </button>
        </div>
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
