/**
 * @module domain/entities/espacio3d/enriquecimientoCatalogo
 *
 * Lógica de dominio puro para enriquecer una entidad `ObjetoEspacio3D` con
 * los metadatos del catálogo (`CatalogoObjeto3DRuntime`).
 *
 * Clean Architecture: Domain layer — sin React, Three.js, Rapier ni Supabase.
 * Antes vivía dentro de `hooks/space3d/useEspacioObjetos.ts` (anti-pattern:
 * lógica de dominio en presentation). Extracción 2026-05-04.
 *
 * Estrategia de matching (en orden de prioridad):
 *   1. catalogo_id directo (PK del catálogo)
 *   2. modelo_url normalizado (lowercase + trim)
 *   3. slug heredado de plantilla de zona (meta_plantilla_zona)
 *   4. tipo del objeto (string del catálogo)
 *
 * Si no hay match, devuelve el objeto solo con la URL resuelta — el resto
 * de campos se mantiene como vino de la DB.
 */

import type { ObjetoEspacio3D } from './index';
import type { CatalogoObjeto3DRuntime } from '@/src/core/domain/ports/IEspacioObjetosRepository';
import { obtenerPlantillaZona } from '../plantillasEspacio';
import { ResolverModeloUrlObjetoUseCase } from '@/src/core/application/usecases/ResolverModeloUrlObjetoUseCase';

// ─── Indexación del catálogo ─────────────────────────────────────────────────

export interface IndiceCatalogo {
  porId: Map<string, CatalogoObjeto3DRuntime>;
  porSlug: Map<string, CatalogoObjeto3DRuntime>;
  porModelo: Map<string, CatalogoObjeto3DRuntime>;
  porTipo: Map<string, CatalogoObjeto3DRuntime>;
}

const normalizarClave = (valor?: string | null): string =>
  (valor || '').trim().toLowerCase();

/**
 * Construye 4 índices de lookup sobre el catálogo runtime para enriquecimiento
 * O(1). Los índices se cachean en el caller (ref) y se rehacen al recibir
 * un nuevo catálogo.
 */
export function crearIndiceCatalogo(
  catalogo: CatalogoObjeto3DRuntime[],
): IndiceCatalogo {
  const porId = new Map<string, CatalogoObjeto3DRuntime>();
  const porSlug = new Map<string, CatalogoObjeto3DRuntime>();
  const porModelo = new Map<string, CatalogoObjeto3DRuntime>();
  const porTipo = new Map<string, CatalogoObjeto3DRuntime>();

  for (const item of catalogo) {
    if (item.id && !porId.has(item.id)) {
      porId.set(item.id, item);
    }

    const claveModelo = normalizarClave(item.modelo_url);
    if (claveModelo && !porModelo.has(claveModelo)) {
      porModelo.set(claveModelo, item);
    }

    const claveSlug = typeof item.slug === 'string' ? item.slug.trim().toLowerCase() : '';
    if (claveSlug && !porSlug.has(claveSlug)) {
      porSlug.set(claveSlug, item);
    }

    const claveTipo = normalizarClave(item.tipo);
    if (claveTipo && !porTipo.has(claveTipo)) {
      porTipo.set(claveTipo, item);
    }
  }

  return { porId, porSlug, porModelo, porTipo };
}

/**
 * Resuelve el slug del catálogo cuando un objeto vino de una plantilla.
 * Mira primero el slug directo en `meta_plantilla_zona.slug_catalogo`;
 * si no, deriva del binomio `(plantilla_id, clave_instancia)`.
 */
export function resolverSlugCatalogoPlantilla(objeto: ObjetoEspacio3D): string {
  const configGeometria = objeto.configuracion_geometria as Record<string, unknown> | null;
  const metaPlantilla = configGeometria?.meta_plantilla_zona as
    | { slug_catalogo?: string; plantilla_id?: string; clave_instancia?: string }
    | undefined;

  const slugDirecto = typeof metaPlantilla?.slug_catalogo === 'string'
    ? metaPlantilla.slug_catalogo.trim().toLowerCase()
    : '';
  if (slugDirecto) return slugDirecto;

  const plantillaId = typeof metaPlantilla?.plantilla_id === 'string'
    ? metaPlantilla.plantilla_id
    : null;
  const claveInstancia = typeof metaPlantilla?.clave_instancia === 'string'
    ? metaPlantilla.clave_instancia
    : null;
  if (!plantillaId || !claveInstancia) return '';

  const plantilla = obtenerPlantillaZona(plantillaId);
  const definicion = plantilla?.objetos.find((item) => item.clave === claveInstancia);
  return (definicion?.slug_catalogo || '').trim().toLowerCase();
}

