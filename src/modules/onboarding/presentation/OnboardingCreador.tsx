'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 Building2, 
 Users, 
 ArrowRight, 
 Check,
 Sparkles,
 Mail,
 X,
 Plus
} from 'lucide-react';
import { onboardingRepository } from '@/core/infrastructure/adapters/OnboardingSupabaseRepository';
import { enviarInvitacionRepository } from '@/core/infrastructure/adapters/EnviarInvitacionSupabaseRepository';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { useShallow } from 'zustand/react/shallow';
import { CargoSelector } from './CargoSelector';
import type { CargoLaboral, CargoDB } from './CargoSelector';
import { RegistrarEmpresaConGridDesksUseCase } from '@/src/core/application/usecases/RegistrarEmpresaConGridDesksUseCase';
import { RepositorioRegistroEmpresaSupabase } from '@/src/core/infrastructure/adapters/RepositorioRegistroEmpresaSupabaseAdapter';
import { areaEscritorioRepository } from '@/src/core/infrastructure/adapters/AreaEscritorioSupabaseRepository';

const INDUSTRIAS = [
 'Tecnología', 'Finanzas', 'Salud', 'Educación', 'Comercio',
 'Manufactura', 'Servicios', 'Consultoría', 'Marketing',
 'Inmobiliaria', 'Legal', 'Energía', 'Transporte', 'Otro',
];

const TAMANOS = [
 { value: 'startup', label: 'Startup (1-10)' },
 { value: 'pequena', label: 'Pequeña (11-50)' },
 { value: 'mediana', label: 'Mediana (51-200)' },
 { value: 'grande', label: 'Grande (201-1000)' },
 { value: 'enterprise', label: 'Enterprise (1000+)' },
];

interface OnboardingCreadorProps {
 userId: string;
 userEmail: string;
 userName: string;
 onComplete: () => void;
}

type Paso = 'bienvenida' | 'empresa' | 'cantidadMiembros' | 'cargo' | 'invitar' | 'completado';

const ESPACIO_GLOBAL = {
 id: '91887e81-1f26-448c-9d6d-9839e7d83b5d',
 nombre: 'kronos'
};

const registrarEmpresaConGridDesksUseCase = new RegistrarEmpresaConGridDesksUseCase(
 new RepositorioRegistroEmpresaSupabase(),
 areaEscritorioRepository,
);

