/**
 * @module domain/ports/IEnviarInvitacionRepository
 * Port para envío de invitaciones a un espacio de trabajo.
 *
 * Clean Architecture (REMEDIATION-007b):
 *  - Define el contrato desde el Dominio, sin dependencias de infraestructura.
 *  - La implementación concreta (Edge Function via Supabase) vive en infrastructure/adapters/.
 *  - Permite cambiar el canal de envío (email, webhook, etc.) sin tocar el Use Case.
 */

export type RolInvitacion = 'miembro' | 'moderador' | 'admin';

export interface EnviarInvitacionInput {
  email: string;
  espacioId: string;
  rol: RolInvitacion;
  nombreInvitado?: string;
}

export interface EnviarInvitacionResult {
  exito: boolean;
  mensaje?: string;
}

export interface IEnviarInvitacionRepository {
  /**
   * Envía una invitación al correo especificado con el rol indicado.
   * Lanza una excepción si el servidor devuelve un error HTTP no recuperable.
   */
  enviar(input: EnviarInvitacionInput): Promise<EnviarInvitacionResult>;
}
