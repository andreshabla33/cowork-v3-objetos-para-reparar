/**
 * Tests del Domain `AreaEscritorio` — value object, policy y factory.
 *
 * Cubre los invariantes y las decisiones puras (puedoReclamar, estado, etc.)
 * antes de cualquier integración con Supabase / R3F.
 *
 * Ref: src/core/domain/entities/espacio3d/AreaEscritorio.ts
 */

import { describe, expect, it } from 'vitest';
import {
  crearBboxAreaEscritorio,
  distanciaAlAreaEscritorio,
  evaluarEstadoAreaEscritorio,
  puedoLiberarAreaEscritorio,
  puedoReclamarAreaEscritorio,
  puntoEnAreaEscritorio,
  type AreaEscritorio,
} from '../../../src/core/domain/entities/espacio3d/AreaEscritorio';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mkArea = (overrides: Partial<AreaEscritorio> = {}): AreaEscritorio => ({
  id: 'area-1',
  espacio_id: 'esp-1',
  bbox: { centroX: 10, centroZ: 20, ancho: 4, alto: 3 },
  nombre: 'Escritorio de prueba',
  asignado_a_usuario_id: null,
  reclamado_por_usuario_id: null,
  audio_aislado: false,
  creado_en: '2026-05-12T00:00:00.000Z',
  actualizado_en: '2026-05-12T00:00:00.000Z',
  ...overrides,
});

// ─── crearBboxAreaEscritorio ────────────────────────────────────────────────

describe('crearBboxAreaEscritorio', () => {
  it('acepta números directos', () => {
    const bbox = crearBboxAreaEscritorio({ centroX: 5, centroZ: 10, ancho: 2, alto: 3 });
    expect(bbox).toEqual({ centroX: 5, centroZ: 10, ancho: 2, alto: 3 });
  });

  it('acepta strings (Supabase numeric roundtrip)', () => {
    const bbox = crearBboxAreaEscritorio({ centroX: '5', centroZ: '10', ancho: '2', alto: '3' });
    expect(bbox).toEqual({ centroX: 5, centroZ: 10, ancho: 2, alto: 3 });
  });

  it('throw si ancho ≤ 0', () => {
    expect(() => crearBboxAreaEscritorio({ centroX: 0, centroZ: 0, ancho: 0, alto: 1 })).toThrow();
    expect(() => crearBboxAreaEscritorio({ centroX: 0, centroZ: 0, ancho: -1, alto: 1 })).toThrow();
  });

  it('throw si alto ≤ 0', () => {
    expect(() => crearBboxAreaEscritorio({ centroX: 0, centroZ: 0, ancho: 1, alto: 0 })).toThrow();
  });

  it('throw si centro es NaN/Infinity', () => {
    expect(() => crearBboxAreaEscritorio({ centroX: NaN, centroZ: 0, ancho: 1, alto: 1 })).toThrow();
    expect(() => crearBboxAreaEscritorio({ centroX: Infinity, centroZ: 0, ancho: 1, alto: 1 })).toThrow();
  });
});

// ─── puntoEnAreaEscritorio ──────────────────────────────────────────────────

describe('puntoEnAreaEscritorio', () => {
  const area = mkArea(); // centro (10,20) ancho 4 alto 3 → x∈[8,12], z∈[18.5,21.5]

  it('punto en el centro está adentro', () => {
    expect(puntoEnAreaEscritorio({ x: 10, z: 20 }, area)).toBe(true);
  });

  it('punto exactamente en el borde está adentro (inclusivo)', () => {
    expect(puntoEnAreaEscritorio({ x: 8, z: 20 }, area)).toBe(true);
    expect(puntoEnAreaEscritorio({ x: 12, z: 21.5 }, area)).toBe(true);
  });

  it('punto fuera del bbox X está afuera', () => {
    expect(puntoEnAreaEscritorio({ x: 7.99, z: 20 }, area)).toBe(false);
    expect(puntoEnAreaEscritorio({ x: 12.01, z: 20 }, area)).toBe(false);
  });

  it('punto fuera del bbox Z está afuera', () => {
    expect(puntoEnAreaEscritorio({ x: 10, z: 18.49 }, area)).toBe(false);
    expect(puntoEnAreaEscritorio({ x: 10, z: 21.51 }, area)).toBe(false);
  });
});

// ─── distanciaAlAreaEscritorio ──────────────────────────────────────────────

