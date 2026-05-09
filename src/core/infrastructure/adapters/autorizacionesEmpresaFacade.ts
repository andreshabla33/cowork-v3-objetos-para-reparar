/**
 * @module lib/autorizacionesEmpresa
 * @description Thin wrappers que delegan a los repositories de Clean Arch.
 *
 * Mantenido como fachada legacy para no romper consumidores
 * (SettingsZona, AdminZoneHUD, ConsentimientoPendiente, useNotifications).
 * Migración progresiva: nuevos consumers deben importar los repositorios
 * directamente desde:
 *   - `@/src/core/infrastructure/adapters/ZonaEmpresaSupabaseRepository` (zona CRUD)
 *   - `@/src/core/infrastructure/adapters/AutorizacionEmpresaSupabaseRepository` (workflow)
 *
 * Toda la lógica supabase + activity log + notifications + canal compartido
 * vive ahora en esos dos repositorios.
 */

import type { AutorizacionEmpresa, ZonaEmpresa } from '@/types';
import type { ConfiguracionZonaEmpresa } from '@/core/domain/entities/cerramientosZona';
import { zonaEmpresaRepository } from '@/core/infrastructure/adapters/ZonaEmpresaSupabaseRepository';
import { autorizacionEmpresaRepository } from '@/core/infrastructure/adapters/AutorizacionEmpresaSupabaseRepository';
import type {
  ActualizarEstadoZonaInput,
  AplicarLayoutInput,
  EliminarZonaInput,
  GuardarZonaInput,
} from '@/core/domain/ports/IZonaEmpresaRepository';
import type {
  AprobarAutorizacionInput,
  SolicitarAccesoInput,
} from '@/core/domain/ports/IAutorizacionEmpresaRepository';

// ── Zona CRUD wrappers ────────────────────────────────────────────────────────

export const cargarZonasEmpresa = (espacioId: string): Promise<ZonaEmpresa[]> =>
  zonaEmpresaRepository.cargarZonas(espacioId);

export const cargarZonaEmpresaActual = (
  espacioId: string,
  empresaId: string,
): Promise<ZonaEmpresa | null> => zonaEmpresaRepository.cargarZonaActual(espacioId, empresaId);

export const actualizarEstadoZonaEmpresa = (payload: ActualizarEstadoZonaInput): Promise<boolean> =>
  zonaEmpresaRepository.actualizarEstado(payload);

export const eliminarZonaEmpresa = (payload: EliminarZonaInput): Promise<boolean> =>
  zonaEmpresaRepository.eliminar(payload);

export const guardarZonaEmpresa = (
  payload: GuardarZonaInput & { configuracion?: ConfiguracionZonaEmpresa | null },
): Promise<ZonaEmpresa | null> => zonaEmpresaRepository.guardar(payload);

export const aplicarLayoutMasivo = (payload: AplicarLayoutInput): Promise<boolean> =>
  zonaEmpresaRepository.aplicarLayout(payload);

// ── Autorizaciones empresa workflow wrappers ─────────────────────────────────

export const cargarSolicitudesPendientes = (
  espacioId: string,
  empresaDestinoId: string,
): Promise<AutorizacionEmpresa[]> =>
  autorizacionEmpresaRepository.cargarSolicitudesPendientes(espacioId, empresaDestinoId);

export const cargarSolicitudesEnviadas = (
  espacioId: string,
  empresaOrigenId: string,
): Promise<AutorizacionEmpresa[]> =>
  autorizacionEmpresaRepository.cargarSolicitudesEnviadas(espacioId, empresaOrigenId);

export const cargarAutorizacionesActivas = (
  espacioId: string,
  empresaId: string,
): Promise<AutorizacionEmpresa[]> =>
  autorizacionEmpresaRepository.cargarAutorizacionesActivas(espacioId, empresaId);

export const solicitarAccesoEmpresa = (payload: SolicitarAccesoInput): Promise<string | null> =>
  autorizacionEmpresaRepository.solicitarAcceso(payload);

export const aprobarAutorizacionEmpresa = (payload: AprobarAutorizacionInput): Promise<boolean> =>
  autorizacionEmpresaRepository.aprobar(payload);

export const rechazarAutorizacionEmpresa = (payload: AprobarAutorizacionInput): Promise<boolean> =>
  autorizacionEmpresaRepository.rechazar(payload);

export const revocarAutorizacionEmpresa = (payload: AprobarAutorizacionInput): Promise<boolean> =>
  autorizacionEmpresaRepository.revocar(payload);
