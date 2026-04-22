/**
 * @module scripts/normalize-glb/normalize-pilot
 *
 * Piloto del normalizador de GLBs del catálogo Cowork — bake canónico.
 *
 * Alineado con best practices oficiales:
 *  - Khronos glTF: escalas uniformes recomendadas (KHR_mesh_quantization).
 *  - Unity/Unreal: metadata = bbox medido post-pipeline.
 *  - Blender: equivalente a "Apply All Transforms" + identity root.
 *
 * Flujo (bake REAL, no solo flatten):
 *  1. Fetch GLB vía HTTP desde Supabase Storage.
 *  2. Parse con @gltf-transform/core (NodeIO).
 *  3. Para cada primitive: calcula worldMatrix del nodo padre, aplica:
 *       - POSITION ← worldMatrix × POSITION_original
 *       - NORMAL   ← inverse-transpose(worldMatrix) × NORMAL_original
 *       - TANGENT  ← worldMatrix × TANGENT_original (solo xyz)
 *  4. Resetea todos los node.TRS a identity (scale=1, rot=identity, trans=0).
 *  5. Mide bbox resultante (ya es trivial — geometry en world coords, nodes identity).
 *  6. Compara con catálogo; si desvía > 5%, aplica escala UNIFORME por mediana.
 *  7. Escribe GLB canónico (node.scale = 1, bbox ≈ declarado).
 *
 * Ref normales non-uniform: https://paroj.github.io/gltut/Illumination/Tut09%20Normal%20Transformation.html
 * Ref glTF spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

// ─── Configuración del pilot ────────────────────────────────────────────────

const PILOT_MODELS = [
  {
    id: '7b87af83-309e-434a-9fd5-f9620d677c44',
    nombre: 'Couch Medium',
    tipo: 'sofa',
    declarado: { ancho: 1.8, alto: 0.80, profundidad: 0.85 },
    url: 'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/pruebasObjetos/Couch Medium.glb',
  },
  {
    id: 'c8a2897b-fdb7-4a49-ad20-493a8e064267',
    nombre: 'Adjustable Desk Merged',
    tipo: 'escritorio',
    declarado: { ancho: 1.6, alto: 0.75, profundidad: 0.8 },
    url: 'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/pruebasObjetos/Adjustable Desk.merged.glb',
  },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../tmp/normalize-glb/output');
const DOWNLOAD_DIR = path.resolve(__dirname, '../../tmp/normalize-glb/downloads');
const DEVIATION_THRESHOLD = 0.05; // 5%

// ─── Utilidades ─────────────────────────────────────────────────────────────

async function downloadGlb(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
  return buffer.byteLength;
}

// ─── Operaciones matriciales (column-major 4x4) ─────────────────────────────

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

/**
 * Inverse-transpose 3x3 superior para transformar normales.
 * Ref: https://paroj.github.io/gltut/Illumination/Tut09%20Normal%20Transformation.html
 */
function normalMatrix3x3FromMat4(m) {
  // Extraer 3x3 superior (ignorar traslación).
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];

  // Determinante.
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) {
    // Singular — devolver identidad como fallback seguro.
    return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }
  const invDet = 1 / det;

  // Adjugada transpuesta / det = inversa.
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

  // Transpuesta de la inversa.
  return new Float64Array([
    inv[0], inv[3], inv[6],
    inv[1], inv[4], inv[7],
    inv[2], inv[5], inv[8],
  ]);
}

// ─── Aplicar matriz a atributos ─────────────────────────────────────────────

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
    // Re-normalizar (non-uniform scale puede desnormalizar).
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[i]     = nx / len;
    out[i + 1] = ny / len;
    out[i + 2] = nz / len;
  }
  return out;
}

function applyMatrixToTangent(arr, m) {
  // TANGENT es vec4: xyz = dirección, w = handedness (no tocar).
  const out = new Float32Array(arr.length);
  const components = 4;
  for (let i = 0; i < arr.length; i += components) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    // Solo rotación/escala 3x3, sin traslación.
    out[i]     = m[0] * x + m[4] * y + m[8]  * z;
    out[i + 1] = m[1] * x + m[5] * y + m[9]  * z;
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z;
    out[i + 3] = arr[i + 3]; // handedness preservado
  }
  return out;
}

// ─── Bake real: worldMatrix → vertex attrs + identity nodes ─────────────────

