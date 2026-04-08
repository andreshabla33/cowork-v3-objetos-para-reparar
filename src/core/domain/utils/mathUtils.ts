/**
 * @module core/domain/utils/mathUtils
 * @description Shared pure math utilities for the domain layer.
 *
 * Clean Architecture: Domain layer — zero external dependencies.
 * These functions are used across domain entities, application use cases,
 * and infrastructure adapters to avoid duplication.
 */

/**
 * Clamp a numeric value between min and max bounds.
 *
 * @param valor  The value to clamp
 * @param min    Lower bound (inclusive)
 * @param max    Upper bound (inclusive)
 * @returns      The clamped value
 */
export const clamp = (valor: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, valor));
