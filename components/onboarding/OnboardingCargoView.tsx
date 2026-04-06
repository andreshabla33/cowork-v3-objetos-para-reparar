/**
 * @module components/onboarding/OnboardingCargoView
 * @description Multi-step onboarding flow for new workspace members.
 * Refactored to Clean Architecture: zero direct Supabase imports.
 * All data access delegated to Use Cases + Repository.
 *
 * Domain types: src/core/domain/entities/onboarding.ts
 * Use Cases: ObtenerDatosOnboardingUseCase, CompletarOnboardingUseCase
 */

import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { logger } from '../../lib/logger';
import { CargoSelector } from './CargoSelector';
import type { CargoLaboral, CargoDB } from './CargoSelector';
import type { Departamento, OnboardingCargoState } from '../../src/core/domain/entities/onboarding';

// Clean Architecture: Use Cases + Repository (no direct supabase import)
import { ObtenerDatosOnboardingUseCase } from '../../src/core/application/usecases/ObtenerDatosOnboardingUseCase';
import { CompletarOnboardingUseCase } from '../../src/core/application/usecases/CompletarOnboardingUseCase';
import { OnboardingSupabaseRepository } from '../../src/core/infrastructure/adapters/OnboardingSupabaseRepository';

const log = logger.child('onboarding');

// Singleton instances — dependency injection
const onboardingRepo = new OnboardingSupabaseRepository();
const obtenerDatosUC = new ObtenerDatosOnboardingUseCase(onboardingRepo);
const completarUC = new CompletarOnboardingUseCase(onboardingRepo);

/** Emoji mapping for department icons */
const DEPARTMENT_ICON_MAP: Record<string, string> = {
  users: '👥',
  code: '💻',
  palette: '🎨',
  megaphone: '📣',
  headphones: '🎧',
  'trending-up': '📈',
};

