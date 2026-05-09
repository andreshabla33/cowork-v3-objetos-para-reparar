/**
 * @module lib/rendering/extractHeightsFromTexture
 *
 * Convierte un PNG heightmap (canal R = altura) en `Float32Array` consumible
 * por `HeightfieldCollider` de Rapier.
 *
 * Coste:
 *   - One-shot al cargar la textura. Después coste = 0 por frame.
 *   - O(nrows × ncols) en CPU; para 128×128 son 16.384 lookups (< 1ms).
 *
 * Convención: el canal R de cada pixel codifica la altura normalizada [0, 1].
 * El consumidor multiplica por `escala.y` para obtener altura en metros.
 *
 * Plan: docs/PLAN-TERRENO-RIOS.md (Fase 2.2)
 */

const MIN_DIM = 16;
const MAX_DIM = 256;

export interface ExtractHeightsParams {
  /** URL pública del PNG (canal R = altura). */
  url: string;
  /** Filas del grid resultante. */
  nrows: number;
  /** Columnas del grid resultante. */
  ncols: number;
  /** Si la textura es de origen distinto, intentar CORS. Default: true. */
  crossOrigin?: boolean;
}

export class HeightmapInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeightmapInvalidoError';
  }
}

/**
 * Carga el heightmap desde URL y devuelve un `Float32Array` con las alturas
 * normalizadas a [0, 1]. Lanza `HeightmapInvalidoError` si las dimensiones
 * están fuera de rango o la imagen no se puede leer.
 */
export async function extractHeightsFromTexture(
  params: ExtractHeightsParams,
): Promise<Float32Array> {
  const { url, nrows, ncols, crossOrigin = true } = params;

  if (nrows < MIN_DIM || nrows > MAX_DIM || ncols < MIN_DIM || ncols > MAX_DIM) {
    throw new HeightmapInvalidoError(
      `nrows/ncols deben estar en [${MIN_DIM}, ${MAX_DIM}] (recibidos: ${nrows}×${ncols})`,
    );
  }

  const img = await cargarImagen(url, crossOrigin);
  const canvas = document.createElement('canvas');
  canvas.width = ncols;
  canvas.height = nrows;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new HeightmapInvalidoError('No se pudo crear contexto 2D');

  ctx.drawImage(img, 0, 0, ncols, nrows);
  const pixels = ctx.getImageData(0, 0, ncols, nrows).data;

  const heights = new Float32Array(nrows * ncols);
  for (let row = 0; row < nrows; row++) {
    for (let col = 0; col < ncols; col++) {
      const pxIdx = (row * ncols + col) * 4;
      heights[row * ncols + col] = pixels[pxIdx] / 255;
    }
  }
  return heights;
}

function cargarImagen(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new HeightmapInvalidoError(`No se pudo cargar heightmap: ${url}`));
    img.src = url;
  });
}
