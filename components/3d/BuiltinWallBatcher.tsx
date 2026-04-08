/**
 * @module BuiltinWallBatcher
 *
 * Fase 5A: Merge-batcher para objetos builtin (paredes procedurales).
 *
 * Problema: 221 paredes builtin × 1-11 meshes cada una = ~330 draw calls.
 * Solución: Mergear geometrías por tipo de material → ~5 draw calls totales.
 *
 * Estrategia:
 *   1. Agrupar objetos por tipo de geometría (wall-panel, wall-glass, box, etc.)
 *   2. Para cada objeto, generar geometría procedural (misma lógica que GeometriaProceduralObjeto3D)
 *   3. Transformar cada geometría a world-space (posición + rotación del objeto)
 *   4. Mergear todas las geometrías por categoría de material:
 *      - "opaque": cuerpo de paredes (PBR)
 *      - "glass": paneles de vidrio (transparente)
 *      - "metal": marcos, remates, montantes
 *   5. Renderizar 1 mesh por categoría
 *
 * Arquitectura Clean:
 *   - Lee datos de EspacioObjeto (domain entity)
 *   - Reutiliza funciones de dominio (normalizarConfiguracionGeometricaObjeto)
 *   - Reutiliza fábricas de materiales (infrastructure)
 *   - Presentation layer: solo montaje R3F
 *
 * Ref: Three.js r170 — BufferGeometryUtils.mergeGeometries
 * Ref: Three.js r170 — ExtrudeGeometry para paredes con aberturas
 */

'use client';
import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { logger } from '@/lib/logger';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import {
  normalizarConfiguracionGeometricaObjeto,
  type ConfiguracionGeometricaObjeto,
  type AberturaArquitectonica,
} from '@/src/core/domain/entities/objetosArquitectonicos';
import { resolverPerfilVisualArquitectonico } from '@/src/core/domain/entities/estilosVisualesArquitectonicos';
import {
  crearMaterialMarcoArquitectonico,
  crearMaterialPBRArquitectonico,
} from '@/lib/rendering/fabricaMaterialesArquitectonicos';
import { obtenerDimensionesObjetoRuntime } from '../space3d/objetosRuntime';

const log = logger.child('BuiltinWallBatcher');

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface AberturaRenderizable extends AberturaArquitectonica {
  izquierda: number;
  derecha: number;
  inferior: number;
  superior: number;
}

/** Categorías de material para merge */
type MaterialCategory = 'opaque' | 'glass' | 'metal';

/** Geometría transformada lista para merge */
interface TransformedGeometry {
  geometry: THREE.BufferGeometry;
  category: MaterialCategory;
}

/** Atributos permitidos en geometrías normalizadas para merge */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set(['position', 'normal', 'uv']);

/**
 * Normaliza una BufferGeometry para que sea compatible con mergeBufferGeometries().
 *
 * Three.js r170 requiere que TODAS las geometrías pasadas a mergeBufferGeometries
 * tengan exactamente los mismos atributos (mismo nombre, mismo tipo, mismo itemSize)
 * y que sean todas indexed o todas non-indexed.
 *
 * ExtrudeGeometry (paredes con aberturas) genera geometría indexed con groups internos
 * y puede tener atributos adicionales. BoxGeometry genera indexed sin groups.
 * Mezclarlas directamente falla.
 *
 * Solución: convertir toda geometría a non-indexed, retener solo position/normal/uv,
 * limpiar groups y recomputar normales.
 *
 * @see https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
 */
const normalizarGeometriaParaMerge = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
  // 1. Convertir a non-indexed (expande vértices compartidos)
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();

  // 2. Eliminar atributos que no estén en el set permitido
  const attrNames = Object.keys(nonIndexed.attributes);
  for (const name of attrNames) {
    if (!ALLOWED_ATTRIBUTES.has(name)) {
      nonIndexed.deleteAttribute(name);
    }
  }

  // 3. Asegurar que exista 'uv' — si no existe, crear uno trivial (0,0) por vértice
  if (!nonIndexed.hasAttribute('uv')) {
    const count = nonIndexed.getAttribute('position').count;
    nonIndexed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }

  // 4. Asegurar que exista 'normal'
  if (!nonIndexed.hasAttribute('normal')) {
    nonIndexed.computeVertexNormals();
  }

  // 5. Limpiar groups internos (residuo de ExtrudeGeometry multi-material)
  nonIndexed.clearGroups();

  // 6. Eliminar index residual (toNonIndexed() ya lo quita, pero por seguridad)
  if (nonIndexed.index) {
    nonIndexed.setIndex(null);
  }

  return nonIndexed;
};

