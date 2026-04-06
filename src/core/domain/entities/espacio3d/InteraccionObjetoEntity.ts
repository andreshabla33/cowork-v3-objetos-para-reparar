/**
 * @module domain/entities/espacio3d/InteraccionObjetoEntity
 *
 * Lógica de dominio para resolución de interacciones de objetos 3D.
 * Clean Architecture: capa de dominio — sin React, Three.js ni Supabase.
 *
 * Migrado desde: components/space3d/interaccionesObjetosRuntime.ts
 */

import type {
  InteraccionConfigObjeto3D,
  InteraccionSubTab3D,
  InteraccionModal3D,
  InteraccionOverlay3D,
  InteraccionModoMovimiento3D,
  InteraccionDisplayConfig3D,
  InteraccionUseConfig3D,
} from '@/types/objetos3d';
import type { ObjetoEspacio3D } from './ObjetoEspacio3D';

// ─── Value Objects ────────────────────────────────────────────────────────────

export interface DestinoTeleport3D {
  x: number;
  z: number;
  modo: InteraccionModoMovimiento3D;
}

export interface DisplayNormalizado3D {
  subtab?: InteraccionSubTab3D;
  modal?: InteraccionModal3D;
  overlay?: InteraccionOverlay3D;
  notificacionMensaje?: string;
  notificacionTipo?: 'info' | 'mention' | 'entry';
}

export interface UseNormalizado3D extends DisplayNormalizado3D {
  xpAccion?: string;
  cooldownMs?: number;
}

// ─── Sets de valores válidos ──────────────────────────────────────────────────

const SUBTABS_VALIDAS = new Set<InteraccionSubTab3D>([
  'space', 'tasks', 'miembros', 'settings', 'builder',
  'chat', 'avatar', 'calendar', 'grabaciones', 'metricas',
]);

const MODALES_VALIDOS = new Set<InteraccionModal3D>(['avatar', 'gamificacion']);
const OVERLAYS_VALIDOS = new Set<InteraccionOverlay3D>(['chat', 'emotes']);

// ─── Funciones de dominio puras ───────────────────────────────────────────────

/** Normaliza la configuración de interacción de un objeto (guard de tipo) */
export const normalizarInteraccionConfig = (
  valor: ObjetoEspacio3D['interaccion_config'],
): InteraccionConfigObjeto3D | null => {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor as InteraccionConfigObjeto3D;
};

/** Resuelve el destino de teleport de un objeto */
export const resolverDestinoTeleport = (
  objeto: ObjetoEspacio3D,
  config: InteraccionConfigObjeto3D | null,
): DestinoTeleport3D => {
  const teleport = config?.teleport;
  const xBase = Number.isFinite(Number(teleport?.x)) ? Number(teleport!.x) : objeto.posicion_x;
  const zBase = Number.isFinite(Number(teleport?.z)) ? Number(teleport!.z) : objeto.posicion_z;
  const offsetX = Number.isFinite(Number(teleport?.offset_x)) ? Number(teleport!.offset_x) : 0;
  const offsetZ = Number.isFinite(Number(teleport?.offset_z)) ? Number(teleport!.offset_z) : 0;

  return { x: xBase + offsetX, z: zBase + offsetZ, modo: teleport?.modo || 'auto' };
};

const normalizarBase = (
  config?: InteraccionDisplayConfig3D | InteraccionUseConfig3D | null,
): DisplayNormalizado3D => {
  const resultado: DisplayNormalizado3D = {};
  if (config?.subtab && SUBTABS_VALIDAS.has(config.subtab as InteraccionSubTab3D))
    resultado.subtab = config.subtab as InteraccionSubTab3D;
  if (config?.modal && MODALES_VALIDOS.has(config.modal as InteraccionModal3D))
    resultado.modal = config.modal as InteraccionModal3D;
  if (config?.overlay && OVERLAYS_VALIDOS.has(config.overlay as InteraccionOverlay3D))
    resultado.overlay = config.overlay as InteraccionOverlay3D;
  if (config?.notificacion_mensaje) resultado.notificacionMensaje = config.notificacion_mensaje;
  if (config?.notificacion_tipo === 'info' || config?.notificacion_tipo === 'mention' || config?.notificacion_tipo === 'entry')
    resultado.notificacionTipo = config.notificacion_tipo;
  return resultado;
};

/** Resuelve la configuración de display del objeto */
export const resolverDisplayObjeto = (config: InteraccionConfigObjeto3D | null): DisplayNormalizado3D =>
  normalizarBase(config?.display);

/** Resuelve la configuración de uso (acción) del objeto */
export const resolverUseObjeto = (config: InteraccionConfigObjeto3D | null): UseNormalizado3D => {
  const base = normalizarBase(config?.use);
  const cooldownMs = Number(config?.use?.cooldown_ms);
  return {
    ...base,
    xpAccion: config?.use?.xp_accion || undefined,
    cooldownMs: Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : undefined,
  };
};
