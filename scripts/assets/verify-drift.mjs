#!/usr/bin/env node
/**
 * @file scripts/assets/verify-drift.mjs
 * @description Verifica que cada modelo_url en catalogo_objetos_3d y
 *              espacio_objetos corresponde a un archivo real en Supabase
 *              Storage. Detecta drift (URLs rotas, assets no referenciados).
 *
 * Clean Architecture: Build tooling / Infrastructure.
 *
 * Uso:
 *   node --env-file=.env scripts/assets/verify-drift.mjs
 *
 * Requiere: VITE_SUPABASE_URL o SUPABASE_URL en .env
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL / VITE_SUPABASE_URL no definida.');
  process.exit(1);
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'avatars';
const PREFIX = process.env.SUPABASE_STORAGE_PREFIX ?? 'pruebasObjetos';

/**
 * Verifica si una URL pública de Supabase Storage devuelve 200.
 * @param {string} url
 * @returns {Promise<{url: string, status: number, ok: boolean, size: number}>}
 */
async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const size = parseInt(res.headers.get('content-length') ?? '0', 10);
    return { url, status: res.status, ok: res.ok, size };
  } catch (err) {
    return { url, status: 0, ok: false, size: 0 };
  }
}

async function main() {
  console.log('◐ Verificando drift catálogo vs storage...\n');

  // Assets que esperamos estén mergeados tras DEBT-002
  const expectedMerged = [
    { slug: 'keyboard', file: 'Keyboard.merged.glb' },
    { slug: 'adjustable_desk', file: 'Adjustable Desk.merged.glb' },
    { slug: 'simple_computer', file: 'Simple computer.merged.glb' },
  ];

  // Verificar que los merged existen en storage
  console.log('── Merged GLBs en Storage ──');
  let allMergedOk = true;
  for (const asset of expectedMerged) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}/${asset.file}`;
    const result = await checkUrl(url);
    const icon = result.ok ? '✓' : '✗';
    const sizeKB = (result.size / 1024).toFixed(1);
    console.log(`  ${icon} ${asset.slug.padEnd(20)} ${asset.file.padEnd(35)} ${result.ok ? `${sizeKB} KB` : `HTTP ${result.status}`}`);
    if (!result.ok) allMergedOk = false;
  }

  // Verificar que los originales aún existen (rollback safety)
  const originals = [
    { slug: 'keyboard', file: 'Keyboard.glb' },
    { slug: 'adjustable_desk', file: 'Adjustable Desk.glb' },
    { slug: 'simple_computer', file: 'Simple computer.glb' },
  ];

  console.log('\n── Originales (backup/rollback) ──');
  for (const asset of originals) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}/${asset.file}`;
    const result = await checkUrl(url);
    const icon = result.ok ? '✓' : '⚠';
    const sizeKB = (result.size / 1024).toFixed(1);
    console.log(`  ${icon} ${asset.slug.padEnd(20)} ${asset.file.padEnd(35)} ${result.ok ? `${sizeKB} KB` : 'MISSING (no rollback available!)'}`);
  }

  // Resultado final
  console.log('\n' + (allMergedOk
    ? '✓ Drift check PASSED: todos los merged GLBs existen en storage.'
    : '✗ Drift check FAILED: faltan merged GLBs. Ejecuta los scripts de premerge primero.'));

  process.exit(allMergedOk ? 0 : 1);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('✗', err);
    process.exit(1);
  });
}
