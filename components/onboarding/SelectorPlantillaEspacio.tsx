import React from 'react';
import { Check } from 'lucide-react';
import { PLANTILLAS_ESPACIO, type PlantillaEspacioId } from '@/src/core/domain/entities/plantillasEspacio';

interface SelectorPlantillaEspacioProps {
  value: PlantillaEspacioId;
  onChange: (valor: PlantillaEspacioId) => void;
  disabled?: boolean;
  recomendadaId?: PlantillaEspacioId | null;
}

export const SelectorPlantillaEspacio: React.FC<SelectorPlantillaEspacioProps> = ({
  value,
  onChange,
  disabled = false,
  recomendadaId = null,
}) => {
  return (
    <div className="space-y-3">
      {PLANTILLAS_ESPACIO.map((plantilla) => {
        const activa = plantilla.id === value;
        const recomendada = plantilla.id === recomendadaId;

        return (
          <button
            key={plantilla.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(plantilla.id)}
            className={`w-full text-left rounded-2xl border transition-all overflow-hidden ${activa
              ? 'border-violet-400/70 bg-violet-500/10 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]'
              : recomendada
                ? 'border-cyan-400/40 bg-cyan-500/[0.06] hover:border-cyan-300/60 hover:bg-cyan-500/[0.09]'
                : 'border-white/[0.08] bg-white/[0.03] hover:border-violet-500/30 hover:bg-white/[0.05]'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="grid grid-cols-[120px_1fr] gap-4 p-4 lg:grid-cols-[100px_1fr] lg:gap-3 lg:p-3.5">
              <div
                className="relative h-[104px] rounded-xl border border-white/10 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${plantilla.color_primario}22 0%, ${plantilla.color_secundario}18 100%)`,
                }}
              >
                <div className="absolute inset-2 rounded-lg border border-white/10" />
                {plantilla.preview.bloques.map((bloque, index) => (
                  <div
                    key={`${plantilla.id}-${index}`}
                    className={`absolute ${bloque.redondeado ? 'rounded-full' : 'rounded-[6px]'}`}
                    style={{
                      left: `${bloque.x}%`,
                      top: `${bloque.y}%`,
                      width: `${bloque.ancho}%`,
                      height: `${bloque.alto}%`,
                      background: bloque.color,
                      opacity: bloque.opacidad ?? 1,
                    }}
                  />
                ))}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-black/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/70">
                  <span>{plantilla.zona.ancho_metros}m</span>
                  <span>{plantilla.zona.alto_metros}m</span>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm lg:text-xs font-black text-white tracking-wide uppercase">{plantilla.nombre}</h3>
                      {recomendada && (
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">
                          Recomendada
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs lg:text-[11px] text-zinc-400 leading-relaxed">{plantilla.descripcion}</p>
                  </div>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${activa ? 'border-violet-400 bg-violet-500/20 text-violet-200' : 'border-white/10 bg-black/30 text-transparent'}`}>
                    <Check className="w-4 h-4" />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {plantilla.resumen.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
