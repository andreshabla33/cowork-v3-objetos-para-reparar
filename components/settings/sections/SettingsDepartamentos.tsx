'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Check, RefreshCw, X,
  Users, TrendingUp, Code, Megaphone, Settings as SettingsIcon,
  HelpCircle, Palette
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const COLORES_PRESET = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#6b7280', '#ec4899', '#3b82f6', '#14b8a6', '#f97316',
];

const ICONOS_DEPT = [
  'users', 'trending-up', 'code', 'megaphone', 'settings',
  'help-circle', 'palette', 'briefcase', 'rocket', 'target',
];

const ICON_MAP_DEPT: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  users: Users, 'trending-up': TrendingUp, code: Code, megaphone: Megaphone,
  settings: SettingsIcon, 'help-circle': HelpCircle, palette: Palette,
};

interface Departamento {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  icono: string;
}

interface SettingsDepartamentosProps {
  workspaceId: string;
  isAdmin: boolean;
}

export const SettingsDepartamentos: React.FC<SettingsDepartamentosProps> = ({ workspaceId, isAdmin }) => {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    color: '#8b5cf6',
    icono: 'users',
  });

  const fetchDepartamentos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('departamentos')
      .select('*')
      .eq('espacio_id', workspaceId)
      .order('nombre');
    if (error) {
      setError('Error al cargar departamentos');
      console.error(error);
    } else {
      setDepartamentos(data || []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchDepartamentos(); }, [fetchDepartamentos]);

  const resetForm = () => {
    setFormData({ nombre: '', descripcion: '', color: '#8b5cf6', icono: 'users' });
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
          .from('departamentos')
          .update({
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim() || null,
            color: formData.color,
            icono: formData.icono,
          })
          .eq('id', editingId);
        if (error) throw error;
        showMessage('Departamento actualizado', 'success');
      } else {
        const { error } = await supabase
          .from('departamentos')
          .insert({
            espacio_id: workspaceId,
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim() || null,
            color: formData.color,
            icono: formData.icono,
          });
        if (error) throw error;
        showMessage('Departamento creado', 'success');
      }
      resetForm();
      fetchDepartamentos();
    } catch (err: any) {
      showMessage(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (dept: Departamento) => {
    setFormData({
      nombre: dept.nombre,
      descripcion: dept.descripcion || '',
      color: dept.color,
      icono: dept.icono,
    });
    setEditingId(dept.id);
    setShowNew(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este departamento? Los miembros asignados no se verán afectados.')) return;
    const { error } = await supabase.from('departamentos').delete().eq('id', id);
    if (error) showMessage('Error al eliminar', 'error');
    else { showMessage('Departamento eliminado', 'success'); fetchDepartamentos(); }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-[#6B83A0]">
        Solo los administradores pueden gestionar departamentos.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-[#0B2240]">Departamentos</h3>
          <p className="text-sm text-[#4A6485] mt-1">Organiza tu equipo en áreas de trabajo</p>
        </div>
        {!showNew && (
          <button
            onClick={() => { resetForm(); setShowNew(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] hover:from-[#4FB0FF] hover:to-[#1E86E5] text-white rounded-xl text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" /> Nuevo departamento
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{success}</div>
      )}

      {/* Formulario nuevo/editar */}
      {showNew && (
        <div className="mb-6 p-5 bg-white/60 backdrop-blur-sm border border-[rgba(46,150,245,0.14)] rounded-2xl">
          <h4 className="text-sm font-bold text-[#0B2240] mb-4">
            {editingId ? 'Editar departamento' : 'Nuevo departamento'}
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-[#4A6485] mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Marketing"
                className="w-full px-3 py-2 bg-white/70 border border-[rgba(46,150,245,0.16)] rounded-lg text-[#0B2240] text-sm focus:border-[#2E96F5] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A6485] mb-1">Descripción</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción breve"
                className="w-full px-3 py-2 bg-white/70 border border-[rgba(46,150,245,0.16)] rounded-lg text-[#0B2240] text-sm focus:border-[#2E96F5] outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-8 mb-4">
            <div>
              <label className="block text-xs font-medium text-[#4A6485] mb-2">Color</label>
              <div className="flex gap-1.5">
                {COLORES_PRESET.map(color => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-7 h-7 rounded-lg transition-all ${
                      formData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-white scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4A6485] mb-2">Icono</label>
              <div className="flex gap-1.5">
                {ICONOS_DEPT.map(iconName => {
                  const Ic = ICON_MAP_DEPT[iconName] || HelpCircle;
                  return (
                    <button
                      key={iconName}
                      onClick={() => setFormData({ ...formData, icono: iconName })}
                      className={`p-1.5 rounded-lg transition-all ${
                        formData.icono === iconName
                          ? 'bg-[#2E96F5] text-white'
                          : 'bg-[rgba(46,150,245,0.08)] text-[#4A6485] hover:text-[#0B2240]'
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
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] hover:from-[#4FB0FF] hover:to-[#1E86E5] text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingId ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-[#4A6485] hover:text-[#0B2240] text-sm transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de departamentos */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
        </div>
      ) : departamentos.length === 0 ? (
        <div className="text-center py-12 text-[#6B83A0]">No hay departamentos configurados</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {departamentos.map((dept) => {
            const DeptIcon = ICON_MAP_DEPT[dept.icono] || HelpCircle;
            return (
              <div
                key={dept.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-[rgba(46,150,245,0.14)] bg-white/50 hover:border-[#2E96F5] transition-all group"
              >
                <div
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: `${dept.color}20` }}
                >
                  <DeptIcon className="w-5 h-5" style={{ color: dept.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-[#0B2240]">{dept.nombre}</div>
                  {dept.descripcion && (
                    <div className="text-xs text-[#6B83A0] truncate">{dept.descripcion}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(dept)}
                    className="p-1.5 rounded-lg text-[#6B83A0] hover:text-[#0B2240] hover:bg-[rgba(46,150,245,0.1)] transition-all"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id)}
                    className="p-1.5 rounded-lg text-[#6B83A0] hover:text-red-400 hover:bg-red-500/10 transition-all"
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
