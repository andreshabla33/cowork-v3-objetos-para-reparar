import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { guardarZonaEmpresa, eliminarZonaEmpresa } from '@/lib/autorizacionesEmpresa';
import { FloorType, FLOOR_TYPE_LABELS, normalizarTipoSuelo } from '../../src/core/domain/entities';
import { ZonaEmpresa } from '@/types';
import { supabase } from '@/lib/supabase';

interface AdminZoneHUDProps {
  workspaceId: string;
  nuevaZona: { ancho: number; alto: number; x: number; z: number } | null;
  zonaAEditar?: ZonaEmpresa | null;
  onLimpiarNuevaZona: () => void;
  onZonaCreada?: () => void;
}

export const AdminZoneHUD: React.FC<AdminZoneHUDProps> = ({ 
  workspaceId, 
  nuevaZona, 
  zonaAEditar,
  onLimpiarNuevaZona, 
  onZonaCreada 
}) => {
  const isDrawingZone = useStore((s) => s.isDrawingZone);
  const setIsDrawingZone = useStore((s) => s.setIsDrawingZone);
  const currentUser = useStore((s) => s.currentUser);
  
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [tipoSuelo, setTipoSuelo] = useState<FloorType>(FloorType.CONCRETE_SMOOTH);
  const [esComun, setEsComun] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sincronizar estado cuando cambia la zona a editar
  useEffect(() => {
    if (zonaAEditar) {
      setNombre(zonaAEditar.nombre_zona || '');
      setColor(zonaAEditar.color || '#2563eb');
      setTipoSuelo(normalizarTipoSuelo(zonaAEditar.tipo_suelo));
      setEsComun(!!zonaAEditar.es_comun);
    } else {
      setNombre('');
      setColor('#2563eb');
      setTipoSuelo(FloorType.CONCRETE_SMOOTH);
      setEsComun(false);
    }
  }, [zonaAEditar]);
  
  // Handlers para UI de dibujo
  const handleToggleDraw = () => {
    setIsDrawingZone(!isDrawingZone);
    if (nuevaZona || zonaAEditar) onLimpiarNuevaZona();
  };

  const handleEliminar = async () => {
    if (!zonaAEditar) return;
    if (!confirm('¿Estás seguro de que deseas eliminar esta zona?')) return;
    
    setIsDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const ok = await eliminarZonaEmpresa({
        zonaId: zonaAEditar.id,
        espacioId: workspaceId,
        usuarioId: sessionData.session?.user.id ?? null,
        empresaId: zonaAEditar.empresa_id ?? currentUser.empresa_id ?? null,
      });
      
      if (!ok) throw new Error('No se pudo eliminar la zona');
      
      if (onZonaCreada) onZonaCreada();
      onLimpiarNuevaZona();
    } catch (e) {
      console.error(e);
      alert('Error eliminando zona');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGuardar = async () => {
    if ((!nuevaZona && !zonaAEditar) || !nombre.trim()) return;
    setIsSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
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
        nombreZona: nombre,
        color: '#ffffff', // Color neutro por defecto, ahora usamos Nombres y Texturas PBR
        estado: 'activa',
        esComun: esComun,
        tipoSuelo: normalizarTipoSuelo(tipoSuelo),
        usuarioId: sessionData.session?.user.id ?? null,
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
      setEsComun(false);
    } catch (e) {
      console.error(e);
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

      {isDrawingZone && !nuevaZona && !zonaAEditar && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[390] animate-in fade-in slide-in-from-bottom pointer-events-none">
          <div className="bg-black/80 backdrop-blur-xl border border-indigo-500/30 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.2)] flex items-center gap-4">
            <div className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-indigo-100/90 font-medium">Arrastra el mouse en el piso para delimitar la zona</span>
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
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-1">Departamento / Área</label>
                <input 
                  type="text" 
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Marketing, IT, Comercial..."
                  className="mt-1 w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500 transition-colors"
                />
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
                disabled={!nombre.trim() || isSaving || isDeleting}
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
