#!/usr/bin/env node
/**
 * @file scripts/assets/premerge-glb.mjs
 * @description Pre-fusiona primitivas de un asset GLB por material, reduciendo
 *              drásticamente el número de meshes que el runtime tiene que
 *              instanciar en `StaticObjectBatcher` / `MultiBatchMesh`.
 *
 * ## Motivación (auditoría rendimiento 2026-04-09 — BUG-3)
 * `Keyboard.glb` tiene 67 primitivas (una por tecla). Multiplicado por los
 * 21 teclados que hay en un espacio de prueba, el runtime crea
 * 67 × 21 = 1 407 instances en BatchedMesh. Fusionando las 67 primitivas
 * por material, cada teclado queda en ≤ 2 meshes → 21–42 instances
 * (reducción ≥ 96 %).
 *
 * ## Clean Architecture (Build tooling)
 * Este script NO forma parte del runtime. Pertenece a la capa de tooling de
 * infraestructura (`scripts/assets/`). Mantiene tres responsabilidades
 * claramente separadas, cada una implementada como función pura:
 *
 *   1. `downloadGlb(url)`            — Infrastructure (fetch)
 *   2. `mergeGlbByMaterial(bytes)`   — Application (transformación pura)
 *   3. `uploadGlb(bytes, path)`      — Infrastructure (Supabase Storage)
 *
 * El entrypoint `main()` es el único que orquesta.
 *
 * ## Dependencias
 * - `@gltf-transform/core`      ^4.x  (Node-native, Don McCurdy / Khronos)
 * - `@gltf-transform/functions` ^4.x  (weld, dedup, flatten, join)
 * - `@supabase/supabase-js`     ya presente en el proyecto
 *
 * Si no están instaladas, ejecutar desde la raíz de `v3.7/`:
 *
 *   npm install -D @gltf-transform/core @gltf-transform/functions
 *
 * ## Uso
 *
 *   # Uso básico — pre-merge del Keyboard por defecto:
 *   node scripts/assets/premerge-glb.mjs
 *
 *   # Con asset custom:
 *   node scripts/assets/premerge-glb.mjs \
 *     --input "Keyboard.glb" \
 *     --output "Keyboard.merged.glb"
 *
 *   # Variables de entorno requeridas:
 *   #   SUPABASE_URL                (ya en .env)
 *   #   SUPABASE_SERVICE_ROLE_KEY   (necesaria para escribir en Storage)
 *   #   SUPABASE_STORAGE_BUCKET     (default: 'avatars')
 *   #   SUPABASE_STORAGE_PREFIX     (default: 'pruebasObjetos')
 *
 * ## Referencias oficiales
 * - gltf-transform · join/flatten:    https://gltf-transform.dev/functions.html#join
 * - gltf-transform · weld/dedup:      https://gltf-transform.dev/functions.html#weld
 * - Supabase Storage JS upload:       https://supabase.com/docs/reference/javascript/storage-from-upload
 * - Three.js BatchedMesh (motivación): https://threejs.org/docs/#api/en/objects/BatchedMesh
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'avatars';
const DEFAULT_PREFIX = process.env.SUPABASE_STORAGE_PREFIX ?? 'pruebasObjetos';
const DEFAULT_INPUT = 'Keyboard.glb';
const DEFAULT_OUTPUT = 'Keyboard.merged.glb';

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') args.input = argv[++i];
    else if (a === '--output' || a === '-o') args.output = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/assets/premerge-glb.mjs [--input X.glb] [--output Y.glb] [--dry-run]`);
      process.exit(0);
    }
  }
  return args;
}

// ─── Infrastructure: download from Supabase Storage ──────────────────────────

/**
 * Descarga un GLB público desde Supabase Storage usando fetch nativo de Node 20+.
 * @param {string} url URL pública completa.
 * @returns {Promise<Uint8Array>}
 */
