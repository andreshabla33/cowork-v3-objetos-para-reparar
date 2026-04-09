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
  OpaqueMaterialSubType,
  MergedGeometryGroup,
  MergeStats,
  WallObjectData,
  GeometryRef,
  CategorizedGeometry,
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
    //
    // FIX (2026-04-09 — Fase 6A): Opaque geometries are now sub-bucketed by
    // materialSubType (ladrillo, yeso, concreto, etc.) so that each sub-group
    // gets its own merged mesh with the correct procedural material.
    //
    // Previous bug: ALL opaque walls merged into 1 mesh with hardcoded 'yeso'
    // material, causing brick/concrete/wood walls to lose their textures.
    const glassBucket: GeometryRef[] = [];
    const metalBucket: GeometryRef[] = [];
    const opaqueSubBuckets = new Map<OpaqueMaterialSubType, GeometryRef[]>();

    let processedCount = 0;
    let skippedCount = 0;

    for (const obj of objetos) {
      const geos: CategorizedGeometry[] = this.geometryService.generarGeometriasObjeto(obj);
      if (geos.length === 0) {
        skippedCount++;
        continue;
      }
      for (const { geometry, category, materialSubType } of geos) {
        if (category === 'glass') {
          glassBucket.push(geometry);
        } else if (category === 'metal') {
          metalBucket.push(geometry);
        } else {
          // Opaque: sub-bucket by materialSubType (defaults to 'yeso')
          const subType = materialSubType ?? 'yeso';
          let bucket = opaqueSubBuckets.get(subType);
          if (!bucket) {
            bucket = [];
            opaqueSubBuckets.set(subType, bucket);
          }
          bucket.push(geometry);
        }
      }
      processedCount++;
    }

    // ── Merge each bucket ──
    //
    // Fase 6A: Opaque sub-buckets are merged per materialSubType.
    // Each sub-group produces 1 draw call with its own procedural material.
    // Typical count: 1-3 sub-types (yeso + ladrillo + concreto).
    //
    // Glass geometries are NOT merged (Fase 5C):
    //   - WebGPU requires individual meshes for correct BLEND pipeline
    //   - Transparent objects need per-object depth sorting
    //
    // Ref: Three.js GitHub #19164 — mergeBufferGeometries ignores existing groups
    // Ref: Three.js GitHub #31768 — WebGPU transmission/transparent rendering
    const results: MergedGeometryGroup[] = [];

    // Merge opaque sub-buckets — one merged mesh per material type
    let totalOpaqueGeos = 0;
    for (const [subType, bucket] of opaqueSubBuckets) {
      if (bucket.length === 0) continue;
      totalOpaqueGeos += bucket.length;

      if (process.env.NODE_ENV !== 'production') {
        this._verificarCompatibilidadAtributos('opaque', bucket);
      }

      const merged = this.geometryService.mergearGeometrias(bucket);
      if (merged) {
        results.push({ geometry: merged, category: 'opaque', materialSubType: subType });
      } else {
        log.warn(`mergeBufferGeometries() returned null for opaque:${subType}`, {
          geometryCount: bucket.length,
        });
      }

      for (const g of bucket) {
        this.geometryService.disposeGeometry(g);
      }
    }

    // Merge metal bucket (single material, no sub-types needed)
    if (metalBucket.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        this._verificarCompatibilidadAtributos('metal', metalBucket);
      }

      const merged = this.geometryService.mergearGeometrias(metalBucket);
      if (merged) {
        results.push({ geometry: merged, category: 'metal' });
      } else {
        log.warn('mergeBufferGeometries() returned null for metal', {
          geometryCount: metalBucket.length,
        });
      }

      for (const g of metalBucket) {
        this.geometryService.disposeGeometry(g);
      }
    }

    // Glass: individual geometries WITHOUT merging (transparency exception)
    for (const g of glassBucket) {
      results.push({ geometry: g, category: 'glass' });
    }

    const stats: MergeStats = {
      inputObjects: objetos.length,
      processed: processedCount,
      skipped: skippedCount,
      mergedGroups: results.length,
      categories: results.map((r) => r.category),
      bucketSizes: {
        opaque: totalOpaqueGeos,
        glass: glassBucket.length,
        metal: metalBucket.length,
      },
    };

    log.info('Builtin walls merged', stats as unknown as Record<string, unknown>);

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
