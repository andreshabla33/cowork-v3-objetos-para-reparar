/**
 * @module domain/entities/espacio3d/AreaEscritorio
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Modela un "área escritorio" (DeskArea estilo Gather): un rectángulo en el
 * mapa que el admin designa como reclamable por un miembro. Una vez
 * reclamada, queda asociada al usuario como su "espacio personal" hasta
 * que la libere o el admin la re-asigne.
 *
 * Diferencia clave vs el sistema legacy `ocupacion_asientos`:
 *  - El legacy reclamaba sub-asientos de muebles físicos (cada silla del
 *    catálogo). Esta entidad reclama un ÁREA en el mapa, independiente del
 *    catálogo de muebles que estén dentro del bbox (muebles decorativos).
 *  - El legacy era proximity-stay-still automático. Este es claim-explícito
 *    al estilo Gather: hover → botón "Reclamar".
 *
 * Refs:
 *  - https://support.gather.town/hc/en-us/articles/15910344777748
 *    (Claim and Customize Your Desk — modelo de referencia)
 *  - https://support.help.gather.town/articles/2255130889-desk-management
 *    (Desk Manager: pre-asignación admin, re-asignación, audio aislado)
 */

// ─── Value object: rectángulo en world coords ───────────────────────────────

/**
 * Rectángulo axis-aligned en world coordinates (metros). El centro y las
 * dimensiones evitan inconsistencias min/max y permiten rotaciones futuras
 * sin cambiar la interfaz.
 *
 * Invariantes:
 *  - ancho > 0, alto > 0
 *  - todos los campos son finitos
 */
export interface BboxAreaEscritorio {
  readonly centroX: number;
  readonly centroZ: number;
  readonly ancho: number;
  readonly alto: number;
}

// ─── Entidad principal ──────────────────────────────────────────────────────

/**
 * Entidad inmutable. Las mutaciones (reclamar, liberar, asignar) producen
 * nuevas instancias o se delegan a use cases que llaman al puerto.
 */
export interface AreaEscritorio {
  readonly id: string;
  readonly espacio_id: string;
  readonly bbox: BboxAreaEscritorio;
  /** Nombre legible: "Escritorio de Andrés", "Desk #4", etc. */
  readonly nombre: string;
  /**
   * Pre-asignación admin: si está definido, solo este usuario puede reclamar.
   * `null` = libre para cualquier miembro.
   */
  readonly asignado_a_usuario_id: string | null;
  /**
   * Reclamación actual: usuario que tomó el área. `null` = disponible.
   * Permanente hasta `liberar` o re-asignación admin (a diferencia del
   * legacy `ocupacion_asientos` que tenía TTL por heartbeat).
   */
  readonly reclamado_por_usuario_id: string | null;
  /**
   * Si `true`, el audio de proximidad queda gateado al perímetro del bbox.
   * Speakers dentro no se escuchan afuera (y viceversa). Equivalente a
   * "Private Area" + Desk flag de Gather.
   */
  readonly audio_aislado: boolean;
  readonly creado_en: string;
  readonly actualizado_en: string;
}

// ─── Tipo de estado UI (para el overlay 3D y tooltip) ───────────────────────

/**
 * Estado visual del área respecto al usuario actual. Calculado por
 * `evaluarEstadoAreaEscritorio` — la presentación lo mapea a colores y
 * tooltips.
 */
export type EstadoAreaEscritorio =
  /** Disponible y el usuario actual puede reclamarla. */
  | 'disponible'
  /** Pre-asignada al usuario actual y no reclamada todavía → "Reclamar tuyo". */
  | 'pre-asignada-mia'
  /** Reclamada por el usuario actual. */
  | 'mia'
  /** Reclamada por otro miembro. */
  | 'ocupada-otro'
  /** Pre-asignada a otro miembro (no reclamada aún) → bloqueada para mí. */
  | 'pre-asignada-otro';

// ─── Policy: funciones puras ────────────────────────────────────────────────

/**
 * Test de containment punto-en-rectángulo axis-aligned. World coords.
 * Inclusivo en los bordes para que el tooltip aparezca cuando el avatar
 * está parado exactamente sobre la línea.
 */
