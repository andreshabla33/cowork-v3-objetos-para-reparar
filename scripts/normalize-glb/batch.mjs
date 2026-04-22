/**
 * @module scripts/normalize-glb/batch
 *
 * Batch normalization de todos los GLBs del catálogo. Reusa la lógica
 * canónica del pilot (bake + measure + uniform correction).
 *
 * Flujo:
 *   1. Lee `catalogo-snapshot.json` (lista completa del catálogo).
 *   2. Dedupea por `modelo_url` — cada GLB se procesa una sola vez.
 *   3. Para cada URL única: descarga → bake → normaliza → guarda.
 *   4. Para CADA row del catálogo: genera UPDATE SQL con nueva URL + bbox.
 *   5. Escribe `output/UPDATES.sql` y `output/report.csv`.
 *
 * Ejecutar: node scripts/normalize-glb/batch.mjs
 *
 * Outputs:
 *   tmp/normalize-glb/output/<nombre>.normalized.glb   — los GLBs listos para upload
 *   tmp/normalize-glb/output/UPDATES.sql               — SQL de updates del catálogo
 *   tmp/normalize-glb/output/report.csv                — auditoría de normalización
 *
 * Alineado con best practices oficiales:
 *  - Khronos glTF 2.0: escalas uniformes (KHR_mesh_quantization).
 *  - Unity/Unreal: catálogo = metadata post-medición.
 *  - Blender: "Apply All Transforms" equivalente en runtime.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

// ─── Paths ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(__dirname, 'catalogo-snapshot.json');
const OUT_DIR = path.resolve(__dirname, '../../tmp/normalize-glb/output');
const DOWNLOAD_DIR = path.resolve(__dirname, '../../tmp/normalize-glb/downloads');
const SQL_OUT = path.join(OUT_DIR, 'UPDATES.sql');
const CSV_OUT = path.join(OUT_DIR, 'report.csv');

// ─── Config ─────────────────────────────────────────────────────────────────

const DEVIATION_THRESHOLD = 0.05; // 5% — por debajo no se corrige escala
const STORAGE_BASE = 'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/pruebasObjetos/';

// ─── Matrix math (column-major 4x4) ─────────────────────────────────────────

function identityMatrix() {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function composeMatrix(t, q, s) {
  const [qx, qy, qz, qw] = q;
  const [sx, sy, sz] = s;
  const [tx, ty, tz] = t;
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return new Float64Array([
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function multiplyMatrices(a, b) {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function normalMatrix3x3FromMat4(m) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) {
    return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }
  const invDet = 1 / det;
  const inv = new Float64Array(9);
  inv[0] = (e * i - f * h) * invDet;
  inv[1] = (c * h - b * i) * invDet;
  inv[2] = (b * f - c * e) * invDet;
  inv[3] = (f * g - d * i) * invDet;
  inv[4] = (a * i - c * g) * invDet;
  inv[5] = (c * d - a * f) * invDet;
  inv[6] = (d * h - e * g) * invDet;
  inv[7] = (b * g - a * h) * invDet;
  inv[8] = (a * e - b * d) * invDet;
  return new Float64Array([
    inv[0], inv[3], inv[6],
    inv[1], inv[4], inv[7],
    inv[2], inv[5], inv[8],
  ]);
}

// ─── Vertex attribute transforms ────────────────────────────────────────────

function applyMatrixToPosition(arr, m) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    out[i]     = m[0] * x + m[4] * y + m[8]  * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

function applyNormalMatrixToNormal(arr, n3) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    let nx = n3[0] * x + n3[3] * y + n3[6] * z;
    let ny = n3[1] * x + n3[4] * y + n3[7] * z;
    let nz = n3[2] * x + n3[5] * y + n3[8] * z;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[i]     = nx / len;
    out[i + 1] = ny / len;
    out[i + 2] = nz / len;
  }
  return out;
}

function applyMatrixToTangent(arr, m) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 4) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    out[i]     = m[0] * x + m[4] * y + m[8]  * z;
    out[i + 1] = m[1] * x + m[5] * y + m[9]  * z;
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z;
    out[i + 3] = arr[i + 3]; // handedness
  }
  return out;
}

// ─── Core: bake + measure + uniform correction ──────────────────────────────

function bakeTransforms(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return { nodesBaked: 0, warnings: [] };

  const bakedMeshes = new Set();
  const warnings = [];
  let nodesBaked = 0;

  function traverse(node, parentMatrix) {
    const local = composeMatrix(node.getTranslation(), node.getRotation(), node.getScale());
    const world = multiplyMatrices(parentMatrix, local);
    const mesh = node.getMesh();
    if (mesh) {
      if (bakedMeshes.has(mesh)) {
        warnings.push(`mesh compartido: "${node.getName() || '<unnamed>'}"`);
      } else {
        bakedMeshes.add(mesh);
        const n3 = normalMatrix3x3FromMat4(world);
        for (const prim of mesh.listPrimitives()) {
          const posAttr = prim.getAttribute('POSITION');
          if (posAttr) {
            const arr = posAttr.getArray();
            if (arr) posAttr.setArray(applyMatrixToPosition(arr, world));
          }
          const normAttr = prim.getAttribute('NORMAL');
          if (normAttr) {
            const arr = normAttr.getArray();
            if (arr) normAttr.setArray(applyNormalMatrixToNormal(arr, n3));
          }
          const tanAttr = prim.getAttribute('TANGENT');
          if (tanAttr) {
            const arr = tanAttr.getArray();
            if (arr) tanAttr.setArray(applyMatrixToTangent(arr, world));
          }
        }
        nodesBaked++;
      }
    }
    for (const child of node.listChildren()) traverse(child, world);
  }

  const id = identityMatrix();
  for (const rootNode of scene.listChildren()) traverse(rootNode, id);

  // Reset a identity.
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation([0, 0, 0]);
    node.setRotation([0, 0, 0, 1]);
    node.setScale([1, 1, 1]);
  }

  return { nodesBaked, warnings };
}

function computeWorldBbox(doc) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i], y = arr[i + 1], z = arr[i + 2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
      }
    }
  }
  if (!isFinite(minX)) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

function applyUniformScaleToGeometry(doc, factor) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      const out = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = arr[i] * factor;
      pos.setArray(out);
    }
  }
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

async function downloadGlb(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
  return buffer.byteLength;
}

// ─── Detect placeholder rows (1,1,1 catalog) ────────────────────────────────

/**
 * Una row con dimensiones declaradas (1,1,1) indica que el admin usó
 * defaults en lugar de medir el GLB. En ese caso NO aplicamos scale
 * correctivo — bakeamos, medimos el real bbox, y el catálogo se actualiza
 * con el valor medido.
 */
