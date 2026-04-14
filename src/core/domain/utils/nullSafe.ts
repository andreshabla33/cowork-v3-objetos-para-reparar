/**
 * @module domain/utils/nullSafe
 *
 * Helpers puros para normalizar la diferencia entre `null` y `undefined` en
 * el borde entre Infrastructure (Supabase/PostgREST devuelven `T | null`
 * por columnas nullables) y Presentation (React suele tipar `T | undefined`).
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Domain (utilidades puras)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin dependencias externas. Los Adapters de Infrastructure deben aplicar
 * `toUndefined()` al mapear DTOs de Supabase al contrato que consume la
 * Presentation. Fix plan-correcciones Fase 2.
 */

/**
 * Convierte `null` a `undefined`. Preserva otros valores.
 *
 * Uso típico en adapters:
 *   return { ...row, avatar_url: toUndefined(row.avatar_url) };
 */
export const toUndefined = <T>(v: T | null | undefined): T | undefined =>
  v === null ? undefined : v;

/**
 * Convierte `undefined` a `null`. Útil al escribir hacia Supabase cuando
 * la columna acepta NULL explícito.
 */
export const toNull = <T>(v: T | null | undefined): T | null =>
  v === undefined ? null : v;

/**
 * Normaliza recursivamente un objeto: todos los `null` se convierten a
 * `undefined` en el primer nivel. NO recurre en sub-objetos. Útil para
 * mapear rows enteros de Supabase cuando hay muchos campos nullable.
 *
 * ```ts
 * const profile = normalizeNullsShallow(row); // null → undefined
 * ```
 */
export function normalizeNullsShallow<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: T[K] extends infer V ? (V extends null ? undefined : V) : never } {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = obj[key] === null ? undefined : obj[key];
  }
  // `as` aquí es seguro: construimos exactamente el shape con null→undefined.
  return result as { [K in keyof T]: T[K] extends infer V ? (V extends null ? undefined : V) : never };
}
