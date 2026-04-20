#!/usr/bin/env node
/**
 * Strip embedded animations from GLBs — one-shot cleanup.
 *
 * Bug: avatares Chxx_nonPBR y Eve traen 1-8 animaciones embebidas que son
 * artefactos del export FBX→GLB de Mixamo (nombres "Armature|mixamo.com|Layer0").
 * GLTFAvatar.tsx:349 dispara `baseAnimations.length > 1` → usa embebidas en vez
 * de universales → T-pose permanente.
 *
 * Este script elimina `animations` del JSON chunk del GLB. NO toca el BIN chunk
 * (los accessors huérfanos quedan en el binario, ahorro mínimo ~5% del archivo).
 * El objetivo es RUNTIME: que `gltf.animations = []` al parsearse en Three.js.
 *
 * Entrada:  C:/Users/Usuario/Downloads/nuevos avatares cowork/glb_optimizados/final_optimizados/
 * Salida:   C:/Users/Usuario/Downloads/nuevos avatares cowork/glb_optimizados/final_optimizados_clean/
 *
 * Uso: node scripts/assets/strip-embedded-anims.mjs
 *
 * Ref: glTF 2.0 spec (Khronos) — chunks JSON y BIN, padding de 4 bytes.
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const INPUT_DIR =
  'C:/Users/Usuario/Downloads/nuevos avatares cowork/glb_optimizados/final_optimizados';
const OUTPUT_DIR =
  'C:/Users/Usuario/Downloads/nuevos avatares cowork/glb_optimizados/final_optimizados_clean';

// ─── GLB binary format helpers ───────────────────────────────────────────

const MAGIC_GLTF = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'
const GLTF_VERSION = 2;

function extractChunks(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (dv.getUint32(0, true) !== MAGIC_GLTF) throw new Error('Not a GLB file');

  // JSON chunk
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error('Expected JSON chunk');
  const jsonBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonLen);

  // BIN chunk (optional)
  let binBytes = null;
  const binOffset = 20 + jsonLen;
  if (binOffset + 8 <= buffer.byteLength) {
    const binLen = dv.getUint32(binOffset, true);
    if (dv.getUint32(binOffset + 4, true) === CHUNK_BIN) {
      binBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + binOffset + 8, binLen);
    }
  }

  return { jsonBytes, binBytes };
}

function buildGLB(jsonObj, binBytes) {
  const jsonStr = JSON.stringify(jsonObj);
  // GLB spec: JSON chunk must be padded to 4-byte alignment with SPACE (0x20).
  const jsonPadLen = (4 - (jsonStr.length % 4)) % 4;
  const jsonPadded = jsonStr + ' '.repeat(jsonPadLen);
  const jsonChunk = new TextEncoder().encode(jsonPadded);

  const binLen = binBytes ? binBytes.byteLength : 0;
  // BIN chunk must be padded to 4-byte alignment with NULL (0x00).
  const binPadLen = binLen > 0 ? (4 - (binLen % 4)) % 4 : 0;
  const binTotalLen = binLen + binPadLen;

  const totalLen = 12 + 8 + jsonChunk.byteLength + (binBytes ? 8 + binTotalLen : 0);

  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);

  // Header (12 bytes)
  dv.setUint32(0, MAGIC_GLTF, true);
  dv.setUint32(4, GLTF_VERSION, true);
  dv.setUint32(8, totalLen, true);

  // JSON chunk
  dv.setUint32(12, jsonChunk.byteLength, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonChunk, 20);

  // BIN chunk
  if (binBytes) {
    const binHeaderOffset = 20 + jsonChunk.byteLength;
    dv.setUint32(binHeaderOffset, binTotalLen, true);
    dv.setUint32(binHeaderOffset + 4, CHUNK_BIN, true);
    out.set(binBytes, binHeaderOffset + 8);
    // padding bytes remain 0x00 (Uint8Array init)
  }

  return Buffer.from(out);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const files = (await readdir(INPUT_DIR)).filter((f) => f.endsWith('.glb')).sort();

  console.log(`Procesando ${files.length} GLBs...\n`);
  let totalSavedBytes = 0;
  let stripped = 0;
  let skipped = 0;

  for (const f of files) {
    const inputPath = path.join(INPUT_DIR, f);
    const outputPath = path.join(OUTPUT_DIR, f);
    const input = await readFile(inputPath);

    const { jsonBytes, binBytes } = extractChunks(input);
    const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));
    const numAnims = (gltf.animations || []).length;

    if (numAnims === 0) {
      await writeFile(outputPath, input);
      console.log(`${f.padEnd(35)} 0 anims  → copy (no change)`);
      skipped++;
      continue;
    }

    delete gltf.animations;

    const output = buildGLB(gltf, binBytes);
    await writeFile(outputPath, output);
    const saved = input.byteLength - output.byteLength;
    totalSavedBytes += saved;
    stripped++;
    const sign = saved >= 0 ? '-' : '+';
    console.log(
      `${f.padEnd(35)} ${String(numAnims).padStart(2)} anims → 0   ` +
        `${String(input.byteLength).padStart(8)} → ${String(output.byteLength).padStart(8)} ` +
        `(${sign}${Math.abs(saved).toString().padStart(6)} B)`,
    );
  }

  console.log(`\n═══ RESUMEN ═══`);
  console.log(`  Limpiados:     ${stripped}`);
  console.log(`  Sin cambio:    ${skipped}`);
  console.log(`  Bytes ahorrados: ${(totalSavedBytes / 1024).toFixed(1)} KB`);
  console.log(`\nOutput: ${OUTPUT_DIR}`);
  console.log('Re-sube estos GLBs a Supabase Storage (sobrescribe los originales).');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
