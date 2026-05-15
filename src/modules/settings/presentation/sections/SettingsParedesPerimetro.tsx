'use client';
/**
 * @module settings/sections/SettingsParedesPerimetro
 *
 * Editor de las paredes perimetrales del espacio — rodean el conjunto de
 * zonas-empresa activas. Tab "Zonas y Accesos" del SettingsModal, debajo
 * de la sección de Suelo Principal.
 *
 * Lee/escribe la PerimeterPolicy via el hook `useConfiguracionPerimetro`
 * (Application layer). Persistencia en `espacio_configuracion_perimetro`
 * + realtime sub a otros admins via SuscribirConfiguracionPerimetroUseCase.
 *
 * Estilos disponibles: los 12 mismos del catálogo del modal "Paredes" en
 * BuildModePanel — cero duplicación entre cerramientos zona y perímetro.
 *
 * Refs:
 *   https://react.dev/reference/react/useCallback
 *   https://supabase.com/docs/guides/database/postgres/row-level-security
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { useConfiguracionPerimetro } from '@/modules/space3d/presentation/hooks/useConfiguracionPerimetro';
import {
  PerimeterPolicy,
  type PerimeterWallStyle,
  ALLOWED_PERIMETER_STYLES,
} from '@/src/core/domain/entities/espacio3d/PerimeterPolicy';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('settings-paredes-perimetro');

// ─── Labels + swatches por estilo ────────────────────────────────────────────
// Mismos que ofrece el catálogo de BuildModePanel — coherencia visual.
// El color es UN proxy del look final (el material PBR final se deriva del
// perfil estético en runtime). Sirve solo para preview en el selector.

const STYLE_META: Record<
  PerimeterWallStyle,
  { label: string; swatch: string; sinAberturas: boolean }
> = {
  glass: { label: 'Vidrio', swatch: '#a8d8e8', sinAberturas: true },
  brick: { label: 'Ladrillo', swatch: '#c47452', sinAberturas: true },
  panel: { label: 'Panel', swatch: '#a08458', sinAberturas: true },
  'half-wall': { label: 'Media pared', swatch: '#888888', sinAberturas: true },
  basic: { label: 'Básica', swatch: '#9a9a9a', sinAberturas: true },
  stripe: { label: 'Franja', swatch: '#b8b8b8', sinAberturas: true },
  column: { label: 'Columna', swatch: '#aaaaaa', sinAberturas: true },
  window: { label: '1 Ventana', swatch: '#c8d8e0', sinAberturas: false },
  'window-double': { label: '2 Ventanas', swatch: '#c8d8e0', sinAberturas: false },
  door: { label: '1 Puerta', swatch: '#b88058', sinAberturas: false },
  'door-double': { label: '2 Puertas', swatch: '#b88058', sinAberturas: false },
  arch: { label: 'Arco', swatch: '#d0d0d0', sinAberturas: false },
};

const [HEIGHT_MIN, HEIGHT_MAX] = PerimeterPolicy.HEIGHT_RANGE;
const [SEGMENT_MIN, SEGMENT_MAX] = PerimeterPolicy.SEGMENT_WIDTH_RANGE;

// ─── Component ───────────────────────────────────────────────────────────────

export interface SettingsParedesPerimetroProps {
  workspaceId: string;
  isAdmin: boolean;
}

export const SettingsParedesPerimetro: React.FC<SettingsParedesPerimetroProps> = ({
  workspaceId,
  isAdmin,
}) => {
  const { policy, loading, actualizar } = useConfiguracionPerimetro(workspaceId);

  const [draft, setDraft] = useState<typeof policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado efectivo: draft (si el admin tocó algo) o policy (lo persistido).
  const effective = draft ?? policy;

  const hasChanges = useMemo(() => {
    if (!draft) return false;
    return (
      draft.enabled !== policy.enabled ||
      draft.style !== policy.style ||
      draft.height !== policy.height ||
      draft.segmentWidth !== policy.segmentWidth
    );
  }, [draft, policy]);

  const updateDraft = useCallback(
    (patch: Partial<typeof policy>) => {
      setDraft((prev) => ({
        ...(prev ?? policy),
        ...patch,
      }));
      setSuccess(false);
      setError(null);
    },
    [policy],
  );

  const handleGuardar = useCallback(async () => {
    if (!isAdmin || !hasChanges || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await actualizar(draft);
      if (result.ok) {
        setDraft(null);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      } else {
        const code = result.error.code;
        log.warn('Error validación dominio', { code, workspaceId });
        setError(`No se pudo guardar (${code}). Revisa los valores.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Error guardando perímetro', { workspaceId, msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [isAdmin, hasChanges, draft, actualizar, workspaceId]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="p-6 space-y-5 border-t border-zinc-800/40">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">
          Paredes perimetrales
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Cerramiento exterior alrededor del conjunto de zonas-empresa.
          Usa las mismas paredes del catálogo de objetos. Si lo desactivas,
          el espacio queda sin paredes perimetrales.
        </p>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500">Cargando configuración…</div>
      ) : (
        <>
          {/* Toggle enabled */}
          <label className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-800/40 border border-zinc-700/40 cursor-pointer">
            <span className="text-xs text-zinc-200 font-medium">
              Activar paredes perimetrales
            </span>
            <input
              type="checkbox"
              checked={effective.enabled}
              onChange={(e) => updateDraft({ enabled: e.target.checked })}
              className="w-4 h-4 accent-indigo-500"
            />
          </label>

          {/* Selector de estilo — grid 4 columnas (12 opciones = 3 rows) */}
          <div className={effective.enabled ? '' : 'opacity-40 pointer-events-none'}>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
              Estilo de pared
            </p>
            <div className="grid grid-cols-4 gap-2">
              {ALLOWED_PERIMETER_STYLES.map((style) => {
                const meta = STYLE_META[style];
                const isSelected = effective.style === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => updateDraft({ style })}
                    title={meta.sinAberturas ? meta.label : `${meta.label} (con aberturas)`}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-500/15 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                        : 'border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-500 hover:bg-zinc-700/40'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg border border-white/10"
                      style={{ backgroundColor: meta.swatch }}
                    />
                    <span className="text-[9px] text-zinc-300 leading-tight text-center truncate w-full">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders: altura + segmento */}
          <div
            className={
              effective.enabled
                ? 'space-y-3'
                : 'space-y-3 opacity-40 pointer-events-none'
            }
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Altura
                </label>
                <span className="text-xs text-zinc-300 font-mono">
                  {effective.height.toFixed(1)} m
                </span>
              </div>
              <input
                type="range"
                min={HEIGHT_MIN}
                max={HEIGHT_MAX}
                step={0.1}
                value={effective.height}
                onChange={(e) => updateDraft({ height: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Ancho de cada segmento
                </label>
                <span className="text-xs text-zinc-300 font-mono">
                  {effective.segmentWidth.toFixed(1)} m
                </span>
              </div>
              <input
                type="range"
                min={SEGMENT_MIN}
                max={SEGMENT_MAX}
                step={0.5}
                value={effective.segmentWidth}
                onChange={(e) =>
                  updateDraft({ segmentWidth: Number(e.target.value) })
                }
                className="w-full accent-indigo-500"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Para estilos con aberturas (ventanas/puertas), un segmento más
                corto produce más aberturas distribuidas en el perímetro.
              </p>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-zinc-500">
              Las paredes se ajustan automáticamente al borde de las zonas
              empresa activas (sin margen).
            </div>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                hasChanges && !saving
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {success ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : success ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

SettingsParedesPerimetro.displayName = 'SettingsParedesPerimetro';