function isPlaceholderDeclared(row) {
  return row.ancho === 1 && row.alto === 1 && row.profundidad === 1;
}

// ─── Procesar una URL única ─────────────────────────────────────────────────

async function processUrl(url, representativeRow, allRowsForUrl) {
  const fileName = decodeURIComponent(path.basename(new URL(url).pathname));
  const downloadPath = path.join(DOWNLOAD_DIR, fileName);

  let bytes;
  try {
    bytes = await downloadGlb(url, downloadPath);
  } catch (err) {
    return { url, fileName, status: 'download_error', error: String(err), rows: allRowsForUrl };
  }

  const io = new NodeIO();
  let doc;
  try {
    doc = await io.read(downloadPath);
  } catch (err) {
    return { url, fileName, status: 'parse_error', error: String(err), rows: allRowsForUrl };
  }

  // 1. Medir antes (con world transforms del GLB original).
  const bboxOriginal = computeBboxWithWorldMatrices(doc);

  // 2. Bake canónico.
  const { nodesBaked, warnings } = bakeTransforms(doc);

  // 3. Bbox post-bake.
  const bboxPostBake = computeWorldBbox(doc);

  // 4. Decisión: aplicar scale correctivo o no.
  const usePlaceholder = isPlaceholderDeclared(representativeRow);
  const declared = [representativeRow.ancho, representativeRow.alto, representativeRow.profundidad];
  const ratios = bboxPostBake.size.map((v, i) => v / declared[i]);
  const ratiosSorted = [...ratios].sort((a, b) => a - b);
  const medianRatio = ratiosSorted[1];

  let bboxFinal = bboxPostBake;
  let uniformFactor = 1;
  let correctionApplied = false;

  if (!usePlaceholder && Math.abs(medianRatio - 1) > DEVIATION_THRESHOLD) {
    uniformFactor = 1 / medianRatio;
    applyUniformScaleToGeometry(doc, uniformFactor);
    bboxFinal = computeWorldBbox(doc);
    correctionApplied = true;
  }

  // 5. Cleanup + escribir.
  try {
    await doc.transform(dedup(), prune());
  } catch {
    // no fatal
  }
  const outName = fileName.replace(/\.glb$/i, '.normalized.glb');
  const outPath = path.join(OUT_DIR, outName);
  await io.write(outPath, doc);
  const outStat = await fs.stat(outPath);

  // 6. Nueva URL (mismo bucket, sufijo .normalized.glb).
  const newUrl = STORAGE_BASE + outName;

  return {
    url,
    newUrl,
    fileName,
    outName,
    status: 'ok',
    nodesBaked,
    warnings,
    sizeBefore: bytes,
    sizeAfter: outStat.size,
    bboxOriginal: bboxOriginal.size,
    bboxPostBake: bboxPostBake.size,
    bboxFinal: bboxFinal.size,
    declared,
    ratios,
    medianRatio,
    uniformFactor,
    correctionApplied,
    usePlaceholder,
    rows: allRowsForUrl,
  };
}

