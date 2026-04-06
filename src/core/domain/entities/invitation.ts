/**
 * @module core/domain/entities/invitation
 * @description Domain types for the workspace invitation system.
 * Replaces inline types and 'as any' casts from the former App.tsx God Component.
 */

/** Possible states during invitation verification and acceptance */
export type InvitationState = 'cargando' | 'valido' | 'expirado' | 'usado' | 'error' | 'aceptado';

/** Shape of the workspace data joined from invitaciones_pendientes → espacios_trabajo */
export interface InvitacionEspacioData {
  id: string;
  nombre: string;
  slug: string;
}

/** Shape of the inviter user data joined from invitaciones_pendientes → usuarios */
export interface InvitacionInvitadorData {
  nombre: string;
}

/** Validated invitation info displayed to the user */
export interface InvitacionInfo {
  email: string;
  rol: string;
  empresa_id: string;
  espacio: InvitacionEspacioData;
  invitador: InvitacionInvitadorData;
}

/** Raw response from Supabase invitaciones_pendientes query with JOINs */
export interface InvitacionQueryRow {
  email: string;
  rol: string;
  empresa_id: string;
  usada: boolean;
  expira_en: string;
  espacio: InvitacionEspacioData | null;
  invitador: InvitacionInvitadorData | null;
}
