/**
 * @module domain/ports/IAutorizacionEmpresaRepository
 * @description Port interface for inter-empresa authorization workflow.
 *
 * Covers the complete cross-empresa access lifecycle: pending requests,
 * approvals, rejections, revocations. Side effects (activity log,
 * notifications, shared chat channel provisioning) are internal to the
 * repository implementation.
 *
 * Clean Architecture: Domain layer defines the contract; Infrastructure
 * implements with Supabase. UI/hooks consume via this port.
 */

import type { AutorizacionEmpresa } from '@/types';

export interface SolicitarAccesoInput {
  espacioId: string;
  empresaOrigenId: string;
  empresaDestinoId: string;
  usuarioId: string;
}

export interface AprobarAutorizacionInput {
  autorizacionId: string;
  usuarioId: string;
  empresaId: string;
  espacioId: string;
}

/** Same shape as AprobarAutorizacionInput; reused by reject/revoke flows. */
export type ActualizarAutorizacionInput = AprobarAutorizacionInput;

export interface IAutorizacionEmpresaRepository {
  /** Pending requests *targeted at* an empresa (admins of empresa-destino see these). */
  cargarSolicitudesPendientes(
    espacioId: string,
    empresaDestinoId: string,
  ): Promise<AutorizacionEmpresa[]>;

  /** Pending requests *sent by* an empresa (admins of empresa-origen see these). */
  cargarSolicitudesEnviadas(
    espacioId: string,
    empresaOrigenId: string,
  ): Promise<AutorizacionEmpresa[]>;

  /** Active (approved) authorizations involving this empresa as origin OR destino. */
  cargarAutorizacionesActivas(
    espacioId: string,
    empresaId: string,
  ): Promise<AutorizacionEmpresa[]>;

  /**
   * Open a new access request from origen → destino.
   * Logs activity + notifies destino admins.
   * Returns the new autorizacion id, or null on failure.
   */
  solicitarAcceso(input: SolicitarAccesoInput): Promise<string | null>;

  /**
   * Approve a pending request. Provisions the shared chat channel if missing,
   * sets a 7-day expiry, logs activity, notifies the requester.
   */
  aprobar(input: AprobarAutorizacionInput): Promise<boolean>;

  /** Reject a pending request. Logs activity + notifies the requester. */
  rechazar(input: ActualizarAutorizacionInput): Promise<boolean>;

  /** Revoke an active approval. Logs activity + notifies the requester. */
  revocar(input: ActualizarAutorizacionInput): Promise<boolean>;

  /**
   * Subscribe to INSERT/UPDATE/DELETE on `zonas_empresa` filtered by espacio.
   * Devuelve `unsubscribe`.
   */
  suscribirCambiosZonasEmpresa(espacioId: string, callback: () => void): () => void;
}
