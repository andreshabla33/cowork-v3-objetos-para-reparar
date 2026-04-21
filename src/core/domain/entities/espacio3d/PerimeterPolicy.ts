/**
 * @module domain/entities/espacio3d/PerimeterPolicy
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Entidad rica de dominio para la política de perímetro. Encapsula:
 *   - Tipos del valor objeto (PerimeterPolicy + PerimeterWallStyle)
 *   - Invariantes del dominio (rangos válidos, estilos permitidos)
 *   - Factory `PerimeterPolicy.create(input)` que valida y produce
 *     un Result<PerimeterPolicy, PerimeterPolicyError>
 *
 * Patrón: "Make Illegal States Unrepresentable" — un PerimeterPolicy que
 * existe en runtime es válido por construcción. La validación NO vive en
 * Application ni en Infrastructure; vive aquí porque las reglas son del
 * dominio del negocio.
 *
 * Refs:
 * - Robert C. Martin — "Clean Architecture": *"Validation logic is a
 *   domain layer concern."* https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
 * - Khalil Stemmler — "Organizing App Logic with the Clean Architecture":
 *   *"Use domain services to keep business rules within the domain layer
 *   so every application that relies on it gets the same rules."*
 *   https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/
 * - Result type pattern (sin dependencia externa, inspirado en `neverthrow`).
 */

// ─── Tipos del valor objeto ──────────────────────────────────────────────────

/**
 * Estilo visual de las paredes perimetrales. Se mapea a `built_in_geometry`
 * del catálogo existente (pared_vidrio, pared_basica, etc.).
 */
export type PerimeterWallStyle = 'glass' | 'brick' | 'panel' | 'half-wall' | 'basic';

/** Estilos permitidos — fuente única de verdad usada por el factory. */
export const ALLOWED_PERIMETER_STYLES: readonly PerimeterWallStyle[] = [
  'glass',
  'brick',
  'panel',
  'half-wall',
  'basic',
] as const;

/**
 * Política inmutable de cerramiento perimetral. Cualquier instancia que
 * exista en runtime es VÁLIDA por construcción (creada via `create`).
 */
export interface PerimeterPolicy {
  readonly enabled: boolean;
  readonly style: PerimeterWallStyle;
  readonly height: number;
  readonly segmentWidth: number;
  readonly margin: number;
}

// ─── Result type (sin dep externa) ───────────────────────────────────────────

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ─── Errores tipados del dominio ─────────────────────────────────────────────

export type PerimeterPolicyError =
  | { code: 'INVALID_STYLE'; received: unknown }
  | { code: 'HEIGHT_OUT_OF_RANGE'; received: unknown; min: number; max: number }
  | { code: 'SEGMENT_WIDTH_OUT_OF_RANGE'; received: unknown; min: number; max: number }
  | { code: 'MARGIN_OUT_OF_RANGE'; received: unknown; min: number; max: number };

// ─── Invariantes del dominio (constantes) ────────────────────────────────────

const HEIGHT_MIN = 0.5;
const HEIGHT_MAX = 10;
const SEGMENT_WIDTH_MIN = 1;
const SEGMENT_WIDTH_MAX = 20;
const MARGIN_MIN = 0;
const MARGIN_MAX = 5;

// ─── Default canónico ────────────────────────────────────────────────────────

/**
 * Policy default cuando un espacio no tiene config persistida. Hardcoded
 * a valores que sabemos válidos (no pasan por `create` para evitar throw).
 */
export const DEFAULT_PERIMETER_POLICY: PerimeterPolicy = Object.freeze({
  enabled: true,
  style: 'glass',
  height: 3,
  segmentWidth: 4,
  margin: 0.5,
});

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Input parcial — todos los campos opcionales para tolerancia con DB legacy. */
export interface PerimeterPolicyInput {
  enabled?: unknown;
  style?: unknown;
  height?: unknown;
  segmentWidth?: unknown;
  margin?: unknown;
}

