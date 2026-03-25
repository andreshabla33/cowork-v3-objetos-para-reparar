/**
 * @module core/domain/entities/validacionZonas
 * Validación geométrica de solapamiento entre zonas/subsuelos.
 *
 * Inspirado en Gather.town (cada tile tiene un solo dueño) adaptado a
 * nuestro sistema de rectángulos AABB continuos.
 *
 * Regla principal:
 *   - Un subsuelo PUEDE estar completamente contenido dentro de una zona padre → permitido
 *   - Un subsuelo NO puede solapar parcialmente con ninguna otra zona → bloqueado
 *   - Un subsuelo NO puede solapar con otro subsuelo del mismo nivel → bloqueado
 *
 * Clean Architecture: Capa de dominio pura, sin dependencias de frameworks.
 */

export interface RectanguloZona {
  /** Centro X (coordenadas mundo) */
  x: number;
  /** Centro Z (coordenadas mundo) */
  z: number;
  /** Ancho total */
  ancho: number;
  /** Alto total (profundidad en eje Z) */
  alto: number;
}

/**
 * Detecta si dos rectángulos AABB se intersecan.
 * Los rectángulos se definen por su centro + dimensiones.
 */
export function rectangulosSeIntersecan(
  a: RectanguloZona,
  b: RectanguloZona
): boolean {
  const aMinX = a.x - a.ancho / 2;
  const aMaxX = a.x + a.ancho / 2;
  const aMinZ = a.z - a.alto / 2;
  const aMaxZ = a.z + a.alto / 2;

  const bMinX = b.x - b.ancho / 2;
  const bMaxX = b.x + b.ancho / 2;
  const bMinZ = b.z - b.alto / 2;
  const bMaxZ = b.z + b.alto / 2;

  return !(aMaxX <= bMinX || bMaxX <= aMinX || aMaxZ <= bMinZ || bMaxZ <= aMinZ);
}

/**
 * Verifica si el rectángulo `hijo` está completamente contenido dentro de `padre`.
 */
export function rectanguloContenidoEn(
  hijo: RectanguloZona,
  padre: RectanguloZona
): boolean {
  const hMinX = hijo.x - hijo.ancho / 2;
  const hMaxX = hijo.x + hijo.ancho / 2;
  const hMinZ = hijo.z - hijo.alto / 2;
  const hMaxZ = hijo.z + hijo.alto / 2;

  const pMinX = padre.x - padre.ancho / 2;
  const pMaxX = padre.x + padre.ancho / 2;
  const pMinZ = padre.z - padre.alto / 2;
  const pMaxZ = padre.z + padre.alto / 2;

  return hMinX >= pMinX && hMaxX <= pMaxX && hMinZ >= pMinZ && hMaxZ <= pMaxZ;
}

/**
 * Detecta si una nueva zona/subsuelo solapa ilegalmente con alguna zona existente.
 *
 * Lógica:
 *   - Si la nueva zona está COMPLETAMENTE contenida dentro de una existente → OK (es subsuelo)
 *   - Si hay solapamiento parcial o la nueva contiene a la existente → BLOQUEADO
 *
 * @returns true si hay solapamiento ilegal, false si es válida.
 */
export function detectarSolapamientoSubzona(
  nueva: RectanguloZona,
  existentes: RectanguloZona[]
): boolean {
  for (const existente of existentes) {
    if (!rectangulosSeIntersecan(nueva, existente)) continue;

    if (rectanguloContenidoEn(nueva, existente)) {
      continue;
    }

    // Cualquier otro tipo de solapamiento → bloqueado
    return true;
  }
  return false;
}

/**
 * Calcula el nivel de anidamiento geométrico de una zona dentro de otras zonas.
 *
 * @param objetivo La zona objetivo a calcular su nivel de anidamiento.
 * @param existentes Las zonas existentes a considerar para el cálculo.
 * @returns El nivel de anidamiento de la zona objetivo.
 */
export function calcularNivelAnidamientoRectangulo(
  objetivo: RectanguloZona,
  existentes: RectanguloZona[]
): number {
  let nivel = 0;

  for (const existente of existentes) {
    const esMismoRectangulo =
      objetivo.x === existente.x &&
      objetivo.z === existente.z &&
      objetivo.ancho === existente.ancho &&
      objetivo.alto === existente.alto;

    if (esMismoRectangulo) continue;
    if (rectanguloContenidoEn(objetivo, existente)) nivel += 1;
  }

  return nivel;
}

/**
 * Convierte una zona de la BD (posición/dimensiones en unidades × 16) a coordenadas mundo.
 */
export function zonaDbAMundo(zona: {
  posicion_x: number;
  posicion_y: number;
  ancho: number;
  alto: number;
}): RectanguloZona {
  return {
    x: Number(zona.posicion_x) / 16,
    z: Number(zona.posicion_y) / 16,
    ancho: Math.max(1, Number(zona.ancho) / 16),
    alto: Math.max(1, Number(zona.alto) / 16),
  };
}
