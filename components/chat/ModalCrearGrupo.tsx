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
    <div className="fixed inset-0 bg-[var(--cw-ink-900)]/30 backdrop-blur-md flex items-center justify-center z-[2000] p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--cw-glass-border)] rounded-2xl lg:rounded-xl p-6 lg:p-5 md:p-4 w-full max-w-sm lg:max-w-xs shadow-[var(--cw-shadow-floating)]">
        <div className="flex justify-between items-center mb-4 lg:mb-3">
          <h2 className="text-lg lg:text-base font-bold tracking-tight text-[var(--cw-ink-900)]">{t('chat.newChannel', currentLang)}</h2>
          <button onClick={onClose} className="text-[var(--cw-ink-400)] hover:text-[var(--cw-ink-700)] transition-colors p-1">
            <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-3">
          <div>
            <label className="text-[9px] lg:text-[8px] font-semibold uppercase tracking-widest text-[var(--cw-ink-400)] mb-1.5 block">{t('chat.name', currentLang)}</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('chat.namePlaceholder', currentLang)} className="w-full bg-white/80 border border-[var(--cw-glass-border)] rounded-xl lg:rounded-lg px-4 lg:px-3 py-3 lg:py-2.5 text-sm lg:text-xs text-[var(--cw-ink-700)] focus:ring-2 focus:ring-blue-100 focus:border-[var(--cw-blue-400)] outline-none font-medium" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:gap-2">
            <button type="button" onClick={() => { setTipo('publico'); setContrasena(''); }} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${tipo === 'publico' ? 'border-[var(--cw-blue-500)] bg-blue-50 text-[var(--cw-blue-600)]' : 'border-[var(--cw-glass-border)] text-[var(--cw-ink-400)] hover:border-[var(--cw-blue-300)]'}`}><span className="text-lg lg:text-base">#</span><span className="text-[8px] lg:text-[7px] font-bold uppercase tracking-widest">{t('chat.public', currentLang)}</span></button>
            <button type="button" onClick={() => setTipo('privado')} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${tipo === 'privado' ? 'border-[var(--cw-blue-500)] bg-blue-50 text-[var(--cw-blue-600)]' : 'border-[var(--cw-glass-border)] text-[var(--cw-ink-400)] hover:border-[var(--cw-blue-300)]'}`}><span className="text-lg lg:text-base">🔒</span><span className="text-[8px] lg:text-[7px] font-bold uppercase tracking-widest">{t('chat.private', currentLang)}</span></button>
          </div>
          {tipo === 'privado' && (
            <div>
              <label className="text-[9px] lg:text-[8px] font-semibold uppercase tracking-widest text-[var(--cw-ink-400)] mb-1.5 block">🔑 Contraseña del canal</label>
              <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} placeholder="Contraseña para acceder al canal" className="w-full bg-white/80 border border-[var(--cw-glass-border)] rounded-xl lg:rounded-lg px-4 lg:px-3 py-3 lg:py-2.5 text-sm lg:text-xs text-[var(--cw-ink-700)] focus:ring-2 focus:ring-blue-100 focus:border-[var(--cw-blue-400)] outline-none font-medium" />
            </div>
          )}
          <div className="flex gap-2.5 lg:gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 lg:py-2.5 text-[10px] lg:text-[9px] font-semibold text-[var(--cw-ink-400)] hover:text-[var(--cw-ink-700)] transition-colors">{t('button.cancel', currentLang)}</button>
            <button type="submit" disabled={!nombre.trim() || creando || (tipo === 'privado' && !contrasena.trim())} className="flex-1 bg-[var(--cw-blue-500)] hover:bg-[var(--cw-blue-600)] text-white py-3 lg:py-2.5 rounded-xl lg:rounded-lg font-semibold text-[10px] lg:text-[9px] disabled:opacity-30 transition-all">{t('button.create', currentLang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
