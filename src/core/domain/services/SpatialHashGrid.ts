/**
 * @module src/core/domain/services/SpatialHashGrid
 *
 * Grid de hashing espacial para queries de proximidad en O(1) amortizado.
 * Reemplaza el loop lineal O(n) sobre todos los avatares.
 *
 * Convención: todas las coords están en el MISMO sistema (world-units de
 * useProximity, pre-escala /16). La consumer decide qué unit usar; la grid
 * no interpreta, solo agrupa por celda = floor(coord / cellSize).
 *
 * Trade-off:
 *  - `cellSize = queryRadius` → cada query revisa 9 celdas (3×3).
 *  - `cellSize = queryRadius * 2` → 4 celdas (2×2), pero menos tight.
 *  - Pattern game-dev estándar — ver "Broad Phase Collision Detection"
 *    (Ericson, Real-Time Collision Detection §7.1).
 *
 * No usamos librería externa porque el algoritmo es triviales ~50 líneas y
 * evitamos añadir dep (rbush, kd-tree-javascript) a Domain layer.
 */

export interface SpatialEntity {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export class SpatialHashGrid<T extends SpatialEntity> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {
    if (cellSize <= 0) {
      throw new Error(`SpatialHashGrid cellSize debe ser > 0 (recibido: ${cellSize})`);
    }
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(entity: T): void {
    const k = this.key(entity.x, entity.y);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(entity);
    else this.cells.set(k, [entity]);
  }

  insertMany(entities: Iterable<T>): void {
    for (const e of entities) this.insert(e);
  }

  /**
   * Devuelve entidades en las celdas que cubren el bbox `[x±radius, y±radius]`.
   *
   * IMPORTANTE: es un broad-phase — puede incluir falsos positivos por las
   * esquinas de las celdas. El caller debe hacer narrow-phase (distance²
   * check) si necesita la lista exacta de vecinos dentro del radio.
   */
  queryNear(x: number, y: number, radius: number): T[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const r = Math.ceil(radius / this.cellSize);
    const result: T[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = this.cells.get(`${cx + dx},${cy + dy}`);
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }

  get size(): number {
    let total = 0;
    for (const bucket of this.cells.values()) total += bucket.length;
    return total;
  }
}
