/**
 * Genera un PNG heightmap procedural simple para probar Fase 2.
 *
 * Patrón: dos colinas tipo gaussiana en posiciones distintas + un valle plano
 * en el centro (donde camina el avatar al spawnear). Canal R = altura [0..255].
 * Tamaño: 128x128 (coherente con CHECK constraint en DB).
 *
 * Uso:
 *   node scripts/generate-test-heightmap.mjs > /dev/null
 *   # genera: scripts/test-heightmap.png
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'test-heightmap.png');

// CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeGrayscalePng(width, height, getR) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth 8
  ihdr[9] = 0;   // color type: grayscale
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter: standard
  ihdr[12] = 0;  // interlace: none

  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      raw[y * (width + 1) + 1 + x] = Math.max(0, Math.min(255, getR(x, y) | 0));
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// Generador: ANILLO de cumbres alrededor del borde + centro PLANO (R=0).
// Patrón pensado para usar como horizonte lejano detrás del DistantSkyline:
//   - Centro (interior radio ~30%): completamente plano (R=0)
//     → queda sumido bajo el suelo del cowork, invisible
//   - Borde (exterior 30-100%): cumbres irregulares
//     → asoman por detrás de los edificios del skyline urbano
function altura(x, y) {
  const cx = (SIZE - 1) / 2;
  const cy = (SIZE - 1) / 2;
  const maxR = Math.hypot(cx, cy); // radio máximo desde centro hasta esquina
  const dCenter = Math.hypot(x - cx, y - cy);
  const rNorm = dCenter / maxR; // [0, 1]

  // Curva de elevación radial:
  //   rNorm < 0.65 → 0 (centro plano cubre el área del skyline a R=120/250=0.48)
  //   rNorm > 0.65 → sube hasta picos en borde
  // Margen 0.17 entre fin del skyline y comienzo de cumbres garantiza que
  // ninguna cumbre aparezca DENTRO del anillo de edificios.
  const innerFlat = 0.65;
  if (rNorm < innerFlat) return 0;

  // Smoothstep desde innerFlat hasta 1.0
  const t = (rNorm - innerFlat) / (1 - innerFlat);
  const radial = t * t * (3 - 2 * t); // smoothstep ∈ [0, 1]

  // Variación angular: 5 picos principales alrededor del anillo (cordillera).
  const angle = Math.atan2(y - cy, x - cx); // [-π, π]
  const peaks = 0.55 + 0.45 * Math.cos(angle * 5); // [0.10, 1.00]

  // Ruido suave (sin libs) para que no sean cumbres demasiado uniformes.
  const noise = 0.15 * (Math.sin(x * 0.35) + Math.cos(y * 0.42)) + 0.5;

  // Combinación: altura final ∈ [0, 255]
  const h = 255 * radial * peaks * noise;
  return Math.max(0, h);
}

const png = makeGrayscalePng(SIZE, SIZE, altura);
fs.writeFileSync(OUT, png);
console.log(`OK: ${OUT} (${png.length} bytes)`);
