/**
 * @module domain/entities/espacio3d/PlacementPolicy
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Supabase).
 *
 * Reglas de colocación (placement) de objetos 3D dentro de un espacio.
 *
 * Modelo: AABB (Axis-Aligned Bounding Box) derivado de los campos de dominio
 * `posicion_x/y/z` + `ancho/alto/profundidad` del objeto. Esto nos permite
 * razonar sobre intersecciones ray↔objeto sin tocar el grafo de meshes de
 * Three.js — el dominio queda 100% puro y testeable.
 *
 * Por qué AABB y no raycasting real contra meshes:
 *   1. Los objetos están batched/instanced (BatchedMesh, InstancedMesh). Un
 *      raycast real devuelve el mesh del batch, no identifica la instancia
 *      individual — resolver el mapping instanceId→objetoId es un refactor
 *      grande del pipeline de rendering.
 *   2. Los objetos del catálogo son "cajas" por diseño (columnas ancho/alto
 *      /profundidad). Un AABB es exacto para la semántica del dominio.
 *   3. El dominio debe ser testeable sin WebGL. AABB = matemáticas puras.
 *
 * Ref Three.js: https://threejs.org/docs/#api/en/math/Ray.intersectBox
 *   "Returns the point of intersection between the given ray and the Box3
 *    or null if there is no intersection."
 */

// ─── Tipos de dominio ────────────────────────────────────────────────────────

/**
 * Caja AABB en coordenadas de mundo. `min` es la esquina inferior
 * (x mínima, y mínima, z mínima); `max` es la esquina superior opuesta.
 */
export interface AABB {
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  readonly max: Readonly<{ x: number; y: number; z: number }>;
}

/** Objeto candidato a ser superficie de apilamiento. */
export interface ObjetoColocable {
  readonly id: string;
  readonly posicionX: number;
  readonly posicionY: number;
  readonly posicionZ: number;
  readonly ancho: number;
  readonly alto: number;
  readonly profundidad: number;
  readonly esSuperficie: boolean;
}

/** Rayo en coordenadas de mundo (origen + dirección normalizada). */
export interface Rayo {
  readonly origenX: number;
  readonly origenY: number;
  readonly origenZ: number;
  readonly direccionX: number;
  readonly direccionY: number;
  readonly direccionZ: number;
}

/** Resultado de evaluar todos los objetos contra un rayo. */
export interface HitSuperficie {
  readonly objetoId: string;
  readonly topY: number;
  readonly esSuperficie: boolean;
  readonly distancia: number;
  readonly puntoX: number;
  readonly puntoZ: number;
}

/** Posición final donde se colocará el objeto. */
export interface Posicion3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// ─── Construcción de AABB desde datos de dominio ─────────────────────────────

/**
 * Construye el AABB de mundo de un objeto. `posicion_y` del objeto es el
 * centro vertical (convención del proyecto: `alto / 2`), así que los
 * extremos son `posicion_y ± alto / 2`.
 */
export function construirAABB(objeto: ObjetoColocable): AABB {
  const halfAncho = objeto.ancho / 2;
  const halfAlto = objeto.alto / 2;
  const halfProfundidad = objeto.profundidad / 2;
  return {
    min: {
      x: objeto.posicionX - halfAncho,
      y: objeto.posicionY - halfAlto,
      z: objeto.posicionZ - halfProfundidad,
    },
    max: {
      x: objeto.posicionX + halfAncho,
      y: objeto.posicionY + halfAlto,
      z: objeto.posicionZ + halfProfundidad,
    },
  };
}

// ─── Intersección rayo↔AABB (slab method) ────────────────────────────────────

/**
 * Implementa el *slab method* para ray-box intersection. Devuelve la
 * distancia `t` desde el origen del rayo al primer punto de entrada (o null
 * si no intersecta o si la caja está detrás del origen).
 *
 * Ref: *Real-Time Rendering* 3rd ed., sección 16.7 — "Ray/Box intersection".
 * Ref Three.js source: Ray.js `intersectBox` usa el mismo algoritmo.
 */
