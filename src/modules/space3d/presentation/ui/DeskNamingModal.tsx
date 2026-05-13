'use client';
/**
 * @module space3d/ui/DeskNamingModal
 *
 * Modal HTML (DOM normal, fuera del Canvas R3F) que aparece tras finalizar
 * el drag del designer. Pide nombre del desk + checkbox audio_aislado, y
 * confirma o cancela. Es controlled-component puro: el caller maneja el
 * commit al server (RPC designar_area_escritorio).
 *
 * UX: focus auto en input, Enter = confirmar, Escape = cancelar.
 *
 * Refs:
 *  - https://react.dev/reference/react-dom/createPortal (no usado — al ser
 *    overlay full-screen no necesita portal específico)
 */

import React, { useEffect, useRef, useState } from 'react';

export interface DeskNamingModalProps {
  open: boolean;
  /** Dimensiones para mostrar al admin antes de confirmar. */
  bbox: { ancho: number; alto: number } | null;
  /** Sugerencia de nombre por default (e.g. "Desk #4" si admin no escribe nada). */
  nombreDefault?: string;
  /** Commit. Recibe nombre limpio + flag audio_aislado. */
  onConfirmar: (nombre: string, audioAislado: boolean) => void;
  /** Cancelar (Esc o botón Cerrar). */
  onCancelar: () => void;
  /** Si `true`, mostrar spinner durante la operación (el caller setea). */
  guardando?: boolean;
  /** Error text del último intento (rojo bajo el input). */
  errorMensaje?: string | null;
}

export const DeskNamingModal: React.FC<DeskNamingModalProps> = ({
  open,
  bbox,
  nombreDefault = '',
  onConfirmar,
  onCancelar,
  guardando = false,
  errorMensaje = null,
}) => {
  const [nombre, setNombre] = useState(nombreDefault);
  const [audioAislado, setAudioAislado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setNombre(nombreDefault);
      setAudioAislado(false);
      // Focus auto en el input tras transición visible (~30ms).
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, nombreDefault]);

  // Escape = cancelar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onCancelar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, guardando, onCancelar]);

  if (!open) return null;

  const nombreLimpio = nombre.trim();
  const puedeConfirmar = nombreLimpio.length > 0 && !guardando;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCancelar(); }}
    >
      <div
        role="dialog"
        aria-labelledby="desk-naming-title"
        className="w-[420px] max-w-[92vw] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-5 text-zinc-100"
      >
        <h2 id="desk-naming-title" className="text-base font-semibold mb-1">
          Designar nuevo escritorio
        </h2>
        {bbox && (
          <p className="text-xs text-zinc-400 mb-4">
            Dimensiones: {bbox.ancho.toFixed(1)}m × {bbox.alto.toFixed(1)}m
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (puedeConfirmar) onConfirmar(nombreLimpio, audioAislado);
          }}
        >
          <label htmlFor="desk-name-input" className="block text-xs font-medium text-zinc-300 mb-1">
            Nombre
          </label>
          <input
            id="desk-name-input"
            ref={inputRef}
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            placeholder="Ej: Escritorio Equipo Diseño"
            maxLength={80}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
          />
          {errorMensaje && (
            <p className="mt-1.5 text-xs text-red-400">{errorMensaje}</p>
          )}

          <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={audioAislado}
              onChange={(e) => setAudioAislado(e.target.checked)}
              disabled={guardando}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span>
              <span className="font-medium">Audio aislado</span>
              <span className="ml-1 text-zinc-500">
                (los que estén afuera no escuchan a quienes estén adentro — estilo Private Area de Gather)
              </span>
            </span>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelar}
              disabled={guardando}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!puedeConfirmar}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? 'Designando...' : 'Designar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

DeskNamingModal.displayName = 'DeskNamingModal';
