/**
 * @module domain/ports/IZonaEmpresaRepository
 * @description Port interface for empresa zone CRUD operations.
 *
 * Clean Architecture: Domain layer defines the contract; Infrastructure
 * implements it with Supabase. UI consumers (SettingsZona, AdminZoneHUD) and
 * other infrastructure adapters (InyectorPlantillaZonaAdapter, etc.) consume
 * via this port — never touch `supabase.from('zonas_empresa')` directly.
 */

import type { ZonaEmpresa } from '@/types';
import type { ConfiguracionZonaEmpresa } from '@/core/domain/entities/cerramientosZona';

export interface GuardarZonaInput {
  zonaId?: string | null;
  espacioId: string;
  empresaId?: string | null;
  esComun?: boolean;
  nombreZona?: string | null;
  posicionX: number;
  posicionY: number;
  ancho: number;
  alto: number;
  color?: string | null;
  estado?: string;
  usuarioId?: string | null;
  spawnX?: number;
  spawnY?: number;
  modeloUrl?: string | null;
  tipoSuelo?: string | null;
  configuracion?: ConfiguracionZonaEmpresa | null;
}

export interface ActualizarEstadoZonaInput {
  zonaId: string;
  estado: 'activa' | 'inactiva';
  usuarioId?: string | null;
  empresaId?: string | null;
  espacioId: string;
}

export interface EliminarZonaInput {
  zonaId: string;
  espacioId: string;
  usuarioId?: string | null;
  empresaId?: string | null;
}

export interface AplicarLayoutInput {
  espacioId: string;
  zonas: Array<{
    empresa_id: string | null;
    nombre_zona: string;
    posicion_x: number;
    posicion_y: number;
    ancho: number;
    alto: number;
    color: string;
    es_comun: boolean;
    spawn_x: number;
    spawn_y: number;
  }>;
  eliminarExistentes?: boolean;
  usuarioId?: string | null;
  algoritmo?: string;
}

export interface IZonaEmpresaRepository {
  /** Load all visible zones for a workspace (filtered: hides decorative subsoil and templated children). */
  cargarZonas(espacioId: string): Promise<ZonaEmpresa[]>;
  /** Load the current zone for a specific empresa within a workspace. */
  cargarZonaActual(espacioId: string, empresaId: string): Promise<ZonaEmpresa | null>;
  /** Toggle zone state (activa ↔ inactiva). Logs the action. */
  actualizarEstado(input: ActualizarEstadoZonaInput): Promise<boolean>;
  /** Hard-delete a zone with RLS-aware count check. Logs the action. */
  eliminar(input: EliminarZonaInput): Promise<boolean>;
  /** Upsert (create or update) a zone. Logs the action and returns the persisted row. */
  guardar(input: GuardarZonaInput): Promise<ZonaEmpresa | null>;
  /** Apply a bulk layout: optionally delete existing zones, then insert all new ones. */
  aplicarLayout(input: AplicarLayoutInput): Promise<boolean>;
}
