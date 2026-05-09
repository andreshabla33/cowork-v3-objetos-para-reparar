/**
 * @module infrastructure/adapters/terrenosMarketplace
 * @description Facade compat para el marketplace de terrenos.
 *
 * Tras el refactor 2026-05-09 (cierre deuda ITEM 6):
 *  - Tipos (EmpresaPublica, ObjetoEspacio) + constantes (TIER_CONFIG) viven
 *    en `@/core/domain/entities/terrenoMarketplace` (Domain).
 *  - Funciones supabase ahora son métodos del singleton
 *    `terrenoMarketplaceRepository` en `TerrenoMarketplaceSupabaseRepository`
 *    (implementa `ITerrenoMarketplaceRepository` port).
 *
 * Este archivo mantiene la API legada (8 funciones sueltas + tipos/const)
 * para no romper los 6 consumers existentes en
 * `components/marketplace/*` y `components/settings/sections/SettingsTerrenos.tsx`.
 */

import type { TerrenoMarketplace, ZonaEmpresa } from '@/types';
import type {
  EmpresaPublica,
  ObjetoEspacio,
} from '@/core/domain/entities/terrenoMarketplace';
import { terrenoMarketplaceRepository } from './TerrenoMarketplaceSupabaseRepository';

// ─── Re-exports Domain (constantes + tipos) ───────────────────────────────────

export { TIER_CONFIG } from '@/core/domain/entities/terrenoMarketplace';
export type {
  EmpresaPublica,
  ObjetoEspacio,
  TerrenoTier,
} from '@/core/domain/entities/terrenoMarketplace';

// ─── Funciones legadas (delegan al singleton repository) ──────────────────────

export const cargarTerrenosPublicos = (espacioId: string): Promise<TerrenoMarketplace[]> =>
  terrenoMarketplaceRepository.cargarTerrenosPublicos(espacioId);

export const cargarTodosTerrenos = (espacioId: string): Promise<TerrenoMarketplace[]> =>
  terrenoMarketplaceRepository.cargarTodosTerrenos(espacioId);

export const cargarZonasPublicas = (espacioId: string): Promise<ZonaEmpresa[]> =>
  terrenoMarketplaceRepository.cargarZonasPublicas(espacioId);

export const cargarEmpresasPublicas = (espacioId: string): Promise<EmpresaPublica[]> =>
  terrenoMarketplaceRepository.cargarEmpresasPublicas(espacioId);

export const cargarObjetosPublicos = (espacioId: string): Promise<ObjetoEspacio[]> =>
  terrenoMarketplaceRepository.cargarObjetosPublicos(espacioId);

export const guardarTerreno = (
  terreno: Partial<TerrenoMarketplace> & { espacio_id: string },
): Promise<TerrenoMarketplace | null> =>
  terrenoMarketplaceRepository.guardarTerreno(terreno);

export const eliminarTerreno = (id: string): Promise<boolean> =>
  terrenoMarketplaceRepository.eliminarTerreno(id);

export const reservarTerreno = (terrenoId: string, usuarioId: string): Promise<boolean> =>
  terrenoMarketplaceRepository.reservarTerreno(terrenoId, usuarioId);
