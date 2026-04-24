/**
 * @module tests/stress/fase3-playwright/domain/ClientJourneyScript
 *
 * Value objects puros que describen el viaje simulado de un cliente real
 * en el espacio 3D. El orquestador de Fase 3 ejecuta estos steps via
 * Playwright en Chromium headless con fake media.
 *
 * Clean Architecture: Domain — sin deps externas.
 */

/** Step granular del journey. Cada uno tiene semántica clara y valida un fix. */
export type JourneyStep =
  | { readonly kind: 'login'; readonly email: string; readonly password: string }
  | { readonly kind: 'wait_room_connected'; readonly timeoutMs: number }
  | { readonly kind: 'walk_random'; readonly durationMs: number }
  | { readonly kind: 'toggle_camera'; readonly enabled: boolean }
  | { readonly kind: 'toggle_mic'; readonly enabled: boolean }
  | { readonly kind: 'send_chat'; readonly message: string }
  | { readonly kind: 'cross_meeting_zone'; readonly zoneName: string }
  | { readonly kind: 'walk_outside_zone'; readonly durationMs: number }
  | { readonly kind: 'abrupt_close' };

export interface ClientJourneyScript {
  readonly journeyId: string;
  readonly steps: readonly JourneyStep[];
}

/**
 * Factory del journey canónico del test aprobado 2026-04-24.
 * Cubre los fixes A, B, C, D, E, F, G, I, K — cada step valida algo específico.
 */
export function buildDefaultJourney(
  email: string,
  password: string,
  index: number,
): ClientJourneyScript {
  return {
    journeyId: `journey-${index}`,
    steps: [
      { kind: 'login', email, password },
      { kind: 'wait_room_connected', timeoutMs: 15_000 },
      { kind: 'walk_random', durationMs: 30_000 },            // fixes A, D
      { kind: 'toggle_camera', enabled: true },                // fix K video
      { kind: 'toggle_mic', enabled: true },
      { kind: 'send_chat', message: `Hola desde bot ${index}` }, // fix K RLS
      { kind: 'cross_meeting_zone', zoneName: 'Sala Meeting XL' }, // fixes C, G
      { kind: 'walk_outside_zone', durationMs: 15_000 },
      { kind: 'toggle_camera', enabled: false },
      { kind: 'abrupt_close' },                                 // fix E
    ],
  };
}
