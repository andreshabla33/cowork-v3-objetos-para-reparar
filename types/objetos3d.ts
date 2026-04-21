import type { ConfiguracionGeometricaObjeto } from '@/src/core/domain/entities/objetosArquitectonicos';

export type InteraccionSubTab3D = 'space' | 'tasks' | 'miembros' | 'settings' | 'builder' | 'chat' | 'avatar' | 'calendar' | 'grabaciones' | 'metricas';
export type InteraccionModal3D = 'avatar' | 'gamificacion';
export type InteraccionOverlay3D = 'chat' | 'emotes';
export type InteraccionNotificacionTipo3D = 'info' | 'mention' | 'entry';
export type InteraccionModoMovimiento3D = 'auto' | 'caminar' | 'teleport';

export interface InteraccionBaseConfig3D {
  subtab?: InteraccionSubTab3D | null;
  modal?: InteraccionModal3D | null;
  overlay?: InteraccionOverlay3D | null;
  notificacion_mensaje?: string | null;
  notificacion_tipo?: InteraccionNotificacionTipo3D | null;
}

export interface InteraccionTeleportConfig3D {
  x?: number | null;
  z?: number | null;
  offset_x?: number | null;
  offset_z?: number | null;
  modo?: InteraccionModoMovimiento3D | null;
}

export interface InteraccionDisplayConfig3D extends InteraccionBaseConfig3D {}

export interface InteraccionUseConfig3D extends InteraccionBaseConfig3D {
  xp_accion?: string | null;
  cooldown_ms?: number | null;
}

export interface InteraccionConfigObjeto3D {
  teleport?: InteraccionTeleportConfig3D | null;
  display?: InteraccionDisplayConfig3D | null;
  use?: InteraccionUseConfig3D | null;
}

export interface CatalogoObjeto3D {
  id: string;
  slug?: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  tipo: string;
  modelo_url: string | null;
  thumbnail_url: string | null;
  built_in_geometry: string | null;
  built_in_color: string | null;
  ancho: number | string;
  profundidad: number | string;
  alto: number | string;
  es_sentable: boolean;
  sit_offset_x?: number | string | null;
  sit_offset_y?: number | string | null;
  sit_offset_z?: number | string | null;
  sit_rotation_y?: number | string | null;
  es_interactuable: boolean;
  interaccion_tipo?: string | null;
  interaccion_radio?: number | string | null;
  interaccion_emoji?: string | null;
  interaccion_label?: string | null;
  interaccion_config?: InteraccionConfigObjeto3D | null;
  configuracion_geometria?: ConfiguracionGeometricaObjeto | null;
  es_reclamable?: boolean;
  premium: boolean;
  escala_normalizacion?: number | null;
  /**
   * Whitelist para placement stacking: si es true, el objeto acepta que
   * otros objetos se apilen encima (snap a su topY). Default en DB = false.
   * Ref migration: `catalogo_objetos_3d_add_es_superficie` (2026-04-21).
   */
  es_superficie?: boolean;
}

export interface ObjetoPreview3D extends CatalogoObjeto3D {
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_y: number;
}
