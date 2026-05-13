'use client';
/**
 * @module space3d/ui/GenerarOficinaModal
 *
 * Modal HTML que dispara el flow "generar oficina con N desks" post-
 * onboarding. Útil cuando un admin con su empresa ya creada quiere armar
 * (o re-armar) la grilla de escritorios de un solo golpe en lugar de
 * colocarlos uno a uno con el botón "Colocar desk".
 *
 * UX alineado con el paso "cantidad miembros" del OnboardingCreador
 * (slider + input + quick-buttons) + preview en vivo de las dimensiones
 * de la grilla computadas por el Domain.
 *
 * Refs:
 *  - https://react.dev/reference/react-dom/components/input#range-input
 *  - Domain `calcularDimensionesGrilla` (puro, sin React)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  CANTIDAD_MIEMBROS_MAX,
  CANTIDAD_MIEMBROS_MIN,
  calcularDimensionesGrilla,
} from '@/src/core/domain/entities/espacio3d/OficinaTemplatePolicy';
import { PRESET_DESK_STANDARD } from '@/src/core/domain/entities/espacio3d/PresetDesk';

export interface GenerarOficinaModalProps {
  open: boolean;
  /** Cantidad sugerida inicial (default 10). */
  cantidadDefault?: number;
  /** Centro sugerido donde se generará la grilla — solo se muestra como hint. */
  centroSugerido?: { x: number; z: number } | null;
  /** Cuántos desks ya existen — warning si la suma >50. */
  desksExistentes?: number;
  onConfirmar: (cantidad: number) => void;
  onCancelar: () => void;
  guardando?: boolean;
  errorMensaje?: string | null;
}

const SUGERIDOS_RAPIDOS = [10, 25, 50, 75, 100];
const UMBRAL_WARNING_TOTAL = 50;

export const GenerarOficinaModal: React.FC<GenerarOficinaModalProps> = ({
  open,
  cantidadDefault = 10,
  centroSugerido = null,
  desksExistentes = 0,
  onConfirmar,
  onCancelar,
  guardando = false,
  errorMensaje = null,
}) => {
  const [cantidad, setCantidad] = useState<number>(cantidadDefault);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir + focus.
  useEffect(() => {
    if (open) {
      setCantidad(Math.max(CANTIDAD_MIEMBROS_MIN, Math.min(CANTIDAD_MIEMBROS_MAX, cantidadDefault)));
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, cantidadDefault]);

  // Esc cancela.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onCancelar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, guardando, onCancelar]);

  if (!open) return null;

  const sanear = (v: number) => Math.max(CANTIDAD_MIEMBROS_MIN, Math.min(CANTIDAD_MIEMBROS_MAX, Math.floor(v) || CANTIDAD_MIEMBROS_MIN));
  const cantidadValida = sanear(cantidad);
  const { columnas, filas } = calcularDimensionesGrilla(cantidadValida);
  const anchoTotal = (columnas * PRESET_DESK_STANDARD.bbox.ancho + (columnas - 1) * 1.5).toFixed(1);
  const altoTotal = (filas * PRESET_DESK_STANDARD.bbox.alto + (filas - 1) * 1.5).toFixed(1);
  const totalDespues = desksExistentes + cantidadValida;
  const mostrarWarning = totalDespues > UMBRAL_WARNING_TOTAL;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCancelar(); }}
    >
      <div
        role="dialog"
        aria-labelledby="generar-oficina-title"
        className="w-[480px] max-w-[94vw] rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-5 text-zinc-100"
      >
        <h2 id="generar-oficina-title" className="text-base font-semibold mb-1">
          Generar oficina con grilla de escritorios
        </h2>
        <p className="text-xs text-zinc-400 mb-4">
          Crearé N escritorios en grilla, cada uno con silla + mesa + monitor.
          {centroSugerido && (
            <> Centro: ({centroSugerido.x.toFixed(1)}, {centroSugerido.z.toFixed(1)}) — tu zona-empresa.</>
          )}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!guardando) onConfirmar(cantidadValida);
          }}
        >
          <label htmlFor="cantidad-input" className="block text-xs font-medium text-zinc-300 mb-2">
            ¿Cuántos miembros tendrá tu equipo?
          </label>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={CANTIDAD_MIEMBROS_MIN}
              max={CANTIDAD_MIEMBROS_MAX}
              step={1}
              value={cantidadValida}
              onChange={(e) => setCantidad(sanear(Number(e.target.value)))}
              disabled={guardando}
              className="flex-1 accent-cyan-500"
            />
            <input
              id="cantidad-input"
              ref={inputRef}
              type="number"
              min={CANTIDAD_MIEMBROS_MIN}
              max={CANTIDAD_MIEMBROS_MAX}
              value={cantidadValida}
              onChange={(e) => setCantidad(sanear(Number(e.target.value)))}
              disabled={guardando}
              className="w-20 text-center px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-base font-bold text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {SUGERIDOS_RAPIDOS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCantidad(v)}
                disabled={guardando}
                className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  cantidadValida === v
                    ? 'bg-cyan-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="mt-4 px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-[11px] text-zinc-300">
            <div className="flex items-center gap-2 mb-1">
              <span aria-hidden>🏢</span>
              <span className="font-semibold text-zinc-100">
                Grilla {columnas}×{filas} — {anchoTotal}×{altoTotal}m
              </span>
            </div>
            <p className="text-zinc-400">
              Cada desk de {PRESET_DESK_STANDARD.bbox.ancho}×{PRESET_DESK_STANDARD.bbox.alto}m. Separación 1.5m entre desks.
            </p>
          </div>

          {desksExistentes > 0 && (
            <p className="mt-3 text-[11px] text-zinc-400">
              Tu espacio ya tiene <span className="font-semibold text-zinc-200">{desksExistentes}</span> desks.
              Se agregarán <span className="font-semibold text-zinc-200">{cantidadValida}</span> más (total: {totalDespues}).
            </p>
          )}

          {mostrarWarning && (
            <p className="mt-2 text-[11px] text-amber-300/90">
              ⚠️ Tendrás {totalDespues} desks en total. Espacios con muchos desks pueden ser confusos visualmente.
            </p>
          )}

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
              disabled={guardando}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? `Creando ${cantidadValida} desks...` : `Generar ${cantidadValida} desks`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

GenerarOficinaModal.displayName = 'GenerarOficinaModal';
