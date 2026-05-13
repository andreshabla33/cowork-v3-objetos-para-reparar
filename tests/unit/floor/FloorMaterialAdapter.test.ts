/**
 * Tests del FloorMaterialAdapter — fábrica GPU-procedural de materiales
 * de suelo. Valida cache, sharing de program GPU vía customProgramCacheKey,
 * y dispose.
 *
 * Ref: src/core/infrastructure/r3f/rendering/floor/FloorMaterialAdapter.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FloorType } from '../../../src/core/domain/entities';
import {
  FloorMaterialAdapter,
  resetFloorMaterialAdapter,
} from '../../../src/core/infrastructure/r3f/rendering/floor/FloorMaterialAdapter';
import { FLOOR_SPECS } from '../../../src/core/infrastructure/r3f/rendering/floor/floorMaterialSpecs';

let adapter: FloorMaterialAdapter;

beforeEach(() => {
  resetFloorMaterialAdapter();
  adapter = new FloorMaterialAdapter();
});

afterEach(() => {
  adapter.dispose();
});

describe('FloorMaterialAdapter — cache por FloorType', () => {
  it('devuelve la misma instancia al llamar 2 veces con el mismo tipo', () => {
    const a = adapter.obtenerMaterial(FloorType.WOOD_OAK);
    const b = adapter.obtenerMaterial(FloorType.WOOD_OAK);
    expect(a.id).toBe(b.id);
    expect(FloorMaterialAdapter.resolverMaterial(a)).toBe(
      FloorMaterialAdapter.resolverMaterial(b),
    );
  });

  it('devuelve instancias distintas para tipos distintos', () => {
    const a = adapter.obtenerMaterial(FloorType.WOOD_OAK);
    const b = adapter.obtenerMaterial(FloorType.MARBLE_BLACK);
    expect(a.id).not.toBe(b.id);
  });

  it('expone floorType en MaterialAbstracto', () => {
    const m = adapter.obtenerMaterial(FloorType.WOOD_CHEVRON_BURGUNDY);
    expect(m.floorType).toBe(FloorType.WOOD_CHEVRON_BURGUNDY);
  });
});

describe('FloorMaterialAdapter — sharing de GL program', () => {
  it('FloorTypes con misma familia+variant comparten customProgramCacheKey', () => {
    const oak = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_OAK),
    );
    const green = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_PLANKS_GREEN),
    );

    expect(oak.customProgramCacheKey).toBeDefined();
    expect(green.customProgramCacheKey).toBeDefined();
    // Ambos son PLANKS variant=0 → misma cache key
    expect(oak.customProgramCacheKey!()).toBe(green.customProgramCacheKey!());
  });

  it('FloorTypes con familias distintas tienen cache key distinta', () => {
    const planks = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_OAK),
    );
    const marble = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.MARBLE_WHITE),
    );
    expect(planks.customProgramCacheKey!()).not.toBe(marble.customProgramCacheKey!());
  });

  it('TILE_WHITE (variant=1) y WOOD_OAK (variant=0) comparten pattern pero NO key', () => {
    const oak = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_OAK),
    );
    const tile = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.TILE_WHITE),
    );
    expect(oak.customProgramCacheKey!()).not.toBe(tile.customProgramCacheKey!());
  });
});

describe('FloorMaterialAdapter — PBR config aplicada', () => {
  it('roughness y metalness del spec se reflejan en el material', () => {
    const m = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.MARBLE_BLACK),
    );
    const spec = FLOOR_SPECS[FloorType.MARBLE_BLACK];
    expect(m.roughness).toBeCloseTo(spec.roughness);
    expect(m.metalness).toBeCloseTo(spec.metalness);
  });

  it('METAL_GRID tiene emissive configurado', () => {
    const m = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.METAL_GRID),
    );
    expect(m.emissive.r + m.emissive.g + m.emissive.b).toBeGreaterThan(0);
    expect(m.emissiveIntensity).toBeGreaterThan(0);
  });
});

describe('FloorMaterialAdapter — defines y uniforms', () => {
  it('inyecta defines FLOOR_PATTERN_X según spec', () => {
    const m = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_CHEVRON_BURGUNDY),
    );
    expect(m.defines).toBeDefined();
    expect(Object.keys(m.defines!).some((k) => k === 'FLOOR_PATTERN_CHEVRON')).toBe(true);
  });

  it('uniforms uPalette/uTileSize/uVariant están registrados en userData', () => {
    const m = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.STONE_PATH_GARDEN),
    );
    expect(m.userData.floorUniforms.uPalette.value).toHaveLength(4);
    expect(m.userData.floorUniforms.uPalette.value[0]).toBeInstanceOf(THREE.Color);
    expect(m.userData.floorUniforms.uTileSize.value).toBeInstanceOf(THREE.Vector2);
    expect(m.userData.floorUniforms.uVariant.value).toBe(1);
  });
});

describe('FloorMaterialAdapter — swatch + precarga + dispose', () => {
  it('obtenerColorSwatch devuelve el hex del spec', () => {
    expect(adapter.obtenerColorSwatch(FloorType.WOOD_OAK)).toBe(
      FLOOR_SPECS[FloorType.WOOD_OAK].swatchColor,
    );
  });

  it('precargar() instancia todos los tipos sin error', () => {
    const tipos = [
      FloorType.WOOD_OAK,
      FloorType.MARBLE_BLACK,
      FloorType.STONE_COBBLE_WARM,
      FloorType.HEX_STYLIZED,
    ];
    adapter.precargar(tipos);
    // Tras precarga, una llamada normal devuelve la misma instancia
    const m = adapter.obtenerMaterial(FloorType.HEX_STYLIZED);
    expect(m.floorType).toBe(FloorType.HEX_STYLIZED);
  });

  it('dispose() limpia el cache y libera materiales', () => {
    const before = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_OAK),
    );
    expect(before).toBeDefined();
    adapter.dispose();
    // Tras dispose, obtenerMaterial reconstruye una nueva instancia
    const after = FloorMaterialAdapter.resolverMaterial(
      adapter.obtenerMaterial(FloorType.WOOD_OAK),
    );
    expect(after).not.toBe(before);
  });
});

describe('FloorMaterialAdapter — cobertura del catálogo', () => {
  it('cada FloorType del enum tiene una spec y construye material sin error', () => {
    const tipos = Object.values(FloorType);
    for (const tipo of tipos) {
      const m = adapter.obtenerMaterial(tipo);
      expect(m.floorType).toBe(tipo);
      const three = FloorMaterialAdapter.resolverMaterial(m);
      expect(three).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
  });
});
