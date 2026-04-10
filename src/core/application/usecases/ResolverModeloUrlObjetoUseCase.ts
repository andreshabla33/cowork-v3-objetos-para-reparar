/**
 * @module application/usecases/ResolverModeloUrlObjetoUseCase
 *
 * Use case puro que resuelve la URL del modelo 3D a cargar para una instancia
 * de `ObjetoEspacio3D`. Encapsula la regla de negocio contra drift entre
 * `espacio_objetos.modelo_url` (denormalizado) y `catalogo_objetos_3d.modelo_url`.
 *
 * ## Problema resuelto (DEBT-001, 2026-04-10)
 *
 * Históricamente el hook `useEspacioObjetos` preferiá `objeto.modelo_url` sobre
 * la URL del catálogo. Esto provocaba que un UPDATE al catálogo (p. ej. swap de
 * `Keyboard.glb` → `Keyboard.merged.glb` tras el premerge de BUG-3) no se
 * reflejara nunca en runtime — las 21 instancias seguían apuntando a la URL
 * vieja guardada en cada fila. Los clientes del runtime (BatchedMesh,
 * StaticObjectBatcher) cargaban el asset sin fusionar.
 *
 * ## Regla de resolución (orden de precedencia)
 *
 *   1. Si la instancia tiene `catalogo_id` válido Y el catálogo indexado
 *      contiene ese id con `modelo_url` no vacío → **gana el catálogo**.
 *   2. Si la instancia ya tiene `modelo_url` no-builtin → se respeta (legacy).
 *   3. Si el catálogo tiene `built_in_geometry` → se construye una URL builtin.
 *   4. Fallback absoluto: `'builtin:cubo:6366f1'`.
 *
 * La URL que empieza con `'builtin:'` NUNCA se sobreescribe por una URL real:
 * los builtins son primitivas procedurales y no deben convertirse en GLBs.
 *
 * ## Clean Architecture
 *
 * - **Domain**: solo depende de `ObjetoEspacio3D` (entidad pura).
 * - **Application**: este archivo. Función pura, estática, determinística.
 * - **Infrastructure**: el hook `useEspacioObjetos` invoca este use case tras
 *   cargar el catálogo desde Supabase. No hay acoplamiento inverso.
 *
 * ## Referencias oficiales
 *
 * - Clean Architecture (Uncle Bob) · Use Case layer como "application-specific
 *   business rules" sin framework coupling.
 * - Supabase PostgREST views · la VIEW `v_espacio_objetos_resuelto` aplica la
 *   misma regla en DB. Este use case es el espejo en la capa cliente, útil
 *   cuando el cliente aún consulta la tabla base (backward compat).
 */

import type { ObjetoEspacio3D } from '@/src/core/domain/entities/espacio3d/ObjetoEspacio3D';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Subconjunto mínimo del catálogo necesario para resolver una URL.
 * Se mantiene intencionalmente pequeño para que el use case no dependa
 * de la forma completa de `CatalogoObjeto3D`.
 */
export interface CatalogoModeloInfo {
  readonly id: string;
  readonly modelo_url?: string | null;
  readonly built_in_geometry?: string | null;
  readonly built_in_color?: string | null;
}

export interface ResolucionModeloUrl {
  /** URL final a cargar (nunca vacía). */
  readonly modeloUrl: string;
  /** De dónde salió la URL, útil para logging y tests. */
  readonly fuente: 'catalogo' | 'instancia' | 'builtin_from_catalogo' | 'builtin_fallback';
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const BUILTIN_PREFIX = 'builtin:';
const BUILTIN_FALLBACK: ResolucionModeloUrl = Object.freeze({
  modeloUrl: 'builtin:cubo:6366f1',
  fuente: 'builtin_fallback',
});

// ─── Helpers puros ───────────────────────────────────────────────────────────

const esBuiltin = (url: string | null | undefined): boolean =>
  typeof url === 'string' && url.startsWith(BUILTIN_PREFIX);

const normalizar = (url: string | null | undefined): string =>
  typeof url === 'string' ? url.trim() : '';

const construirBuiltinDesdeCatalogo = (
  catalogo: CatalogoModeloInfo,
): string | null => {
  if (!catalogo.built_in_geometry) return null;
  const color = (catalogo.built_in_color ?? '#6366f1').replace('#', '') || '6366f1';
  return `${BUILTIN_PREFIX}${catalogo.built_in_geometry}:${color}`;
};

// ─── Use Case ────────────────────────────────────────────────────────────────

export const ResolverModeloUrlObjetoUseCase = {
  /**
   * Resuelve la URL del modelo 3D para una instancia concreta.
   *
   * @param objeto  Instancia leída de `espacio_objetos` (o en memoria).
   * @param catalogo Entrada del catálogo indexada por `id`, o `null` si
   *                 no se encuentra (builtin o legacy sin catalogo_id).
   */
  resolver(
    objeto: Pick<ObjetoEspacio3D, 'modelo_url' | 'catalogo_id'>,
    catalogo: CatalogoModeloInfo | null,
  ): ResolucionModeloUrl {
    const urlInstancia = normalizar(objeto.modelo_url);
    const instanciaEsBuiltin = esBuiltin(urlInstancia);

    // Caso builtin: la instancia manda SIEMPRE, no se sobreescribe con GLB real.
    if (instanciaEsBuiltin) {
      return { modeloUrl: urlInstancia, fuente: 'instancia' };
    }

    // Caso preferente: catálogo con URL real y catalogo_id válido.
    if (catalogo && objeto.catalogo_id) {
      const urlCatalogo = normalizar(catalogo.modelo_url);
      if (urlCatalogo && !esBuiltin(urlCatalogo)) {
        return { modeloUrl: urlCatalogo, fuente: 'catalogo' };
      }
    }

    // Si no hay catálogo útil, respetar URL de la instancia (legacy).
    if (urlInstancia) {
      return { modeloUrl: urlInstancia, fuente: 'instancia' };
    }

    // Si el catálogo solo tiene builtin, construirlo.
    if (catalogo) {
      const builtin = construirBuiltinDesdeCatalogo(catalogo);
      if (builtin) {
        return { modeloUrl: builtin, fuente: 'builtin_from_catalogo' };
      }
    }

    // Fallback absoluto: cubo gris.
    return BUILTIN_FALLBACK;
  },
} as const;

export type ResolverModeloUrlObjetoUseCaseType = typeof ResolverModeloUrlObjetoUseCase;
