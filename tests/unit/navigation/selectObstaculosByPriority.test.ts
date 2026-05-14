/**
 * Tests del helper de priorización de obstáculos para el TileCache.
 *
 * Cobertura del invariante: el TileCache de recast-navigation tiene un cap
 * absoluto upstream de 64 obstacles (DT_BUFFER_TOO_SMALL si excede). El helper
 * filtra una lista arbitraria para quedarse con los más cercanos al spawn,
 * garantizando que los obstáculos relevantes al pathfinding del jugador queden
 * dentro del cap.
 *
 * Ref: src/modules/space3d/presentation/hooks/useNavigation.ts
 * Ref: https://github.com/isaac-mason/recast-navigation-js (README — TileCache)
 */

import { describe, expect, it } from 'vitest';
import { selectObstaculosByPriority } from '@/modules/space3d/presentation/hooks/useNavigation';
import type { NavigationObstaculo } from '@/core/domain/ports/INavigationService';

function obs(id: string, x: number, z: number): NavigationObstaculo {
  return {
    id,
    position: { x, y: 0, z },
    halfExtents: { x: 0.5, y: 1, z: 0.5 },
    rotationY: 0,
  };
}

describe('selectObstaculosByPriority', () => {
  it('retorna todos los obstáculos si están bajo el cap', () => {
    const input = [obs('a', 10, 10), obs('b', 20, 20)];
    const { selected, deprioritized } = selectObstaculosByPriority(input, { x: 0, z: 0 }, 64);
    expect(selected).toHaveLength(2);
    expect(deprioritized).toBe(0);
  });

  it('selecciona los maxCount más cercanos al anchor por distancia²', () => {
    const input = [
      obs('lejos-1', 100, 0),
      obs('cerca', 1, 1),
      obs('medio', 5, 5),
      obs('lejos-2', 50, 50),
    ];
    const { selected, deprioritized } = selectObstaculosByPriority(input, { x: 0, z: 0 }, 2);
    expect(selected.map((o) => o.id)).toEqual(['cerca', 'medio']);
    expect(deprioritized).toBe(2);
  });

  it('respeta exactamente el cap absoluto del TileCache (64)', () => {
    const input: NavigationObstaculo[] = [];
    for (let i = 0; i < 100; i++) {
      input.push(obs(`o-${i}`, i, i));
    }
    const { selected, deprioritized } = selectObstaculosByPriority(input, { x: 0, z: 0 }, 64);
    expect(selected).toHaveLength(64);
    expect(deprioritized).toBe(36);
  });

  it('anchor no-zero altera la selección correctamente', () => {
    const input = [obs('cerca-a-spawn', 0, 0), obs('cerca-a-anchor', 50, 50)];
    const { selected } = selectObstaculosByPriority(input, { x: 50, z: 50 }, 1);
    expect(selected[0].id).toBe('cerca-a-anchor');
  });

  it('lista vacía → selected vacía y deprioritized = 0', () => {
    const { selected, deprioritized } = selectObstaculosByPriority([], { x: 0, z: 0 }, 64);
    expect(selected).toHaveLength(0);
    expect(deprioritized).toBe(0);
  });

  it('no muta el array de entrada (pureza)', () => {
    const input = [obs('b', 10, 10), obs('a', 1, 1), obs('c', 100, 100)];
    const snapshot = input.map((o) => o.id);
    selectObstaculosByPriority(input, { x: 0, z: 0 }, 2);
    expect(input.map((o) => o.id)).toEqual(snapshot);
  });
});
