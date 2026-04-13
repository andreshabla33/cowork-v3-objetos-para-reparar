/**
 * @module core/domain/entities/onboarding
 * @description Domain types for the member onboarding flow.
 * Replaces inline types and 'as any' casts from the former App.tsx God Component.
 */

/** Department as returned by the departamentos table */
export interface Departamento {
  id: string;
  nombre: string;
  color: string;
  icono: string;
}

/** Shape of the workspace name joined from miembros_espacio → espacios_trabajo */
export interface MiembroEspacioData {
  nombre: string;
}

/** Shape of the inviter data joined from invitaciones_pendientes → usuarios */
export interface OnboardingInvitadorData {
  nombre: string;
}

/**
 * Cargo (role) record from the `cargos` DB table.
 * Previously defined in CargoSelector.tsx (Presentation layer).
 * Moved to Domain to fix dependency inversion violation in IOnboardingRepository.
 */
export interface CargoDB {
  id: string;
  nombre: string;
  clave: string;
  descripcion: string | null;
  categoria: string;
  icono: string;
  orden: number;
  activo: boolean;
  tiene_analisis_avanzado: boolean;
  analisis_disponibles: string[];
  solo_admin: boolean;
}

/** Full state for the onboarding flow component */
export interface OnboardingCargoState {
  isLoading: boolean;
  error: string | null;
  espacioNombre: string;
  espacioId: string | null;
  cargoSugerido: string | null;
  miembroId: string | null;
  departamentos: Departamento[];
  cargosDB: CargoDB[];
  paso: 'bienvenida' | 'cargo' | 'departamento' | 'avatar';
  cargoSeleccionado: string | null;
  rolSistema: string;
  invitadorNombre: string;
}