export const OnboardingCargoView: React.FC = () => {
  const { session, setView, setAuthFeedback, fetchWorkspaces } = useStore();
  const [state, setState] = useState<OnboardingCargoState>({
    isLoading: true,
    error: null,
    espacioNombre: 'tu espacio',
    espacioId: null,
    cargoSugerido: null,
    miembroId: null,
    departamentos: [],
    cargosDB: [],
    paso: 'bienvenida',
    cargoSeleccionado: null,
    rolSistema: 'member',
    invitadorNombre: '',
  });
  const [saving, setSaving] = useState(false);

  const cargarDatos = async () => {
    if (!session?.user?.id) {
      setState((prev) => ({ ...prev, isLoading: false, error: 'No hay sesión activa' }));
      return;
    }

    try {
      const datos = await obtenerDatosUC.ejecutar(session.user.id, session.user.email || '');

      if (!datos) {
        setState((prev) => ({ ...prev, isLoading: false, error: 'No se encontró membresía' }));
        return;
      }

      if (datos.miembro.onboarding_completado) {
        setView('dashboard');
        return;
      }

      setState({
        isLoading: false,
        error: null,
        espacioNombre: datos.miembro.espacioNombre,
        espacioId: datos.miembro.espacio_id,
        cargoSugerido: datos.cargoSugerido,
        miembroId: datos.miembro.id,
        departamentos: datos.departamentos,
        cargosDB: datos.cargosDB,
        paso: 'bienvenida',
        cargoSeleccionado: null,
        rolSistema: datos.miembro.rol,
        invitadorNombre: datos.invitadorNombre,
      });
    } catch (err: unknown) {
      log.error('Failed to load onboarding data', { error: err instanceof Error ? err.message : String(err) });
      setState((prev) => ({ ...prev, isLoading: false, error: 'Error al cargar datos' }));
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSelectCargo = async (cargo: CargoLaboral) => {
    if (state.departamentos.length === 0) {
      if (!state.miembroId) return;
      setSaving(true);
      try {
        await completarUC.ejecutar({ miembroId: state.miembroId, cargoId: cargo });
        await fetchWorkspaces();
        setAuthFeedback({ type: 'success', message: '¡Perfil configurado!' });
        setView('dashboard');
      } catch (err: unknown) {
        log.error('Failed to save role', { error: err instanceof Error ? err.message : String(err) });
        setState((prev) => ({ ...prev, error: 'Error al guardar' }));
      } finally {
        setSaving(false);
      }
      return;
    }
    setState((prev) => ({ ...prev, cargoSeleccionado: cargo, paso: 'departamento' }));
  };

  const handleSelectDepartamento = async (departamentoId: string) => {
    if (!state.miembroId || !state.cargoSeleccionado) return;
    setSaving(true);

    try {
      await completarUC.ejecutar({
        miembroId: state.miembroId,
        cargoId: state.cargoSeleccionado,
        departamentoId,
      });

      const deptNombre = state.departamentos.find((d) => d.id === departamentoId)?.nombre || '';
      await fetchWorkspaces();
      setAuthFeedback({ type: 'success', message: `¡Perfil configurado! ${deptNombre}` });
      setView('dashboard');
    } catch (err: unknown) {
      log.error('Failed to save department', { error: err instanceof Error ? err.message : String(err) });
      setState((prev) => ({ ...prev, error: 'Error al guardar' }));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setState((prev) => ({ ...prev, paso: 'cargo', cargoSeleccionado: null }));
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (state.isLoading) {
    return (
      <div className="fixed inset-0 bg-[#050508] flex items-center justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="text-center relative z-10">
          <div className="w-10 h-10 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Cargando...</p>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────
  if (state.error) {
    return (
      <div className="fixed inset-0 bg-[#050508] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="relative z-10 bg-red-500/10 border border-red-500/30 rounded-xl p-5 max-w-sm text-center">
          <p className="text-red-400 text-sm mb-4">{state.error}</p>
          <button
            onClick={() => setView('dashboard')}
            className="px-5 py-2.5 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  const esAdmin = state.rolSistema === 'admin' || state.rolSistema === 'super_admin';

  // ─── Step 0: Welcome ─────────────────────────────────────────────────
  if (state.paso === 'bienvenida') {
    return (
      <div className="fixed inset-0 bg-[#050508] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-600/10 via-fuchsia-600/5 to-transparent blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-cyan-600/10 via-violet-600/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

        <div className="w-full max-w-md lg:max-w-sm text-center relative z-10">
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 rounded-[40px] lg:rounded-[32px] blur-xl opacity-60" />
          <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[36px] lg:rounded-[28px] p-6 lg:p-5">

            <div className="relative group mx-auto w-14 h-14 lg:w-12 lg:h-12 mb-4">
              <div className={`absolute -inset-2 rounded-xl blur-lg opacity-40 ${
                esAdmin ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600' : 'bg-gradient-to-r from-cyan-500 to-violet-600'
              }`} />
              <div className={`relative w-14 h-14 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center ${
                esAdmin ? 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500' : 'bg-gradient-to-br from-cyan-500 via-violet-600 to-fuchsia-600'
              }`}>
                <span className="text-2xl lg:text-xl">{esAdmin ? '\u{1F451}' : '\u{1F44B}'}</span>
              </div>
            </div>

            <h1 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-2">
              {esAdmin
                ? `¡Bienvenido como ${state.rolSistema === 'super_admin' ? 'Super Admin' : 'Admin'}!`
                : '¡Bienvenido al equipo!'}
            </h1>

            <p className="text-zinc-500 text-xs lg:text-[10px] mb-4">
              Te uniste a <span className="text-violet-400 font-medium">{state.espacioNombre}</span>
              {state.invitadorNombre && (
                <span> por invitación de <span className="text-fuchsia-400 font-medium">{state.invitadorNombre}</span></span>
              )}
            </p>

            {esAdmin ? (
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 lg:p-3 text-left mb-4">
                <h3 className="text-violet-400 font-black text-[10px] uppercase tracking-widest mb-2">Como administrador podrás:</h3>
                <ul className="space-y-1.5 text-[11px] lg:text-[10px] text-zinc-400">
                  <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Invitar y gestionar miembros del equipo</li>
                  <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Configurar métricas de análisis conductual</li>
                  <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Administrar departamentos y roles</li>
                  <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Acceder a configuraciones avanzadas del espacio</li>
                </ul>
              </div>
            ) : (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 lg:p-3 text-left mb-4">
                <h3 className="text-cyan-400 font-black text-[10px] uppercase tracking-widest mb-2">En tu espacio podrás:</h3>
                <ul className="space-y-1.5 text-[11px] lg:text-[10px] text-zinc-400">
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Colaborar en el espacio virtual 3D</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Participar en reuniones con análisis inteligente</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Gestionar tareas y comunicarte con tu equipo</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Personalizar tu avatar y experiencia</li>
                </ul>
              </div>
            )}

            <p className="text-zinc-600 text-[10px] lg:text-[9px] mb-4">
              Primero, cuéntanos cuál es tu cargo para personalizar tu experiencia.
            </p>

            <button
              onClick={() => setState((prev) => ({ ...prev, paso: 'cargo' }))}
              className="relative w-full group overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white py-3 lg:py-2.5 rounded-xl font-black text-xs lg:text-[10px] uppercase tracking-[0.15em] transition-all shadow-2xl shadow-violet-600/30 active:scale-[0.98]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-center justify-center gap-2">
                Continuar
                <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 1: Role selection ───────────────────────────────────────────
  if (state.paso === 'cargo') {
    return (
      <CargoSelector
        onSelect={handleSelectCargo}
        cargoSugerido={state.cargoSugerido || undefined}
        espacioNombre={state.espacioNombre}
        isLoading={saving}
        rolUsuario={state.rolSistema}
        cargosDB={state.cargosDB}
      />
    );
  }

  // ─── Step 2: Department selection ─────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#050508] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-600/10 via-fuchsia-600/5 to-transparent blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-cyan-600/10 via-violet-600/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-xl lg:max-w-lg relative z-10">
        <div className="text-center mb-6 lg:mb-5">
          <button
            onClick={handleBack}
            className="mb-3 text-zinc-500 hover:text-violet-400 flex items-center gap-1.5 mx-auto text-[10px] font-bold uppercase tracking-widest transition-colors"
          >
            ← Volver a selección de cargo
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-full text-violet-400 text-[9px] font-bold uppercase tracking-wider mb-3">
            Paso 2 de 2
          </div>
          <h1 className="text-2xl lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white mb-1">¿A qué departamento perteneces?</h1>
          <p className="text-zinc-500 text-xs lg:text-[10px]">
            Selecciona tu departamento en <span className="text-violet-400 font-medium">{state.espacioNombre}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-2.5">
          {state.departamentos.map((dept) => (
            <button
              key={dept.id}
              onClick={() => handleSelectDepartamento(dept.id)}
              disabled={saving}
              className="group p-4 lg:p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl hover:border-violet-500/40 transition-all duration-200 text-left disabled:opacity-50"
            >
              <div
                className="w-10 h-10 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center mb-3 lg:mb-2 text-xl lg:text-lg"
                style={{ backgroundColor: dept.color + '20' }}
              >
                {DEPARTMENT_ICON_MAP[dept.icono] || '📁'}
              </div>
              <h3 className="text-sm lg:text-xs font-bold text-white group-hover:text-violet-400 transition-colors">
                {dept.nombre}
              </h3>
              <div
                className="w-6 h-0.5 rounded-full mt-1.5"
                style={{ backgroundColor: dept.color }}
              />
            </button>
          ))}
        </div>

        {saving && (
          <div className="mt-4 text-center">
            <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-2">Guardando...</p>
          </div>
        )}
      </div>
    </div>
  );
};
