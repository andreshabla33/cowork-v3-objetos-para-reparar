/**
 * @module infrastructure/adapters/gamificacion
 * @description Facade compat para el sistema de gamificación.
 *
 * Tras el refactor 2026-05-09 (cierre deuda ITEM 6):
 *  - Constantes + funciones puras (XP_POR_ACCION, AccionXP, xpParaNivel,
 *    calcularNivel) + tipos (PerfilGamificacion, Mision, Logro,
 *    LogroDesbloqueado, ItemCosmetico) viven en
 *    `@/core/domain/entities/gamificacion` (Domain).
 *  - Funciones supabase ahora son métodos del singleton
 *    `gamificacionRepository` en `GamificacionSupabaseRepository`
 *    (implementa `IGamificacionRepository` port).
 *
 * Este archivo mantiene la API legada (10 funciones sueltas + constantes/types)
 * para no romper los 10 consumers existentes. Nuevos consumers deberían
 * inyectar el repo:
 *
 *   import { gamificacionRepository } from '@/core/infrastructure/adapters/GamificacionSupabaseRepository';
 *   await gamificacionRepository.otorgarXP(...);
 */

import { gamificacionRepository } from './GamificacionSupabaseRepository';
import type {
  PerfilGamificacion,
  Mision,
  Logro,
  LogroDesbloqueado,
  ItemCosmetico,
} from '@/core/domain/entities/gamificacion';

// ─── Re-exports Domain (constantes + funciones puras + tipos) ─────────────────

export {
  XP_POR_ACCION,
  xpParaNivel,
  calcularNivel,
} from '@/core/domain/entities/gamificacion';
export type {
  AccionXP,
  PerfilGamificacion,
  Mision,
  Logro,
  LogroDesbloqueado,
  ItemCosmetico,
} from '@/core/domain/entities/gamificacion';

// ─── Funciones legadas (delegan al singleton repository) ──────────────────────

export const obtenerPerfilGamificacion = (
  usuarioId: string,
  espacioId: string,
): Promise<PerfilGamificacion | null> =>
  gamificacionRepository.obtenerPerfil(usuarioId, espacioId);

export const otorgarXP = (
  usuarioId: string,
  espacioId: string,
  cantidad: number,
  accion: string,
): Promise<{ xp_total: number; nivel: number; subioDeMivel: boolean } | null> =>
  gamificacionRepository.otorgarXP(usuarioId, espacioId, cantidad, accion);

export const registrarLoginDiario = (
  usuarioId: string,
  espacioId: string,
): Promise<{ racha: number; xpGanado: number } | null> =>
  gamificacionRepository.registrarLoginDiario(usuarioId, espacioId);

export const obtenerMisionesDiarias = (
  usuarioId: string,
  espacioId: string,
): Promise<Mision[]> => gamificacionRepository.obtenerMisionesDiarias(usuarioId, espacioId);

export const avanzarMision = (misionId: string, incremento: number = 1): Promise<Mision | null> =>
  gamificacionRepository.avanzarMision(misionId, incremento);

export const generarMisionesDiarias = (
  usuarioId: string,
  espacioId: string,
): Promise<Mision[]> => gamificacionRepository.generarMisionesDiarias(usuarioId, espacioId);

export const obtenerCatalogoLogros = (): Promise<Logro[]> =>
  gamificacionRepository.obtenerCatalogoLogros();

export const obtenerLogrosUsuario = (
  usuarioId: string,
  espacioId: string,
): Promise<LogroDesbloqueado[]> =>
  gamificacionRepository.obtenerLogrosUsuario(usuarioId, espacioId);

export const desbloquearLogro = (
  usuarioId: string,
  espacioId: string,
  logroId: string,
): Promise<boolean> =>
  gamificacionRepository.desbloquearLogro(usuarioId, espacioId, logroId);

export const obtenerItemsCosmeticos = (): Promise<ItemCosmetico[]> =>
  gamificacionRepository.obtenerItemsCosmeticos();
