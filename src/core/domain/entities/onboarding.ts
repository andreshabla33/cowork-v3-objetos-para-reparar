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

/** Full state for the onboarding flow component */
export interface OnboardingCargoState {
  isLoading: boolean;
  error: string | null;
  espacioNombre: string;
  espacioId: string | null;
  cargoSugerido: string | null;
  miembroId: string | null;
  departamentos: Departamento[];
  cargosDB: Array<{
    id: string;
    nombre: string;
    clave: string;
    descripcion: string;
    categoria: string;
    icono: string;
    orden: number;
    activo: boolean;
    tiene_analisis_avanzado: boolean;
    analisis_disponibles: string[];
    solo_admin: boolean;
  }>;
  paso: 'bienvenida' | 'cargo' | 'departamento';
  cargoSeleccionado: string | null;
  rolSistema: string;
  invitadorNombre: string;
}
