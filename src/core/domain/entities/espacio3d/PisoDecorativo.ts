/**
 * @module domain/entities/espacio3d/PisoDecorativo
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Pisos decorativos (alfombras / parches de material) que admin pinta sobre
 * el suelo del espacio o dentro de una zona-empresa. Render plano (Y≈0.01)
 * con un `FloorType` reusando el sistema de materiales PBR existente.
 *
 * Modelo Gather-style: rectángulo en world coords (centro + ancho/profundidad
 * + rotación Y). `zona_id` nullable permite decorar también el suelo de la
 * zona "Principal" (suelo común del espacio, sin zona-empresa asociada).
 */

import type { FloorType } from '../tiposSuelo';

export interface PisoDecorativo {
  readonly id: string;
  readonly espacioId: string;
  /** `null` = decoración sobre el suelo principal (fuera de zonas-empresa). */
  readonly zonaId: string | null;
  readonly tipoSuelo: FloorType;
  readonly centroX: number;
  readonly centroZ: number;
  readonly ancho: number;
  readonly profundidad: number;
  /** Radianes alrededor de Y. */
  readonly rotacionY: number;
  /** Z-order al apilar múltiples decoraciones en la misma área. */
  readonly orden: number;
  readonly ownerId: string | null;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface CrearPisoDecorativoInput {
  espacioId: string;
  zonaId: string | null;
  tipoSuelo: FloorType;
  centroX: number;
  centroZ: number;
  ancho: number;
  profundidad: number;
  rotacionY?: number;
  orden?: number;
}

/**
 * Y offset world del piso decorativo sobre el suelo base.
 *
 * Historia:
 *   - 2026-05-14: subido de 0.01 → 0.05 para fight z-fighting (con polygonOffset
 *     activo en el material). Side effect: pisos quedaban 5cm sobre el suelo
 *     → cubrían zapatos del avatar y patas de las mesas en vista de juego.
 *   - 2026-05-15: bajado a 0.003 (3mm) tras remover polygonOffset del
 *     material. Demasiado tight — algunos drivers AMD/ANGLE tenían trouble
 *     renderizando consistentemente con margen tan chico.
 *   - 2026-05-15 (later): subido a 0.01 (1cm). Balance entre "flush enough"
 *     (avatar no parece flotando) y depth-safe (drivers AMD ANGLE consistent).
 *     1cm sobre el suelo = imperceptible en vista de juego (cámara ~5m de
 *     altura) pero suficiente separación para que ningún driver dude.
 *
 * Ref: https://threejs.org/manual/#en/cameras (sección "Z-Fighting")
 */
export const PISO_DECORATIVO_Y_OFFSET = 0.01;

/**
 * Determina si el punto world (X,Z) cae dentro de un piso decorativo.
 * Considera la rotación Y del piso (transforma el punto al frame local
 * del piso antes del bbox test). Función pura — Domain only.
 */
export function puntoEnPiso(
  puntoX: number,
  puntoZ: number,
  piso: Pick<PisoDecorativo, 'centroX' | 'centroZ' | 'ancho' | 'profundidad' | 'rotacionY'>,
): boolean {
  // Trasladar el punto al frame local del piso (centrado en origen).
  const dx = puntoX - piso.centroX;
  const dz = puntoZ - piso.centroZ;
  // Rotar -rotacionY para deshacer la rotación del piso.
  const cos = Math.cos(-piso.rotacionY);
  const sin = Math.sin(-piso.rotacionY);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return (
    localX >= -piso.ancho / 2 &&
    localX <= piso.ancho / 2 &&
    localZ >= -piso.profundidad / 2 &&
    localZ <= piso.profundidad / 2
  );
}

/**
 * Busca el piso decorativo bajo el punto (X,Z). Retorna el de mayor `orden`
 * cuando hay varios apilados (el visible "encima"). null si ninguno.
 */
export function pisoEnPunto(
  puntoX: number,
  puntoZ: number,
  pisos: ReadonlyArray<PisoDecorativo>,
): PisoDecorativo | null {
  let mejor: PisoDecorativo | null = null;
  for (const p of pisos) {
    if (!puntoEnPiso(puntoX, puntoZ, p)) continue;
    if (mejor === null || p.orden > mejor.orden) mejor = p;
  }
  return mejor;
}
