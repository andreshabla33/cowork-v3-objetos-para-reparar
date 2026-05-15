'use client';
/**
 * @module settings/sections/SettingsZonasAccesos
 *
 * Editor del **suelo principal del espacio** + entry point al modo edición
 * 3D de zonas/decoraciones. Tab "Zonas y Accesos" del SettingsModal.
 *
 * Lee/escribe `espacio_terreno.tipo_suelo_principal` via
 * `ActualizarSueloPrincipalUseCase` (Application layer).
 *
 * Las zonas decorativas se siguen creando desde el HUD admin in-canvas
 * (botón "Designar zona" → dropdown "Decorativo"). Este componente solo
 * cubre el suelo de fondo global.
 *
 * Refs:
 *   https://r3f.docs.pmnd.rs/api/objects (primitive)
 *   https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { useDI } from '@/src/core/infrastructure/di/DIProvider';
import { CargarTerrenoUseCase } from '@/src/core/application/usecases/CargarTerrenoUseCase';
import { ActualizarSueloPrincipalUseCase } from '@/src/core/application/usecases/ActualizarSueloPrincipalUseCase';
import { FloorType, FLOOR_TYPE_LABELS, FLOOR_TYPE_CATEGORIES, normalizarTipoSuelo } from '@/core/domain/entities';
import { FLOOR_SPECS } from '@/core/infrastructure/r3f/rendering/floor/floorMaterialSpecs';
import { logger } from '@/core/infrastructure/observability/logger';
import { SettingsParedesPerimetro } from './SettingsParedesPerimetro';

const log = logger.child('settings-zonas-accesos');

export interface SettingsZonasAccesosProps {
  workspaceId: string;
  isAdmin: boolean;
}

export const SettingsZonasAccesos: React.FC<SettingsZonasAccesosProps> = ({
  workspaceId,
  isAdmin,
}) => {
  const container = useDI();
  const [tipoSueloPrincipal, setTipoSueloPrincipal] = useState<FloorType>(
    FloorType.CONCRETE_SMOOTH,
  );
  const [tipoOriginal, setTipoOriginal] = useState<FloorType>(FloorType.CONCRETE_SMOOTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Cargar terreno actual.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelado = false;
    setLoading(true);

    const useCase = new CargarTerrenoUseCase(container.terreno);
    useCase
      .ejecutar({ espacioId: workspaceId })
      .then((terreno) => {
        if (cancelado) return;
        const tipo = normalizarTipoSuelo(terreno.tipoSueloPrincipal);
        setTipoSueloPrincipal(tipo);
        setTipoOriginal(tipo);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Error cargando terreno', { workspaceId, msg });
        setError(msg);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [workspaceId, container]);

  const hasChanges = useMemo(
    () => tipoSueloPrincipal !== tipoOriginal,
    [tipoSueloPrincipal, tipoOriginal],
  );

  const handleSeleccionar = (tipo: FloorType) => {
    setTipoSueloPrincipal(tipo);
    setSuccess(false);
    setError(null);
  };

  const handleGuardar = async () => {
    if (!isAdmin || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const useCase = new ActualizarSueloPrincipalUseCase(container.terreno);
      await useCase.ejecutar({
        espacioId: workspaceId,
        tipoSueloPrincipal,
      });
      setTipoOriginal(tipoSueloPrincipal);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Error guardando suelo principal', { workspaceId, msg });
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-zinc-400">
        Solo los administradores pueden editar el suelo principal del espacio.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">
          Suelo principal del espacio
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Material PBR aplicado al piso de fondo (fuera de zonas y decoraciones).
          Las zonas activas se renderizan encima.
        </p>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500">Cargando configuración…</div>
      ) : (
        <>
          {/* Selector visual por categorías */}
          <div className="space-y-4">
            {Object.entries(FLOOR_TYPE_CATEGORIES).map(([categoria, tipos]) => (
              <div key={categoria}>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
                  {categoria}
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {tipos.map((tipo) => {
                    const isSelected = tipoSueloPrincipal === tipo;
                    const swatch = FLOOR_SPECS[tipo].swatchColor;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => handleSeleccionar(tipo)}
                        title={FLOOR_TYPE_LABELS[tipo]}
                        className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-500/15 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                            : 'border-zinc-700/40 bg-zinc-800/30 hover:border-zinc-500 hover:bg-zinc-700/40'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg border border-white/10"
                          style={{ backgroundColor: swatch }}
                        />
                        <span className="text-[9px] text-zinc-300 leading-tight text-center truncate w-full">
                          {FLOOR_TYPE_LABELS[tipo].split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Estado actual */}
          <div className="px-3 py-2.5 rounded-lg bg-zinc-800/40 border border-zinc-700/40 flex items-center gap-3">
            <div
              className="w-5 h-5 rounded border border-white/10"
              style={{ backgroundColor: FLOOR_SPECS[tipoSueloPrincipal].swatchColor }}
            />
            <span className="text-xs text-zinc-200 font-medium">
              {FLOOR_TYPE_LABELS[tipoSueloPrincipal]}
            </span>
            {hasChanges && (
              <span className="ml-auto text-[10px] text-amber-300/90">Sin guardar</span>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40">
            <div className="text-[11px] text-zinc-500">
              Las zonas decorativas (alfombras, transiciones) se crean desde el
              HUD admin en el espacio 3D — botón <em>Designar zona</em> → tipo
              <em> Decorativo</em>.
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

      {/* ── Paredes perimetrales del espacio (sección complementaria) ── */}
      <SettingsParedesPerimetro workspaceId={workspaceId} isAdmin={isAdmin} />
    </div>
  );
};

SettingsZonasAccesos.displayName = 'SettingsZonasAccesos';
