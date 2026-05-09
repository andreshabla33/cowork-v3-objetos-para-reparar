/**
 * @module domain/ports/ITerrenoMarketplaceRepository
 * @description Port para operaciones del marketplace de terrenos virtuales.
 *
 * Clean Architecture: Domain define el contrato; Infrastructure (Supabase)
 * provee la implementación concreta.
 *
 * Tablas: `terrenos_marketplace` (lectura pública / escritura admin),
 * `zonas_empresa`, `empresas`, `miembros_espacio`, `espacio_objetos`.
 */

import type { TerrenoMarketplace, ZonaEmpresa } from '@/types';
import type { EmpresaPublica, ObjetoEspacio } from '@/core/domain/entities/terrenoMarketplace';

export interface ITerrenoMarketplaceRepository {
  /**
   * Cargar terrenos públicos disponibles + reservados para un espacio.
   * Ordenados por destacado DESC, luego por orden_visual.
   */
  cargarTerrenosPublicos(espacioId: string): Promise<TerrenoMarketplace[]>;

  /** Cargar todos los terrenos (incluyendo no-públicos) — admin. */
  cargarTodosTerrenos(espacioId: string): Promise<TerrenoMarketplace[]>;

  /** Cargar zonas activas con datos básicos de empresa joined. */
  cargarZonasPublicas(espacioId: string): Promise<ZonaEmpresa[]>;

  /**
   * Cargar empresas del espacio + count de miembros agregado.
   * El count se calcula en JS (1 query empresas + 1 query miembros).
   */
  cargarEmpresasPublicas(espacioId: string): Promise<EmpresaPublica[]>;

  /** Cargar objetos del espacio con datos de transformación 3D. */
  cargarObjetosPublicos(espacioId: string): Promise<ObjetoEspacio[]>;

  /**
   * Upsert un terreno (insert si no existe, update si existe).
   * Auto-stamps `updated_at`. Retorna el terreno final, o null en error.
   */
  guardarTerreno(
    terreno: Partial<TerrenoMarketplace> & { espacio_id: string },
  ): Promise<TerrenoMarketplace | null>;

  /** Eliminar un terreno por ID. */
  eliminarTerreno(id: string): Promise<boolean>;

  /**
   * Reservar un terreno disponible para un usuario.
   * Reserva válida por 48h (auto-expires server-side).
   * Idempotente vía `.eq('estado', 'disponible')`: si otro usuario lo
   * reservó primero, esta call no afecta filas (retorna true sin error).
   */
  reservarTerreno(terrenoId: string, usuarioId: string): Promise<boolean>;
}
