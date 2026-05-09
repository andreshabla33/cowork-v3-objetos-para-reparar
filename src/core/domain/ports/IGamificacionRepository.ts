/**
 * @module domain/ports/IGamificacionRepository
 * @description Port para operaciones de persistencia del sistema de gamificación.
 *
 * Clean Architecture: Domain define el contrato; Infrastructure (Supabase)
 * provee la implementación concreta.
 *
 * Tablas: `gamificacion_usuarios`, `gamificacion_misiones`,
 * `gamificacion_logros`, `gamificacion_logros_usuario`, `gamificacion_items`.
 */

import type {
  PerfilGamificacion,
  Mision,
  Logro,
  LogroDesbloqueado,
  ItemCosmetico,
} from '@/core/domain/entities/gamificacion';

export interface IGamificacionRepository {
  /** Obtener o crear (idempotente) el perfil de gamificación de un usuario en un espacio. */
  obtenerPerfil(usuarioId: string, espacioId: string): Promise<PerfilGamificacion | null>;

  /**
   * Otorgar XP por una acción. Recalcula nivel automáticamente.
   * Retorna `null` si no se pudo cargar el perfil; en éxito retorna
   * `{ xp_total, nivel, subioDeNivel }`.
   */
  otorgarXP(
    usuarioId: string,
    espacioId: string,
    cantidad: number,
    accion: string,
  ): Promise<{ xp_total: number; nivel: number; subioDeMivel: boolean } | null>;

  /**
   * Registrar login diario y actualizar racha.
   * Idempotente: si el usuario ya hizo login hoy, retorna racha actual con xpGanado=0.
   */
  registrarLoginDiario(
    usuarioId: string,
    espacioId: string,
  ): Promise<{ racha: number; xpGanado: number } | null>;

  /** Obtener misiones del día para un usuario. */
  obtenerMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]>;

  /**
   * Avanzar progreso de una misión.
   * Si no está activa, retorna la misión sin cambios.
   * Si se completa el progreso, marca estado='completada' y `completada_en`.
   */
  avanzarMision(misionId: string, incremento: number): Promise<Mision | null>;

  /**
   * Generar misiones diarias para un usuario si no tiene del día.
   * 3 misiones aleatorias seleccionadas de 6 plantillas predefinidas.
   */
  generarMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]>;

  /** Obtener catálogo completo de logros disponibles. */
  obtenerCatalogoLogros(): Promise<Logro[]>;

  /** Obtener logros desbloqueados por un usuario en un espacio. */
  obtenerLogrosUsuario(usuarioId: string, espacioId: string): Promise<LogroDesbloqueado[]>;

  /**
   * Desbloquear un logro. Idempotente: si ya está desbloqueado (UNIQUE
   * violation 23505), retorna true sin error.
   */
  desbloquearLogro(usuarioId: string, espacioId: string, logroId: string): Promise<boolean>;

  /** Obtener items cosméticos disponibles. */
  obtenerItemsCosmeticos(): Promise<ItemCosmetico[]>;
}
