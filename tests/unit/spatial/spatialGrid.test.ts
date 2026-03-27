import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid } from '@/lib/spatial/SpatialGrid';

describe('SpatialGrid', () => {
  let grid: SpatialGrid<{ id: string }>;

  beforeEach(() => {
    grid = new SpatialGrid(10);
  });

  it('inserts and queries entities in the same cell', () => {
    grid.insert({ id: 'a' }, 5, 5);
    grid.insert({ id: 'b' }, 7, 8);
    const result = grid.queryCell(5, 5);
    expect(result.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('entities in different cells are separated', () => {
    grid.insert({ id: 'a' }, 5, 5);
    grid.insert({ id: 'b' }, 25, 25); // cell (2,2) vs (0,0)
    const cell0 = grid.queryCell(5, 5);
    const cell2 = grid.queryCell(25, 25);
    expect(cell0.map((e) => e.id)).toEqual(['a']);
    expect(cell2.map((e) => e.id)).toEqual(['b']);
  });

  it('queryNear returns entities from adjacent cells', () => {
    grid.insert({ id: 'a' }, 5, 5);   // cell (0,0)
    grid.insert({ id: 'b' }, 15, 15);  // cell (1,1)
    grid.insert({ id: 'c' }, 35, 35);  // cell (3,3)
    const near = grid.queryNear(5, 5, 1);
    const ids = near.map((e) => e.id).sort();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c');
  });

  it('remove deletes entity from grid', () => {
    grid.insert({ id: 'a' }, 5, 5);
    expect(grid.totalEntities).toBe(1);
    grid.remove('a');
    expect(grid.totalEntities).toBe(0);
    expect(grid.queryCell(5, 5)).toEqual([]);
  });

  it('insert handles entity moving between cells', () => {
    const entity = { id: 'a' };
    grid.insert(entity, 5, 5);   // cell (0,0)
    grid.insert(entity, 15, 15); // cell (1,1) — should move
    expect(grid.queryCell(5, 5)).toEqual([]);
    expect(grid.queryCell(15, 15).map((e) => e.id)).toEqual(['a']);
    expect(grid.totalEntities).toBe(1);
  });

  it('clear removes all entities and cells', () => {
    grid.insert({ id: 'a' }, 5, 5);
    grid.insert({ id: 'b' }, 15, 15);
    grid.clear();
    expect(grid.totalEntities).toBe(0);
    expect(grid.totalCells).toBe(0);
  });

  it('queryNear with default radius returns 9 cells', () => {
    // Insert entities in cells (0,0) through (2,2)
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        grid.insert({ id: `${x}-${z}` }, x * 10 + 5, z * 10 + 5);
      }
    }
    // Query from center cell (1,1) — should find all 9
    const near = grid.queryNear(15, 15);
    expect(near).toHaveLength(9);
  });
});