// ─── Helpers de geometría (extraídos de GeometriaProceduralObjeto3D) ─────────

const clamp = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

const crearGeneradorUVPared = (ancho: number, alto: number) => ({
  generateTopUV: (_geo: THREE.ExtrudeGeometry, verts: number[], iA: number, iB: number, iC: number) => {
    const read = (i: number) => new THREE.Vector2(
      (verts[i * 3] + ancho / 2) / Math.max(ancho, 0.001),
      (verts[i * 3 + 1] + alto / 2) / Math.max(alto, 0.001),
    );
    return [read(iA), read(iB), read(iC)];
  },
  generateSideWallUV: (_geo: THREE.ExtrudeGeometry, verts: number[], iA: number, iB: number, iC: number, iD: number) => {
    const pts = [iA, iB, iC, iD].map((i) => ({ x: verts[i * 3], y: verts[i * 3 + 1], z: verts[i * 3 + 2] }));
    const w = Math.max(Math.abs(pts[0].x - pts[1].x), Math.abs(pts[0].y - pts[1].y), 0.001);
    const d = Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z)) || 0.001;
    return [new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, d), new THREE.Vector2(0, d)];
  },
});

const normalizarAberturas = (
  aberturas: AberturaArquitectonica[],
  ancho: number,
  alto: number,
): AberturaRenderizable[] => {
  const margen = 0.08;
  return aberturas.map((ab) => {
    const aw = clamp(ab.ancho, 0.2, Math.max(0.2, ancho - margen * 2));
    const ah = clamp(ab.alto, 0.2, Math.max(0.2, alto - margen * 2));
    const izq = clamp(ab.posicion_x - aw / 2, -ancho / 2 + margen, ancho / 2 - margen - aw);
    const inf = clamp(ab.posicion_y - ah / 2, -alto / 2 + margen, alto / 2 - margen - ah);
    return { ...ab, ancho: aw, alto: ah, izquierda: izq, derecha: izq + aw, inferior: inf, superior: inf + ah };
  });
};

const crearHuecoAbertura = (ab: AberturaRenderizable) => {
  const hueco = new THREE.Path();
  if (ab.forma === 'arco') {
    const radio = Math.min(ab.ancho / 2, ab.alto * 0.4);
    const altArco = ab.superior - radio;
    const cx = (ab.izquierda + ab.derecha) / 2;
    hueco.moveTo(ab.izquierda, ab.inferior);
    hueco.lineTo(ab.izquierda, altArco);
    hueco.absarc(cx, altArco, radio, Math.PI, 0, true);
    hueco.lineTo(ab.derecha, ab.inferior);
    hueco.closePath();
  } else {
    hueco.moveTo(ab.izquierda, ab.inferior);
    hueco.lineTo(ab.izquierda, ab.superior);
    hueco.lineTo(ab.derecha, ab.superior);
    hueco.lineTo(ab.derecha, ab.inferior);
    hueco.closePath();
  }
  return hueco;
};

/** Crear geometría de pared extruida con aberturas (huecos). */
const crearGeometriaPared = (
  ancho: number, alto: number, profundidad: number,
  aberturas: AberturaRenderizable[],
): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  shape.moveTo(-ancho / 2, -alto / 2);
  shape.lineTo(ancho / 2, -alto / 2);
  shape.lineTo(ancho / 2, alto / 2);
  shape.lineTo(-ancho / 2, alto / 2);
  shape.lineTo(-ancho / 2, -alto / 2);
  aberturas.forEach((ab) => shape.holes.push(crearHuecoAbertura(ab)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: profundidad,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 24,
    UVGenerator: crearGeneradorUVPared(ancho, alto),
  });
  geo.translate(0, 0, -profundidad / 2);
  geo.computeVertexNormals();
  return geo;
};

/**
 * Genera todas las geometrías de un objeto builtin en world-space,
 * clasificadas por categoría de material.
 */