/**
 * Construye un PerimeterPolicy validado o retorna el primer error encontrado.
 *
 * Estrategia: fail-fast. Si el caller necesita acumular múltiples errores,
 * puede llamar a `validateXxx` individualmente (ver helpers privados — no
 * exportados por ahora; agregar si se requiere).
 */
function create(input: PerimeterPolicyInput | null | undefined): Result<PerimeterPolicy, PerimeterPolicyError> {
  const safe = input ?? {};

  // enabled: cualquier valor truthy/falsy es válido (Boolean coerce).
  const enabled = Boolean(safe.enabled);

  // style
  const style = safe.style ?? DEFAULT_PERIMETER_POLICY.style;
  if (!ALLOWED_PERIMETER_STYLES.includes(style as PerimeterWallStyle)) {
    return err({ code: 'INVALID_STYLE', received: style });
  }

  // height
  const height = toFiniteNumber(safe.height, DEFAULT_PERIMETER_POLICY.height);
  if (height < HEIGHT_MIN || height > HEIGHT_MAX) {
    return err({ code: 'HEIGHT_OUT_OF_RANGE', received: safe.height, min: HEIGHT_MIN, max: HEIGHT_MAX });
  }

  // segmentWidth
  const segmentWidth = toFiniteNumber(safe.segmentWidth, DEFAULT_PERIMETER_POLICY.segmentWidth);
  if (segmentWidth < SEGMENT_WIDTH_MIN || segmentWidth > SEGMENT_WIDTH_MAX) {
    return err({ code: 'SEGMENT_WIDTH_OUT_OF_RANGE', received: safe.segmentWidth, min: SEGMENT_WIDTH_MIN, max: SEGMENT_WIDTH_MAX });
  }

  // margin
  const margin = toFiniteNumber(safe.margin, DEFAULT_PERIMETER_POLICY.margin);
  if (margin < MARGIN_MIN || margin > MARGIN_MAX) {
    return err({ code: 'MARGIN_OUT_OF_RANGE', received: safe.margin, min: MARGIN_MIN, max: MARGIN_MAX });
  }

  return ok(Object.freeze({ enabled, style: style as PerimeterWallStyle, height, segmentWidth, margin }));
}

/**
 * Variante "lenient": acepta input parcial/inválido y devuelve la policy
 * más cercana posible (clamp + fallback). Útil para inputs externos que NO
 * controlamos (ej. JSONB legacy, payload realtime). NO usar para escrituras
 * del usuario — ahí debe usarse `create()` para reportar el error.
 */
function createLenient(input: PerimeterPolicyInput | null | undefined): PerimeterPolicy {
  const safe = input ?? {};
  const styleRaw = safe.style;
  const style = ALLOWED_PERIMETER_STYLES.includes(styleRaw as PerimeterWallStyle)
    ? (styleRaw as PerimeterWallStyle)
    : DEFAULT_PERIMETER_POLICY.style;
  return Object.freeze({
    enabled: Boolean(safe.enabled),
    style,
    height: clamp(toFiniteNumber(safe.height, DEFAULT_PERIMETER_POLICY.height), HEIGHT_MIN, HEIGHT_MAX),
    segmentWidth: clamp(toFiniteNumber(safe.segmentWidth, DEFAULT_PERIMETER_POLICY.segmentWidth), SEGMENT_WIDTH_MIN, SEGMENT_WIDTH_MAX),
    margin: clamp(toFiniteNumber(safe.margin, DEFAULT_PERIMETER_POLICY.margin), MARGIN_MIN, MARGIN_MAX),
  });
}

// Namespace export para uso tipo `PerimeterPolicy.create(input)`.
export const PerimeterPolicy = {
  create,
  createLenient,
  DEFAULT: DEFAULT_PERIMETER_POLICY,
  HEIGHT_RANGE: [HEIGHT_MIN, HEIGHT_MAX] as const,
  SEGMENT_WIDTH_RANGE: [SEGMENT_WIDTH_MIN, SEGMENT_WIDTH_MAX] as const,
  MARGIN_RANGE: [MARGIN_MIN, MARGIN_MAX] as const,
} as const;

// ─── Helpers privados ────────────────────────────────────────────────────────

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
