'use client';
/**
 * @module space3d/ui/DeskAsignarModal
 *
 * Modal HTML (fuera del Canvas R3F) que aparece tras el click del admin en
 * el modo Desk Placer. Pide:
 *  - Nombre del desk (auto: "Desk #N+1", editable).
 *  - Asignar a: dropdown con miembros online del espacio + opción
 *    "Dejar libre (cualquiera puede reclamar)".
 *  - Checkbox audio aislado (default true, alineado con Gather).
 *
 * UX:
 *  - Focus auto en input nombre.
 *  - Enter = confirmar; Escape = cancelar.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@/types';

export interface DeskAsignarModalProps {
  open: boolean;
  /** Lista de miembros disponibles para asignar (online users del espacio). */
  miembros: User[];
  /** Nombre default sugerido (e.g. "Desk #5"). */
  nombreDefault: string;
  /** Posición confirmada (m). Se muestra como hint visual. */
  posicion: { x: number; z: number } | null;
  onConfirmar: (input: {
    nombre: string;
    asignadoAUsuarioId: string | null;
    audioAislado: boolean;
  }) => void;
  onCancelar: () => void;
  guardando?: boolean;
  errorMensaje?: string | null;
}

export const DeskAsignarModal: React.FC<DeskAsignarModalProps> = ({
  open,
  miembros,
  nombreDefault,
  posicion,
  onConfirmar,
  onCancelar,
  guardando = false,
  errorMensaje = null,
}) => {
  const [nombre, setNombre] = useState(nombreDefault);
  const [asignado, setAsignado] = useState<string>(''); // '' = libre
  const [audioAislado, setAudioAislado] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setNombre(nombreDefault);
      setAsignado('');
      setAudioAislado(true);
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

  // Ordenar miembros alfabéticamente para el dropdown.
  const miembrosOrdenados = useMemo(
    () => [...miembros].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [miembros],
  );

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
        aria-labelledby="desk-asignar-title"
        className="w-[460px] max-w-[92vw] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-5 text-zinc-100"
      >
        <h2 id="desk-asignar-title" className="text-base font-semibold mb-1">
          Colocar escritorio
        </h2>
        {posicion && (
          <p className="text-xs text-zinc-400 mb-4">
            Posición: ({posicion.x.toFixed(1)}, {posicion.z.toFixed(1)}) — tamaño 4.5 × 4.0 m
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (puedeConfirmar) {
              onConfirmar({
                nombre: nombreLimpio,
                asignadoAUsuarioId: asignado || null,
                audioAislado,
              });
            }
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
            placeholder="Ej: Desk de María"
            maxLength={80}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
          />

          <label htmlFor="desk-asignar-select" className="block text-xs font-medium text-zinc-300 mt-4 mb-1">
            Asignar a
          </label>
          <select
            id="desk-asignar-select"
            value={asignado}
            onChange={(e) => setAsignado(e.target.value)}
            disabled={guardando}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
          >
            <option value="">— Dejar libre (cualquiera puede reclamarlo) —</option>
            {miembrosOrdenados.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={audioAislado}
              onChange={(e) => setAudioAislado(e.target.checked)}
              disabled={guardando}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span>
              <span className="font-medium">Audio aislado por default</span>
              <span className="ml-1 text-zinc-500">
                (los ocupantes pueden cerrar/abrir el candado en el ControlBar)
              </span>
            </span>
          </label>

          {errorMensaje && (
            <p className="mt-3 text-xs text-red-400">{errorMensaje}</p>
          )}

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
              {guardando ? 'Colocando...' : 'Colocar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

DeskAsignarModal.displayName = 'DeskAsignarModal';