// ─── Enriquecimiento ─────────────────────────────────────────────────────────

/**
 * Aplica los metadatos del catálogo sobre el objeto persistido. Resuelve
 * `modelo_url` con la regla de negocio (DEBT-001 — el catálogo prioriza sobre
 * la instancia cuando hay catalogo_id válido).
 *
 * Idempotente: si no encuentra metadata, devuelve el objeto con la URL
 * eventualmente sintetizada por el use case (no muta resto de campos).
 */
export function enriquecerObjetoEspacio(
  objeto: ObjetoEspacio3D,
  indiceCatalogo: IndiceCatalogo,
): ObjetoEspacio3D {
  const metadataPorId = objeto.catalogo_id ? indiceCatalogo.porId.get(objeto.catalogo_id) : undefined;
  const claveModelo = normalizarClave(objeto.modelo_url);
  const claveSlugPlantilla = resolverSlugCatalogoPlantilla(objeto);
  const claveTipo = normalizarClave(objeto.tipo);

  const metadata =
    metadataPorId
    || (claveModelo ? indiceCatalogo.porModelo.get(claveModelo) : undefined)
    || (claveSlugPlantilla ? indiceCatalogo.porSlug.get(claveSlugPlantilla) : undefined)
    || (claveTipo ? indiceCatalogo.porTipo.get(claveTipo) : undefined);

  // DEBT-001 (2026-04-10) — la resolución de modelo_url es regla de negocio.
  // El use case prioriza el catálogo sobre la instancia cuando hay catalogo_id
  // válido, evitando drift tras un swap del asset (p. ej. premerge GLB).
  const resolucionUrl = ResolverModeloUrlObjetoUseCase.resolver(
    { modelo_url: objeto.modelo_url, catalogo_id: objeto.catalogo_id ?? null },
    metadata
      ? {
          id: metadata.id,
          modelo_url: metadata.modelo_url,
          built_in_geometry: metadata.built_in_geometry,
          built_in_color: metadata.built_in_color,
        }
      : null,
  );

  if (!metadata) {
    return resolucionUrl.modeloUrl !== objeto.modelo_url
      ? { ...objeto, modelo_url: resolucionUrl.modeloUrl }
      : objeto;
  }

  const escalaInstancia = Number(objeto.escala_normalizacion);
  const escalaMeta = Number(metadata.escala_normalizacion ?? 1);
  const usarEscalaMeta = Number.isFinite(escalaMeta)
    && escalaMeta > 0
    && (!Number.isFinite(escalaInstancia) || escalaInstancia <= 0);

  return {
    ...objeto,
    modelo_url: resolucionUrl.modeloUrl,
    built_in_geometry: metadata.built_in_geometry,
    built_in_color: metadata.built_in_color,
    ancho: metadata.ancho,
    alto: metadata.alto,
    profundidad: metadata.profundidad,
    es_sentable: metadata.es_sentable,
    sit_offset_x: metadata.sit_offset_x,
    sit_offset_y: metadata.sit_offset_y,
    sit_offset_z: metadata.sit_offset_z,
    sit_rotation_y: metadata.sit_rotation_y,
    interactuable: objeto.interactuable ?? metadata.es_interactuable,
    es_interactuable: objeto.interactuable ?? metadata.es_interactuable,
    interaccion_tipo: metadata.interaccion_tipo,
    interaccion_radio: metadata.interaccion_radio,
    interaccion_emoji: metadata.interaccion_emoji,
    interaccion_label: metadata.interaccion_label,
    interaccion_config: metadata.interaccion_config,
    configuracion_geometria: objeto.configuracion_geometria ?? metadata.configuracion_geometria ?? null,
    es_reclamable: metadata.es_reclamable,
    premium: metadata.premium,
    escala_normalizacion: usarEscalaMeta
      ? escalaMeta
      : (Number.isFinite(escalaInstancia) && escalaInstancia > 0
        ? escalaInstancia
        : (metadata.escala_normalizacion ?? 1)),
    catalogo: {
      ancho: Number(metadata.ancho) || 1,
      alto: Number(metadata.alto) || 1,
      profundidad: Number(metadata.profundidad) || 1,
      escala_normalizacion: metadata.escala_normalizacion ?? 1,
      es_superficie: Boolean(metadata.es_superficie),
    },
  };
}
