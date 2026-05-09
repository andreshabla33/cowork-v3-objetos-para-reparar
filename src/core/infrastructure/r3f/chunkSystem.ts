export interface ChunkInfo {
  cx: number;
  cy: number;
  clave: string;
}

const CHUNK_SIZE = 200;

export const obtenerChunk = (x: number, y: number, tamano: number = CHUNK_SIZE): ChunkInfo => {
  const cx = Math.floor(x / tamano);
  const cy = Math.floor(y / tamano);
  return { cx, cy, clave: `chunk_${cx}_${cy}` };
};

export const obtenerChunksVecinos = (chunk: ChunkInfo, radio: number = 1): string[] => {
  const claves: string[] = [];
  for (let dx = -radio; dx <= radio; dx += 1) {
    for (let dy = -radio; dy <= radio; dy += 1) {
      const cx = chunk.cx + dx;
      const cy = chunk.cy + dy;
      claves.push(`chunk_${cx}_${cy}`);
    }
  }
  return claves;
};
