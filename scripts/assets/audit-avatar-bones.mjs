#!/usr/bin/env node
// Diagnóstico one-off: compara nombres de huesos entre avatares y universales.
// Read-only: solo lee GLBs locales + descarga 12 GLBs públicos de Supabase.
// Uso: node scripts/assets/audit-avatar-bones.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const LOCAL_AVATAR_DIR =
  'C:/Users/Usuario/Downloads/nuevos avatares cowork/glb_optimizados/final_optimizados';
const OUTPUT_JSON = 'scripts/assets/audit-avatar-bones.report.json';

const REMOTE_AVATAR_BASE =
  'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars';

const SB = 'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/animaciones_universales';
const UNIVERSAL_URLS = {
  idle: `${SB}/idle.glb`,
  walk: `${SB}/walk.glb`,
  run: `${SB}/run.glb`,
  dance: `${SB}/dance.glb`,
  cheer: `${SB}/cheer.glb`,
  wave: `${SB}/wave.glb`,
  sit: `${SB}/sitting_idle.glb`,
  sit_down: `${SB}/sit_down.glb`,
  stand_up: `${SB}/stand_up.glb`,
  seated_idle: `${SB}/seated_idle.glb`,
  dance2: `${SB}/dance2.glb`,
  wave_fast: `${SB}/wave_fast.glb`,
};

const MIN_MATCH_RATE = 0.3;

// ── GLB parser (solo JSON chunk — no toca geometría Draco) ──────────────
function parseGLB(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('Expected JSON chunk');
  const jsonBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 20, jsonLen);
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

// ── Copia exacta de components/avatar3d/rigUtils.ts:6 ───────────────────
function normalizeBoneName(name) {
  let n = name;
  n = n.replace(/^Armature[|/]/, '');
  n = n.replace(/^mixamorig\d*[:]?/, '');
  n = n.replace(/^(Character_|Root_)/, '');
  n = n.replace(/(\D)0+(\d+)$/, '$1$2');
  return n;
}

function extractAvatarBones(gltf) {
  if (!gltf.skins || gltf.skins.length === 0) return [];
  return gltf.skins[0].joints.map((idx) => gltf.nodes[idx]?.name || `node_${idx}`);
}

function extractAnimationTrackBones(gltf) {
  const bones = new Set();
  if (!gltf.animations) return [];
  for (const anim of gltf.animations) {
    for (const ch of anim.channels) {
      const n = gltf.nodes?.[ch.target?.node];
      if (n?.name) bones.add(n.name);
    }
  }
  return Array.from(bones);
}

function computeMatchRate(avatarBones, clipTrackBones) {
  const avatarSet = new Set(avatarBones.map((n) => normalizeBoneName(n).toLowerCase()));
  if (clipTrackBones.length === 0) return 0;
  let matched = 0;
  for (const b of clipTrackBones) {
    if (avatarSet.has(normalizeBoneName(b).toLowerCase())) matched++;
  }
  return matched / clipTrackBones.length;
}

