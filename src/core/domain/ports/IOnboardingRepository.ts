/**
 * @module domain/ports/IOnboardingRepository
 * @description Port (interface) for onboarding data access.
 * Clean Architecture: Domain layer defines the contract.
 */

import type { Departamento, OnboardingInvitadorData, CargoDB } from '../entities/onboarding';

/** Raw membership data returned when verifying onboarding status */
export interface MiembroOnboarding {
  id: string;
  cargo: string | null;
  rol: string;
  espacio_id: string;
  onboarding_completado: boolean;
  espacioNombre: string;
}

/** Complete onboarding data fetched in a single orchestration */
export interface DatosOnboarding {
  miembro: MiembroOnboarding;
  departamentos: Departamento[];
  cargosDB: CargoDB[];
  cargoSugerido: string | null;
  invitadorNombre: string;
}

export interface MiembroResumen {
  rol: string;
  espacio_id: string;
}

export interface IOnboardingRepository {
  /**
   * Find the most recent pending onboarding membership for a user.
   * @param espacioId — Si se provee, filtra por workspace específico (evita retornar
   *                     membresías de otros workspaces con rol diferente — ROLE-MISMATCH-001).
   */
  obtenerMiembroPendiente(userId: string, espacioId?: string): Promise<MiembroOnboarding | null>;

  /**
   * Find the most recent accepted membership (cualquier estado de onboarding) for guard de rol.
   */
  obtenerMiembroMasReciente(userId: string): Promise<MiembroResumen | null>;

  /**
   * Fetch departments, roles/cargos, and invitation data for onboarding.
   */
  obtenerDatosOnboarding(
    userId: string,
    userEmail: string,
    espacioId: string,
  ): Promise<{
    departamentos: Departamento[];
    cargosDB: CargoDB[];
    cargoSugerido: string | null;
    invitadorNombre: string;
  }>;

  /**
   * Load only active cargos for a given workspace (Onboarding Creador flow).
   */
  obtenerCargosActivos(espacioId: string): Promise<CargoDB[]>;

  /**
   * Resolve a member's id in a given workspace.
   */
  obtenerIdMiembro(userId: string, espacioId: string): Promise<string | null>;

  /**
   * Mark `onboarding_completado=true` por id de miembro (sin cargo update).
   */
  marcarOnboardingCompleto(miembroId: string): Promise<void>;

  /**
   * Complete onboarding by updating member's cargo and optionally department.
   */
  completarOnboarding(
    miembroId: string,
    cargoId: string,
    departamentoId?: string,
  ): Promise<void>;
}