describe('distanciaAlAreaEscritorio', () => {
  const area = mkArea(); // x∈[8,12], z∈[18.5,21.5]

  it('0 si el punto está adentro', () => {
    expect(distanciaAlAreaEscritorio({ x: 10, z: 20 }, area)).toBe(0);
  });

  it('distancia perpendicular si está alineado a un eje', () => {
    expect(distanciaAlAreaEscritorio({ x: 15, z: 20 }, area)).toBeCloseTo(3); // 15 - 12 = 3
    expect(distanciaAlAreaEscritorio({ x: 10, z: 25 }, area)).toBeCloseTo(3.5); // 25 - 21.5 = 3.5
  });

  it('distancia diagonal en esquinas', () => {
    // Esquina (12, 21.5). Punto (15, 25). dx=3, dz=3.5 → hypot ≈ 4.610
    expect(distanciaAlAreaEscritorio({ x: 15, z: 25 }, area)).toBeCloseTo(Math.hypot(3, 3.5));
  });
});

// ─── evaluarEstadoAreaEscritorio ────────────────────────────────────────────

describe('evaluarEstadoAreaEscritorio', () => {
  it('disponible si nadie asignado ni reclamó', () => {
    expect(evaluarEstadoAreaEscritorio(mkArea(), 'user-A')).toBe('disponible');
  });

  it('mia si el reclamado soy yo', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-A' });
    expect(evaluarEstadoAreaEscritorio(a, 'user-A')).toBe('mia');
  });

  it('ocupada-otro si reclamó alguien más (sin importar mi pre-asignación)', () => {
    const a = mkArea({
      reclamado_por_usuario_id: 'user-B',
      asignado_a_usuario_id: 'user-A',
    });
    expect(evaluarEstadoAreaEscritorio(a, 'user-A')).toBe('ocupada-otro');
  });

  it('pre-asignada-mia si me asignaron y nadie reclamó', () => {
    const a = mkArea({ asignado_a_usuario_id: 'user-A' });
    expect(evaluarEstadoAreaEscritorio(a, 'user-A')).toBe('pre-asignada-mia');
  });

  it('pre-asignada-otro si la asignaron a otro', () => {
    const a = mkArea({ asignado_a_usuario_id: 'user-B' });
    expect(evaluarEstadoAreaEscritorio(a, 'user-A')).toBe('pre-asignada-otro');
  });

  it('user anónimo (null) ve "disponible" si nadie reclamó (incluso si pre-asignada a alguien)', () => {
    // Caso edge: con userId null no podemos saber si la pre-asignación es nuestra,
    // pero sigue siendo "pre-asignada-otro" por convención (no es del anon).
    expect(evaluarEstadoAreaEscritorio(mkArea(), null)).toBe('disponible');
    expect(evaluarEstadoAreaEscritorio(mkArea({ asignado_a_usuario_id: 'user-A' }), null))
      .toBe('pre-asignada-otro');
  });
});

// ─── puedoReclamarAreaEscritorio ────────────────────────────────────────────

describe('puedoReclamarAreaEscritorio', () => {
  it('sí si está libre', () => {
    expect(puedoReclamarAreaEscritorio(mkArea(), 'user-A')).toBe(true);
  });

  it('no si ya está reclamada por otro', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-B' });
    expect(puedoReclamarAreaEscritorio(a, 'user-A')).toBe(false);
  });

  it('no si la reclamé yo mismo (idempotente — la UI debe mostrar "Liberar")', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-A' });
    expect(puedoReclamarAreaEscritorio(a, 'user-A')).toBe(false);
  });

  it('no si pre-asignada a otro', () => {
    const a = mkArea({ asignado_a_usuario_id: 'user-B' });
    expect(puedoReclamarAreaEscritorio(a, 'user-A')).toBe(false);
  });

  it('sí si pre-asignada a mí', () => {
    const a = mkArea({ asignado_a_usuario_id: 'user-A' });
    expect(puedoReclamarAreaEscritorio(a, 'user-A')).toBe(true);
  });

  it('no si user es anónimo', () => {
    expect(puedoReclamarAreaEscritorio(mkArea(), null)).toBe(false);
  });
});

// ─── puedoLiberarAreaEscritorio ─────────────────────────────────────────────

describe('puedoLiberarAreaEscritorio', () => {
  it('sí si soy el dueño actual', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-A' });
    expect(puedoLiberarAreaEscritorio(a, 'user-A')).toBe(true);
  });

  it('no si la reclamó otro', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-B' });
    expect(puedoLiberarAreaEscritorio(a, 'user-A')).toBe(false);
  });

  it('no si no está reclamada', () => {
    expect(puedoLiberarAreaEscritorio(mkArea(), 'user-A')).toBe(false);
  });

  it('no si user es anónimo', () => {
    const a = mkArea({ reclamado_por_usuario_id: 'user-A' });
    expect(puedoLiberarAreaEscritorio(a, null)).toBe(false);
  });
});
