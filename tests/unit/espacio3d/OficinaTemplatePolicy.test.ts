/**
 * Tests del Domain `OficinaTemplatePolicy` — generador puro de grilla de
 * desks para el onboarding admin.
 *
 * Ref: src/core/domain/entities/espacio3d/OficinaTemplatePolicy.ts
 */

import { describe, expect, it } from 'vitest';
import {
  CANTIDAD_MIEMBROS_MAX,
  CANTIDAD_MIEMBROS_MIN,
  SEPARACION_DESKS_DEFAULT,
  calcularBboxTotalGrid,
  calcularDimensionesGrilla,
  generarPosicionesGridDesks,
  normalizarCantidadMiembros,
} from '../../../src/core/domain/entities/espacio3d/OficinaTemplatePolicy';
import { PRESET_DESK_STANDARD } from '../../../src/core/domain/entities/espacio3d/PresetDesk';

// ─── normalizarCantidadMiembros ─────────────────────────────────────────────

describe('normalizarCantidadMiembros', () => {
  it('clampea al mínimo si recibe <=0', () => {
    expect(normalizarCantidadMiembros(0)).toBe(CANTIDAD_MIEMBROS_MIN);
    expect(normalizarCantidadMiembros(-5)).toBe(CANTIDAD_MIEMBROS_MIN);
  });

  it('clampea al máximo si supera 100', () => {
    expect(normalizarCantidadMiembros(101)).toBe(CANTIDAD_MIEMBROS_MAX);
    expect(normalizarCantidadMiembros(10000)).toBe(CANTIDAD_MIEMBROS_MAX);
  });

  it('redondea floor decimales', () => {
    expect(normalizarCantidadMiembros(7.9)).toBe(7);
    expect(normalizarCantidadMiembros(7.1)).toBe(7);
  });

  it('NaN/Infinity → mínimo', () => {
    expect(normalizarCantidadMiembros(NaN)).toBe(CANTIDAD_MIEMBROS_MIN);
    expect(normalizarCantidadMiembros(Infinity)).toBe(CANTIDAD_MIEMBROS_MAX); // Infinity > 100 → clamp
  });
});

// ─── calcularDimensionesGrilla ──────────────────────────────────────────────

describe('calcularDimensionesGrilla', () => {
  it('N=1 → 1×1', () => {
    expect(calcularDimensionesGrilla(1)).toEqual({ columnas: 1, filas: 1 });
  });

  it('N=10 → 4×3 (4 cols, 3 filas, sobran 2)', () => {
    expect(calcularDimensionesGrilla(10)).toEqual({ columnas: 4, filas: 3 });
  });

  it('N=12 → 4×3 exacto', () => {
    expect(calcularDimensionesGrilla(12)).toEqual({ columnas: 4, filas: 3 });
  });

  it('N=25 → 5×5 exacto', () => {
    expect(calcularDimensionesGrilla(25)).toEqual({ columnas: 5, filas: 5 });
  });

  it('N=100 → 10×10 exacto', () => {
    expect(calcularDimensionesGrilla(100)).toEqual({ columnas: 10, filas: 10 });
  });

  it('N=50 → 8 cols, 7 filas (sqrt 50 ≈ 7.07 → 8 cols, 50/8=6.25→7 filas)', () => {
    expect(calcularDimensionesGrilla(50)).toEqual({ columnas: 8, filas: 7 });
  });
});

// ─── generarPosicionesGridDesks ─────────────────────────────────────────────