/**
 * Recorre el scene graph. Para cada nodo con mesh, bakea worldMatrix en
 * los atributos de todas sus primitives. Al final, resetea TODAS las TRS
 * a identity.
 *
 * Nota: si múltiples nodos comparten el mismo mesh (reference), el bake
 * duplicaría la geometría incorrectamente. En la práctica esto es raro
 * en GLBs del catálogo; si ocurriera, el script emite warning y skip.
 */
function bakeTransforms(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return { nodesBaked: 0, warnings: [] };

  const bakedMeshes = new Set();
  const warnings = [];
  let nodesBaked = 0;

  function traverse(node, parentMatrix) {
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const local = composeMatrix(t, r, s);
    const world = multiplyMatrices(parentMatrix, local);

    const mesh = node.getMesh();
    if (mesh) {
      if (bakedMeshes.has(mesh)) {
        warnings.push(`Mesh compartido entre nodos — puede producir geometría duplicada: "${node.getName() || '<unnamed>'}"`);
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

    for (const child of node.listChildren()) {
      traverse(child, world);
    }
  }

  const identity = identityMatrix();
  for (const rootNode of scene.listChildren()) {
    traverse(rootNode, identity);
  }

  // Reset todas las TRS a identity.
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation([0, 0, 0]);
    node.setRotation([0, 0, 0, 1]);
    node.setScale([1, 1, 1]);
  }

  return { nodesBaked, warnings };
}

// ─── Bbox calc (post-bake: todos los nodes identity → accessor.min/max válido) ──

function computeWorldBbox(doc) {
  // Post-bake, node transforms son identity, así que los accessor POSITION
  // ya están en world space. Basta con unir sus min/max.
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
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
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

// ─── Scale uniforme a POSITION (post-bake) ──────────────────────────────────

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
  // Nota: scale uniforme NO afecta normales (misma dirección), así que
  // no hay que transformarlas. Solo si fuese non-uniform habría que hacerlo.
}

// ─── Verificación: confirma que todos los nodes están en identity ───────────

function verifyNodesIdentity(doc) {
  const issues = [];
  for (const node of doc.getRoot().listNodes()) {
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const epsilon = 1e-6;
    if (Math.abs(t[0]) > epsilon || Math.abs(t[1]) > epsilon || Math.abs(t[2]) > epsilon) {
      issues.push(`Node "${node.getName() || '<unnamed>'}" translation != 0: [${t}]`);
    }
    if (Math.abs(r[0]) > epsilon || Math.abs(r[1]) > epsilon || Math.abs(r[2]) > epsilon || Math.abs(r[3] - 1) > epsilon) {
      issues.push(`Node "${node.getName() || '<unnamed>'}" rotation != identity: [${r}]`);
    }
    if (Math.abs(s[0] - 1) > epsilon || Math.abs(s[1] - 1) > epsilon || Math.abs(s[2] - 1) > epsilon) {
      issues.push(`Node "${node.getName() || '<unnamed>'}" scale != 1: [${s}]`);
    }
  }
  return issues;
}

// ─── Pipeline principal ─────────────────────────────────────────────────────

async function processModel(model) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📦 ${model.nombre} (${model.tipo})`);

  const fileName = decodeURIComponent(path.basename(new URL(model.url).pathname));
  const downloadPath = path.join(DOWNLOAD_DIR, fileName);
  const bytes = await downloadGlb(model.url, downloadPath);
  console.log(`   ✓ Descargado (${(bytes / 1024).toFixed(1)} KB)`);

  const io = new NodeIO();
  const doc = await io.read(downloadPath);

  // 1. Bbox pre-bake (usando world-matrix-walk manual en el archivo original).
  const bboxBeforeBake = computeBboxWithWorldMatrices(doc);
  console.log(`   bbox ORIGINAL (c/world tx): size=[${bboxBeforeBake.size.map((v) => v.toFixed(3)).join(', ')}]`);

  // 2. Bake transforms (POSITION + NORMAL + TANGENT + identity nodes).
  const { nodesBaked, warnings } = bakeTransforms(doc);
  console.log(`   ✓ Bake canónico: ${nodesBaked} nodos con mesh bakeados`);
  for (const w of warnings) console.log(`     ⚠️  ${w}`);

  // 3. Verificar que los nodes están en identity.
  const identityIssues = verifyNodesIdentity(doc);
  if (identityIssues.length > 0) {
    console.log(`   ⚠️  ${identityIssues.length} nodes NO en identity:`);
    for (const i of identityIssues.slice(0, 3)) console.log(`     · ${i}`);
  } else {
    console.log(`   ✓ Todos los nodes en identity (scale=1, rot=identity, trans=0)`);
  }

  // 4. Bbox post-bake — ahora es trivial (geometry en world coords).
  const bboxPostBake = computeWorldBbox(doc);
  console.log(`   bbox POST-BAKE: size=[${bboxPostBake.size.map((v) => v.toFixed(3)).join(', ')}]`);

  // 5. Comparar con catálogo.
  const declared = [model.declarado.ancho, model.declarado.alto, model.declarado.profundidad];
  console.log(`   catálogo:       size=[${declared.map((v) => v.toFixed(3)).join(', ')}]`);

  const ratios = bboxPostBake.size.map((v, i) => v / declared[i]);
  const ratiosSorted = [...ratios].sort((a, b) => a - b);
  const medianRatio = ratiosSorted[1];
  console.log(`   ratios:         [${ratios.map((r) => r.toFixed(3)).join(', ')}]`);
  console.log(`   mediana:        ${medianRatio.toFixed(4)}x`);

  // 6. Si mediana desvía > 5%, aplicar scale uniforme correctivo.
  const needsCorrection = Math.abs(medianRatio - 1) > DEVIATION_THRESHOLD;
  let bboxFinal = bboxPostBake;
  let uniformFactorApplied = 1;
  if (needsCorrection) {
    uniformFactorApplied = 1 / medianRatio;
    console.log(`   ⚠️  Aplicando scale UNIFORME: ${uniformFactorApplied.toFixed(4)}x`);
    applyUniformScaleToGeometry(doc, uniformFactorApplied);
    bboxFinal = computeWorldBbox(doc);
    console.log(`   bbox FINAL:     size=[${bboxFinal.size.map((v) => v.toFixed(3)).join(', ')}]`);
  } else {
    console.log(`   ✓ Sin corrección necesaria (<${DEVIATION_THRESHOLD * 100}%)`);
  }

  // 7. Cleanup: dedup + prune.
  await doc.transform(dedup(), prune());

  // 8. Escribir output.
  const outName = fileName.replace(/\.glb$/i, '.normalized.glb');
  const outPath = path.join(OUT_DIR, outName);
  await io.write(outPath, doc);
  const outStat = await fs.stat(outPath);
  console.log(`   ✓ Escrito (${(outStat.size / 1024).toFixed(1)} KB)`);

  // 9. Sugerencia de UPDATE catalog.
  const [ax, ay, az] = bboxFinal.size;
  const sugerencia = `UPDATE catalogo_objetos_3d SET ancho=${ax.toFixed(3)}, alto=${ay.toFixed(3)}, profundidad=${az.toFixed(3)} WHERE id='${model.id}';`;
  console.log(`   SQL sugerido:`);
  console.log(`     ${sugerencia}`);

  return {
    nombre: model.nombre,
    id: model.id,
    bboxOriginal: bboxBeforeBake.size,
    bboxPostBake: bboxPostBake.size,
    bboxFinal: bboxFinal.size,
    declarado: declared,
    ratios,
    medianRatio,
    uniformFactorApplied,
    needsCorrection,
    nodesIdentity: identityIssues.length === 0,
    outputPath: outPath,
    sizeBytes: outStat.size,
    sqlUpdate: sugerencia,
  };
}

// Helper — bbox pre-bake con world-matrix-walk (reutiliza flag del archivo cargado).
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
          if (wx < minX) minX = wx;
          if (wy < minY) minY = wy;
          if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx;
          if (wy > maxY) maxY = wy;
          if (wz > maxZ) maxZ = wz;
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

  console.log(`🎯 Pilot normalización GLBs — bake canónico`);
  console.log(`   Estrategia: Khronos-compliant (uniform scale only, identity nodes)`);

  const reports = [];
  for (const model of PILOT_MODELS) {
    try {
      reports.push(await processModel(model));
    } catch (err) {
      console.error(`\n❌ Error en ${model.nombre}:`, err);
      reports.push({ nombre: model.nombre, error: String(err) });
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Reporte final`);
  for (const r of reports) {
    if (r.error) { console.log(`   ${r.nombre}: ❌ ${r.error}`); continue; }
    const flag = r.needsCorrection ? `⚠️  scale ${r.uniformFactorApplied.toFixed(3)}x` : '✓ OK';
    const identityFlag = r.nodesIdentity ? '✓ identity' : '⚠️  nodes NOT identity';
    console.log(`   ${flag}  ${identityFlag}  ${r.nombre}`);
  }

  console.log(`\n📝 SQLs sugeridos (no ejecutar hasta validar visualmente):`);
  for (const r of reports) {
    if (r.sqlUpdate) console.log(`   ${r.sqlUpdate}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
