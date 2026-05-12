/**
 * Tests del Domain de hysteresis para meeting zones.
 *
 * Cubre el value object + funciones puras `isPointInMeetingZoneEnter` /
 * `isPointInMeetingZoneExit`. Bug objetivo (deuda B3, sesión 2026-05-12):
 * 6 transitions enter/leave en 2min cuando un avatar caminaba en el borde
 * de una meeting zone — flapping audio + ruido SDK LiveKit.
 *
 * Hysteresis: si el user ya está dentro, el bbox de salida es +0.5m
 * expandido; si está fuera, el de entrada es −0.5m shrinked. Estado
 * intermedio entre bboxes NO transitiona.
 *
 * Ref: src/core/domain/entities/realtime/MeetingRoomAssignment.ts
 * Ref: Valve docs — "area triggers with entry/exit thresholds"
 */

import { describe, expect, it } from 'vitest';
import {
  isPointInMeetingZoneEnter,
  isPointInMeetingZoneExit,
  MEETING_ZONE_HYSTERESIS_MARGIN_DB,
  type MeetingZoneBbox,
} from '../../../src/core/domain/entities/realtime/MeetingRoomAssignment';

// ─── Setup: zona sala_juntas típica (centro 400,400, 64×64 DB = 4×4m world)

const ZONA_BASE: MeetingZoneBbox = {
  posicion_x: 400,
  posicion_y: 400,
  ancho: 64,
  alto: 64,
};

const MARGIN = MEETING_ZONE_HYSTERESIS_MARGIN_DB; // 8 unidades DB = 0.5m world

describe('isPointInMeetingZoneEnter — bbox shrinked (entrada)', () => {
  it('punto en el centro está dentro', () => {
    expect(isPointInMeetingZoneEnter({ x: 400, y: 400 }, ZONA_BASE)).toBe(true);
  });

  it('punto en el borde exacto del bbox visible está FUERA del enterBbox', () => {
    // Borde visible: x = 400 + 64/2 = 432. enterBbox: 432 - margin = 424.
    expect(isPointInMeetingZoneEnter({ x: 432, y: 400 }, ZONA_BASE)).toBe(false);
  });

  it('punto a 1 unidad dentro del borde shrinked está dentro', () => {
    // enterBbox right edge: 432 - 8 = 424. 423 está adentro.
    expect(isPointInMeetingZoneEnter({ x: 423, y: 400 }, ZONA_BASE)).toBe(true);
  });

  it('punto a 1 unidad fuera del borde shrinked está fuera', () => {
    // enterBbox right edge: 424. 425 está afuera del enterBbox.
    expect(isPointInMeetingZoneEnter({ x: 425, y: 400 }, ZONA_BASE)).toBe(false);
  });

  it('zona muy chica (ancho < 2×margin) colapsa el enterBbox a punto (no seleccionable)', () => {
    // Ancho 8 = igual al margin → halfW = 0. Solo el centro exacto entra.
    const zonaMinuscula: MeetingZoneBbox = { posicion_x: 100, posicion_y: 100, ancho: 8, alto: 8 };
    expect(isPointInMeetingZoneEnter({ x: 100, y: 100 }, zonaMinuscula)).toBe(true);
    expect(isPointInMeetingZoneEnter({ x: 101, y: 100 }, zonaMinuscula)).toBe(false);
  });

  it('acepta strings (Supabase numeric roundtrip)', () => {
    const zonaStr: MeetingZoneBbox = { posicion_x: '400', posicion_y: '400', ancho: '64', alto: '64' };
    expect(isPointInMeetingZoneEnter({ x: 400, y: 400 }, zonaStr)).toBe(true);
  });
});

describe('isPointInMeetingZoneExit — bbox expanded (salida)', () => {
  it('punto en el centro está dentro', () => {
    expect(isPointInMeetingZoneExit({ x: 400, y: 400 }, ZONA_BASE)).toBe(true);
  });

  it('punto en el borde visible está dentro del exitBbox (margen interior + 0)', () => {
    // Borde visible: 432. exitBbox extiende a 432 + margin = 440.
    expect(isPointInMeetingZoneExit({ x: 432, y: 400 }, ZONA_BASE)).toBe(true);
  });

  it('punto a 7 unidades fuera del borde visible está dentro del exitBbox', () => {
    expect(isPointInMeetingZoneExit({ x: 439, y: 400 }, ZONA_BASE)).toBe(true);
  });

  it('punto a 9 unidades fuera del borde visible está FUERA del exitBbox', () => {
    expect(isPointInMeetingZoneExit({ x: 441, y: 400 }, ZONA_BASE)).toBe(false);
  });

  it('acepta strings', () => {
    const zonaStr: MeetingZoneBbox = { posicion_x: '400', posicion_y: '400', ancho: '64', alto: '64' };
    expect(isPointInMeetingZoneExit({ x: 440, y: 400 }, zonaStr)).toBe(true);
  });
});

describe('Hysteresis invariant: enterBbox ⊆ visibleBbox ⊆ exitBbox', () => {
  it('punto entre enterBbox y exitBbox NO está en enter pero SÍ en exit', () => {
    // Banda hysteresis derecha: x ∈ (424, 440] (exit pero no enter).
    const inHystereisBand = { x: 430, y: 400 };
    expect(isPointInMeetingZoneEnter(inHystereisBand, ZONA_BASE)).toBe(false);
    expect(isPointInMeetingZoneExit(inHystereisBand, ZONA_BASE)).toBe(true);

    // Esto significa: si el user ya estaba dentro, sigue dentro (sticky).
    // Si estaba fuera, NO entra (no se gana acceso por estar cerca).
  });

  it('punto muy adentro está en AMBOS bboxes', () => {
    const muyAdentro = { x: 400, y: 400 };
    expect(isPointInMeetingZoneEnter(muyAdentro, ZONA_BASE)).toBe(true);
    expect(isPointInMeetingZoneExit(muyAdentro, ZONA_BASE)).toBe(true);
  });

  it('punto muy afuera no está en NINGUNO', () => {
    const muyAfuera = { x: 500, y: 500 };
    expect(isPointInMeetingZoneEnter(muyAfuera, ZONA_BASE)).toBe(false);
    expect(isPointInMeetingZoneExit(muyAfuera, ZONA_BASE)).toBe(false);
  });
});

describe('MEETING_ZONE_HYSTERESIS_MARGIN_DB — invariantes', () => {
  it('valor sensato (entre 0.25m y 1m en world)', () => {
    // 4 unidades DB = 0.25m world (factor /16). 16 = 1m.
    expect(MARGIN).toBeGreaterThanOrEqual(4);
    expect(MARGIN).toBeLessThanOrEqual(16);
  });
});
