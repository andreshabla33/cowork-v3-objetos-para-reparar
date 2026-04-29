import React, { useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { activarRecuperacionConTokenHash } from '../lib/authRecoveryService';

interface PantallaAccesoRecuperacionContrasenaProps {
  confirmationUrl?: string | null;
  onSesionRecuperacionLista: (session: Session) => void;
  tokenHash?: string | null;
}

export const PantallaAccesoRecuperacionContrasena: React.FC<PantallaAccesoRecuperacionContrasenaProps> = ({
  confirmationUrl,
  onSesionRecuperacionLista,
  tokenHash,
}) => {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmationUrlDecodificada = useMemo(() => {
    if (!confirmationUrl) return null;

    try {
      return decodeURIComponent(confirmationUrl);
    } catch {
      return confirmationUrl;
    }
  }, [confirmationUrl]);

  const tieneAccesoSeguro = Boolean(tokenHash || confirmationUrlDecodificada);

  const manejarContinuar = async () => {
    if (!tieneAccesoSeguro) {
      setError('El enlace de recuperación no contiene datos válidos. Solicita uno nuevo.');
      return;
    }

    if (tokenHash) {
      setCargando(true);
      setError(null);

      const resultado = await activarRecuperacionConTokenHash(tokenHash);

      setCargando(false);

      if (!resultado.success || !resultado.session) {
        setError(resultado.error || 'No fue posible validar el enlace de recuperación.');
        return;
      }

      window.history.replaceState({}, '', window.location.pathname);
      onSesionRecuperacionLista(resultado.session);
      return;
    }

    if (confirmationUrlDecodificada) {
      window.location.assign(confirmationUrlDecodificada);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#050508] p-4 overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-blue-600/15 blur-[180px] animate-pulse" />
        <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full bg-cyan-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="w-full max-w-md my-auto relative z-10">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-sky-500/20 to-cyan-500/20 rounded-[40px] blur-xl opacity-60" />

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[36px] p-6 shadow-2xl text-center space-y-5">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full blur-xl opacity-50 animate-pulse" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-2.761 0-5 1.791-5 4v1h10v-1c0-2.209-2.239-4-5-4z" />
              </svg>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-200 to-white mb-2">
              Continuar recuperación
            </h1>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Por seguridad, confirma manualmente el acceso a tu enlace antes de cambiar la contraseña.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-left">
              <div className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-bold text-xs">!</div>
              <p className="text-red-400 text-[10px] font-bold leading-tight flex-1">{error}</p>
            </div>
          )}

          <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-left">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Qué hace este paso</p>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Evita depender de aperturas automáticas del correo y solo activa la recuperación cuando tú confirmas explícitamente.
            </p>
          </div>

          <button
            id="recovery-access-continue-btn"
            onClick={manejarContinuar}
            disabled={cargando || !tieneAccesoSeguro}
            className="relative w-full group overflow-hidden bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative flex items-center gap-2">
              {cargando ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Continuar'
              )}
            </span>
          </button>

          <button
            id="recovery-access-back-btn"
            onClick={() => window.location.replace('/')}
            className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 font-black text-[10px] uppercase tracking-[0.15em] hover:border-blue-500/30 transition-all"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
};
