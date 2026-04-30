import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Language, getCurrentLanguage, subscribeToLanguageChange, t } from '../../lib/i18n';

interface Props {
  grupoId: string;
  espacioId: string;
  onClose: () => void;
}

export const AgregarMiembros: React.FC<Props> = ({ grupoId, espacioId, onClose }) => {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [miembrosActuales, setMiembrosActuales] = useState<string[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());

  useEffect(() => {
    const unsubscribe = subscribeToLanguageChange(() => {
      setCurrentLang(getCurrentLanguage());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const cargar = async () => {
      const { data: miembrosEspacio } = await supabase
        .from('miembros_espacio')
        .select('usuario_id')
        .eq('espacio_id', espacioId)
        .eq('aceptado', true);
        
      const { data: miembrosGrupo } = await supabase
        .from('miembros_grupo')
        .select('usuario_id')
        .eq('grupo_id', grupoId);

      if (miembrosEspacio && miembrosEspacio.length > 0) {
        const ids = miembrosEspacio.map((m: any) => m.usuario_id);
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, nombre, email')
          .in('id', ids);
        setUsuarios(usuarios || []);
      }
      
      setMiembrosActuales(miembrosGrupo?.map((m: any) => m.usuario_id) || []);
    };
    cargar();
  }, [grupoId, espacioId]);

  const agregarMiembros = async () => {
    const nuevos = seleccionados.filter(id => !miembrosActuales.includes(id));
    if (nuevos.length === 0) return;
    
    const { error } = await supabase.from('miembros_grupo').insert(
      nuevos.map(usuario_id => ({
        grupo_id: grupoId,
        usuario_id,
        rol: 'miembro'
      }))
    );
    
    if (!error) onClose();
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const usuariosFiltrados = usuarios.filter(u => 
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || 
    u.email?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-[var(--cw-ink-900)]/30 backdrop-blur-sm flex items-center justify-center z-[1000] p-6">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--cw-glass-border)] rounded-2xl p-8 w-full max-w-md shadow-[var(--cw-shadow-floating)] animate-in zoom-in duration-300">
        <h2 className="text-xl font-bold text-[var(--cw-ink-900)] mb-6">{t('chat.addToChannel', currentLang)}</h2>
        
        <input 
          type="text"
          placeholder={t('chat.searchMembers', currentLang)}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-white/80 border border-[var(--cw-glass-border)] rounded-xl px-5 py-3 mb-5 text-sm text-[var(--cw-ink-700)] focus:ring-2 focus:ring-blue-100 focus:border-[var(--cw-blue-400)] outline-none placeholder:text-[var(--cw-ink-400)]"
        />

        <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {usuariosFiltrados.map((user: any) => {
            const esMiembro = miembrosActuales.includes(user.id);
            const estaSeleccionado = seleccionados.includes(user.id);

            return (
              <div
                key={user.id}
                onClick={() => !esMiembro && toggleSeleccion(user.id)}
                className={`flex items-center gap-4 p-3.5 rounded-xl transition-all cursor-pointer border-2 ${
                  esMiembro 
                    ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' 
                    : estaSeleccionado
                      ? 'bg-blue-50 border-[var(--cw-blue-500)]'
                      : 'bg-white/60 border-[var(--cw-glass-border)] hover:border-[var(--cw-blue-300)] hover:bg-blue-50/50'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${estaSeleccionado ? 'bg-[var(--cw-blue-500)] text-white' : 'bg-blue-100 text-[var(--cw-blue-600)]'}`}>
                  {user.nombre?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--cw-ink-900)] truncate">{user.nombre}</p>
                  <p className="text-[10px] text-[var(--cw-ink-400)] truncate">{user.email}</p>
                </div>
                {esMiembro && (
                  <span className="text-[9px] font-semibold text-[var(--cw-ink-400)]">{t('chat.member', currentLang)}</span>
                )}
                {!esMiembro && estaSeleccionado && (
                  <span className="text-[var(--cw-blue-500)] text-lg">✓</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-4 pt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 font-semibold text-[11px] text-[var(--cw-ink-400)] hover:text-[var(--cw-ink-700)] transition-colors"
          >
            {t('button.cancel', currentLang)}
          </button>
          <button
            onClick={agregarMiembros}
            disabled={seleccionados.length === 0}
            className="flex-1 bg-[var(--cw-blue-500)] hover:bg-[var(--cw-blue-600)] text-white py-3.5 rounded-xl font-semibold text-[11px] shadow-md disabled:opacity-40 transition-all"
          >
            {t('action.add', currentLang)} ({seleccionados.length})
          </button>
        </div>
      </div>
    </div>
  );
};