async function fetchGLB(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function main() {
  console.log('═══ AUDITORÍA HUESOS — AVATARES COWORK ═══\n');

  console.log('[1/3] Descargando 12 animaciones universales...');
  const universalBones = {};
  for (const [name, url] of Object.entries(UNIVERSAL_URLS)) {
    try {
      const gltf = parseGLB(await fetchGLB(url));
      universalBones[name] = extractAnimationTrackBones(gltf);
      console.log(`   ${name.padEnd(14)} → ${universalBones[name].length} tracks`);
    } catch (err) {
      console.warn(`   ${name.padEnd(14)} → FAILED: ${err.message}`);
      universalBones[name] = [];
    }
  }

  console.log('\n[2/3] Analizando avatares locales...');
  const files = (await readdir(LOCAL_AVATAR_DIR)).filter((f) => f.endsWith('.glb')).sort();
  const avatars = {};
  for (const f of files) {
    try {
      const gltf = parseGLB(await readFile(path.join(LOCAL_AVATAR_DIR, f)));
      avatars[f] = extractAvatarBones(gltf);
      console.log(`   ${f.padEnd(35)} → ${avatars[f].length} huesos`);
    } catch (err) {
      console.warn(`   ${f.padEnd(35)} → FAILED: ${err.message}`);
      avatars[f] = [];
    }
  }

  console.log('\n═══ MUESTRA DE NAMING (primeros 4 huesos de cada avatar) ═══');
  for (const [file, bones] of Object.entries(avatars)) {
    console.log(`${file.padEnd(35)} [${bones.slice(0, 4).join(' | ')}]`);
  }

  console.log('\n═══ CLUSTERS POR FIRMA (prefijo + conteo) ═══');
  const clusters = new Map();
  for (const [file, bones] of Object.entries(avatars)) {
    if (bones.length === 0) continue;
    const prefix = bones[0].replace(/Hips?\d*$/i, 'HIPS');
    const sig = `${prefix}_n=${bones.length}`;
    if (!clusters.has(sig)) clusters.set(sig, []);
    clusters.get(sig).push(file);
  }
  for (const [sig, list] of clusters) {
    console.log(`  [${list.length}] ${sig}`);
    for (const f of list) console.log(`        · ${f}`);
  }

  console.log('\n═══ MATCH RATE MATRIX (umbral ≥ 0.30) ═══');
  const clips = Object.keys(universalBones);
  const head = 'Avatar'.padEnd(35) + clips.map((c) => c.slice(0, 5).padStart(6)).join('') + '  → VEREDICTO';
  console.log(head);
  console.log('─'.repeat(head.length));
  const matrix = {};
  for (const [file, bones] of Object.entries(avatars)) {
    const row = {};
    let pass = 0;
    for (const c of clips) {
      const rate = computeMatchRate(bones, universalBones[c]);
      row[c] = rate;
      if (rate >= MIN_MATCH_RATE) pass++;
    }
    matrix[file] = { row, passCount: pass };
    const v = pass === 0 ? '❌ T-POSE' : pass < 6 ? `⚠️  ${pass}/12` : `✅ ${pass}/12`;
    const line =
      file.padEnd(35) +
      clips.map((c) => row[c].toFixed(2).padStart(6)).join('') +
      '  → ' +
      v;
    console.log(line);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOCAL vs REMOTO — byte-compare + bone diff
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n═══ COMPARACIÓN LOCAL vs SUPABASE STORAGE ═══');
  const comparison = {};
  for (const [file, localBones] of Object.entries(avatars)) {
    const url = `${REMOTE_AVATAR_BASE}/${file}`;
    try {
      const remoteBuf = await fetchGLB(url);
      const localBuf = await readFile(path.join(LOCAL_AVATAR_DIR, file));
      const localHash = createHash('sha256').update(localBuf).digest('hex').slice(0, 16);
      const remoteHash = createHash('sha256').update(remoteBuf).digest('hex').slice(0, 16);
      const identical = localHash === remoteHash;
      let remoteBones = [];
      let remoteParseError = null;
      try {
        remoteBones = extractAvatarBones(parseGLB(remoteBuf));
      } catch (err) {
        remoteParseError = err.message;
      }
      const bonesDiffer = JSON.stringify(localBones) !== JSON.stringify(remoteBones);
      comparison[file] = {
        localBytes: localBuf.byteLength,
        remoteBytes: remoteBuf.byteLength,
        localHash,
        remoteHash,
        identical,
        localBoneCount: localBones.length,
        remoteBoneCount: remoteBones.length,
        bonesDiffer,
        remoteParseError,
      };
      const sizeDiff = remoteBuf.byteLength - localBuf.byteLength;
      const status = identical
        ? '✅ IDENTICAL'
        : bonesDiffer
        ? '❌ BONES DIFFER'
        : sizeDiff !== 0
        ? `⚠️ BYTES DIFF (${sizeDiff > 0 ? '+' : ''}${sizeDiff})`
        : '⚠️ HASH DIFF';
      console.log(
        `${file.padEnd(35)} L=${String(localBuf.byteLength).padStart(8)}  R=${String(
          remoteBuf.byteLength
        ).padStart(8)}  bones L=${localBones.length}/R=${remoteBones.length}  ${status}`
      );
      if (remoteParseError) console.log(`    ⚠️  remote parse error: ${remoteParseError}`);
      if (bonesDiffer && remoteBones.length > 0) {
        console.log(`    local [0..3]:  [${localBones.slice(0, 4).join(' | ')}]`);
        console.log(`    remote [0..3]: [${remoteBones.slice(0, 4).join(' | ')}]`);
      }
    } catch (err) {
      comparison[file] = { error: err.message };
      console.log(`${file.padEnd(35)} ❌ REMOTE FETCH FAILED: ${err.message}`);
    }
  }

  console.log('\n[3/3] Escribiendo reporte JSON...');
  const report = {
    timestamp: new Date().toISOString(),
    threshold: MIN_MATCH_RATE,
    localDir: LOCAL_AVATAR_DIR,
    avatars: Object.fromEntries(
      Object.entries(avatars).map(([f, b]) => [f, { boneCount: b.length, bones: b }])
    ),
    universalBones,
    matrix,
    localVsRemote: comparison,
  };
  await writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2));
  console.log(`   ${OUTPUT_JSON}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
