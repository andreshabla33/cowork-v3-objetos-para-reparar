export type ChunkWorkerMessage =
  | { type: 'compute'; payload: { current: { x: number; y: number }; radio: number; users: Array<{ id: string; x: number; y: number }> } };

type ChunkWorkerResponse =
  | { type: 'result'; payload: { usuariosIds: string[]; chunksVecinos: string[] } }
  | { type: 'error'; payload: { message: string } };

interface ChunkInfo {
  cx: number;
  cy: number;
  clave: string;
}

const CHUNK_SIZE = 200;

const obtenerChunk = (x: number, y: number, tamano: number = CHUNK_SIZE): ChunkInfo => {
  const cx = Math.floor(x / tamano);
  const cy = Math.floor(y / tamano);
  return { cx, cy, clave: `chunk_${cx}_${cy}` };
};

const obtenerChunksVecinos = (chunk: ChunkInfo, radio: number = 1): string[] => {
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

const enviar = (mensaje: ChunkWorkerResponse) => {
  postMessage(mensaje);
};

self.onmessage = (event: MessageEvent<ChunkWorkerMessage>) => {
  try {
    const { type, payload } = event.data || {};
    if (type !== 'compute' || !payload) {
      enviar({ type: 'error', payload: { message: 'Mensaje inválido para worker de chunks' } });
      return;
    }

    const { current, radio, users } = payload;
    if (!current || typeof current.x !== 'number' || typeof current.y !== 'number') {
      enviar({ type: 'error', payload: { message: 'Coordenadas actuales inválidas' } });
      return;
    }

    const chunkActual = obtenerChunk(current.x, current.y);
    const chunksVecinos = obtenerChunksVecinos(chunkActual, radio);
    const chunkSet = new Set(chunksVecinos);

    const usuariosIds = (users || [])
      .filter((usuario) => typeof usuario.x === 'number' && typeof usuario.y === 'number')
      .filter((usuario) => chunkSet.has(obtenerChunk(usuario.x, usuario.y).clave))
      .map((usuario) => usuario.id);

    enviar({ type: 'result', payload: { usuariosIds, chunksVecinos } });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido en worker';
    enviar({ type: 'error', payload: { message: mensaje } });
  }
};