function computeBboxWithWorldMatrices(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  function traverse(node, parentMatrix) {
    const local = composeMatrix(node.getTranslation(), node.getRotation(), node.getScale());
    const world = multiplyMatrices(parentMatrix, local);
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const posAttr = prim.getAttribute('POSITION');
        if (!posAttr) continue;
        const arr = posAttr.getArray();
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 3) {
          const x = arr[i], y = arr[i + 1], z = arr[i + 2];
          const wx = world[0] * x + world[4] * y + world[8]  * z + world[12];
          const wy = world[1] * x + world[5] * y + world[9]  * z + world[13];
          const wz = world[2] * x + world[6] * y + world[10] * z + world[14];
          if (wx < minX) minX = wx; if (wy < minY) minY = wy; if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx; if (wy > maxY) maxY = wy; if (wz > maxZ) maxZ = wz;
        }
      }
    }
    for (const child of node.listChildren()) traverse(child, world);
  }
  const id = identityMatrix();
  for (const rootNode of scene.listChildren()) traverse(rootNode, id);
  if (!isFinite(minX)) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], size: [maxX - minX, maxY - minY, maxZ - minZ] };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const snapshot = JSON.parse(await fs.readFile(SNAPSHOT_PATH, 'utf8'));
  const rows = snapshot.rows;
  console.log(`🎯 Batch normalización — ${rows.length} rows del catálogo`);

  // Dedupe URLs (múltiples rows pueden compartir el mismo GLB).
  const urlToRows = new Map();
  for (const row of rows) {
    if (!urlToRows.has(row.modelo_url)) urlToRows.set(row.modelo_url, []);
    urlToRows.get(row.modelo_url).push(row);
  }
  console.log(`   ${urlToRows.size} GLBs únicos a procesar`);

  const results = [];
  let idx = 0;
  for (const [url, rowsForUrl] of urlToRows) {
    idx++;
    const rep = rowsForUrl[0];
    process.stdout.write(`\n[${idx}/${urlToRows.size}] ${rep.nombre}... `);
    try {
      const r = await processUrl(url, rep, rowsForUrl);
      results.push(r);
      if (r.status === 'ok') {
        const flag = r.correctionApplied
          ? `scale ${r.uniformFactor.toFixed(3)}x`
          : r.usePlaceholder ? 'placeholder (sin corrección)' : 'sin corrección';
        process.stdout.write(`✓ ${flag}`);
      } else {
        process.stdout.write(`❌ ${r.status}`);
      }
    } catch (err) {
      console.error(`\n  ❌ Error: ${err}`);
      results.push({ url, status: 'exception', error: String(err), rows: rowsForUrl });
    }
  }

  // ─── Generar UPDATES.sql ─────────────────────────────────────────────────
  const sqlLines = [
    '-- Batch normalización de catálogo_objetos_3d — generado automáticamente',
    `-- Source: scripts/normalize-glb/batch.mjs`,
    `-- Generated: ${new Date().toISOString()}`,
    '-- Ejecutar después de subir los .normalized.glb al storage.',
    '',
    'BEGIN;',
    '',
  ];

  for (const r of results) {
    if (r.status !== 'ok') {
      sqlLines.push(`-- SKIP ${r.fileName}: ${r.status} (${r.error || ''})`);
      continue;
    }
    const [w, h, d] = r.bboxFinal;
    for (const row of r.rows) {
      sqlLines.push(
        `UPDATE catalogo_objetos_3d SET modelo_url='${r.newUrl}', ancho=${w.toFixed(3)}, alto=${h.toFixed(3)}, profundidad=${d.toFixed(3)}, actualizado_en=NOW() WHERE id='${row.id}'; -- ${row.nombre}`
      );
    }
  }

  sqlLines.push('', 'COMMIT;', '');
  await fs.writeFile(SQL_OUT, sqlLines.join('\n'), 'utf8');

  // ─── Generar report.csv ──────────────────────────────────────────────────
  const csvHeader = 'fileName,status,nombre_representativo,tipo,nodesBaked,bboxOriginalX,bboxOriginalY,bboxOriginalZ,bboxFinalX,bboxFinalY,bboxFinalZ,declaredX,declaredY,declaredZ,medianRatio,uniformFactor,correctionApplied,placeholder,rowsCount,sizeBefore,sizeAfter,warnings,error';
  const csvLines = [csvHeader];
  for (const r of results) {
    if (r.status !== 'ok') {
      csvLines.push([
        r.fileName || '',
        r.status,
        r.rows?.[0]?.nombre || '',
        r.rows?.[0]?.tipo || '',
        '', '', '', '', '', '', '',
        '', '', '', '', '',
        '', '',
        r.rows?.length || 0,
        '', '',
        '',
        (r.error || '').replace(/,/g, ';').replace(/\n/g, ' '),
      ].join(','));
      continue;
    }
    csvLines.push([
      r.fileName,
      r.status,
      r.rows[0].nombre,
      r.rows[0].tipo,
      r.nodesBaked,
      ...r.bboxOriginal.map((v) => v.toFixed(3)),
      ...r.bboxFinal.map((v) => v.toFixed(3)),
      ...r.declared.map((v) => v.toFixed(3)),
      r.medianRatio.toFixed(4),
      r.uniformFactor.toFixed(4),
      r.correctionApplied,
      r.usePlaceholder,
      r.rows.length,
      r.sizeBefore,
      r.sizeAfter,
      r.warnings.join('; ').replace(/,/g, ';'),
      '',
    ].join(','));
  }
  await fs.writeFile(CSV_OUT, csvLines.join('\n'), 'utf8');

  // ─── Resumen ─────────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === 'ok').length;
  const corrected = results.filter((r) => r.correctionApplied).length;
  const placeholders = results.filter((r) => r.usePlaceholder).length;
  const failed = results.filter((r) => r.status !== 'ok').length;

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Resumen`);
  console.log(`   OK:                ${ok}/${results.length}`);
  console.log(`   Con corrección:    ${corrected}`);
  console.log(`   Placeholder (1,1,1): ${placeholders}`);
  console.log(`   Fallaron:          ${failed}`);
  console.log(`\n📁 Outputs:`);
  console.log(`   ${OUT_DIR}/*.normalized.glb`);
  console.log(`   ${SQL_OUT}`);
  console.log(`   ${CSV_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
