/**
 * @module core/application/usecases/GenerarGeometriasMergeadasBuiltinUseCase
 * @description Application Use Case for generating merged builtin wall geometries.
 *
 * Clean Architecture: Application layer — orchestrates domain entities and
 * infrastructure adapters to produce merged geometry groups ready for rendering.
 *
 * Responsibilities:
 *   1. Compute a fingerprint from wall object data (memoization key)
 *   2. Delegate geometry generation to IBuiltinWallGeometryService
 *   3. Bucket geometries by material category (opaque/glass/metal)
 *   4. Validate attribute compatibility before merge (dev mode)
 *   5. Merge each bucket into a single geometry
 *   6. Manage module-level cache for React Strict Mode resilience
 *
 * Ref: Three.js r182 — BufferGeometryUtils.mergeGeometries
 */

import { logger } from '@/lib/logger';
import type {
  IBuiltinWallGeometryService,
  MaterialCategory,
  MergedGeometryGroup,
  MergeStats,
  WallObjectData,
  GeometryRef,
} from '@/src/core/domain/ports/IBuiltinWallGeometryService';

const log = logger.child('GenerarGeometriasMergeadasBuiltinUseCase');

// ─── Module-level cache ─────────────────────────────────────────────────────
// Survives React Strict Mode double-mount in development.
// In production, protects against unnecessary re-computation.

let _moduleCacheFingerprint = '';
let _moduleCacheResult: MergedGeometryGroup[] | null = null;

/**
 * Genera un fingerprint estable basado en IDs y propiedades geométricas.
 *
 * Incluye built_in_geometry + built_in_color + dimensiones + configuracion_geometria
 * para que cualquier cambio geométrico invalide el cache.
 */
export const computarFingerprint = (objetos: WallObjectData[]): string => {
  if (objetos.length === 0) return '';
  const parts = objetos
    .map((o) => {
      const configHash = o.configuracion_geometria
        ? JSON.stringify(o.configuracion_geometria)
        : '';
      return `${o.id}|${o.built_in_geometry ?? ''}|${o.built_in_color ?? ''}|${o.ancho ?? 0}|${o.alto ?? 0}|${o.profundidad ?? 0}|${configHash}`;
    })
    .sort();
  return `${parts.length}:${parts.join(',')}`;
};

// ─── Use Case ───────────────────────────────────────────────────────────────

export interface ResultadoMerge {
  merged: MergedGeometryGroup[] | null;
  stats: MergeStats | null;
}

export class GenerarGeometriasMergeadasBuiltinUseCase {
  constructor(
    private readonly geometryService: IBuiltinWallGeometryService,
  ) {}

