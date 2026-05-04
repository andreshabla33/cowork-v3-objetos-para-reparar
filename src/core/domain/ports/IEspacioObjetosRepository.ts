/**
 * @module domain/ports/IEspacioObjetosRepository
 *
 * Clean Architecture — Domain port para CRUD de `espacio_objetos`.
 *
 * Encapsula todas las operaciones de Supabase para objetos 3D persistentes
 * (creación, mutaciones, claim/release de escritorios, spawn personal del
 * usuario, suscripción realtime). El hook `useEspacioObjetos` delega aquí;
 * la capa de presentación no toca infraestructura directamente.
 */

import type { ObjetoEspacio3D as EspacioObjeto } from '@/src/core/domain/entities/espacio3d';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import type { ConfiguracionGeometricaObjeto } from '@/src/core/domain/entities/objetosArquitectonicos';

// ─── Tipos auxiliares (specific to this port) ────────────────────────────────

export interface SpawnPersonal {
  spawn_x: number | null;
  spawn_z: number | null;
}

/**
 * Subset del catálogo que se enriquece runtime sobre cada objeto. Re-usa la
 * definición canónica de `CatalogoObjeto3D` para mantener el contrato consistente.
 */
export type CatalogoObjeto3DRuntime = Pick<
  CatalogoObjeto3D,
  | 'id' | 'tipo' | 'modelo_url' | 'built_in_geometry' | 'built_in_color'
  | 'ancho' | 'alto' | 'profundidad'
  | 'es_sentable' | 'sit_offset_x' | 'sit_offset_y' | 'sit_offset_z' | 'sit_rotation_y'
  | 'es_interactuable' | 'interaccion_tipo' | 'interaccion_radio'
  | 'interaccion_emoji' | 'interaccion_label' | 'interaccion_config'
  | 'configuracion_geometria'
  | 'es_reclamable' | 'premium' | 'escala_normalizacion' | 'es_superficie'
> & {
  slug?: string | null;
};

/** Payload para crear un nuevo objeto desde el catálogo. */
export interface CrearObjetoInput {
  espacio_id: string;
  empresa_id: string | null;
  modelo_url: string;
  tipo: string;
  nombre: string | null;
  posicion_x: number;
  posicion_y: number;
  posicion_z: number;
  rotacion_x?: number;
  rotacion_y?: number;
  rotacion_z?: number;
  escala_x?: number;
  escala_y?: number;
  escala_z?: number;
  owner_id?: string | null;
  catalogo_id?: string | null;
  interactuable?: boolean;
  configuracion_geometria?: ConfiguracionGeometricaObjeto | null;
  escala_normalizacion?: number | null;
  es_de_plantilla?: boolean;
  plantilla_origen?: string | null;
}

/** Payload para reemplazar un objeto existente (mantiene posición + ids). */
export interface ReemplazarObjetoPayload {
  catalogo_id: string;
  modelo_url: string;
  tipo: string;
  nombre: string | null;
  interactuable: boolean;
  configuracion_geometria: ConfiguracionGeometricaObjeto | null;
  escala_normalizacion: number | null;
}

/** Payload para upsert / restaurar objeto completo. */
export interface UpsertObjetoPayload {
  id: string;
  espacio_id: string;
  catalogo_id: string | null;
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
  empresa_id: string | null;
  es_de_plantilla: boolean;
  owner_id: string | null;
  plantilla_origen: string | null;
  interactuable: boolean;
}

/** Cambios de transformación (subset de columnas pos/rot/escala). */
export type TransformacionObjetoPatch = Partial<Pick<
  EspacioObjeto,
  | 'posicion_x' | 'posicion_y' | 'posicion_z'
  | 'rotacion_x' | 'rotacion_y' | 'rotacion_z'
  | 'escala_x' | 'escala_y' | 'escala_z'
>>;

/** Handlers para eventos realtime de la tabla. */
export interface RealtimeObjetosHandlers {
  onInsert: (objeto: EspacioObjeto) => void;
  onUpdate: (objeto: EspacioObjeto) => void;
  onDelete: (objetoId: string) => void;
}

// ─── Port ────────────────────────────────────────────────────────────────────

export interface IEspacioObjetosRepository {
  /** Lee todos los objetos de un espacio. */
  listarPorEspacio(espacioId: string): Promise<EspacioObjeto[]>;

  /** Lee el catálogo runtime (subset de columnas necesarias para enriquecer). */
  obtenerCatalogoRuntime(): Promise<CatalogoObjeto3DRuntime[]>;

  /** Spawn personal del usuario en este espacio (o null si no tiene). */
  obtenerSpawnPersonal(espacioId: string, userId: string): Promise<SpawnPersonal | null>;

  /** Crea un objeto nuevo y devuelve la fila resultante. */
  crear(input: CrearObjetoInput): Promise<EspacioObjeto>;

  /** Reemplaza catalog_id + nombre/tipo/url manteniendo posición. */
  reemplazar(objetoId: string, payload: ReemplazarObjetoPayload): Promise<EspacioObjeto>;

  /** Actualiza solo transformación (pos/rot/escala). Idempotente. */
  actualizarTransformacion(objetoId: string, patch: TransformacionObjetoPatch): Promise<void>;

  /** Elimina un objeto. Devuelve void en éxito; throw en error real. */
  eliminar(objetoId: string): Promise<void>;

  /** Inserta múltiples objetos en una sola operación. */
  insertarBatch(entradas: CrearObjetoInput[]): Promise<EspacioObjeto[]>;

  /** Upsert por `id` (usado para restaurar tras delete optimista). */
  upsert(objeto: UpsertObjetoPayload): Promise<EspacioObjeto>;

  /**
   * Reclama un objeto (escritorio libre → asigna `owner_id = userId`).
   * Solo asigna si `owner_id IS NULL` (RLS-safe). Retorna las filas afectadas
   * (length=0 → ya estaba ocupado u otro error de RLS).
   */
  reclamar(objetoId: string, userId: string): Promise<EspacioObjeto[]>;

  /**
   * Libera el escritorio actual del usuario (si tiene uno y es distinto al
   * que está reclamando). Idempotente.
   */
  liberarEscritorioActualDelUsuario(userId: string, exceptObjetoId: string): Promise<void>;

  /**
   * Libera un objeto del usuario (`owner_id = null` con check de owner_id=userId).
   * Devuelve true si liberó al menos 1 fila.
   */
  liberar(objetoId: string, userId: string): Promise<boolean>;

  /** Guarda spawn point del usuario en `miembros_espacio`. */
  guardarSpawnPersonal(espacioId: string, userId: string, x: number, z: number): Promise<void>;

  /** Limpia spawn point del usuario (al liberar escritorio). */
  limpiarSpawnPersonal(espacioId: string, userId: string): Promise<void>;

  /**
   * Suscribe a cambios en `espacio_objetos` filtrados por espacio_id.
   * Retorna función de cleanup (unsubscribe).
   */
  suscribirCambios(espacioId: string, handlers: RealtimeObjetosHandlers): () => void;
}
