/**
 * @module domain/entities/espacio3d/ObjetoEspacio3D
 *
 * Entidad de dominio que representa un objeto persistente en el espacio 3D.
 * Clean Architecture: esta capa NO depende de Supabase, hooks ni frameworks.
 *
 * Fue migrada desde: hooks/space3d/useEspacioObjetos.ts
 * Motivo: EspacioObjeto es una entidad de negocio, no un detalle de hook.
 */

import type { InteraccionConfigObjeto3D } from '@/types/objetos3d';
import type { ConfiguracionGeometricaObjeto } from '@/src/core/domain/entities/objetosArquitectonicos';

// ─── Entidad Principal ────────────────────────────────────────────────────────

/**
 * Objeto persistente del espacio 3D (mueble, decoración, elemento interactivo).
 * Corresponde a una fila de la tabla `espacio_objetos` en Supabase.
 * Aquí vive la definición canónica: el hook useEspacioObjetos re-exporta este tipo.
 */
export interface ObjetoEspacio3D {
  id: string;
  espacio_id: string;
  catalogo_id?: string | null;
  modelo_url: string;
  tipo: string;
  nombre: string | null;
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_x: number;
  rotacion_y: number;
  rotacion_z: number;
  escala_x: number;
  escala_y: number;
  escala_z: number;
  empresa_id?: string | null;
  es_de_plantilla?: boolean;
  owner_id: string | null;
  plantilla_origen?: string | null;
  creado_en: string;
  actualizado_en: string;
  interactuable?: boolean;
  built_in_geometry?: string | null;
  built_in_color?: string | null;
  ancho?: number | string | null;
  alto?: number | string | null;
  profundidad?: number | string | null;
  es_sentable?: boolean;
  sit_offset_x?: number | string | null;
  sit_offset_y?: number | string | null;
  sit_offset_z?: number | string | null;
  sit_rotation_y?: number | string | null;
  es_interactuable?: boolean;
  interaccion_tipo?: string | null;
  interaccion_radio?: number | string | null;
  interaccion_emoji?: string | null;
  interaccion_label?: string | null;
  interaccion_config?: InteraccionConfigObjeto3D | null;
  configuracion_geometria?: ConfiguracionGeometricaObjeto | null;
  es_reclamable?: boolean;
  premium?: boolean;
  escala_normalizacion?: number | null;
  /**
   * Subconjunto del catálogo para acceso rápido en runtime.
   * Los campos de interacción y asiento son opcionales: el query Supabase
   * no siempre los selecciona. Usar `?? false` o `?? null` al consumirlos.
   */
  catalogo?: {
    ancho: number | string;
    alto: number | string;
    profundidad: number | string;
    es_sentable?: boolean;
    sit_offset_x?: number | string | null;
    sit_offset_y?: number | string | null;
    sit_offset_z?: number | string | null;
    sit_rotation_y?: number | string | null;
    es_interactuable?: boolean;
    interaccion_tipo?: string | null;
    interaccion_radio?: number | string | null;
    interaccion_emoji?: string | null;
    interaccion_label?: string | null;
    escala_normalizacion?: number | null;
  } | null;
}

// ─── Alias de compatibilidad ──────────────────────────────────────────────────

/**
 * @deprecated Usar ObjetoEspacio3D directamente.
 * Alias para facilitar la migración gradual desde el hook.
 */
export type EspacioObjetoDominio = ObjetoEspacio3D;
