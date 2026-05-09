/**
 * PR-7: Spatial Grid — Partición espacial del mundo 3D
 *
 * Divide el espacio en celdas cuadradas (por defecto 20×20 metros).
 * Permite consultar rápidamente "¿qué avatares hay cerca del jugador?"
 * sin iterar sobre los 500.
 *
 * Complejidad:
 *   insert: O(1)
 *   remove: O(1)
 *   queryNear: O(k) donde k = avatares en celdas adyacentes (~50 de 500)
 *
 * Clean Architecture:
 *   - Infraestructura pura: no depende de React, Three.js, ni ECS
 *   - Se inyecta en CullingSystem como dependencia
 */

export class SpatialGrid<T extends { id: string }> {
  private cellSize: number;
  private cells = new Map<string, Set<T>>();
  private entityCell = new Map<string, string>(); // entityId → cellKey

  constructor(cellSize: number = 20) {
    this.cellSize = cellSize;
  }

  // ── Key generation ─────────────────────────────────────────────────────

  private cellKey(x: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cz}`;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  insert(entity: T, x: number, z: number): void {
    const key = this.cellKey(x, z);

    // Si ya estaba en otra celda, removerlo de ahí
    const oldKey = this.entityCell.get(entity.id);
    if (oldKey && oldKey !== key) {
      this.cells.get(oldKey)?.delete(entity);
    }

    // Insertar en la celda correcta
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
    this.entityCell.set(entity.id, key);
  }

  remove(entityId: string): void {
    const key = this.entityCell.get(entityId);
    if (!key) return;
    const cell = this.cells.get(key);
    if (cell) {
      for (const entity of cell) {
        if (entity.id === entityId) {
          cell.delete(entity);
          break;
        }
      }
      if (cell.size === 0) this.cells.delete(key);
    }
    this.entityCell.delete(entityId);
  }

  /**
   * Consulta todas las entidades en la celda del punto (x, z)
   * y las celdas adyacentes (8 vecinas + la propia = 9 celdas).
   *
   * Con cellSize=20, esto cubre un área de 60×60 metros.
   * En un mapa grande, esto consulta ~50-80 avatares de 500.
   */
  queryNear(x: number, z: number, radius: number = 1): T[] {
    const result: T[] = [];
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const cellRadius = Math.ceil(radius);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const entity of cell) {
            result.push(entity);
          }
        }
      }
    }

    return result;
  }

  /**
   * Retorna las entidades que están en la misma celda que (x, z).
   * Más rápido que queryNear, para uso dentro de useFrame.
   */
  queryCell(x: number, z: number): T[] {
    const key = this.cellKey(x, z);
    const cell = this.cells.get(key);
    return cell ? Array.from(cell) : [];
  }

  get totalEntities(): number {
    let total = 0;
    for (const cell of this.cells.values()) {
      total += cell.size;
    }
    return total;
  }

  get totalCells(): number {
    return this.cells.size;
  }

  clear(): void {
    this.cells.clear();
    this.entityCell.clear();
  }
}
