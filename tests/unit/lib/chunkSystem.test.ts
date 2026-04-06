import { describe, it, expect } from 'vitest';
import { obtenerChunk, obtenerChunksVecinos, ChunkInfo } from '../../../lib/chunkSystem';

describe('chunkSystem', () => {
  describe('obtenerChunk', () => {
    it('should calculate chunk coordinates from world coordinates', () => {
      const chunk = obtenerChunk(0, 0);
      expect(chunk.cx).toBe(0);
      expect(chunk.cy).toBe(0);
    });

    it('should calculate correct chunk for positive coordinates within first chunk', () => {
      const chunk = obtenerChunk(100, 150);
      expect(chunk.cx).toBe(0);
      expect(chunk.cy).toBe(0);
    });

    it('should calculate correct chunk for coordinates at chunk boundary', () => {
      const chunk = obtenerChunk(200, 200);
      expect(chunk.cx).toBe(1);
      expect(chunk.cy).toBe(1);
    });

    it('should calculate correct chunk for large positive coordinates', () => {
      const chunk = obtenerChunk(1000, 1500);
      expect(chunk.cx).toBe(5);
      expect(chunk.cy).toBe(7);
    });

    it('should handle negative coordinates correctly', () => {
      const chunk = obtenerChunk(-100, -150);
      expect(chunk.cx).toBe(-1);
      expect(chunk.cy).toBe(-1);
    });

    it('should handle negative coordinates at chunk boundary', () => {
      const chunk = obtenerChunk(-200, -200);
      expect(chunk.cx).toBe(-1);
      expect(chunk.cy).toBe(-1);
    });

    it('should handle negative coordinates beyond chunk boundary', () => {
      const chunk = obtenerChunk(-400, -600);
      expect(chunk.cx).toBe(-2);
      expect(chunk.cy).toBe(-3);
    });

    it('should handle mixed positive and negative coordinates', () => {
      const chunk = obtenerChunk(-100, 300);
      expect(chunk.cx).toBe(-1);
      expect(chunk.cy).toBe(1);
    });

    it('should generate correct chunk key', () => {
      const chunk = obtenerChunk(100, 200);
      expect(chunk.clave).toBe('chunk_0_1');
    });

    it('should generate correct chunk key for negative coordinates', () => {
      const chunk = obtenerChunk(-100, -200);
      expect(chunk.clave).toBe('chunk_-1_-1');
    });

    it('should support custom chunk size', () => {
      const chunk = obtenerChunk(100, 100, 50);
      expect(chunk.cx).toBe(2);
      expect(chunk.cy).toBe(2);
    });

    it('should calculate consistent chunks for coordinates in same chunk with custom size', () => {
      const chunk1 = obtenerChunk(25, 25, 50);
      const chunk2 = obtenerChunk(49, 49, 50);
      expect(chunk1.cx).toBe(chunk2.cx);
      expect(chunk1.cy).toBe(chunk2.cy);
    });

    it('should have consistent chunk size default of 200', () => {
      const chunk1 = obtenerChunk(199, 199);
      const chunk2 = obtenerChunk(200, 200);
      expect(chunk1.cx).toBe(0);
      expect(chunk1.cy).toBe(0);
      expect(chunk2.cx).toBe(1);
      expect(chunk2.cy).toBe(1);
    });

    it('should return ChunkInfo with all required properties', () => {
      const chunk = obtenerChunk(100, 150);
      expect(chunk).toHaveProperty('cx');
      expect(chunk).toHaveProperty('cy');
      expect(chunk).toHaveProperty('clave');
      expect(typeof chunk.cx).toBe('number');
      expect(typeof chunk.cy).toBe('number');
      expect(typeof chunk.clave).toBe('string');
    });
  });

  describe('obtenerChunksVecinos', () => {
    it('should return single chunk with radius 0', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 0);
      expect(neighbors).toHaveLength(1);
      expect(neighbors).toContain('chunk_0_0');
    });

    it('should return 9 chunks with default radius of 1', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk);
      expect(neighbors).toHaveLength(9);
    });

    it('should include center chunk in neighbors with radius 1', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 1);
      expect(neighbors).toContain('chunk_0_0');
    });

    it('should include all 8 adjacent chunks with radius 1', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 1);
      expect(neighbors).toContain('chunk_-1_-1');
      expect(neighbors).toContain('chunk_-1_0');
      expect(neighbors).toContain('chunk_-1_1');
      expect(neighbors).toContain('chunk_0_-1');
      expect(neighbors).toContain('chunk_0_1');
      expect(neighbors).toContain('chunk_1_-1');
      expect(neighbors).toContain('chunk_1_0');
      expect(neighbors).toContain('chunk_1_1');
    });

    it('should return 25 chunks with radius 2', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 2);
      expect(neighbors).toHaveLength(25);
    });

    it('should work with negative chunk coordinates', () => {
      const chunk: ChunkInfo = { cx: -5, cy: -3, clave: 'chunk_-5_-3' };
      const neighbors = obtenerChunksVecinos(chunk, 1);
      expect(neighbors).toHaveLength(9);
      expect(neighbors).toContain('chunk_-5_-3');
      expect(neighbors).toContain('chunk_-4_-2');
      expect(neighbors).toContain('chunk_-6_-4');
    });

    it('should work with large positive chunk coordinates', () => {
      const chunk: ChunkInfo = { cx: 100, cy: 200, clave: 'chunk_100_200' };
      const neighbors = obtenerChunksVecinos(chunk, 1);
      expect(neighbors).toHaveLength(9);
      expect(neighbors).toContain('chunk_100_200');
      expect(neighbors).toContain('chunk_99_199');
      expect(neighbors).toContain('chunk_101_201');
    });

    it('should return correct count for larger radius', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 3);
      // (3*2+1)^2 = 7^2 = 49
      expect(neighbors).toHaveLength(49);
    });

    it('should not contain duplicates', () => {
      const chunk: ChunkInfo = { cx: 0, cy: 0, clave: 'chunk_0_0' };
      const neighbors = obtenerChunksVecinos(chunk, 2);
      const uniqueNeighbors = new Set(neighbors);
      expect(uniqueNeighbors.size).toBe(neighbors.length);
    });

    it('should generate all neighbors in square pattern', () => {
      const chunk: ChunkInfo = { cx: 5, cy: 5, clave: 'chunk_5_5' };
      const neighbors = obtenerChunksVecinos(chunk, 1);
      // All x values should be in range [4, 6]
      // All y values should be in range [4, 6]
      neighbors.forEach((key) => {
        const match = key.match(/chunk_(-?\d+)_(-?\d+)/);
        expect(match).not.toBeNull();
        const cx = parseInt(match![1], 10);
        const cy = parseInt(match![2], 10);
        expect(cx).toBeGreaterThanOrEqual(4);
        expect(cx).toBeLessThanOrEqual(6);
        expect(cy).toBeGreaterThanOrEqual(4);
        expect(cy).toBeLessThanOrEqual(6);
      });
    });
  });

  describe('Integration tests', () => {
    it('should correctly identify chunks for nearby coordinates', () => {
      const pos1 = obtenerChunk(150, 150);
      const pos2 = obtenerChunk(160, 160);
      expect(pos1.cx).toBe(pos2.cx);
      expect(pos1.cy).toBe(pos2.cy);
      expect(pos1.clave).toBe(pos2.clave);
    });

    it('should return different chunks for distant coordinates', () => {
      const pos1 = obtenerChunk(100, 100);
      const pos2 = obtenerChunk(500, 500);
      expect(pos1.cx).not.toBe(pos2.cx);
      expect(pos1.cy).not.toBe(pos2.cy);
    });

    it('should verify neighbor chunk contains original chunk', () => {
      const chunk = obtenerChunk(250, 350);
      const neighbors = obtenerChunksVecinos(chunk, 1);
      expect(neighbors).toContain(chunk.clave);
    });

    it('should handle world coordinate to chunk lookup workflow', () => {
      // Find chunk for a world position
      const worldPos1 = obtenerChunk(1234, 5678);
      // Get neighbors
      const neighbors = obtenerChunksVecinos(worldPos1, 1);
      // Verify original chunk is included
      expect(neighbors).toContain(worldPos1.clave);
      // Verify we have 9 neighbors (including self)
      expect(neighbors).toHaveLength(9);
    });

    it('should handle chunk boundary crossing', () => {
      const chunkBefore = obtenerChunk(199, 199);
      const chunkAfter = obtenerChunk(200, 200);
      expect(chunkBefore.clave).not.toBe(chunkAfter.clave);
    });

    it('should maintain consistency across chunk size transitions', () => {
      const defaultChunk = obtenerChunk(400, 400);
      const customChunk = obtenerChunk(400, 400, 200);
      expect(defaultChunk.cx).toBe(customChunk.cx);
      expect(defaultChunk.cy).toBe(customChunk.cy);
    });
  });
});
