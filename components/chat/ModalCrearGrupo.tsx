import React, { useState, useEffect } from 'react';
import { Language, getCurrentLanguage, subscribeToLanguageChange, t } from '../../lib/i18n';

interface Props {
  onClose: () => void;
  onCreate: (nombre: string, tipo: 'publico' | 'privado', contrasena?: string) => void;
}

export const ModalCrearGrupo: React.FC<Props> = ({ onClose, onCreate }) => {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'publico' | 'privado'>('publico');
  const [contrasena, setContrasena] = useState('');
  const [creando, setCreando] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());

  useEffect(() => {
    const unsubscribe = subscribeToLanguageChange(() => {
      setCurrentLang(getCurrentLanguage());
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (tipo === 'privado' && !contrasena.trim()) return;
    setCreando(true);
    await onCreate(nombre.trim(), tipo, tipo === 'privado' ? contrasena.trim() : undefined);
    setCreando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[2000] p-4">
      <div className="bg-[#181825] border border-white/5 rounded-2xl lg:rounded-xl p-6 lg:p-5 md:p-4 w-full max-w-sm lg:max-w-xs shadow-2xl">
        <div className="flex justify-between items-center mb-4 lg:mb-3">
          <h2 className="text-lg lg:text-base font-bold tracking-tight text-white uppercase">{t('chat.newChannel', currentLang)}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-3">
          <div>
            <label className="text-[9px] lg:text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">{t('chat.name', currentLang)}</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('chat.namePlaceholder', currentLang)} className="w-full bg-[#1e1e2e] border border-white/5 rounded-xl lg:rounded-lg px-4 lg:px-3 py-3 lg:py-2.5 text-sm lg:text-xs text-white focus:ring-1 focus:ring-indigo-600 outline-none font-bold" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:gap-2">
            <button type="button" onClick={() => { setTipo('publico'); setContrasena(''); }} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg border-2 flex flex-col items-center gap-1 ${tipo === 'publico' ? 'border-indigo-600 bg-indigo-600/10 text-white' : 'border-white/5 text-zinc-500'}`}><span className="text-lg lg:text-base">#</span><span className="text-[8px] lg:text-[7px] font-black uppercase tracking-widest">{t('chat.public', currentLang)}</span></button>
            <button type="button" onClick={() => setTipo('privado')} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg border-2 flex flex-col items-center gap-1 ${tipo === 'privado' ? 'border-indigo-600 bg-indigo-600/10 text-white' : 'border-white/5 text-zinc-500'}`}><span className="text-lg lg:text-base">🔒</span><span className="text-[8px] lg:text-[7px] font-black uppercase tracking-widest">{t('chat.private', currentLang)}</span></button>
          </div>
          {tipo === 'privado' && (
            <div>
              <label className="text-[9px] lg:text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">🔑 Contrase\u00f1a del canal</label>
              <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} placeholder="Contrase\u00f1a para acceder al canal" className="w-full bg-[#1e1e2e] border border-white/5 rounded-xl lg:rounded-lg px-4 lg:px-3 py-3 lg:py-2.5 text-sm lg:text-xs text-white focus:ring-1 focus:ring-indigo-600 outline-none font-bold" />
            </div>
          )}
          <div className="flex gap-2.5 lg:gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 lg:py-2.5 text-[9px] lg:text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">{t('button.cancel', currentLang)}</button>
            <button type="submit" disabled={!nombre.trim() || creando || (tipo === 'privado' && !contrasena.trim())} className="flex-1 bg-indigo-600 text-white py-3 lg:py-2.5 rounded-xl lg:rounded-lg font-black uppercase tracking-widest text-[9px] lg:text-[8px] disabled:opacity-20 transition-all">{t('button.create', currentLang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