const generarGeometriasObjeto = (
  objeto: EspacioObjeto,
  config: ConfiguracionGeometricaObjeto,
): TransformedGeometry[] => {
  const dims = obtenerDimensionesObjetoRuntime(objeto);
  const ancho = Math.max(dims.ancho, 0.05);
  const alto = Math.max(dims.alto, 0.05);
  const prof = Math.max(dims.profundidad, 0.05);
  const aberturas = config.tipo_geometria === 'pared'
    ? normalizarAberturas(config.aberturas, ancho, alto) : [];

  const geoLegacy = (objeto.built_in_geometry || '').trim().toLowerCase();
  const esMampara = geoLegacy === 'wall-glass';
  const esVentana = geoLegacy === 'wall-window' || geoLegacy === 'wall-window-double';
  const esArco = geoLegacy === 'wall-arch';
  const esPuerta = geoLegacy === 'wall-door' || geoLegacy === 'wall-door-double';
  const esDivision = esMampara || esVentana;
  const esMuro = esVentana || esArco || esPuerta;

  const perfil = resolverPerfilVisualArquitectonico(config.estilo_visual ?? 'corporativo');

  // World-space transform matrix
  const mat4 = new THREE.Matrix4();
  mat4.makeRotationY(objeto.rotacion_y || 0);
  mat4.setPosition(objeto.posicion_x, objeto.posicion_y, objeto.posicion_z);

  const results: TransformedGeometry[] = [];

  const addGeo = (geo: THREE.BufferGeometry, category: MaterialCategory) => {
    // Aplicar transformación world-space ANTES de normalizar
    geo.applyMatrix4(mat4);
    // Normalizar para compatibilidad con mergeBufferGeometries:
    // - Convierte a non-indexed
    // - Retiene solo position/normal/uv
    // - Limpia groups internos
    const normalized = normalizarGeometriaParaMerge(geo);
    // Dispose la geometría original si es diferente a la normalizada
    if (normalized !== geo) geo.dispose();
    results.push({ geometry: normalized, category });
  };

  // ── Cuerpo principal ──
  if (config.tipo_geometria === 'pared') {
    addGeo(crearGeometriaPared(ancho, alto, prof, aberturas), 'opaque');
  } else if (config.tipo_geometria === 'caja') {
    addGeo(new THREE.BoxGeometry(ancho, alto, prof), 'opaque');
  } else if (config.tipo_geometria === 'cilindro') {
    addGeo(new THREE.CylinderGeometry(ancho / 2, ancho / 2, alto, 32), 'opaque');
  } else if (config.tipo_geometria === 'plano') {
    addGeo(new THREE.PlaneGeometry(ancho, alto), 'opaque');
  }

  // ── Remates metálicos de división interior (mamparas/ventanas) ──
  if (config.tipo_geometria === 'pared' && esDivision && perfil.render.mostrar_remates_division) {
    const aberturaPrincipal = aberturas[0];
    if (aberturaPrincipal) {
      const altRemate = clamp(aberturaPrincipal.inferior, -alto / 2 + 0.18, alto / 2 - 0.24);
      const gRemate = new THREE.BoxGeometry(
        Math.max(ancho - 0.02, 0.08),
        perfil.render.espesor_remate_division,
        Math.min(Math.max(prof * 0.82, 0.022), 0.05)
      );
      gRemate.translate(0, altRemate, 0);
      addGeo(gRemate, 'metal');

      const gCabezal = new THREE.BoxGeometry(
        Math.max(ancho - 0.02, 0.08),
        perfil.render.espesor_cabezal_division,
        Math.min(Math.max(prof * 0.78, 0.02), 0.045)
      );
      gCabezal.translate(0, alto / 2 - 0.03, 0);
      addGeo(gCabezal, 'metal');
    }
  }

  // ── Montantes laterales mampara ──
  if (config.tipo_geometria === 'pared' && esMampara && perfil.render.mostrar_montantes_laterales_mampara) {
    const mw = perfil.render.espesor_montante_lateral;
    const mh = Math.max(alto - 0.02, 0.2);
    const md = Math.min(Math.max(prof * 0.76, 0.02), 0.04);
    const gL = new THREE.BoxGeometry(mw, mh, md);
    gL.translate(-ancho / 2 + 0.022, 0, 0);
    addGeo(gL, 'metal');
    const gR = new THREE.BoxGeometry(mw, mh, md);
    gR.translate(ancho / 2 - 0.022, 0, 0);
    addGeo(gR, 'metal');
  }

  // ── Bandas perimetrales (muros con ventana/puerta) ──
  if (config.tipo_geometria === 'pared' && esMuro && aberturas[0] && perfil.render.mostrar_bandas_perimetrales) {
    const ab = aberturas[0];
    const altPecho = clamp(ab.inferior - 0.045, -alto / 2 + 0.08, alto / 2 - 0.12);
    const gPecho = new THREE.BoxGeometry(
      Math.max(ancho - 0.04, 0.12),
      perfil.render.grosor_banda_perimetral_inferior,
      Math.min(Math.max(prof * 0.86, 0.03), 0.075)
    );
    gPecho.translate(0, altPecho, 0);
    addGeo(gPecho, 'opaque');

    const altBanda = clamp(ab.superior + 0.035, -alto / 2 + 0.24, alto / 2 - 0.05);
    const gBanda = new THREE.BoxGeometry(
      Math.max(ancho - 0.02, 0.12),
      perfil.render.grosor_banda_perimetral_superior,
      Math.min(Math.max(prof * 0.86, 0.03), 0.07)
    );
    gBanda.translate(0, altBanda, 0);
    addGeo(gBanda, 'opaque');
  }

  // ── Marcos + vidrio de aberturas ──
  if (config.tipo_geometria === 'pared') {
    for (const ab of aberturas) {
      const frameDepth = clamp(Math.max(prof * 0.92, ab.profundidad_marco), 0.02, Math.max(prof, 0.02));
      const grosorBase = clamp(ab.grosor_marco, 0.02, Math.min(ab.ancho * 0.2, ab.alto * 0.2));
      const grosor = esMampara
        ? Math.min(grosorBase, perfil.render.grosor_perfil_mampara_max)
        : esVentana
          ? clamp(grosorBase, perfil.render.grosor_perfil_ventana_min, perfil.render.grosor_perfil_ventana_max)
          : grosorBase;
      const anchoInt = Math.max(0.08, ab.ancho - grosor * 2);
      const altoInt = Math.max(0.08, ab.alto - grosor * 2);
      const cx = (ab.izquierda + ab.derecha) / 2;
      const cy = (ab.inferior + ab.superior) / 2;
      const usarMetal = esMampara || ab.tipo === 'ventana';
      const matCat: MaterialCategory = usarMetal ? 'metal' : 'opaque';

      const altArranque = ab.superior - Math.min(ab.ancho / 2, ab.alto * 0.4);
      const altJamba = Math.max(0.08, altArranque - ab.inferior + grosor);

      // Dintel superior (no en arco)
      if (ab.forma !== 'arco') {
        const gTop = new THREE.BoxGeometry(ab.ancho, grosor, frameDepth);
        gTop.translate(cx, ab.superior - grosor / 2, 0);
        addGeo(gTop, matCat);
      }
      // Alféizar (ventana o cerramiento)
      if (ab.tipo === 'ventana' || ab.insertar_cerramiento) {
        const gBot = new THREE.BoxGeometry(ab.ancho, grosor, frameDepth);
        gBot.translate(cx, ab.inferior + grosor / 2, 0);
        addGeo(gBot, matCat);
      }
      // Jambas laterales
      const jH = ab.forma === 'arco' ? altJamba : ab.alto;
      const jY = ab.forma === 'arco' ? (ab.inferior + altArranque) / 2 : cy;
      const gJL = new THREE.BoxGeometry(grosor, jH, frameDepth);
      gJL.translate(ab.izquierda + grosor / 2, jY, 0);
      addGeo(gJL, matCat);
      const gJR = new THREE.BoxGeometry(grosor, jH, frameDepth);
      gJR.translate(ab.derecha - grosor / 2, jY, 0);
      addGeo(gJR, matCat);

      // Vidrio
      if (ab.tipo === 'ventana') {
        const espesorVidrio = Math.min(frameDepth * 0.22, 0.025);
        const gGlass = new THREE.BoxGeometry(anchoInt, altoInt, espesorVidrio);
        gGlass.translate(cx, cy, 0);
        addGeo(gGlass, 'glass');

        // Montante central (mamparas/ventanas anchas)
        if ((esMampara || esVentana) && anchoInt > 1.05) {
          const gMont = new THREE.BoxGeometry(grosor * 0.7, altoInt, Math.min(frameDepth * 0.92, 0.04));
          gMont.translate(cx, cy, 0);
          addGeo(gMont, 'metal');
        }
      }

      // Hoja de puerta
      if (ab.tipo === 'puerta' && ab.insertar_cerramiento && ab.forma !== 'arco' && !esPuerta) {
        const espesorHoja = Math.max(0.02, Math.min(prof * 0.45, 0.05));
        const zPuerta = prof / 2 - frameDepth / 2;
        const gDoor = new THREE.BoxGeometry(anchoInt, altoInt, espesorHoja);
        gDoor.translate(cx, cy, zPuerta);
        addGeo(gDoor, 'opaque');
      }
    }
  }

  return results;
};

