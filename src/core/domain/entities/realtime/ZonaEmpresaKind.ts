/**
 * @module src/core/domain/entities/realtime/ZonaEmpresaKind
 *
 * Fase 1 del refactor de `zonas_empresa` (2026-04-23): introduce un
 * vocabulario de dominio para distinguir las 3 categorías que hoy viven
 * mezcladas en la misma tabla:
 *
 *   - Perimeter: la zona "todo el grid" de la empresa — su área base
 *     donde aparecen los spawns, el piso, etc. Corresponde a la plantilla
 *     `piso_base` (o sin plantilla específica en data legacy).
 *   - Subzona: zonas funcionales del interior (cubiculo, focus, comedor,
 *     bano). NO son aisladas acústicamente — son partes del perimeter.
 *   - Meeting: salas privadas que, al entrar, disparan `moveParticipant`
 *     a una LiveKit Room dedicada (sala_juntas, sala_meeting_grande).
 *
 * Este módulo NO toca la DB. Opera sobre arreglos `ZonaEmpresa[]` ya
 * cargados y los clasifica. Es un shim puro que permite a Presentation
 * consumir las 3 categorías por separado sin que cambie el schema.
 *
 * Cuando se haga Fase 3 (split del schema en 3 tablas), este módulo será
 * el único punto de cambio para adaptar la clasificación — el resto del
 * código que consume `ClassifiedZonas` queda intacto.
 *
 * Dependencia: solo tipos de Domain. No importa React, Supabase, LiveKit.
 */

import type { ZonaEmpresa } from '@/types';
import { normalizarConfiguracionZonaEmpresa } from '@/src/core/domain/entities/cerramientosZona';

// ─── Discriminated value objects ────────────────────────────────────────────

/**
 * La zona "todo el grid" de la empresa. Fuente de verdad para:
 *   - `limitarPosicionAZonaPropia` (clamp del avatar a los bounds de la empresa)
 *   - `obtenerPosicionSpawnEmpresa` (spawn inicial al entrar al espacio)
 *
 * Invariante: plantilla_zona.id === 'piso_base' OR plantilla_zona === undefined.
 */
export interface PerimeterZone {
  readonly _kind: 'perimeter';
  readonly zona: ZonaEmpresa;
}

/**
 * Zona funcional del interior (cubículos, focus, comedor, baño).
 * NO aisla media — solo es un área visual / de propósito.
 *
 * Invariante: plantilla_zona.id ∈ { 'cubiculo', 'focus', 'comedor', 'bano' }.
 */
export interface SubZone {
  readonly _kind: 'subzona';
  readonly zona: ZonaEmpresa;
}

/**
 * Sala de meeting. Al entrar dispara `moveParticipant` a LiveKit Room
 * dedicada (privacy a nivel SFU).
 *
 * Invariante: plantilla_zona.id ∈ { 'sala_juntas', 'sala_meeting_grande' }.
 */
export interface MeetingZone {
  readonly _kind: 'meeting';
  readonly zona: ZonaEmpresa;
}

export type ZonaEmpresaKind = PerimeterZone | SubZone | MeetingZone;

// ─── Whitelists por categoría ───────────────────────────────────────────────

/** Plantillas clasificadas como meeting — misma lista que MEETING_PLANTILLAS. */
const MEETING_PLANTILLAS = new Set(['sala_juntas', 'sala_meeting_grande']);
/** Plantillas clasificadas como perimeter. */
const PERIMETER_PLANTILLAS = new Set(['piso_base']);
/** Plantillas clasificadas como subzona funcional. */
const SUBZONA_PLANTILLAS = new Set(['cubiculo', 'focus', 'comedor', 'bano']);

// ─── Classifier result ──────────────────────────────────────────────────────

/**
 * Output determinístico del classifier. `perimeter` es singleton opcional
 * — en data bien formada existe una sola zona perimeter por empresa/espacio;
 * si hay 2+ por bug de config, se elige la PRIMERA (orden estable por id).
 */
export interface ClassifiedZonas {
  readonly perimeter: PerimeterZone | null;
  readonly subzonas: readonly SubZone[];
  readonly meetings: readonly MeetingZone[];
  /**
   * Zonas activas que no encajaron en ninguna categoría conocida (data
   * legacy con plantillas desconocidas, o plantilla null). Las exponemos
   * para que Presentation pueda decidir qué hacer (renderizar como
   * subzona genérica, loggear warning, etc.).
   */
  readonly unclassified: readonly ZonaEmpresa[];
}

// ─── Classifier puro ────────────────────────────────────────────────────────

/**
 * Determina la categoría de una zona leyendo `plantilla_zona.id` de su
 * `configuracion`. Null-safe sobre data parcial/legacy.
 */
export function categorizeZonaEmpresa(zona: ZonaEmpresa): ZonaEmpresaKind | null {
  const config = normalizarConfiguracionZonaEmpresa(zona.configuracion);
  const plantillaId = config?.plantilla_zona?.id;
  if (!plantillaId) return null;
  if (MEETING_PLANTILLAS.has(plantillaId)) {
    return { _kind: 'meeting', zona };
  }
  if (PERIMETER_PLANTILLAS.has(plantillaId)) {
    return { _kind: 'perimeter', zona };
  }
  if (SUBZONA_PLANTILLAS.has(plantillaId)) {
    return { _kind: 'subzona', zona };
  }
  return null;
}

/**
 * Clasifica un arreglo completo de zonas. Filtra por empresa/estado
 * ANTES de invocar — este classifier no aplica ningún filtro de scope.
 *
 * Comportamiento en edge cases:
 *  - Zona sin plantilla_zona.id conocida → `unclassified`.
 *  - Múltiples perimeter zones → retorna la primera (orden de entrada),
 *    marca las demás como `unclassified` para que el caller decida.
 */
export function classifyZonasEmpresa(zonas: readonly ZonaEmpresa[]): ClassifiedZonas {
  let perimeter: PerimeterZone | null = null;
  const subzonas: SubZone[] = [];
  const meetings: MeetingZone[] = [];
  const unclassified: ZonaEmpresa[] = [];

  for (const zona of zonas) {
    const kind = categorizeZonaEmpresa(zona);
    if (!kind) {
      unclassified.push(zona);
      continue;
    }
    switch (kind._kind) {
      case 'perimeter':
        if (perimeter === null) perimeter = kind;
        else unclassified.push(zona);
        break;
      case 'subzona':
        subzonas.push(kind);
        break;
      case 'meeting':
        meetings.push(kind);
        break;
    }
  }

  return { perimeter, subzonas, meetings, unclassified };
}

/**
 * Filtro adicional para "la zona propia activa de MI empresa". Convenience
 * wrapper de `classifyZonasEmpresa` con los dos filtros que antes estaban
 * hardcoded en Player3D.obtenerZonaPropiaActiva.
 */
export function classifyZonasPropiaActiva(
  zonas: readonly ZonaEmpresa[],
  empresaId: string | null | undefined,
): ClassifiedZonas {
  if (!empresaId) {
    return { perimeter: null, subzonas: [], meetings: [], unclassified: [] };
  }
  const propias = zonas.filter((z) => z.empresa_id === empresaId && z.estado === 'activa');
  return classifyZonasEmpresa(propias);
}