function intersectarRayoAABB(rayo: Rayo, caja: AABB): number | null {
  const invDirX = 1 / rayo.direccionX;
  const invDirY = 1 / rayo.direccionY;
  const invDirZ = 1 / rayo.direccionZ;

  let tmin: number;
  let tmax: number;

  if (invDirX >= 0) {
    tmin = (caja.min.x - rayo.origenX) * invDirX;
    tmax = (caja.max.x - rayo.origenX) * invDirX;
  } else {
    tmin = (caja.max.x - rayo.origenX) * invDirX;
    tmax = (caja.min.x - rayo.origenX) * invDirX;
  }

  let tymin: number;
  let tymax: number;
  if (invDirY >= 0) {
    tymin = (caja.min.y - rayo.origenY) * invDirY;
    tymax = (caja.max.y - rayo.origenY) * invDirY;
  } else {
    tymin = (caja.max.y - rayo.origenY) * invDirY;
    tymax = (caja.min.y - rayo.origenY) * invDirY;
  }
  if (tmin > tymax || tymin > tmax) return null;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  let tzmin: number;
  let tzmax: number;
  if (invDirZ >= 0) {
    tzmin = (caja.min.z - rayo.origenZ) * invDirZ;
    tzmax = (caja.max.z - rayo.origenZ) * invDirZ;
  } else {
    tzmin = (caja.max.z - rayo.origenZ) * invDirZ;
    tzmax = (caja.min.z - rayo.origenZ) * invDirZ;
  }
  if (tmin > tzmax || tzmin > tmax) return null;
  if (tzmin > tmin) tmin = tzmin;
  if (tzmax < tmax) tmax = tzmax;

  // Descarta cajas detrás del origen.
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

// ─── Resolver superficie apuntada por el rayo ─────────────────────────────────

/**
 * Recorre los objetos candidatos, descarta los que no intersectan, y devuelve
 * el más cercano al origen del rayo. Se excluye `idEnColocacion` para evitar
 * que el objeto que estás arrastrando se auto-apile sobre sí mismo.
 *
 * Complejidad O(n) sobre los objetos — suficiente para el rango típico
 * (<1000 objetos por espacio). Si escala más, se puede añadir un broad-phase
 * tipo grid/BVH, pero es optimización prematura hoy.
 */
export function resolverHitSuperficie(
  rayo: Rayo,
  objetos: readonly ObjetoColocable[],
  idEnColocacion: string | null,
): HitSuperficie | null {
  let mejor: HitSuperficie | null = null;
  for (const obj of objetos) {
    if (obj.id === idEnColocacion) continue;
    const caja = construirAABB(obj);
    const t = intersectarRayoAABB(rayo, caja);
    if (t === null) continue;
    if (mejor !== null && t >= mejor.distancia) continue;
    const puntoX = rayo.origenX + rayo.direccionX * t;
    const puntoZ = rayo.origenZ + rayo.direccionZ * t;
    mejor = {
      objetoId: obj.id,
      topY: caja.max.y,
      esSuperficie: obj.esSuperficie,
      distancia: t,
      puntoX,
      puntoZ,
    };
  }
  return mejor;
}

// ─── Política de colocación (fail-closed, whitelist) ─────────────────────────

/**
 * Política:
 *   - Si NO hay hit contra objetos, o si el hit es contra un objeto con
 *     `esSuperficie=false` → se cae al suelo (Y = alto/2 del objeto a colocar).
 *   - Si el hit es contra un objeto con `esSuperficie=true` → se apila
 *     encima: Y = topY del target + alto/2 del objeto a colocar.
 *
 * La X/Z se toma del hit más reciente (sea contra objeto o contra suelo).
 * El caller es responsable de darnos `hitPiso` cuando el rayo llega al
 * plano Y=0 — no miramos el plano desde aquí para mantener el dominio
 * independiente de THREE.
 */
export function resolverPosicionColocacion(input: {
  readonly hitObjeto: HitSuperficie | null;
  readonly hitPisoX: number;
  readonly hitPisoZ: number;
  readonly altoAColocar: number;
}): Posicion3D {
  const halfAltoAColocar = input.altoAColocar / 2;

  // Sin hit contra objetos → suelo.
  if (input.hitObjeto === null) {
    return { x: input.hitPisoX, y: halfAltoAColocar, z: input.hitPisoZ };
  }

  // Hit contra objeto no-superficie → también suelo, pero X/Z del suelo
  // (el puntero siguió su camino hasta el piso pasando por encima/al lado).
  if (!input.hitObjeto.esSuperficie) {
    return { x: input.hitPisoX, y: halfAltoAColocar, z: input.hitPisoZ };
  }

  // Hit contra superficie válida → apilar.
  return {
    x: input.hitObjeto.puntoX,
    y: input.hitObjeto.topY + halfAltoAColocar,
    z: input.hitObjeto.puntoZ,
  };
}