// ─── Props del componente ────────────────────────────────────────────────────

interface BuiltinWallBatcherProps {
  /** Objetos builtin (modelo_url starts with 'builtin:') */
  objetos: EspacioObjeto[];
}

// ─── Componente ──────────────────────────────────────────────────────────────

export const BuiltinWallBatcher: React.FC<BuiltinWallBatcherProps> = ({ objetos }) => {
  const merged = useMemo(() => {
    if (objetos.length === 0) return null;

    const buckets: Record<MaterialCategory, THREE.BufferGeometry[]> = {
      opaque: [],
      glass: [],
      metal: [],
    };

    let processedCount = 0;
    let skippedCount = 0;

    for (const obj of objetos) {
      const config = normalizarConfiguracionGeometricaObjeto({
        built_in_geometry: obj.built_in_geometry,
        built_in_color: obj.built_in_color,
        configuracion_geometria: obj.configuracion_geometria,
        ancho: obj.ancho,
        alto: obj.alto,
        profundidad: obj.profundidad,
      });

      if (!config) {
        skippedCount++;
        continue;
      }

      const geos = generarGeometriasObjeto(obj, config);
      for (const { geometry, category } of geos) {
        buckets[category].push(geometry);
      }
      processedCount++;
    }

    // Merge each bucket
    const results: { geometry: THREE.BufferGeometry; category: MaterialCategory }[] = [];

    for (const cat of ['opaque', 'glass', 'metal'] as MaterialCategory[]) {
      if (buckets[cat].length === 0) continue;

      // Debug: verificar compatibilidad de atributos antes del merge
      if (process.env.NODE_ENV !== 'production') {
        const attrs0 = Object.keys(buckets[cat][0].attributes).sort().join(',');
        const incompatible = buckets[cat].filter(
          (g, i) => i > 0 && Object.keys(g.attributes).sort().join(',') !== attrs0,
        );
        if (incompatible.length > 0) {
          log.warn(`[${cat}] Attribute mismatch detected BEFORE merge`, {
            expected: attrs0,
            mismatched: incompatible.length,
            total: buckets[cat].length,
          });
        }
      }

      const merged = mergeBufferGeometries(buckets[cat], false);
      if (merged) {
        merged.computeVertexNormals();
        results.push({ geometry: merged, category: cat });
      } else {
        log.warn(`mergeBufferGeometries() returned null for category "${cat}"`, {
          geometryCount: buckets[cat].length,
          hint: 'Incompatible attributes survived normalization — check normalizarGeometriaParaMerge()',
        });
      }
      // Dispose source geometries — mergeBufferGeometries copies data
      for (const g of buckets[cat]) g.dispose();
    }

    log.info('Builtin walls merged', {
      inputObjects: objetos.length,
      processed: processedCount,
      skipped: skippedCount,
      mergedGroups: results.length,
      drawCalls: results.length,
      previousDrawCalls: '~330 (individual)',
    });

    return results;
  }, [objetos]);

  // ── Materials (shared across all merged groups) ──
  const materials = useMemo(() => {
    // Use the first wall-panel's visual profile for consistency
    const perfil = resolverPerfilVisualArquitectonico('corporativo');

    const opaque = crearMaterialPBRArquitectonico({
      tipo_material: 'yeso',
      ancho: 4,
      alto: 3,
      repetir_textura: true,
      escala_textura: 1,
      color_base: '#94a3b8',
      opacidad: 1,
      rugosidad: 0.7,
      metalicidad: 0.05,
      resaltar: false,
    });

    const glass = crearMaterialPBRArquitectonico({
      tipo_material: 'vidrio',
      ancho: 2,
      alto: 2,
      repetir_textura: false,
      escala_textura: 1,
      color_base: perfil.materiales.color_vidrio,
      opacidad: perfil.materiales.opacidad_vidrio_mampara,
      rugosidad: perfil.materiales.rugosidad_vidrio_mampara,
      metalicidad: 0,
      resaltar: false,
    });

    const metal = crearMaterialMarcoArquitectonico('vidrio', false);

    return { opaque, glass, metal };
  }, []);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      if (merged) {
        for (const m of merged) m.geometry.dispose();
      }
      materials.opaque?.material.dispose();
      materials.opaque?.texturas.forEach((t) => t.dispose());
      materials.glass?.material.dispose();
      materials.glass?.texturas.forEach((t) => t.dispose());
      materials.metal?.material.dispose();
      materials.metal?.texturas.forEach((t) => t.dispose());
    };
  }, [merged, materials]);

  if (!merged || merged.length === 0) return null;

  const getMaterial = (cat: MaterialCategory): THREE.Material => {
    if (cat === 'glass') return materials.glass?.material ?? new THREE.MeshBasicMaterial();
    if (cat === 'metal') return materials.metal?.material ?? new THREE.MeshBasicMaterial();
    return materials.opaque?.material ?? new THREE.MeshBasicMaterial();
  };

  return (
    <group name="BuiltinWallBatcher">
      {merged.map(({ geometry, category }, i) => (
        <mesh
          key={category}
          geometry={geometry}
          material={getMaterial(category)}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
};