  /**
   * Execute the merge pipeline for an array of builtin wall objects.
   *
   * @param objetos  Wall objects to process
   * @returns        Merged geometry groups by material category, or null if empty
   */
  ejecutar(objetos: WallObjectData[]): ResultadoMerge {
    const newFingerprint = computarFingerprint(objetos);

    // Cache hit — return existing result
    if (
      newFingerprint === _moduleCacheFingerprint &&
      _moduleCacheResult !== null
    ) {
      return { merged: _moduleCacheResult, stats: null };
    }

    // Dispose previous cached geometries
    if (_moduleCacheResult) {
      for (const m of _moduleCacheResult) {
        this.geometryService.disposeGeometry(m.geometry);
      }
      _moduleCacheResult = null;
    }

    _moduleCacheFingerprint = newFingerprint;

    if (objetos.length === 0) {
      _moduleCacheResult = null;
      return { merged: null, stats: null };
    }

    // ── Bucket geometries by material category ──
    const buckets: Record<MaterialCategory, GeometryRef[]> = {
      opaque: [],
      glass: [],
      metal: [],
    };

    let processedCount = 0;
    let skippedCount = 0;

    for (const obj of objetos) {
      const geos = this.geometryService.generarGeometriasObjeto(obj);
      if (geos.length === 0) {
        skippedCount++;
        continue;
      }
      for (const { geometry, category } of geos) {
        buckets[category].push(geometry);
      }
      processedCount++;
    }

    // ── Merge each bucket ──
    //
    // CRITICAL (2026-04-09 — Fase 5C): Glass geometries are NOT merged.
    //
    // Root cause: In WebGPU, merging transparent geometries into a single mesh
    // prevents correct alpha blending. The WebGPU pipeline compiles blend state
    // per-pipeline, and merged transparent geometry can't be individually depth-sorted.
    //
    // Additionally, alphaTest > 0 on a merged transparent mesh forces the WebGPU
    // renderer to use ALPHA_MASK pipeline (binary discard) instead of BLEND pipeline
    // (alpha blending), making glass appear fully opaque.
    //
    // Fix: Keep glass geometries as individual MergedGeometryGroup entries.
    // With ~6 glass panes, the performance impact is negligible (6 draw calls vs 1).
    //
    // Industry standard: Transparent objects should NOT be batched; they need
    // per-object depth sorting for correct blending order.
    //
    // Ref: Three.js GitHub #19164 — mergeBufferGeometries ignores existing groups
    // Ref: Three.js GitHub #31768 — WebGPU transmission/transparent incorrect rendering
    // Ref: Three.js docs — Object3D.renderOrder for transparent sorting
    const results: MergedGeometryGroup[] = [];
    const mergeableCategories: MaterialCategory[] = ['opaque', 'metal'];

    // Merge opaque and metal buckets (fully opaque, no depth-sort issues)
    for (const cat of mergeableCategories) {
      if (buckets[cat].length === 0) continue;

      // Dev mode: verify attribute compatibility before merge
      if (process.env.NODE_ENV !== 'production') {
        this._verificarCompatibilidadAtributos(cat, buckets[cat]);
      }

      const merged = this.geometryService.mergearGeometrias(buckets[cat]);
      if (merged) {
        results.push({ geometry: merged, category: cat });
      } else {
        log.warn(
          `mergeBufferGeometries() returned null for category "${cat}"`,
          {
            geometryCount: buckets[cat].length,
            hint: 'Incompatible attributes survived normalization',
          },
        );
      }

      // Dispose source geometries — merge copies data
      for (const g of buckets[cat]) {
        this.geometryService.disposeGeometry(g);
      }
    }

    // Glass: push individual geometries WITHOUT merging (transparency exception)
    for (const g of buckets.glass) {
      results.push({ geometry: g, category: 'glass' });
    }

    const stats: MergeStats = {
      inputObjects: objetos.length,
      processed: processedCount,
      skipped: skippedCount,
      mergedGroups: results.length,
      categories: results.map((r) => r.category),
      bucketSizes: {
        opaque: buckets.opaque.length,
        glass: buckets.glass.length,
        metal: buckets.metal.length,
      },
    };

    log.info('Builtin walls merged', stats);

    _moduleCacheResult = results;
    return { merged: results, stats };
  }

  /**
   * Invalidate the module cache and dispose cached geometries.
   * Call on component unmount.
   */
  invalidarCache(): void {
    if (_moduleCacheResult) {
      for (const m of _moduleCacheResult) {
        this.geometryService.disposeGeometry(m.geometry);
      }
    }
    _moduleCacheFingerprint = '';
    _moduleCacheResult = null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _verificarCompatibilidadAtributos(
    cat: MaterialCategory,
    geometries: GeometryRef[],
  ): void {
    const geos = geometries as Array<{ attributes: Record<string, unknown> }>;
    if (geos.length < 2) return;
    const attrs0 = Object.keys(geos[0].attributes).sort().join(',');
    const incompatible = geos.filter(
      (g, i) =>
        i > 0 && Object.keys(g.attributes).sort().join(',') !== attrs0,
    );
    if (incompatible.length > 0) {
      log.warn(`[${cat}] Attribute mismatch detected BEFORE merge`, {
        expected: attrs0,
        mismatched: incompatible.length,
        total: geos.length,
      });
    }
  }
}
