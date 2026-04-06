/**
 * @module components/invitation/InvitationProcessor
 * @description Handles workspace invitation verification and acceptance.
 * Refactored to Clean Architecture: zero Supabase imports.
 * All data access delegated to Use Cases + Repository.
 *
 * Domain types: src/core/domain/entities/invitation.ts
 * Use Cases: VerificarInvitacionUseCase, AceptarInvitacionUseCase
 * Infrastructure: InvitacionSupabaseRepository (injected)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { hashToken } from '../../lib/security/hashToken';
import { seleccionarProcesadorInvitacion } from '../../store/selectores';
import type { InvitationState, InvitacionInfo } from '../../src/core/domain/entities/invitation';
import { logger } from '../../lib/logger';

// Clean Architecture: Use Cases + Repository (no direct supabase import)
import { VerificarInvitacionUseCase } from '../../src/core/application/usecases/VerificarInvitacionUseCase';
import { AceptarInvitacionUseCase } from '../../src/core/application/usecases/AceptarInvitacionUseCase';
import { InvitacionSupabaseRepository } from '../../src/core/infrastructure/adapters/InvitacionSupabaseRepository';
import { supabase } from '../../lib/supabase';

const log = logger.child('invitation');

// Singleton repository — injected into use cases
const invitacionRepo = new InvitacionSupabaseRepository();
const verificarUC = new VerificarInvitacionUseCase(invitacionRepo);
const aceptarUC = new AceptarInvitacionUseCase(invitacionRepo);

export const InvitationProcessor: React.FC = () => {
  const [estado, setEstado] = useState<InvitationState>('cargando');
  const [invitacion, setInvitacion] = useState<InvitacionInfo | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');
  const [tokenHashLocal, setTokenHashLocal] = useState<string>('');
  const { session, setAuthFeedback, setView, theme, fetchWorkspaces } = useStore(
    useShallow(seleccionarProcesadorInvitacion)
  );

  const token = useMemo(() => new URLSearchParams(window.location.search).get('token'), []);

  const verificarInvitacion = async () => {
    try {
      const tHash = await hashToken(token!);
      setTokenHashLocal(tHash);

      const resultado = await verificarUC.ejecutar(tHash);

      if (resultado.estado === 'valido' && resultado.invitacion) {
        setInvitacion(resultado.invitacion);
      }
      setEstado(resultado.estado);
    } catch (err: unknown) {
      log.error('Failed to verify invitation', { error: err instanceof Error ? err.message : String(err) });
      setEstado('error');
    }
  };

  useEffect(() => {
    if (token) {
      verificarInvitacion();
    } else {
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const aceptarInvitacion = async () => {
    if (!token || !invitacion) return;
    setProcesando(true);
    setErrorLocal('');

    try {
      await aceptarUC.ejecutar({
        userId: session.user.id,
        userEmail: session.user.email || '',
        invitacion,
        tokenHash: tokenHashLocal,
      });

      setEstado('aceptado');

      // Clean token from URL for security
      window.history.replaceState({}, '', window.location.pathname);

      // Refresh workspaces list to avoid redirect to "Create Space"
      await fetchWorkspaces();

      setTimeout(() => {
        setAuthFeedback({ type: 'success', message: `¡Bienvenido a ${invitacion.espacio.nombre}!` });
        setView('onboarding');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al aceptar invitación';
      log.error('Failed to accept invitation', { error: message });
      setErrorLocal(message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 bg-[#050508]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-600/10 via-fuchsia-600/5 to-transparent blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-cyan-600/10 via-violet-600/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md lg:max-w-sm relative z-10">
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[36px] lg:rounded-[28px] p-7 lg:p-5 text-center">

          {estado === 'cargando' && (
            <div className="space-y-4">
              <div className="w-12 h-12 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto"></div>
              <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white uppercase tracking-widest">Verificando...</h1>
            </div>
          )}

          {estado === 'error' && (
            <div className="space-y-4">
              <div className="text-4xl">❌</div>
              <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white">Invitación no válida</h1>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">El enlace es inválido o ha sido eliminado.</p>
              <button onClick={() => setView('dashboard')} className="w-full py-3 lg:py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl font-black uppercase tracking-widest text-[10px] text-zinc-400 hover:border-violet-500/30 transition-all">Ir al Inicio</button>
            </div>
          )}

          {estado === 'expirado' && (
            <div className="space-y-4">
              <div className="text-4xl">⏰</div>
              <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white">Invitación expirada</h1>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Esta invitación ha caducado. Solicita una nueva.</p>
              <button onClick={() => setView('dashboard')} className="w-full py-3 lg:py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl font-black uppercase tracking-widest text-[10px] text-zinc-400 hover:border-violet-500/30 transition-all">Cerrar</button>
            </div>
          )}

          {estado === 'usado' && (
            <div className="space-y-4">
              <div className="text-4xl">✅</div>
              <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white">Invitación ya utilizada</h1>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Ya eres parte de este equipo o el token ya fue canjeado.</p>
              <button onClick={() => setView('dashboard')} className="relative w-full group overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white py-3 lg:py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-2xl shadow-violet-600/30 active:scale-[0.98]">
                <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative">Ir a mi Workspace</span>
              </button>
            </div>
          )}

          {estado === 'valido' && invitacion && (
            <div className="space-y-5">
              <div className="text-4xl animate-bounce">🎉</div>
              <div className="space-y-1">
                <h1 className="text-xl lg:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white">¡Te han invitado!</h1>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-violet-400">{invitacion.invitador.nombre}</span> te invita a unirte a:
                </p>
              </div>

              <div className="p-5 lg:p-4 rounded-xl bg-black/40 border border-white/5">
                <h2 className="text-lg lg:text-base font-black text-white">{invitacion.espacio.nombre}</h2>
                <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mt-1">Rol: {invitacion.rol}</p>
              </div>

              {errorLocal && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest">
                    {errorLocal}
                  </div>
                  {session?.user?.email?.toLowerCase() !== invitacion.email.toLowerCase() && (
                    <div className="space-y-2">
                      <p className="text-zinc-500 text-[10px]">
                        Sesión actual: <span className="text-zinc-300 font-bold">{session?.user?.email}</span>
                      </p>
                      <button
                        onClick={async () => {
                          const currentUrl = window.location.href;
                          await supabase.auth.signOut();
                          window.location.href = currentUrl;
                        }}
                        className="w-full py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl font-black uppercase tracking-widest text-[10px] text-zinc-400 hover:border-violet-500/30 hover:text-violet-400 transition-all"
                      >
                        Cerrar sesión y entrar con {invitacion.email}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!errorLocal && (
                <button
                  onClick={aceptarInvitacion}
                  disabled={procesando}
                  className="relative w-full group overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-violet-600/30 active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative">
                    {procesando ? 'Procesando...' : 'Aceptar invitación'}
                  </span>
                </button>
              )}
              {errorLocal && session?.user?.email?.toLowerCase() === invitacion.email.toLowerCase() && (
                <button
                  onClick={() => { setErrorLocal(''); aceptarInvitacion(); }}
                  disabled={procesando}
                  className="relative w-full group overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-violet-600/30 active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative">Reintentar</span>
                </button>
              )}
            </div>
          )}

          {estado === 'aceptado' && (
            <div className="space-y-4">
              <div className="relative mx-auto w-14 h-14 lg:w-12 lg:h-12">
                <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="relative w-14 h-14 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🎊</span>
                </div>
              </div>
              <h1 className="text-xl lg:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">¡Bienvenido al equipo!</h1>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Redirigiendo a configurar tu perfil...</p>
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