export const OnboardingCreador: React.FC<OnboardingCreadorProps> = ({
 userId,
 userEmail,
 userName,
 onComplete
}) => {
 const { fetchWorkspaces, setView } = useStore(
   useShallow(s => ({ fetchWorkspaces: s.fetchWorkspaces, setView: s.setView }))
 );

 useEffect(() => {
 const verificarRol = async () => {
 // Guard 1: Si hay un token de invitación pendiente en sessionStorage,
 // este usuario llegó por invitación pero perdió el token en la URL.
 // Redirigir al flujo de invitación para que lo procese correctamente.
 const pendingToken = sessionStorage.getItem('pendingInvitationToken');
 if (pendingToken) {
 setView('invitation');
 return;
 }

 // Guard 2: Si hay pendingOnboardingEspacioId en el store, el usuario
 // ya aceptó una invitación y debe ir al onboarding de miembro, no de creador.
 const pendingEspacioId = useStore.getState().pendingOnboardingEspacioId;
 if (pendingEspacioId) {
 setView('onboarding');
 return;
 }

 // Guard 3: Verificar rol en la membresía más reciente.
 // Si no es admin/super_admin, redirigir al onboarding de miembro.
 const miembro = await onboardingRepository.obtenerMiembroMasReciente(userId);
 if (miembro && miembro.rol !== 'admin' && miembro.rol !== 'super_admin') {
 // Setear el espacioId para que OnboardingCargoView filtre correctamente
 useStore.getState().setPendingOnboardingEspacioId(miembro.espacio_id);
 setView('onboarding');
 }
 };
 verificarRol();
 }, [userId, setView]);

 const [paso, setPaso] = useState<Paso>('bienvenida');
 const [cargoSeleccionado, setCargoSeleccionado] = useState<CargoLaboral | null>(null);
 const [invitaciones, setInvitaciones] = useState<string[]>(['']);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [espacioCreado, setEspacioCreado] = useState<{ id: string; nombre: string } | null>(ESPACIO_GLOBAL);
 const [cargosDB, setCargosDB] = useState<CargoDB[]>([]);
 const [miembroId, setMiembroId] = useState<string | null>(null);
 const [empresaId, setEmpresaId] = useState<string | null>(null);
 /**
  * Cantidad de miembros que tendrá la empresa (1..100). Define cuántos
  * desks se generan automáticamente en grilla durante el onboarding.
  */
 const [cantidadMiembros, setCantidadMiembros] = useState<number>(10);
 const [empresaData, setEmpresaData] = useState({
 nombre: '',
 industria: '',
 tamano: 'pequena',
 sitio_web: '',
 });

 const cargarCargosDisponibles = async () => {
 if (!espacioCreado) {
 throw new Error('Espacio global no disponible');
 }
 const cargosData = await onboardingRepository.obtenerCargosActivos(espacioCreado.id);
 setCargosDB(cargosData);
 };

 const handleSelectCargo = (cargo: CargoLaboral) => {
 setError(null);
 setCargoSeleccionado(cargo);
 setPaso('cantidadMiembros');
 };

 const completarOnboarding = async () => {
 if (!espacioCreado) {
 throw new Error('Espacio global no disponible');
 }

 let targetMiembroId = miembroId;

 if (!targetMiembroId) {
 const resolvedId = await onboardingRepository.obtenerIdMiembro(userId, espacioCreado.id);
 if (resolvedId) {
 targetMiembroId = resolvedId;
 setMiembroId(resolvedId);
 }
 }

 if (!targetMiembroId) {
 throw new Error('No se encontró la membresía');
 }

 await onboardingRepository.marcarOnboardingCompleto(targetMiembroId);
 };

 const finalizarOnboarding = async () => {
 try {
 await completarOnboarding();
 } catch (err) {
 console.warn('⚠️ Onboarding: Error en completarOnboarding (continuando):', err);
 }
 setPaso('completado');
 // Timeout de seguridad: si onComplete tarda más de 8s, forzar redirección
 const safeTimeout = setTimeout(() => {
 console.warn('⚠️ Onboarding: onComplete tardó demasiado, forzando redirección');
 onComplete();
 }, 8000);
 setTimeout(async () => {
 try {
 await onComplete();
 } catch (err) {
 console.error('❌ Error en onComplete:', err);
 onComplete(); // Forzar redirección aunque falle
 } finally {
 clearTimeout(safeTimeout);
 }
 }, 2000);
 };

 const handleGuardarEmpresa = async () => {
 setLoading(true);
 setError(null);

 try {
 if (!espacioCreado) {
 throw new Error('Espacio global no disponible');
 }

 if (!empresaData.nombre.trim()) {
 throw new Error('Ingresa el nombre de tu empresa para continuar');
 }

 // Auto-sugerir cantidad de miembros según el tamaño elegido.
 const sugeridoPorTamano: Record<string, number> = {
 startup: 8,
 pequena: 25,
 mediana: 50,
 grande: 80,
 enterprise: 100,
 };
 const sugerido = sugeridoPorTamano[empresaData.tamano] ?? 10;
 setCantidadMiembros(Math.min(100, Math.max(1, sugerido)));

 await cargarCargosDisponibles();
 setPaso('cargo');
 } catch (err: any) {
 setError(err.message || 'Error preparando los cargos disponibles');
 } finally {
 setLoading(false);
 }
 };

 const handleGuardarPlantilla = async () => {
 setLoading(true);
 setError(null);

 try {
 if (!espacioCreado) {
 throw new Error('Espacio global no disponible');
 }

 const resultado = await registrarEmpresaConGridDesksUseCase.execute({
 empresaId,
 userId,
 espacioId: espacioCreado.id,
 nombre: empresaData.nombre,
 industria: empresaData.industria || null,
 tamano: empresaData.tamano,
 sitioWeb: empresaData.sitio_web.trim() || null,
 cargoId: cargoSeleccionado,
 cantidadMiembros,
 });

 setEmpresaId(resultado.empresaId);
 setMiembroId(resultado.miembroId);

 await fetchWorkspaces();
 setPaso('invitar');
 } catch (err: any) {
 console.error('Error guardando plantilla de empresa:', err);
 setError(err.message || 'Error al configurar la oficina inicial');
 } finally {
 setLoading(false);
 }
 };

 const handleAddEmail = () => {
 setInvitaciones([...invitaciones, '']);
 };

 const handleRemoveEmail = (index: number) => {
 setInvitaciones(invitaciones.filter((_, i) => i !== index));
 };

 const handleEmailChange = (index: number, value: string) => {
 const updated = [...invitaciones];
 updated[index] = value;
 setInvitaciones(updated);
 };

 const handleEnviarInvitaciones = async () => {
 const emailsValidos = invitaciones.filter(e => e.trim() && e.includes('@'));
 
 if (emailsValidos.length === 0) {
 setLoading(true);
 setError(null);
 try {
 await finalizarOnboarding();
 } catch (err: any) {
 console.error('Error completando onboarding:', err);
 setError(err.message || 'Error al completar el onboarding');
 } finally {
 setLoading(false);
 }
 return;
 }

 setLoading(true);
 setError(null);

 try {
 // Enviar invitaciones usando el Repository (encapsula edge function)
 for (const email of emailsValidos) {
 const result = await enviarInvitacionRepository.enviar({
 email,
 espacioId: espacioCreado!.id,
 rol: 'miembro',
 });
 if (!result.exito) throw new Error(result.mensaje || 'Error al enviar la invitación');
 }

 await finalizarOnboarding();
 } catch (err: any) {
 console.error('Error enviando invitaciones:', err);
 setError('Error al enviar algunas invitaciones');
 } finally {
 setLoading(false);
 }
 };

 const handleSkipInvitaciones = () => {
 setLoading(true);
 setError(null);
 finalizarOnboarding()
 .catch((err: any) => {
 console.error('Error completando onboarding:', err);
 setError(err.message || 'Error al completar el onboarding');
 })
 .finally(() => {
 setLoading(false);
 });
 };

 return (
 <div className="fixed inset-0 bg-[#050508] flex items-center justify-center p-4 lg:p-3 overflow-y-auto min-h-0">
 {/* Fondo con gradientes neon animados - mismo estilo que login */}
 <div className="absolute inset-0 overflow-hidden pointer-events-none">
 <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-[#2E96F5]/15 blur-[180px] animate-pulse" />
 <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-[#2E96F5]/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
 <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full bg-[#2E96F5]/10 blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
 <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
 </div>

 <AnimatePresence mode="wait">
 {/* PASO: Bienvenida - Compacto */}
 {paso === 'bienvenida' && (
 <motion.div
 key="bienvenida"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -20 }}
 className="w-full max-w-md lg:max-w-sm text-center relative z-10"
 >
 <div className="mb-6 lg:mb-5">
 {/* Logo con glow neon */}
 <div className="relative group mx-auto w-14 h-14 lg:w-12 lg:h-12 mb-4 lg:mb-3">
 <div className="absolute -inset-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
 <div className="relative w-14 h-14 lg:w-12 lg:h-12 bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] rounded-xl flex items-center justify-center shadow-2xl">
 <Sparkles className="w-7 h-7 lg:w-6 lg:h-6 text-[#0B2240]" />
 </div>
 </div>
 <h1 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-2">
 ¡Bienvenido, {userName.split(' ')[0]}!
 </h1>
 <p className="text-sm lg:text-xs text-[#4A6485]">
 Vamos a configurar tu empresa en el espacio global kronos
 </p>
 </div>

 <div className="space-y-2 lg:space-y-1.5 mb-6 lg:mb-5">
 <div className="flex items-center gap-3 lg:gap-2 p-3 lg:p-2.5 backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl lg:rounded-lg group hover:border-[rgba(46,150,245,0.3)]/30 transition-all">
 <div className="w-8 h-8 lg:w-7 lg:h-7 bg-gradient-to-br from-[#4FB0FF]/20 to-[#2E96F5]/20 rounded-lg flex items-center justify-center border border-[rgba(46,150,245,0.3)]/20">
 <span className="text-[#1E86E5] font-black text-sm lg:text-xs">1</span>
 </div>
 <span className="text-[#1B3A5C] font-medium text-sm lg:text-xs">Datos de tu empresa</span>
 </div>
 <div className="flex items-center gap-3 lg:gap-2 p-3 lg:p-2.5 backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl lg:rounded-lg group hover:border-[rgba(46,150,245,0.3)]/30 transition-all">
 <div className="w-8 h-8 lg:w-7 lg:h-7 bg-gradient-to-br from-[#4FB0FF]/20 to-[#2E96F5]/20 rounded-lg flex items-center justify-center border border-[rgba(46,150,245,0.3)]/20">
 <span className="text-[#1E86E5] font-black text-sm lg:text-xs">2</span>
 </div>
 <span className="text-[#1B3A5C] font-medium text-sm lg:text-xs">Selecciona tu cargo</span>
 </div>
 <div className="flex items-center gap-3 lg:gap-2 p-3 lg:p-2.5 backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl lg:rounded-lg group hover:border-[rgba(46,150,245,0.3)]/30 transition-all">
 <div className="w-8 h-8 lg:w-7 lg:h-7 bg-gradient-to-br from-[#4FB0FF]/20 to-[#2E96F5]/20 rounded-lg flex items-center justify-center border border-[rgba(46,150,245,0.3)]/20">
 <span className="text-[#1E86E5] font-black text-sm lg:text-xs">3</span>
 </div>
 <span className="text-[#1B3A5C] font-medium text-sm lg:text-xs">Elige tu plantilla inicial</span>
 </div>
 <div className="flex items-center gap-3 lg:gap-2 p-3 lg:p-2.5 backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl lg:rounded-lg group hover:border-[rgba(46,150,245,0.3)]/30 transition-all">
 <div className="w-8 h-8 lg:w-7 lg:h-7 bg-gradient-to-br from-[#4FB0FF]/20 to-[#2E96F5]/20 rounded-lg flex items-center justify-center border border-[rgba(46,150,245,0.3)]/20">
 <span className="text-[#1E86E5] font-black text-sm lg:text-xs">4</span>
 </div>
 <span className="text-[#1B3A5C] font-medium text-sm lg:text-xs">Invita a tu equipo</span>
 </div>
 </div>

 <button
 onClick={() => setPaso('empresa')}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3 lg:py-2.5 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-wider transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98]"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative flex items-center justify-center gap-2">
 Comenzar
 <ArrowRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
 </span>
 </button>
 </motion.div>
 )}

 {/* PASO: Datos de Empresa */}
 {paso === 'empresa' && (
 <motion.div
 key="empresa"
 initial={{ opacity: 0, x: 100 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -100 }}
 className="w-full max-w-md lg:max-w-sm relative z-10"
 >
 <div className="absolute -inset-1 bg-gradient-to-r from-[#2E96F5]/20 to-[#4FB0FF]/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[36px] lg:rounded-[28px] p-6 lg:p-5">
 <div className="text-center mb-6 lg:mb-5">
 <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#4FB0FF]/20 to-[#2E96F5]/20 border border-[rgba(46,150,245,0.3)]/30 rounded-full text-[#1E86E5] text-[9px] lg:text-[8px] font-bold uppercase tracking-wider mb-3">
 Paso 1 de 4
 </div>
 <div className="relative group mx-auto w-12 h-12 lg:w-10 lg:h-10 mb-3">
 <div className="absolute -inset-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] rounded-xl blur-lg opacity-40" />
 <div className="relative w-12 h-12 lg:w-10 lg:h-10 bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] rounded-xl flex items-center justify-center">
 <Building2 className="w-6 h-6 lg:w-5 lg:h-5 text-[#0B2240]" />
 </div>
 </div>
 <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-1">Datos de tu empresa</h2>
 <p className="text-[#4A6485] text-xs lg:text-[10px]">
 Vincula tu organización a <span className="text-[#1E86E5] font-medium">{espacioCreado?.nombre}</span>
 </p>
 </div>

 <div className="space-y-3 lg:space-y-2.5 mb-5 lg:mb-4">
 <div>
 <label className="block text-xs lg:text-[10px] font-medium text-[#4A6485] mb-1.5">Nombre de la empresa *</label>
 <input
 type="text"
 value={empresaData.nombre}
 onChange={(e) => setEmpresaData({ ...empresaData, nombre: e.target.value })}
 placeholder="Mi Empresa S.A.S."
 className="w-full px-4 py-3.5 lg:py-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-sm lg:text-xs text-[#0B2240] placeholder-zinc-700 focus:border-[rgba(46,150,245,0.3)]/50 focus:ring-2 focus:ring-[#2E96F5]/20 outline-none transition-all"
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs lg:text-[10px] font-medium text-[#4A6485] mb-1.5">Industria</label>
 <select
 value={empresaData.industria}
 onChange={(e) => setEmpresaData({ ...empresaData, industria: e.target.value })}
 className="w-full px-3 py-3.5 lg:py-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-sm lg:text-xs text-[#0B2240] focus:border-[rgba(46,150,245,0.3)]/50 focus:ring-2 focus:ring-[#2E96F5]/20 outline-none transition-all"
 >
 <option value="">Seleccionar...</option>
 {INDUSTRIAS.map(i => (
 <option key={i} value={i}>{i}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-xs lg:text-[10px] font-medium text-[#4A6485] mb-1.5">Tamaño</label>
 <select
 value={empresaData.tamano}
 onChange={(e) => setEmpresaData({ ...empresaData, tamano: e.target.value })}
 className="w-full px-3 py-3.5 lg:py-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-sm lg:text-xs text-[#0B2240] focus:border-[rgba(46,150,245,0.3)]/50 focus:ring-2 focus:ring-[#2E96F5]/20 outline-none transition-all"
 >
 {TAMANOS.map(t => (
 <option key={t.value} value={t.value}>{t.label}</option>
 ))}
 </select>
 </div>
 </div>
 <div>
 <label className="block text-xs lg:text-[10px] font-medium text-[#4A6485] mb-1.5">Sitio web (opcional)</label>
 <input
 type="url"
 value={empresaData.sitio_web}
 onChange={(e) => setEmpresaData({ ...empresaData, sitio_web: e.target.value })}
 placeholder="https://miempresa.com"
 className="w-full px-4 py-3.5 lg:py-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-sm lg:text-xs text-[#0B2240] placeholder-zinc-700 focus:border-[rgba(46,150,245,0.3)]/50 focus:ring-2 focus:ring-[#2E96F5]/20 outline-none transition-all"
 />
 </div>
 </div>

 {error && (
 <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-[10px] font-bold">
 {error}
 </div>
 )}

 <div className="space-y-2.5">
 <button
 onClick={handleGuardarEmpresa}
 disabled={loading || !empresaData.nombre.trim()}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-50"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative flex items-center justify-center gap-2">
 {loading ? (
 <>
 <div className="w-4 h-4 lg:w-3.5 lg:h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 Guardando...
 </>
 ) : (
 <>
 Continuar
 <ArrowRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
 </>
 )}
 </span>
 </button>
 </div>
 </div>
 </motion.div>
 )}

 {/* PASO: Selección de Plantilla */}
 {paso === 'cantidadMiembros' && (
 <motion.div
 key="cantidadMiembros"
 initial={{ opacity: 0, x: 100 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -100 }}
 className="w-full max-w-2xl relative z-10"
 >
 <div className="absolute -inset-1 bg-gradient-to-r from-[#4FB0FF]/20 to-[#2E96F5]/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[36px] lg:rounded-[28px] p-6 lg:p-5">
 <div className="text-center mb-6 lg:mb-5">
 <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#4FB0FF]/20 to-[#2E96F5]/20 border border-[rgba(46,150,245,0.3)]/30 rounded-full text-[#1E86E5] text-[9px] lg:text-[8px] font-bold uppercase tracking-wider mb-3">
 Paso 3 de 4
 </div>
 <div className="relative group mx-auto w-12 h-12 lg:w-10 lg:h-10 mb-3">
 <div className="absolute -inset-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] rounded-xl blur-lg opacity-40" />
 <div className="relative w-12 h-12 lg:w-10 lg:h-10 bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] rounded-xl flex items-center justify-center">
 <Users className="w-6 h-6 lg:w-5 lg:h-5 text-white" />
 </div>
 </div>
 <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-1">¿Cuántos miembros tendrá tu oficina?</h2>
 <p className="text-[#4A6485] text-xs lg:text-[10px]">
 Vamos a generar automáticamente tu oficina con un escritorio para cada miembro
 (silla, mesa y monitor incluidos). Podrás colocar más después.
 </p>
 </div>

 <div className="space-y-3">
 <div className="flex items-center gap-3">
 <input
 type="range"
 min={1}
 max={100}
 step={1}
 value={cantidadMiembros}
 onChange={(e) => setCantidadMiembros(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
 disabled={loading}
 className="flex-1 accent-[#1E86E5]"
 />
 <input
 type="number"
 min={1}
 max={100}
 value={cantidadMiembros}
 onChange={(e) => setCantidadMiembros(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
 disabled={loading}
 className="w-20 text-center px-3 py-2 rounded-xl border border-[rgba(46,150,245,0.3)] bg-white text-[#0B2240] font-black text-lg"
 />
 </div>
 <div className="grid grid-cols-5 gap-1.5">
 {[10, 25, 50, 75, 100].map((v) => (
 <button
 key={v}
 type="button"
 onClick={() => setCantidadMiembros(v)}
 disabled={loading}
 className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
 cantidadMiembros === v
 ? 'bg-[#1E86E5] text-white shadow'
 : 'bg-white/70 text-[#1B3A5C] border border-[rgba(46,150,245,0.14)] hover:border-[#1E86E5]'
 }`}
 >
 {v}
 </button>
 ))}
 </div>
 <div className="text-center text-[10px] text-[#4A6485] mt-1">
 Vamos a crear <span className="font-bold text-[#1E86E5]">{cantidadMiembros}</span> escritorios en grilla. Cada uno con silla + mesa + monitor.
 </div>
 </div>

 {error && (
 <div className="mt-4 mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-[10px] font-bold">
 {error}
 </div>
 )}

 <div className="mt-5 grid grid-cols-2 gap-2.5">
 <button
 onClick={() => setPaso('cargo')}
 disabled={loading}
 className="w-full py-3 lg:py-2.5 rounded-xl border border-[rgba(46,150,245,0.14)] bg-white/70 text-[#1B3A5C] hover:text-[#0B2240] hover:border-[rgba(46,150,245,0.14)] transition-all text-xs lg:text-[10px] font-bold uppercase tracking-[0.15em] disabled:opacity-50"
 >
 Volver
 </button>
 <button
 onClick={handleGuardarPlantilla}
 disabled={loading}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3 lg:py-2.5 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-50"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative flex items-center justify-center gap-2">
 {loading ? (
 <>
 <div className="w-4 h-4 lg:w-3.5 lg:h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 Creando {cantidadMiembros} escritorios...
 </>
 ) : (
 <>
 Crear oficina con {cantidadMiembros} desks
 <ArrowRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
 </>
 )}
 </span>
 </button>
 </div>
 </div>
 </motion.div>
 )}

 {/* PASO: Selección de Cargo (después de empresa) */}
 {paso === 'cargo' && (
 <motion.div
 key="cargo"
 initial={{ opacity: 0, x: 100 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -100 }}
 className="w-full max-w-4xl"
 >
 <CargoSelector
 onSelect={handleSelectCargo}
 espacioNombre={espacioCreado?.nombre || 'kronos'}
 isLoading={loading}
 rolUsuario="super_admin"
 cargosDB={cargosDB}
 etiquetaPaso="Paso 2 de 4"
 titulo="¿Cuál es tu cargo principal?"
 descripcion="Usaremos este dato para terminar de personalizar tu oficina inicial"
 />
 </motion.div>
 )}

 {/* PASO: Invitar Equipo */}
 {paso === 'invitar' && (
 <motion.div
 key="invitar"
 initial={{ opacity: 0, x: 100 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -100 }}
 className="w-full max-w-md lg:max-w-sm relative z-10"
 >
 <div className="absolute -inset-1 bg-gradient-to-r from-[#4FB0FF]/20 /20 to-[#2E96F5]/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[36px] lg:rounded-[28px] p-6 lg:p-5">
 <div className="text-center mb-6 lg:mb-5">
 <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#4FB0FF]/20 to-[#2E96F5]/20 border border-[rgba(46,150,245,0.3)]/30 rounded-full text-[#1E86E5] text-[9px] lg:text-[8px] font-bold uppercase tracking-wider mb-3">
 Paso 4 de 4
 </div>
 <div className="relative group mx-auto w-12 h-12 lg:w-10 lg:h-10 mb-3">
 <div className="absolute -inset-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] rounded-xl blur-lg opacity-40" />
 <div className="relative w-12 h-12 lg:w-10 lg:h-10 bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] rounded-xl flex items-center justify-center">
 <Users className="w-6 h-6 lg:w-5 lg:h-5 text-[#0B2240]" />
 </div>
 </div>
 <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-1">Invita a tu equipo</h2>
 <p className="text-[#4A6485] text-xs lg:text-[10px]">
 Añade los emails para invitar a <span className="text-[#1E86E5] font-medium">{espacioCreado?.nombre}</span>
 </p>
 </div>

 <div className="space-y-2.5 mb-4 lg:mb-3">
 {invitaciones.map((email, index) => (
 <div key={index} className="flex gap-2">
 <div className="flex-1 relative">
 <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B83A0]" />
 <input
 type="email"
 value={email}
 onChange={(e) => handleEmailChange(index, e.target.value)}
 placeholder="email@ejemplo.com"
 className="w-full pl-10 pr-3 py-3.5 lg:py-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-sm lg:text-xs text-[#0B2240] placeholder-zinc-700 focus:border-[rgba(46,150,245,0.3)]/50 focus:ring-2 focus:ring-[#2E96F5]/20 outline-none transition-all"
 />
 </div>
 {invitaciones.length > 1 && (
 <button
 onClick={() => handleRemoveEmail(index)}
 className="p-3.5 lg:p-3 bg-white/70 border border-[rgba(46,150,245,0.14)] rounded-xl text-[#4A6485] hover:text-red-400 hover:border-red-500/50 transition-all"
 >
 <X className="w-4 h-4" />
 </button>
 )}
 </div>
 ))}
 </div>

 <button
 onClick={handleAddEmail}
 className="w-full py-3 lg:py-2.5 border-2 border-dashed border-[rgba(46,150,245,0.14)] rounded-xl text-[#6B83A0] hover:text-[#1E86E5] hover:border-[rgba(46,150,245,0.3)]/30 transition-all flex items-center justify-center gap-2 mb-4 lg:mb-3 text-xs"
 >
 <Plus className="w-4 h-4" />
 Añadir otro email
 </button>

 {error && (
 <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-[10px] font-bold">
 {error}
 </div>
 )}

 <div className="space-y-2.5">
 <button
 onClick={handleEnviarInvitaciones}
 disabled={loading}
 className="relative w-full group overflow-hidden bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white py-3.5 lg:py-3 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] active:scale-[0.98] disabled:opacity-50"
 >
 <span className="absolute inset-0 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <span className="relative flex items-center justify-center gap-2">
 {loading ? (
 <>
 <div className="w-4 h-4 lg:w-3.5 lg:h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 Enviando...
 </>
 ) : (
 <>
 Enviar invitaciones
 <ArrowRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
 </>
 )}
 </span>
 </button>

 <button
 onClick={handleSkipInvitaciones}
 disabled={loading}
 className="w-full py-2 text-[#4A6485] hover:text-[#1E86E5] transition-colors text-[10px] lg:text-[9px] font-bold uppercase tracking-widest"
 >
 Omitir por ahora
 </button>
 </div>
 </div>
 </motion.div>
 )}

 {/* PASO: Completado */}
 {paso === 'completado' && (
 <motion.div
 key="completado"
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 className="w-full max-w-md lg:max-w-sm text-center relative z-10"
 >
 <div className="relative mx-auto w-16 h-16 lg:w-14 lg:h-14 mb-4">
 <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-[#2E96F5] rounded-full blur-xl opacity-50 animate-pulse" />
 <div className="relative w-16 h-16 lg:w-14 lg:h-14 bg-gradient-to-br from-emerald-500 to-[#2E96F5] rounded-full flex items-center justify-center shadow-2xl">
 <Check className="w-8 h-8 lg:w-7 lg:h-7 text-[#0B2240]" />
 </div>
 </div>
 <h2 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-2">¡Todo listo!</h2>
 <p className="text-[#1B3A5C] text-sm lg:text-xs mb-1">
 Tu espacio <span className="text-emerald-400 font-medium">{espacioCreado?.nombre}</span> está listo
 </p>
 <p className="text-[#6B83A0] text-[10px]">Redirigiendo...</p>

 <div className="mt-6">
 <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
};

export default OnboardingCreador;
