/**
 * @module domain/utils/supabaseRelations
 *
 * Helpers puros para normalizar el shape que PostgREST devuelve al
 * embeber FKs. Cuando hacemos:
 *
 *   .select('*, espacio:espacios (nombre)')
 *
 * PostgREST devuelve `espacio` como **array** incluso cuando la relación
 * es 1:1. El type generado por Supabase respeta ese shape, lo que rompe
 * casts directos a `{ nombre: string }` desde la capa de Domain.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Domain (utilidades puras)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin deps. Se usan en adapters de Infrastructure para mapear DTOs
 * de PostgREST a entidades de dominio sin leakear el shape del ORM.
 */

/**
 * Normaliza una relación embebida de PostgREST a un single record o null.
 * Si el valor es array, retorna el primer elemento (o null si vacío).
 * Si es un objeto, lo retorna tal cual.
 * Si es null/undefined, retorna null.
 *
 * ```ts
 * const espacio = pickOneRelation<{ nombre: string }>(data.espacio);
 * //    ^ { nombre: string } | null
 * ```
 */
export const pickOneRelation = <T>(rel: unknown): T | null => {
  if (Array.isArray(rel)) {
    return (rel[0] as T | undefined) ?? null;
  }
  if (rel === null || rel === undefined) {
    return null;
  }
  return rel as T;
};

/**
 * Normaliza una relación embebida a un array. Si PostgREST devolvió un
 * objeto (caso 1:1 proyectado raro), lo envuelve; si es array, lo retorna.
 */
export const pickManyRelations = <T>(rel: unknown): T[] => {
  if (Array.isArray(rel)) return rel as T[];
  if (rel === null || rel === undefined) return [];
  return [rel as T];
};
