'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown, Settings, Users, UserCheck, Search, TrendingUp, Target,
  Briefcase, Rocket, Package, RefreshCw, User, HelpCircle,
  Plus, Pencil, Trash2, GripVertical, Shield, Check, X, ChevronDown,
  ToggleLeft, ToggleRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  crown: Crown, settings: Settings, users: Users, 'user-check': UserCheck,
  search: Search, 'trending-up': TrendingUp, target: Target, briefcase: Briefcase,
  rocket: Rocket, package: Package, 'refresh-cw': RefreshCw, user: User,
  'help-circle': HelpCircle,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const CATEGORIAS = [
  { value: 'liderazgo', label: 'Liderazgo Ejecutivo' },
  { value: 'rrhh', label: 'Recursos Humanos' },
  { value: 'comercial', label: 'Área Comercial' },
  { value: 'producto', label: 'Producto y Desarrollo' },
  { value: 'otros', label: 'Otros' },
];

interface Cargo {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  icono: string;
  orden: number;
  activo: boolean;
  tiene_analisis_avanzado: boolean;
  analisis_disponibles: string[];
  solo_admin: boolean;
}

interface SettingsCargosProps {
  workspaceId: string;
  isAdmin: boolean;
}

export const SettingsCargos: React.FC<SettingsCargosProps> = ({ workspaceId, isAdmin }) => {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'otros',
    icono: 'user',
    solo_admin: false,
    tiene_analisis_avanzado: false,
  });

  const fetchCargos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cargos')
      .select('*')
      .eq('espacio_id', workspaceId)
      .order('orden');
    if (error) {
      setError('Error al cargar cargos');
      console.error(error);
    } else {
      setCargos(data || []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchCargos(); }, [fetchCargos]);

  const resetForm = () => {
    setFormData({ nombre: '', descripcion: '', categoria: 'otros', icono: 'user', solo_admin: false, tiene_analisis_avanzado: false });
    setEditingId(null);
    setShowNew(false);
  };

  const showMessage = (msg: string, type: 'error' | 'success') => {
    if (type === 'error') setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) { showMessage('El nombre es requerido', 'error'); return; }
    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('cargos')
          .update({
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim() || null,
            categoria: formData.categoria,
            icono: formData.icono,
            solo_admin: formData.solo_admin,
            tiene_analisis_avanzado: formData.tiene_analisis_avanzado,
          })
          .eq('id', editingId);
        if (error) throw error;
        showMessage('Cargo actualizado', 'success');
      } else {
        const maxOrden = cargos.length > 0 ? Math.max(...cargos.map(c => c.orden)) + 1 : 1;
        const { error } = await supabase
          .from('cargos')
          .insert({
            espacio_id: workspaceId,
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim() || null,
            categoria: formData.categoria,
            icono: formData.icono,
            orden: maxOrden,
            solo_admin: formData.solo_admin,
            tiene_analisis_avanzado: formData.tiene_analisis_avanzado,
          });
        if (error) throw error;
        showMessage('Cargo creado', 'success');
      }
      resetForm();
      fetchCargos();
    } catch (err: any) {
      if (err.code === '23505') showMessage('Ya existe un cargo con ese nombre', 'error');
      else showMessage(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cargo: Cargo) => {
    setFormData({
      nombre: cargo.nombre,
      descripcion: cargo.descripcion || '',
      categoria: cargo.categoria,
      icono: cargo.icono,
      solo_admin: cargo.solo_admin,
      tiene_analisis_avanzado: cargo.tiene_analisis_avanzado,
    });
    setEditingId(cargo.id);
    setShowNew(true);
  };

  const handleToggleActivo = async (cargo: Cargo) => {
    const { error } = await supabase
      .from('cargos')
      .update({ activo: !cargo.activo })
      .eq('id', cargo.id);
    if (error) showMessage('Error al cambiar estado', 'error');
    else fetchCargos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cargo? Los miembros con este cargo no se verán afectados.')) return;
    const { error } = await supabase.from('cargos').delete().eq('id', id);
    if (error) showMessage('Error al eliminar', 'error');
    else { showMessage('Cargo eliminado', 'success'); fetchCargos(); }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Solo los administradores pueden gestionar cargos.
      </div>
    );
  }

  const IconComp = ICON_MAP[formData.icono] || User;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">Cargos del Espacio</h3>
          <p className="text-sm text-zinc-400 mt-1">Gestiona los roles disponibles para los miembros</p>
        </div>
        {!showNew && (
          <button
            onClick={() => { resetForm(); setShowNew(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" /> Nuevo cargo
          </button>
        )}
      </div>

      {/* Mensajes */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{success}</div>
      )}

      {/* Formulario nuevo/editar */}
      {showNew && (
        <div className="mb-6 p-5 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl">
          <h4 className="text-sm font-bold text-white mb-4">
            {editingId ? 'Editar cargo' : 'Nuevo cargo'}
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Director de Marketing"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Categoría</label>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              >
                {CATEGORIAS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Descripción</label>
            <input
              type="text"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción breve del cargo"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-6 mb-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Icono</label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_OPTIONS.map(iconName => {
                  const Ic = ICON_MAP[iconName];
                  return (
                    <button
                      key={iconName}
                      onClick={() => setFormData({ ...formData, icono: iconName })}
                      className={`p-1.5 rounded-lg transition-all ${
                        formData.icono === iconName
                          ? 'bg-violet-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                      title={iconName}
                    >
                      <Ic className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => setFormData({ ...formData, solo_admin: !formData.solo_admin })}>
                {formData.solo_admin
                  ? <ToggleRight className="w-5 h-5 text-violet-400" />
                  : <ToggleLeft className="w-5 h-5 text-zinc-500" />
                }
              </button>
              <span className="text-sm text-zinc-300">Solo admin puede asignar</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => setFormData({ ...formData, tiene_analisis_avanzado: !formData.tiene_analisis_avanzado })}>
                {formData.tiene_analisis_avanzado
                  ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                  : <ToggleLeft className="w-5 h-5 text-zinc-500" />
                }
              </button>
              <span className="text-sm text-zinc-300">Análisis avanzado</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingId ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de cargos */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
        </div>
      ) : cargos.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">No hay cargos configurados</div>
      ) : (
        <div className="space-y-2">
          {cargos.map((cargo) => {
            const CargoIcon = ICON_MAP[cargo.icono] || User;
            const catLabel = CATEGORIAS.find(c => c.value === cargo.categoria)?.label || cargo.categoria;
            return (
              <div
                key={cargo.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  cargo.activo
                    ? 'bg-zinc-800/30 border-zinc-700/50 hover:border-zinc-600'
                    : 'bg-zinc-900/50 border-zinc-800/30 opacity-60'
                }`}
              >
                <div className={`p-2 rounded-lg ${cargo.activo ? 'bg-violet-600/20 text-violet-400' : 'bg-zinc-800 text-zinc-600'}`}>
                  <CargoIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${cargo.activo ? 'text-white' : 'text-zinc-500'}`}>
                      {cargo.nombre}
                    </span>
                    {cargo.solo_admin && (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold">ADMIN</span>
                    )}
                    {cargo.tiene_analisis_avanzado && (
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {!cargo.activo && (
                      <span className="px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded text-[10px]">INACTIVO</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {catLabel} {cargo.descripcion ? `· ${cargo.descripcion}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleActivo(cargo)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all"
                    title={cargo.activo ? 'Desactivar' : 'Activar'}
                  >
                    {cargo.activo ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(cargo)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cargo.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
