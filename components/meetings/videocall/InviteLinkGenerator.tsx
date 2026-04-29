'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

interface InviteLinkGeneratorProps {
  salaId: string;
  onClose?: () => void;
}

type TipoInvitado = 'cliente' | 'candidato' | 'invitado';

interface EnlaceGenerado {
  etiqueta: string;
  enlace: string;
  descripcion: string;
}

const log = logger.child('InviteLinkGenerator');

export const InviteLinkGenerator: React.FC<InviteLinkGeneratorProps> = ({
  salaId,
  onClose,
}) => {
  const { theme, currentUser } = useStore();
  const [nombreReferencia, setNombreReferencia] = useState('');
  const [tipoInvitado, setTipoInvitado] = useState<TipoInvitado>('invitado');
  const [loading, setLoading] = useState(false);
  const [enlaces, setEnlaces] = useState<EnlaceGenerado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Generar/reutilizar link general de invitación
  const generateLinks = async () => {
    try {
      setLoading(true);
      setError(null);
      const nombreNormalizado = nombreReferencia.trim();
      const etiqueta = nombreNormalizado || 'Link general';
      const ahoraIso = new Date().toISOString();

      const { data: invitacionExistente, error: invitacionExistenteError } = await supabase
        .from('invitaciones_reunion')
        .select('id, token_unico, expira_en, nombre, tipo_invitado')
        .eq('sala_id', salaId)
        .is('participante_id', null)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invitacionExistenteError) {
        throw invitacionExistenteError;
      }

      const invitacionActiva = invitacionExistente && (!invitacionExistente.expira_en || invitacionExistente.expira_en > ahoraIso)
        ? invitacionExistente
        : null;

      let tokenUnico = invitacionActiva?.token_unico;

      if (invitacionActiva) {
        const { error: actualizacionError } = await supabase
          .from('invitaciones_reunion')
          .update({
            tipo_invitado: tipoInvitado,
            nombre: null,
            email: null,
          })
          .eq('id', invitacionActiva.id);

        if (actualizacionError) {
          throw actualizacionError;
        }
      }

      if (!tokenUnico) {
        const { data: invitacionNueva, error: invitacionNuevaError } = await supabase
          .from('invitaciones_reunion')
          .insert({
            sala_id: salaId,
            participante_id: null,
            email: null,
            nombre: null,
            tipo_invitado: tipoInvitado,
            creado_por: currentUser?.id,
            expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('token_unico')
          .single();

        if (invitacionNuevaError || !invitacionNueva?.token_unico) {
          throw invitacionNuevaError || new Error('No se pudo generar el link general');
        }

        tokenUnico = invitacionNueva.token_unico;
      }

      setEnlaces([
        {
          etiqueta,
          enlace: `${baseUrl}/join/${tokenUnico}`,
          descripcion: 'Comparte este mismo enlace con todas las personas externas. Cada una podrá entrar sin correo y verse con el resto en la reunión.',
        },
      ]);
    } catch (err: any) {
      log.error('Error generando enlaces', { error: err instanceof Error ? err.message : String(err) });
      setError(err.message || 'Error al generar enlaces');
    } finally {
      setLoading(false);
    }
  };

  // Copiar enlace
  const copyLink = async (enlace: string, etiqueta: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopied(etiqueta);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      log.error('Error copiando enlace', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  const isArcade = theme === 'arcade';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-lg max-h-[85vh] rounded-2xl ${isArcade ? 'bg-black border-[#00ff41]/30' : 'bg-[#1a1a2e]'} border border-white/10 shadow-2xl overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`p-4 border-b border-white/10 ${isArcade ? 'bg-[#00ff41]/5' : 'bg-blue-600/10'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl ${isArcade ? 'bg-[#00ff41]' : 'bg-gradient-to-br from-blue-600 to-blue-600'} flex items-center justify-center`}>
                <svg className={`w-5 h-5 ${isArcade ? 'text-black' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className={`font-bold ${isArcade ? 'text-[#00ff41]' : 'text-white'}`}>Invitar Participantes</h3>
                <p className="text-xs opacity-50">Genera enlaces para invitados externos</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-all shrink-0"
            >
              <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {enlaces.length === 0 ? (
            <>
              <div className="space-y-4 mb-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                      Nombre de referencia (opcional)
                    </label>
                    <input
                      type="text"
                      value={nombreReferencia}
                      onChange={(e) => setNombreReferencia(e.target.value)}
                      placeholder="Ej. Invitados externos"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                      Tipo de acceso externo
                    </label>
                    <select
                      value={tipoInvitado}
                      onChange={(e) => setTipoInvitado(e.target.value as TipoInvitado)}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none text-white"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="invitado" className="bg-zinc-800 text-white">Invitado</option>
                      <option value="cliente" className="bg-zinc-800 text-white">Cliente</option>
                      <option value="candidato" className="bg-zinc-800 text-white">Candidato</option>
                    </select>
                  </div>

                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    Se generará un único link general para compartir con todas las personas externas. No necesitan correo para entrar; cada una solo escribe su nombre al acceder.
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Enlaces generados */}
              <div className="space-y-3">
                {enlaces.map((enlace) => (
                  <div key={enlace.enlace} className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                      <span className="text-sm font-medium break-words">{enlace.etiqueta}</span>
                      <button
                        onClick={() => copyLink(enlace.enlace, enlace.etiqueta)}
                        className={`px-3 py-2 text-xs font-bold rounded-lg transition-all shrink-0 ${
                          copied === enlace.etiqueta
                            ? 'bg-green-500 text-white'
                            : isArcade
                              ? 'bg-[#00ff41]/20 text-[#00ff41] hover:bg-[#00ff41]/30'
                              : 'bg-blue-600/20 text-sky-600 hover:bg-blue-600/30'
                        }`}
                      >
                        {copied === enlace.etiqueta ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-xs opacity-70 mb-3 leading-relaxed">{enlace.descripcion}</p>
                    <p className="text-xs opacity-50 break-all font-mono leading-relaxed">{enlace.enlace}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setEnlaces([]);
                  setError(null);
                  setNombreReferencia('');
                  setTipoInvitado('invitado');
                }}
                className="mt-2 w-full py-2 text-sm opacity-60 hover:opacity-100 transition-all"
              >
                Generar otro link general
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        {enlaces.length === 0 && (
          <div className="p-4 border-t border-white/10 flex flex-col-reverse sm:flex-row gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={generateLinks}
              disabled={loading}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 ${
                isArcade
                  ? 'bg-[#00ff41] text-black hover:bg-white'
                  : 'bg-blue-700 hover:bg-blue-600 text-white'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Generando...
                </span>
              ) : (
                'Generar Enlaces'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteLinkGenerator;