async function downloadGlb(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`downloadGlb: ${res.status} ${res.statusText} at ${url}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ─── Application: merge primitives by material ───────────────────────────────

/**
 * Fusiona todas las primitivas del GLB por identidad de material,
 * preservando topología y atributos. Es el mismo efecto que
 * `BufferGeometryUtils.mergeGeometries()` en Three.js, pero aplicado
 * offline al nivel del grafo glTF.
 *
 * Estrategia (gltf-transform):
 *   1. `dedup()`: elimina accessors/materials duplicados.
 *   2. `weld({ tolerance: 0.0001 })`: une vértices colineales por distancia,
 *      reduce el conteo de vertex sin cambiar topología.
 *   3. `flatten()`: colapsa la jerarquía de nodos en un único root (los 67
 *      child meshes de Keyboard.glb se convierten en hermanos del root).
 *   4. `join()`: fusiona primitivas que comparten material en un único
 *      primitive. ESTE es el paso que convierte 67 meshes → ≤ 2 meshes
 *      (uno por material identity).
 *
 * @param {Uint8Array} bytes GLB de entrada.
 * @returns {Promise<{ bytes: Uint8Array; metrics: { meshesBefore:number; meshesAfter:number; verticesBefore:number; verticesAfter:number; materialsBefore:number; materialsAfter:number } }>}
 */
async function mergeGlbByMaterial(bytes) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { dedup, weld, flatten, join } = await import('@gltf-transform/functions');

  const io = new NodeIO();
  const document = await io.readBinary(bytes);

  const countMeshes = (doc) =>
    doc.getRoot().listMeshes().reduce((acc, m) => acc + m.listPrimitives().length, 0);
  const countVertices = (doc) =>
    doc.getRoot().listMeshes().reduce((acc, m) => {
      for (const prim of m.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (pos) acc += pos.getCount();
      }
      return acc;
    }, 0);
  const countMaterials = (doc) => doc.getRoot().listMaterials().length;

  const meshesBefore = countMeshes(document);
  const verticesBefore = countVertices(document);
  const materialsBefore = countMaterials(document);

  // Orden del pipeline documentado en gltf-transform:
  // dedup → weld → flatten → join. Cada paso depende del anterior.
  // Ref: https://gltf-transform.dev/functions.html#join
  await document.transform(
    dedup(),
    weld({ tolerance: 0.0001 }),
    flatten(),
    join({ keepNamed: false }),
  );

  const meshesAfter = countMeshes(document);
  const verticesAfter = countVertices(document);
  const materialsAfter = countMaterials(document);

  const out = await io.writeBinary(document);

  return {
    bytes: out,
    metrics: {
      meshesBefore,
      meshesAfter,
      verticesBefore,
      verticesAfter,
      materialsBefore,
      materialsAfter,
    },
  };
}

// ─── Infrastructure: upload to Supabase Storage ──────────────────────────────

/**
 * Sube bytes GLB al bucket de Supabase Storage. Requiere service-role key.
 * @param {Uint8Array} bytes
 * @param {string} objectPath p.ej. 'pruebasObjetos/Keyboard.merged.glb'
 */
async function uploadGlb(bytes, objectPath) {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'uploadGlb: faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno',
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(objectPath, bytes, {
      contentType: 'model/gltf-binary',
      upsert: true,
      cacheControl: '31536000',
    });

  if (error) {
    throw new Error(`uploadGlb: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);

  return publicUrl;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  // Aceptamos tanto el nombre "vanilla" como el prefijo VITE_ que usa
  // el .env del proyecto, así el mismo archivo sirve al runtime y al script.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL / VITE_SUPABASE_URL no está definida.');
    console.error('   Ejecuta con --env-file=.env o exporta la variable antes.');
    process.exit(1);
  }

  const inputUrl = `${supabaseUrl}/storage/v1/object/public/${DEFAULT_BUCKET}/${DEFAULT_PREFIX}/${args.input}`;
  const outputPath = `${DEFAULT_PREFIX}/${args.output}`;

  console.log(`◐ Downloading ${inputUrl}`);
  const inputBytes = await downloadGlb(inputUrl);
  console.log(`  ↳ ${(inputBytes.byteLength / 1024).toFixed(1)} KB`);

  console.log(`◑ Merging by material identity…`);
  const { bytes: outputBytes, metrics } = await mergeGlbByMaterial(inputBytes);

  const reduction = ((1 - metrics.meshesAfter / metrics.meshesBefore) * 100).toFixed(1);
  console.log(`  ↳ meshes:    ${metrics.meshesBefore} → ${metrics.meshesAfter}   (−${reduction}%)`);
  console.log(`  ↳ vertices:  ${metrics.verticesBefore} → ${metrics.verticesAfter}`);
  console.log(`  ↳ materials: ${metrics.materialsBefore} → ${metrics.materialsAfter}`);
  console.log(`  ↳ size:      ${(outputBytes.byteLength / 1024).toFixed(1)} KB`);

  if (args.dryRun) {
    console.log('◇ --dry-run: saltando upload');
    return;
  }

  // Si no hay service-role key, guardamos el archivo en disco y damos
  // instrucciones de upload manual vía dashboard. Esto evita que el usuario
  // tenga que pegar credenciales de admin en su .env (fail-safe).
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    const outDir = path.resolve('scripts/assets/out');
    await mkdir(outDir, { recursive: true });
    const localPath = path.join(outDir, args.output);
    await writeFile(localPath, outputBytes);

    console.log(`\n◇ Sin SUPABASE_SERVICE_ROLE_KEY — archivo guardado localmente:`);
    console.log(`  ${localPath}`);
    console.log(`\n  Siguientes pasos (upload manual, sin tocar credenciales):`);
    console.log(`  1. Abre https://supabase.com/dashboard/project/lcryrsdyrzotjqdxcwtp/storage/buckets/${DEFAULT_BUCKET}`);
    console.log(`  2. Entra a la carpeta "${DEFAULT_PREFIX}/"`);
    console.log(`  3. Arrastra "${args.output}" al dashboard (upsert=sí si pregunta).`);
    console.log(`  4. Avísale a Claude: "archivo subido" para aplicar la migración SQL.\n`);
    return;
  }

  console.log(`◒ Uploading → ${DEFAULT_BUCKET}/${outputPath}`);
  const publicUrl = await uploadGlb(outputBytes, outputPath);
  console.log(`  ↳ ${publicUrl}`);

  console.log(`\n✓ Done. Ahora aplica la migración SQL:`);
  console.log(`  supabase/migrations/20260410_keyboard_premerged.sql`);
  console.log(`\n  (o apply_migration vía MCP con el mismo SQL)\n`);
}

// Solo ejecutar main() cuando se invoca directamente (no cuando se importa).
// NOTA: usamos pathToFileURL() en lugar de `file://${argv[1]}` porque en
// Windows `process.argv[1]` viene con backslashes (`C:\...`) mientras que
// `import.meta.url` es `file:///C:/...`. El check ingenuo nunca empareja
// en Windows y main() no se ejecuta (bug silencioso, scripts/assets 2026-04-10).
// Ref: https://nodejs.org/api/url.html#urlpathtofileurlpath
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('✗', err);
    process.exit(1);
  });
}

// Exports para permitir testing unitario de las funciones puras.
export { downloadGlb, mergeGlbByMaterial, uploadGlb };