describe('generarPosicionesGridDesks', () => {
  const preset = PRESET_DESK_STANDARD;
  const bounds = { centroX: 0, centroZ: 0, separacion: SEPARACION_DESKS_DEFAULT };

  it('N=1 → 1 posición en el centro exacto', () => {
    const ps = generarPosicionesGridDesks({ cantidad: 1, preset, bounds });
    expect(ps).toHaveLength(1);
    expect(ps[0]).toEqual({ indice: 0, x: 0, z: 0, fila: 0, columna: 0 });
  });

  it('N=4 → 2×2, cuatro posiciones simétricas alrededor del centro', () => {
    const ps = generarPosicionesGridDesks({ cantidad: 4, preset, bounds });
    expect(ps).toHaveLength(4);
    // stepX = ancho(4.5) + sep(1.5) = 6 → x0 = -3 → cols: -3, 3
    // stepZ = alto(4.0)  + sep(1.5) = 5.5 → z0 = -2.75 → filas: -2.75, 2.75
    expect(ps[0].x).toBeCloseTo(-3);
    expect(ps[0].z).toBeCloseTo(-2.75);
    expect(ps[1].x).toBeCloseTo(3);
    expect(ps[1].z).toBeCloseTo(-2.75);
    expect(ps[2].x).toBeCloseTo(-3);
    expect(ps[2].z).toBeCloseTo(2.75);
    expect(ps[3].x).toBeCloseTo(3);
    expect(ps[3].z).toBeCloseTo(2.75);
  });

  it('N=10 → 10 posiciones, todas dentro de 4×3 (4 cols, 3 filas)', () => {
    const ps = generarPosicionesGridDesks({ cantidad: 10, preset, bounds });
    expect(ps).toHaveLength(10);
    // Última fila tiene solo 2 (4+4+2=10)
    const ultima = ps[ps.length - 1];
    expect(ultima.fila).toBe(2);
    expect(ultima.columna).toBe(1);
  });

  it('todas las posiciones son finitas', () => {
    const ps = generarPosicionesGridDesks({ cantidad: 100, preset, bounds });
    expect(ps).toHaveLength(100);
    for (const p of ps) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });

  it('respeta separación: distancia centro-a-centro horizontal = ancho + sep', () => {
    const ps = generarPosicionesGridDesks({ cantidad: 4, preset, bounds });
    // Entre col 0 (ps[0]) y col 1 (ps[1]) de la primera fila
    const dx = Math.abs(ps[1].x - ps[0].x);
    expect(dx).toBeCloseTo(preset.bbox.ancho + bounds.separacion);
  });

  it('centro de la grilla coincide con bounds.centroX/Z', () => {
    const customBounds = { centroX: 10, centroZ: 20, separacion: 1.5 };
    const ps = generarPosicionesGridDesks({ cantidad: 9, preset, bounds: customBounds });
    // 9 → 3×3, posición central (fila 1, col 1) debe coincidir con centro.
    const central = ps.find((p) => p.fila === 1 && p.columna === 1);
    expect(central?.x).toBeCloseTo(10);
    expect(central?.z).toBeCloseTo(20);
  });

  it('cantidad fuera de rango se clamp', () => {
    expect(generarPosicionesGridDesks({ cantidad: 0, preset, bounds })).toHaveLength(1);
    expect(generarPosicionesGridDesks({ cantidad: 500, preset, bounds })).toHaveLength(100);
  });
});

// ─── calcularBboxTotalGrid ──────────────────────────────────────────────────

describe('calcularBboxTotalGrid', () => {
  it('N=1 → bbox de 1 desk', () => {
    const b = calcularBboxTotalGrid({
      cantidad: 1,
      preset: PRESET_DESK_STANDARD,
      separacion: 1.5,
    });
    expect(b.ancho).toBeCloseTo(4.5);
    expect(b.alto).toBeCloseTo(4.0);
  });

  it('N=4 (2×2) → 2 desks + 1 sep en cada eje', () => {
    const b = calcularBboxTotalGrid({
      cantidad: 4,
      preset: PRESET_DESK_STANDARD,
      separacion: 1.5,
    });
    expect(b.ancho).toBeCloseTo(2 * 4.5 + 1 * 1.5);
    expect(b.alto).toBeCloseTo(2 * 4.0 + 1 * 1.5);
  });
});
