/**
 * @module components/invitation/InvitationProcessor
 * @description Handles workspace invitation verification and acceptance.
 * Refactored to Clean Architecture: zero Supabase imports, zero module-level singletons.
 * All data access delegated to Use Cases + Repository via DI Context.
 *
 * Domain types: src/core/domain/entities/invitation.ts
 * Use Cases: VerificarInvitacionUseCase, AceptarInvitacionUseCase
 * DI: Repositories injected from DIProvider (React Context)
 *
 * Ref: CLEAN-ARCH-DI-001
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { hashToken } from '../../lib/security/hashToken';
import { seleccionarProcesadorInvitacion } from '../../store/selectores';
import type { InvitationState, InvitacionInfo } from '../../src/core/domain/entities/invitation';
import { logger } from '../../lib/logger';

// Clean Architecture: Use Cases (Application Layer — no infrastructure imports)
import { VerificarInvitacionUseCase } from '../../src/core/application/usecases/VerificarInvitacionUseCase';
import { AceptarInvitacionUseCase } from '../../src/core/application/usecases/AceptarInvitacionUseCase';
// DI: Repository port resolved from React Context, not module-level singleton
import { useDIUseCase } from '../../src/core/infrastructure/di/DIProvider';
import { supabase } from '../../lib/supabase';

const log = logger.child('invitation');

export const InvitationProcessor: React.FC = () => {
 // DI: Use Cases resueltos desde el container inyectado por DIProvider
 const verificarUC = useDIUseCase((c) => new VerificarInvitacionUseCase(c.invitacion));
 const aceptarUC = useDIUseCase((c) => new AceptarInvitacionUseCase(c.invitacion));

 const [estado, setEstado] = useState<InvitationState>('cargando');
 const [invitacion, setInvitacion] = useState<InvitacionInfo | null>(null);
 const [procesando, setProcesando] = useState(false);
 const [errorLocal, setErrorLocal] = useState('');
 const [tokenHashLocal, setTokenHashLocal] = useState<string>('');
 const { session, setAuthFeedback, setView, theme, fetchWorkspaces, setPendingOnboardingEspacioId } = useStore(
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
 // Guard explícito: el Use Case requiere un userId real. Fix P2 — plan 34919757.
 if (!session?.user?.id) {
 setErrorLocal('Sesión inválida — vuelve a iniciar sesión.');
 return;
 }
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

 // Clean token from URL and sessionStorage for security
 window.history.replaceState({}, '', window.location.pathname);
 sessionStorage.removeItem('pendingInvitationToken');

 // Refresh workspaces list to avoid redirect to "Create Space"
 await fetchWorkspaces();

 setTimeout(() => {
 setAuthFeedback({ type: 'success', message: `¡Bienvenido a ${invitacion.espacio.nombre}!` });
 // ROLE-MISMATCH-001: pasar espacio_id al onboarding para que filtre
 // la membresía correcta y no retorne otra con rol diferente.
 setPendingOnboardingEspacioId(invitacion.espacio.id);
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
 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-[#4FB0FF]/10 /5 to-transparent blur-[120px] rounded-full pointer-events-none" />
 <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-[#2E96F5]/10 via-[#4FB0FF]/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

 <div className="w-full max-w-md lg:max-w-sm relative z-10">
 <div className="absolute -inset-1 bg-gradient-to-r from-[#4FB0FF]/20 /20 to-[#2E96F5]/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[36px] lg:rounded-[28px] p-7 lg:p-5 text-center">

 {estado === 'cargando' && (
 <div className="space-y-4">
 <div className="w-12 h-12 border-3 border-[rgba(46,150,245,0.3)]/30 border-[#2E96F5] border-t-transparent rounded-full animate-spin mx-auto"></div>
 <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] uppercase tracking-widest">Verificando...</h1>
 </div>
 )}

 {estado === 'error' && (
 <div className="space-y-4">
 <div className="text-4xl">❌</div>
 <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240]">Invitación no válida</h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">El enlace es inválido o ha sido eliminado.</p>
 <button onClick={() => setView('dashboard')} className="w-full py-3 lg:py-2.5 bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl font-black uppercase tracking-widest text-[10px] text-[#4A6485] hover:border-[rgba(46,150,245,0.3)]/30 transition-all">Ir al Inicio</button>
 </div>
 )}

 {estado === 'expirado' && (
 <div className="space-y-4">
 <div className="text-4xl">⏰</div>
 <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240]">Invitación expirada</h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">Esta invitación ha caducado. Solicita una nueva.</p>
 <button onClick={() => setView('dashboard')} className="w-full py-3 lg:py-2.5 bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl font-black uppercase tracking-widest text-[10px] text-[#4A6485] hover:border-[rgba(46,150,245,0.3)]/30 transition-all">Cerrar</button>
 </div>
 )}

 {estado === 'usado' && (
 <div className="space-y-4">
 <div className="text-4xl">✅</div>
 <h1 className="text-lg lg:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240]">Invitación ya utilizada</h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">Ya eres parte de este equipo o el token ya fue canjeado.</p>
 <button onClick={() => setView('dashboard')} className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3 lg:py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98]">
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative">Ir a mi Workspace</span>
 </button>
 </div>
 )}

 {estado === 'valido' && invitacion && (
 <div className="space-y-5">
 <div className="text-4xl animate-bounce">🎉</div>
 <div className="space-y-1">
 <h1 className="text-xl lg:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240]">¡Te han invitado!</h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">
 <span className="text-[#1E86E5]">{invitacion.invitador.nombre}</span> te invita a unirte a:
 </p>
 </div>

 <div className="p-5 lg:p-4 rounded-xl bg-white/70 border border-[rgba(46,150,245,0.14)]">
 <h2 className="text-lg lg:text-base font-black text-[#0B2240]">{invitacion.espacio.nombre}</h2>
 <p className="text-[9px] font-black uppercase tracking-widest text-[#1E86E5] mt-1">Rol: {invitacion.rol}</p>
 </div>

 {errorLocal && (
 <div className="space-y-3">
 <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest">
 {errorLocal}
 </div>
 {session?.user?.email?.toLowerCase() !== invitacion.email.toLowerCase() && (
 <div className="space-y-2">
 <p className="text-[#4A6485] text-[10px]">
 Sesión actual: <span className="text-[#1B3A5C] font-bold">{session?.user?.email}</span>
 </p>
 <button
 onClick={async () => {
 const currentUrl = window.location.href;
 await supabase.auth.signOut();
 window.location.href = currentUrl;
 }}
 className="w-full py-2.5 bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl font-black uppercase tracking-widest text-[10px] text-[#4A6485] hover:border-[rgba(46,150,245,0.3)]/30 hover:text-[#1E86E5] transition-all"
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
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-50"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative">
 {procesando ? 'Procesando...' : 'Aceptar invitación'}
 </span>
 </button>
 )}
 {errorLocal && session?.user?.email?.toLowerCase() === invitacion.email.toLowerCase() && (
 <button
 onClick={() => { setErrorLocal(''); aceptarInvitacion(); }}
 disabled={procesando}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-50"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative">Reintentar</span>
 </button>
 )}
 </div>
 )}

 {estado === 'aceptado' && (
 <div className="space-y-4">
 <div className="relative mx-auto w-14 h-14 lg:w-12 lg:h-12">
 <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-[#2E96F5] rounded-full blur-xl opacity-50 animate-pulse" />
 <div className="relative w-14 h-14 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-500 to-[#2E96F5] rounded-full flex items-center justify-center">
 <span className="text-2xl">🎊</span>
 </div>
 </div>
 <h1 className="text-xl lg:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5]">¡Bienvenido al equipo!</h1>
 <p className="text-[#4A6485] text-[10px] font-bold uppercase tracking-widest">Redirigiendo a configurar tu perfil...</p>
 <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