export function puntoEnAreaEscritorio(
  punto: { x: number; z: number },
  area: AreaEscritorio,
): boolean {
  const { centroX, centroZ, ancho, alto } = area.bbox;
  const halfW = ancho / 2;
  const halfH = alto / 2;
  return (
    punto.x >= centroX - halfW &&
    punto.x <= centroX + halfW &&
    punto.z >= centroZ - halfH &&
    punto.z <= centroZ + halfH
  );
}

/**
 * Distancia mínima del punto al perímetro del área (positivo afuera,
 * negativo adentro). Útil para gradient de outline (intensidad por
 * proximidad).
 */
export function distanciaAlAreaEscritorio(
  punto: { x: number; z: number },
  area: AreaEscritorio,
): number {
  const { centroX, centroZ, ancho, alto } = area.bbox;
  const halfW = ancho / 2;
  const halfH = alto / 2;
  const dx = Math.max(Math.abs(punto.x - centroX) - halfW, 0);
  const dz = Math.max(Math.abs(punto.z - centroZ) - halfH, 0);
  return Math.hypot(dx, dz);
}

/**
 * Estado visual del área respecto al usuario actual.
 *
 * Reglas:
 *  - Si yo la reclamé → 'mia'.
 *  - Si está reclamada por otro → 'ocupada-otro'.
 *  - Si está pre-asignada a mí (no reclamada) → 'pre-asignada-mia'.
 *  - Si está pre-asignada a otro (no reclamada) → 'pre-asignada-otro'.
 *  - Caso restante (sin asignación ni reclamación) → 'disponible'.
 */
export function evaluarEstadoAreaEscritorio(
  area: AreaEscritorio,
  miUsuarioId: string | null,
): EstadoAreaEscritorio {
  if (miUsuarioId && area.reclamado_por_usuario_id === miUsuarioId) return 'mia';
  if (area.reclamado_por_usuario_id) return 'ocupada-otro';
  if (area.asignado_a_usuario_id && miUsuarioId && area.asignado_a_usuario_id === miUsuarioId) {
    return 'pre-asignada-mia';
  }
  if (area.asignado_a_usuario_id) return 'pre-asignada-otro';
  return 'disponible';
}

/**
 * Determina si el usuario actual puede ejecutar la acción "Reclamar" sobre
 * este área. Útil para gatear el botón en la UI.
 *
 * Reglas:
 *  - El área NO debe estar reclamada por nadie.
 *  - Si tiene pre-asignación, debe ser para mí.
 */
export function puedoReclamarAreaEscritorio(
  area: AreaEscritorio,
  miUsuarioId: string | null,
): boolean {
  if (!miUsuarioId) return false;
  if (area.reclamado_por_usuario_id !== null) return false;
  if (area.asignado_a_usuario_id !== null && area.asignado_a_usuario_id !== miUsuarioId) {
    return false;
  }
  return true;
}

/**
 * Determina si el usuario actual puede liberar este área (solo el dueño).
 */
export function puedoLiberarAreaEscritorio(
  area: AreaEscritorio,
  miUsuarioId: string | null,
): boolean {
  return !!miUsuarioId && area.reclamado_por_usuario_id === miUsuarioId;
}

// ─── Constructores defensivos ───────────────────────────────────────────────

/**
 * Factory que normaliza un bbox de cualquier fuente (DB row, Supabase
 * payload, drag-to-create del admin) hacia la forma canónica del Domain.
 * Acepta tanto formatos string→number (Supabase numeric) como pares
 * min/max.
 *
 * Throws si los valores no son finitos o los lados son <= 0.
 */
export function crearBboxAreaEscritorio(input: {
  centroX: number | string;
  centroZ: number | string;
  ancho: number | string;
  alto: number | string;
}): BboxAreaEscritorio {
  const centroX = Number(input.centroX);
  const centroZ = Number(input.centroZ);
  const ancho = Number(input.ancho);
  const alto = Number(input.alto);
  if (!Number.isFinite(centroX) || !Number.isFinite(centroZ)) {
    throw new Error('BboxAreaEscritorio: centro no es finito');
  }
  if (!Number.isFinite(ancho) || ancho <= 0) {
    throw new Error('BboxAreaEscritorio: ancho debe ser > 0');
  }
  if (!Number.isFinite(alto) || alto <= 0) {
    throw new Error('BboxAreaEscritorio: alto debe ser > 0');
  }
  return { centroX, centroZ, ancho, alto };
}
