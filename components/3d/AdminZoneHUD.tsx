import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { guardarZonaEmpresa, eliminarZonaEmpresa } from '@/lib/autorizacionesEmpresa';
import { logger } from '@/lib/logger';
import { FloorType, FLOOR_TYPE_LABELS, FLOOR_TYPE_CATEGORIES, normalizarTipoSuelo } from '../../src/core/domain/entities';
import { normalizarConfiguracionZonaEmpresa, normalizarTipoSubsueloZona, type TipoSubsueloZona } from '../../src/core/domain/entities/cerramientosZona';
import { TEXTURE_REGISTRY } from '../../lib/rendering/textureRegistry';
import { ZonaEmpresa } from '@/types';
import { useAuthSessionGetter } from '@/hooks/auth/useAuthSession';

interface AdminZoneHUDProps {
  workspaceId: string;
  nuevaZona: { ancho: number; alto: number; x: number; z: number; tipoSuelo?: FloorType; nivelAnidamiento?: number } | null;
  zonaAEditar?: ZonaEmpresa | null;
  onLimpiarNuevaZona: () => void;
  onMaterialSeleccionado?: () => void;
  onZonaCreada?: () => void;
}

export const AdminZoneHUD: React.FC<AdminZoneHUDProps> = ({
  workspaceId,
  nuevaZona,
  zonaAEditar,
  onLimpiarNuevaZona,
  onMaterialSeleccionado,
  onZonaCreada
}) => {
  const log = logger.child('AdminZoneHUD');
  const isDrawingZone = useStore((s) => s.isDrawingZone);
  const setIsDrawingZone = useStore((s) => s.setIsDrawingZone);
  const paintFloorType = useStore((s) => s.paintFloorType);
  const setPaintFloorType = useStore((s) => s.setPaintFloorType);
  const currentUser = useStore((s) => s.currentUser);
  
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [tipoSuelo, setTipoSuelo] = useState<FloorType>(FloorType.CONCRETE_SMOOTH);
  const [tipoSubsuelo, setTipoSubsuelo] = useState<TipoSubsueloZona>('organizacional');
  const [esComun, setEsComun] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mostrarSelectorSuelo, setMostrarSelectorSuelo] = useState(true);
  const getAuthSession = useAuthSessionGetter();
  const anidamientoDecorativoForzado = (nuevaZona?.nivelAnidamiento ?? 0) >= 2;

  // Sincronizar estado cuando cambia la zona a editar
  useEffect(() => {
    if (zonaAEditar) {
      const configuracion = normalizarConfiguracionZonaEmpresa(zonaAEditar.configuracion);
      setNombre(zonaAEditar.nombre_zona || '');
      setColor(zonaAEditar.color || '#2563eb');
      setTipoSuelo(normalizarTipoSuelo(zonaAEditar.tipo_suelo));
      setTipoSubsuelo(normalizarTipoSubsueloZona(configuracion.tipo_subsuelo, 'organizacional'));
      setEsComun(!!zonaAEditar.es_comun);
    } else {
      setNombre('');
      setColor('#2563eb');
      setTipoSuelo(FloorType.CONCRETE_SMOOTH);
      setTipoSubsuelo('organizacional');
      setEsComun(false);
    }
  }, [zonaAEditar]);

  // Auto-populate tipoSuelo desde el material seleccionado al dibujar
  useEffect(() => {
    if (nuevaZona?.tipoSuelo) {
      setTipoSuelo(nuevaZona.tipoSuelo);
    }
  }, [nuevaZona]);

  useEffect(() => {
    if (isDrawingZone && !nuevaZona && !zonaAEditar) {
      setMostrarSelectorSuelo(true);
    }
  }, [isDrawingZone, nuevaZona, zonaAEditar]);
  
  // Handlers para UI de dibujo
  const handleToggleDraw = () => {
    setIsDrawingZone(!isDrawingZone);
    setMostrarSelectorSuelo(true);
    if (nuevaZona || zonaAEditar) onLimpiarNuevaZona();
  };

  const handleSeleccionarSuelo = (tipo: FloorType) => {
    setPaintFloorType(tipo);
    setTipoSuelo(tipo);
    setMostrarSelectorSuelo(false);
    onMaterialSeleccionado?.();
  };

  const handleEliminar = async () => {
    if (!zonaAEditar) return;
    if (!confirm('¿Estás seguro de que deseas eliminar esta zona?')) return;
    
    setIsDeleting(true);
    try {
      const { userId } = getAuthSession();

      const ok = await eliminarZonaEmpresa({
        zonaId: zonaAEditar.id,
        espacioId: workspaceId,
        usuarioId: userId,
        empresaId: zonaAEditar.empresa_id ?? currentUser.empresa_id ?? null,
      });

      if (!ok) throw new Error('No se pudo eliminar la zona');

      if (onZonaCreada) onZonaCreada();
      onLimpiarNuevaZona();
    } catch (e) {
      log.error('handleEliminar error', { error: e instanceof Error ? e.message : String(e) });
      alert('Error eliminando zona');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGuardar = async () => {
    const nombreNormalizado = nombre.trim();
    const tipoSubsueloFinal: TipoSubsueloZona = anidamientoDecorativoForzado ? 'decorativo' : tipoSubsuelo;
    if ((!nuevaZona && !zonaAEditar) || (tipoSubsueloFinal === 'organizacional' && !nombreNormalizado)) return;
    setIsSaving(true);
    try {
      const { userId } = getAuthSession();

      const empresaZonaPrivada = esComun
        ? null
        : zonaAEditar?.empresa_id ?? currentUser.empresa_id ?? null;

      if (!esComun && !empresaZonaPrivada) {
        alert('No se pudo determinar la empresa propietaria de la zona.');
        return;
      }

      const payload = {
        espacioId: workspaceId,
        empresaId: empresaZonaPrivada,
        nombreZona: tipoSubsueloFinal === 'decorativo' ? (nombreNormalizado || null) : nombreNormalizado,
        color: '#ffffff', // Color neutro por defecto, ahora usamos Nombres y Texturas PBR
        estado: 'activa',
        esComun: esComun,
        tipoSuelo: normalizarTipoSuelo(tipoSuelo),
        configuracion: {
          ...(normalizarConfiguracionZonaEmpresa(zonaAEditar?.configuracion) || {}),
          tipo_subsuelo: tipoSubsueloFinal,
        },
        usuarioId: userId,
      };

      if (zonaAEditar) {
        // Modo Edición
        await guardarZonaEmpresa({
          ...payload,
          zonaId: zonaAEditar.id,
          posicionX: zonaAEditar.posicion_x,
          posicionY: zonaAEditar.posicion_y,
          ancho: zonaAEditar.ancho,
          alto: zonaAEditar.alto,
        });
      } else if (nuevaZona) {
        // Modo Creación
        await guardarZonaEmpresa({
          ...payload,
          posicionX: Math.round(nuevaZona.x * 16),
          posicionY: Math.round(nuevaZona.z * 16),
          ancho: Math.round(nuevaZona.ancho * 16),
          alto: Math.round(nuevaZona.alto * 16),
        });
      }

      if (onZonaCreada) onZonaCreada();
      onLimpiarNuevaZona();
      setNombre('');
      setColor('#2563eb');
      setTipoSuelo(FloorType.CONCRETE_SMOOTH);
      setTipoSubsuelo('organizacional');
      setEsComun(false);
    } catch (e) {
      log.error('handleGuardar error', { error: e instanceof Error ? e.message : String(e) });
      alert('Error guardando zona');
    } finally {
      setIsSaving(false);
    }
  };

  const showModal = !!nuevaZona || !!zonaAEditar;

  return (
    <>
      {isDrawingZone && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[390] flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={handleToggleDraw}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all duration-200 shadow-lg bg-red-500/20 border-red-400 text-red-200"
          >
            <span className="text-lg">❌</span>
            Cancelar Dibujo
          </button>
        </div>
      )}

      {isDrawingZone && !nuevaZona && !zonaAEditar && mostrarSelectorSuelo && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[390] animate-in fade-in slide-in-from-bottom pointer-events-auto">
          <div className="bg-black/88 backdrop-blur-xl border border-indigo-500/30 px-5 py-4 rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.25)] flex flex-col gap-3" style={{ minWidth: 380 }}>
            {/* Instrucción */}
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
              <span className="text-indigo-100/90 font-medium text-sm">Elige el suelo y arrastra para delimitar la zona</span>
            </div>
            {/* Selector de material por categoría */}
            <div className="flex flex-col gap-2">
              {Object.entries(FLOOR_TYPE_CATEGORIES).map(([categoria, tipos]) => (
                <div key={categoria}>
                  <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">{categoria}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {tipos.map((tipo) => {
                      const config = TEXTURE_REGISTRY[tipo];
                      const label = FLOOR_TYPE_LABELS[tipo];
                      const isSelected = paintFloorType === tipo;
                      return (
                        <button
                          key={tipo}
                          onClick={() => handleSeleccionarSuelo(tipo)}
                          title={label}
                          className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-indigo-400 bg-indigo-500/25 shadow-[0_0_8px_rgba(99,102,241,0.5)]'
                              : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-700/40'
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex-shrink-0 border border-white/10"
                            style={{ backgroundColor: config.fallbackColor }}
                          />
                          <span className="text-[8px] text-slate-300 leading-tight max-w-[52px] text-center truncate">
                            {label.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isDrawingZone && !nuevaZona && !zonaAEditar && !mostrarSelectorSuelo && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[390] animate-in fade-in slide-in-from-bottom pointer-events-auto">
          <div className="bg-black/80 backdrop-blur-xl border border-indigo-500/25 px-4 py-2.5 rounded-2xl shadow-[0_0_24px_rgba(99,102,241,0.18)] flex items-center gap-3">
            <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: TEXTURE_REGISTRY[paintFloorType].fallbackColor }} />
            <span className="text-sm text-indigo-100/90 font-medium">{FLOOR_TYPE_LABELS[paintFloorType]}</span>
            <button
              onClick={() => setMostrarSelectorSuelo(true)}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800/70 text-slate-200 hover:bg-slate-700/70 transition-colors"
            >
              Cambiar suelo
            </button>
          </div>
        </div>
      )}

      {/* Modal para rellenar campos tras dibujar o al editar */}
      {showModal && (
        <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-white tracking-tight">
                {zonaAEditar ? 'Editar Zona' : 'Configurar Zona'}
              </h3>
              {zonaAEditar && (
                <button 
                  onClick={handleEliminar}
                  disabled={isDeleting}
                  className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                  title="Eliminar zona"
                >
                  <span className="text-lg text-red-400/80">🗑</span>
                </button>
              )}
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-1">{tipoSubsuelo === 'decorativo' ? 'Nombre decorativo (opcional)' : 'Departamento / Área'}</label>
                <input 
                  type="text" 
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={tipoSubsuelo === 'decorativo' ? 'Ej: Franja de mármol, pasillo, detalle...' : 'Ej: Marketing, IT, Comercial...'}
                  className="mt-1 w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-1">Uso del subsuelo</label>
                <select
                  value={tipoSubsuelo}
                  onChange={(e) => setTipoSubsuelo(normalizarTipoSubsueloZona(e.target.value))}
                  disabled={anidamientoDecorativoForzado}
                  className="mt-1 w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500 transition-colors appearance-none disabled:opacity-60"
                >
                  <option value="organizacional" className="bg-slate-900 text-white">Organizacional</option>
                  <option value="decorativo" className="bg-slate-900 text-white">Decorativo</option>
                </select>
                {anidamientoDecorativoForzado && (
                  <p className="mt-1 text-[11px] text-amber-300/90">Dentro de un subsuelo existente solo se permiten subsuelos decorativos.</p>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-1">Tipo de Suelo (Textura PBR)</label>
                <select
                  value={tipoSuelo}
                  onChange={(e) => setTipoSuelo(normalizarTipoSuelo(e.target.value))}
                  className="mt-1 w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500 transition-colors appearance-none"
                >
                  {Object.entries(FLOOR_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value} className="bg-slate-900 text-white">
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2 cursor-pointer group" onClick={() => setEsComun(!esComun)}>
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${esComun ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                  {esComun && <span className="text-[10px]">✔</span>}
                </div>
                <label className="text-sm text-slate-300 cursor-pointer select-none group-hover:text-white transition-colors">
                  Es una zona común (pública)
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-800/50">
              <button 
                onClick={onLimpiarNuevaZona}
                className="flex-1 py-2.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800/30 hover:bg-slate-800 rounded-xl transition-all border border-slate-700/30"
                disabled={isSaving || isDeleting}
              >
                CANCELAR
              </button>
              <button 
                onClick={handleGuardar}
                disabled={((anidamientoDecorativoForzado ? 'decorativo' : tipoSubsuelo) === 'organizacional' && !nombre.trim()) || isSaving || isDeleting}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                {isSaving ? 'GUARDANDO...' : (zonaAEditar ? 'GUARDAR CAMBIOS' : 'CREAR ZONA')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
