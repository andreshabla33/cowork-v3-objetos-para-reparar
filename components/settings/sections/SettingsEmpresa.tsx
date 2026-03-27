'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Globe, MapPin, Phone, Mail, FileText,
  Check, RefreshCw, Save, Plus, Users
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const TAMANOS = [
  { value: 'startup', label: 'Startup (1-10)' },
  { value: 'pequena', label: 'Pequeña (11-50)' },
  { value: 'mediana', label: 'Mediana (51-200)' },
  { value: 'grande', label: 'Grande (201-1000)' },
  { value: 'enterprise', label: 'Enterprise (1000+)' },
];

const INDUSTRIAS = [
  'Tecnología', 'Finanzas', 'Salud', 'Educación', 'Comercio',
  'Manufactura', 'Servicios', 'Consultoría', 'Marketing',
  'Inmobiliaria', 'Legal', 'Energía', 'Transporte', 'Otro',
];

interface Empresa {
  id: string;
  nombre: string;
  nit_rut: string | null;
  industria: string | null;
  tamano: string;
  sitio_web: string | null;
  logo_url: string | null;
  pais: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  descripcion: string | null;
}

interface SettingsEmpresaProps {
  workspaceId: string;
  isAdmin: boolean;
}

export const SettingsEmpresa: React.FC<SettingsEmpresaProps> = ({ workspaceId, isAdmin }) => {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    nit_rut: '',
    industria: '',
    tamano: 'pequena',
    sitio_web: '',
    pais: '',
    ciudad: '',
    direccion: '',
    telefono: '',
    email_contacto: '',
    descripcion: '',
  });

  const fetchEmpresa = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setEmpresa(null);
        setLoading(false);
        return;
      }

      const { data: miembroData } = await supabase
        .from('miembros_espacio')
        .select('empresa_id')
        .eq('espacio_id', workspaceId)
        .eq('usuario_id', userId)
        .maybeSingle();

      if (miembroData?.empresa_id) {
        const { data: empresaData } = await supabase
          .from('empresas')
          .select('*')
          .eq('id', miembroData.empresa_id)
          .eq('espacio_id', workspaceId)
          .single();

        if (empresaData) {
          setEmpresa(empresaData);
          setFormData({
            nombre: empresaData.nombre || '',
            nit_rut: empresaData.nit_rut || '',
            industria: empresaData.industria || '',
            tamano: empresaData.tamano || 'pequena',
            sitio_web: empresaData.sitio_web || '',
            pais: empresaData.pais || '',
            ciudad: empresaData.ciudad || '',
            direccion: empresaData.direccion || '',
            telefono: empresaData.telefono || '',
            email_contacto: empresaData.email_contacto || '',
            descripcion: empresaData.descripcion || '',
          });
        }
      }
    } catch (err) {
      console.error('Error cargando empresa:', err);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchEmpresa(); }, [fetchEmpresa]);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const showMessage = (msg: string, type: 'error' | 'success') => {
    if (type === 'error') setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) { showMessage('El nombre de la empresa es requerido', 'error'); return; }
    setSaving(true);

    try {
      const empresaPayload = {
        nombre: formData.nombre.trim(),
        nit_rut: formData.nit_rut.trim() || null,
        industria: formData.industria || null,
        tamano: formData.tamano,
        sitio_web: formData.sitio_web.trim() || null,
        pais: formData.pais.trim() || null,
        ciudad: formData.ciudad.trim() || null,
        direccion: formData.direccion.trim() || null,
        telefono: formData.telefono.trim() || null,
        email_contacto: formData.email_contacto.trim() || null,
        descripcion: formData.descripcion.trim() || null,
        actualizado_en: new Date().toISOString(),
      };

      if (empresa) {
        // Actualizar empresa existente
        const { error } = await supabase
          .from('empresas')
          .update(empresaPayload)
          .eq('id', empresa.id);
        if (error) throw error;
        showMessage('Empresa actualizada correctamente', 'success');
      } else {
        // Crear nueva empresa y vincular al espacio
        const { data: session } = await supabase.auth.getSession();
        const { data: nuevaEmpresa, error: createError } = await supabase
          .from('empresas')
          .insert({
            ...empresaPayload,
            creado_por: session.session?.user.id,
            espacio_id: workspaceId,
          })
          .select()
          .single();
        if (createError) throw createError;

        setEmpresa(nuevaEmpresa);
        showMessage('Empresa creada correctamente', 'success');
      }
      setHasChanges(false);
    } catch (err: any) {
      showMessage(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Solo los administradores pueden gestionar la empresa.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">
            {empresa ? 'Información de la Empresa' : 'Vincular Empresa'}
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            {empresa ? 'Datos de la organización vinculada a este espacio' : 'Configura los datos de tu empresa para este espacio de trabajo'}
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{success}</div>
      )}

      {!empresa && (
        <div className="mb-6 p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-violet-400" />
            <p className="text-sm text-violet-300">
              Aún no tienes una empresa vinculada. Completa los datos y se creará automáticamente.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Datos principales */}
        <div className="p-5 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-400" /> Datos principales
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre de la empresa *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => updateField('nombre', e.target.value)}
                placeholder="Mi Empresa S.A.S."
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">NIT / RUT</label>
              <input
                type="text"
                value={formData.nit_rut}
                onChange={(e) => updateField('nit_rut', e.target.value)}
                placeholder="900.123.456-7"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Industria</label>
              <select
                value={formData.industria}
                onChange={(e) => updateField('industria', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {INDUSTRIAS.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Tamaño</label>
              <select
                value={formData.tamano}
                onChange={(e) => updateField('tamano', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              >
                {TAMANOS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Descripción</label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => updateField('descripcion', e.target.value)}
              placeholder="Breve descripción de la empresa..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Contacto */}
        <div className="p-5 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-violet-400" /> Contacto
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Sitio web</label>
              <input
                type="url"
                value={formData.sitio_web}
                onChange={(e) => updateField('sitio_web', e.target.value)}
                placeholder="https://miempresa.com"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Email de contacto</label>
              <input
                type="email"
                value={formData.email_contacto}
                onChange={(e) => updateField('email_contacto', e.target.value)}
                placeholder="info@miempresa.com"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Teléfono</label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => updateField('telefono', e.target.value)}
                placeholder="+57 300 123 4567"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Ubicación */}
        <div className="p-5 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl">
          <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-violet-400" /> Ubicación
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">País</label>
              <input
                type="text"
                value={formData.pais}
                onChange={(e) => updateField('pais', e.target.value)}
                placeholder="Colombia"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Ciudad</label>
              <input
                type="text"
                value={formData.ciudad}
                onChange={(e) => updateField('ciudad', e.target.value)}
                placeholder="Bogotá"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Dirección</label>
            <input
              type="text"
              value={formData.direccion}
              onChange={(e) => updateField('direccion', e.target.value)}
              placeholder="Calle 123 #45-67, Oficina 801"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Botón guardar fijo */}
      {hasChanges && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl font-medium disabled:opacity-50 transition-all shadow-lg shadow-violet-600/20"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {empresa ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </div>
      )}
    </div>
  );
};
