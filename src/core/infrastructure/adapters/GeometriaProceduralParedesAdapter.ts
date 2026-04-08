/**
 * @module core/infrastructure/adapters/GeometriaProceduralParedesAdapter
 * @description Infrastructure adapter for procedural wall geometry generation.
 *
 * Clean Architecture: Infrastructure layer — Three.js-specific implementation
 * of the IBuiltinWallGeometryService domain port.
 *
 * Consolidates procedural wall geometry logic that was previously duplicated
 * across BuiltinWallBatcher.tsx and GeometriaProceduralObjeto3D.tsx.
 *
 * Responsibilities:
 *   - Wall body (ExtrudeGeometry with holes for aberturas)
 *   - Glass panels (BoxGeometry for window fill)
 *   - Metal frames (BoxGeometry for frames, jambs, mullions)
 *   - Geometry normalization for merge compatibility
 *   - Merging via three-stdlib mergeBufferGeometries
 *
 * Ref: Three.js r182 — ExtrudeGeometry
 *   https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry
 * Ref: Three.js r182 — BufferGeometryUtils.mergeGeometries
 *   https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
 */

import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  normalizarConfiguracionGeometricaObjeto,
  type AberturaArquitectonica,
} from '@/src/core/domain/entities/objetosArquitectonicos';
import { resolverPerfilVisualArquitectonico } from '@/src/core/domain/entities/estilosVisualesArquitectonicos';
// FIX (Clean Architecture): Import directly from domain, not from deprecated
// Presentation proxy (@/components/space3d/objetosRuntime).
// Ref: Infrastructure must depend on Domain, never on Presentation.
import {
  obtenerDimensionesObjeto,
  type ObjetoRuntime3D,
} from '@/src/core/domain/entities/espacio3d';
import {
  GLASS_Z_OFFSET_FACTOR,
  GLASS_MAX_THICKNESS,
  type IBuiltinWallGeometryService,
  type CategorizedGeometry,
  type MaterialCategory,
  type WallObjectData,
  type GeometryRef,
} from '@/src/core/domain/ports/IBuiltinWallGeometryService';

// ─── Types internos ─────────────────────────────────────────────────────────

export interface AberturaRenderizable extends AberturaArquitectonica {
  izquierda: number;
  derecha: number;
  inferior: number;
  superior: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Atributos permitidos en geometrías normalizadas para merge.
 * Incluye 'color' para vertex colors (per-object color baking).
 *
 * @see https://threejs.org/docs/#api/en/materials/Material.vertexColors
 * @see https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
 */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set(['position', 'normal', 'uv', 'color']);

/** Cache de THREE.Color para evitar crear objetos temporales en hot path */
const _tmpColor = new THREE.Color();

// ─── Domain utility imports ────────────────────────────────────────────────
import { clamp } from '@/src/core/domain/utils/mathUtils';

// ─── Helpers de geometría compartidos ───────────────────────────────────────
// Estas funciones son usadas tanto por BuiltinWallBatcher (merge path)
// como por GeometriaProceduralObjeto3D (individual path).

/**
 * Genera UV mapping para ExtrudeGeometry de paredes.
 * @see https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry (UVGenerator)
 */
export const crearGeneradorUVPared = (ancho: number, alto: number) => ({
  generateTopUV: (
    _geo: THREE.ExtrudeGeometry,
    verts: number[],
    iA: number,
    iB: number,
    iC: number,
  ) => {
    const read = (i: number) =>
      new THREE.Vector2(
        (verts[i * 3] + ancho / 2) / Math.max(ancho, 0.001),
        (verts[i * 3 + 1] + alto / 2) / Math.max(alto, 0.001),
      );
    return [read(iA), read(iB), read(iC)];
  },
  generateSideWallUV: (
    _geo: THREE.ExtrudeGeometry,
    verts: number[],
    iA: number,
    iB: number,
    iC: number,
    iD: number,
  ) => {
    const pts = [iA, iB, iC, iD].map((i) => ({
      x: verts[i * 3],
      y: verts[i * 3 + 1],
      z: verts[i * 3 + 2],
    }));
    const w = Math.max(
      Math.abs(pts[0].x - pts[1].x),
      Math.abs(pts[0].y - pts[1].y),
      0.001,
    );
    const d =
      Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z)) ||
      0.001;
    return [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(w, 0),
      new THREE.Vector2(w, d),
      new THREE.Vector2(0, d),
    ];
  },
});

/**
 * Normaliza aberturas (ventanas, puertas) a coordenadas renderizables
 * con bordes izquierda/derecha/inferior/superior calculados.
 */
export const normalizarAberturas = (
  aberturas: AberturaArquitectonica[],
  ancho: number,
  alto: number,
): AberturaRenderizable[] => {
  const margen = 0.08;
  return aberturas.map((ab) => {
    const aw = clamp(ab.ancho, 0.2, Math.max(0.2, ancho - margen * 2));
    const ah = clamp(ab.alto, 0.2, Math.max(0.2, alto - margen * 2));
    const izq = clamp(
      ab.posicion_x - aw / 2,
      -ancho / 2 + margen,
      ancho / 2 - margen - aw,
    );
    const inf = clamp(
      ab.posicion_y - ah / 2,
      -alto / 2 + margen,
      alto / 2 - margen - ah,
    );
    return {
      ...ab,
      ancho: aw,
      alto: ah,
      izquierda: izq,
      derecha: izq + aw,
      inferior: inf,
      superior: inf + ah,
    };
  });
};

/**
 * Crea un THREE.Path con la forma del hueco de una abertura.
 * Soporta formas 'rectangular' y 'arco'.
 */
export const crearHuecoAbertura = (ab: AberturaRenderizable): THREE.Path => {
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

/**
 * Crear geometría de pared extruida con aberturas (huecos).
 * @see https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry
 */
export const crearGeometriaPared = (
  ancho: number,
  alto: number,
  profundidad: number,
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

// ─── Adapter Implementation ─────────────────────────────────────────────────

export class GeometriaProceduralParedesAdapter
  implements IBuiltinWallGeometryService
{
  /**
   * Normaliza una BufferGeometry para merge compatibility.
   *
   * Three.js requiere que TODAS las geometrías pasadas a mergeBufferGeometries
   * tengan exactamente los mismos atributos. Esta función estandariza a
   * position/normal/uv/color, convierte a non-indexed, y limpia groups.
   *
   * @see https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
   */
  normalizarParaMerge(
    geo: GeometryRef,
    vertexColor?: string,
    skipVertexColor = false,
  ): GeometryRef {
    const geometry = geo as THREE.BufferGeometry;
    const nonIndexed = geometry.index
      ? geometry.toNonIndexed()
      : geometry.clone();

    // Eliminar atributos no permitidos
    const attrNames = Object.keys(nonIndexed.attributes);
    for (const name of attrNames) {
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        nonIndexed.deleteAttribute(name);
      }
    }

    const vertCount = nonIndexed.getAttribute('position').count;

    // Vertex color injection
    if (!skipVertexColor) {
      if (vertexColor) {
        _tmpColor.set(vertexColor);
      } else {
        _tmpColor.set(0x94a3b8);
      }
      _tmpColor.convertSRGBToLinear();
      const colorArray = new Float32Array(vertCount * 3);
      for (let i = 0; i < vertCount; i++) {
        colorArray[i * 3] = _tmpColor.r;
        colorArray[i * 3 + 1] = _tmpColor.g;
        colorArray[i * 3 + 2] = _tmpColor.b;
      }
      nonIndexed.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colorArray, 3),
      );
    } else {
      if (nonIndexed.hasAttribute('color')) {
        nonIndexed.deleteAttribute('color');
      }
    }

    // Asegurar uv
    if (!nonIndexed.hasAttribute('uv')) {
      nonIndexed.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array(vertCount * 2), 2),
      );
    }

    // Asegurar normal
    if (!nonIndexed.hasAttribute('normal')) {
      nonIndexed.computeVertexNormals();
    }

    // Limpiar groups e index residuales
    nonIndexed.clearGroups();
    if (nonIndexed.index) {
      nonIndexed.setIndex(null);
    }

    return nonIndexed;
  }

  /**
   * Genera todas las geometrías de un objeto builtin en world-space,
   * clasificadas por categoría de material.
   */
  generarGeometriasObjeto(objeto: WallObjectData): CategorizedGeometry[] {
    const config = normalizarConfiguracionGeometricaObjeto({
      built_in_geometry: objeto.built_in_geometry,
      built_in_color: objeto.built_in_color,
      configuracion_geometria: objeto.configuracion_geometria,
      ancho: objeto.ancho,
      alto: objeto.alto,
      profundidad: objeto.profundidad,
    });

    if (!config) return [];

    const dims = obtenerDimensionesObjeto(objeto as ObjetoRuntime3D);
    const ancho = Math.max(dims.ancho, 0.05);
    const alto = Math.max(dims.alto, 0.05);
    const prof = Math.max(dims.profundidad, 0.05);
    const aberturas =
      config.tipo_geometria === 'pared'
        ? normalizarAberturas(config.aberturas, ancho, alto)
        : [];

    const geoLegacy = (objeto.built_in_geometry || '').trim().toLowerCase();
    const esMampara = geoLegacy === 'wall-glass';
    const esVentana =
      geoLegacy === 'wall-window' || geoLegacy === 'wall-window-double';
    const esArco = geoLegacy === 'wall-arch';
    const esPuerta =
      geoLegacy === 'wall-door' || geoLegacy === 'wall-door-double';
    const esDivision = esMampara || esVentana;
    const esMuro = esVentana || esArco || esPuerta;

    const perfil = resolverPerfilVisualArquitectonico(
      config.estilo_visual ?? 'corporativo',
    );

    // World-space transform
    const mat4 = new THREE.Matrix4();
    mat4.makeRotationY(objeto.rotacion_y || 0);
    mat4.setPosition(objeto.posicion_x, objeto.posicion_y, objeto.posicion_z);

    const colorOpaque = config.color_base ?? '#94a3b8';
    const colorGlass = perfil.materiales.color_vidrio ?? '#e0f2fe';
    const colorMetal = perfil.materiales.color_metal ?? '#a8a29e';

    const results: CategorizedGeometry[] = [];

    const addGeo = (geo: THREE.BufferGeometry, category: MaterialCategory) => {
      geo.applyMatrix4(mat4);
      const color =
        category === 'glass'
          ? colorGlass
          : category === 'metal'
            ? colorMetal
            : colorOpaque;
      const skipVC = category === 'glass';
      const normalized = this.normalizarParaMerge(
        geo,
        color,
        skipVC,
      ) as THREE.BufferGeometry;
      if (normalized !== geo) geo.dispose();
      results.push({ geometry: normalized, category });
    };

    // ── Cuerpo principal ──
    if (config.tipo_geometria === 'pared') {
      addGeo(crearGeometriaPared(ancho, alto, prof, aberturas), 'opaque');
    } else if (config.tipo_geometria === 'caja') {
      addGeo(new THREE.BoxGeometry(ancho, alto, prof), 'opaque');
    } else if (config.tipo_geometria === 'cilindro') {
      addGeo(
        new THREE.CylinderGeometry(ancho / 2, ancho / 2, alto, 32),
        'opaque',
      );
    } else if (config.tipo_geometria === 'plano') {
      addGeo(new THREE.PlaneGeometry(ancho, alto), 'opaque');
    }

    // ── Remates metálicos de división interior ──
    if (
      config.tipo_geometria === 'pared' &&
      esDivision &&
      perfil.render.mostrar_remates_division
    ) {
      const aberturaPrincipal = aberturas[0];
      if (aberturaPrincipal) {
        const altRemate = clamp(
          aberturaPrincipal.inferior,
          -alto / 2 + 0.18,
          alto / 2 - 0.24,
        );
        const gRemate = new THREE.BoxGeometry(
          Math.max(ancho - 0.02, 0.08),
          perfil.render.espesor_remate_division,
          Math.min(Math.max(prof * 0.82, 0.022), 0.05),
        );
        gRemate.translate(0, altRemate, 0);
        addGeo(gRemate, 'metal');

        const gCabezal = new THREE.BoxGeometry(
          Math.max(ancho - 0.02, 0.08),
          perfil.render.espesor_cabezal_division,
          Math.min(Math.max(prof * 0.78, 0.02), 0.045),
        );
        gCabezal.translate(0, alto / 2 - 0.03, 0);
        addGeo(gCabezal, 'metal');
      }
    }

    // ── Montantes laterales mampara ──
    if (
      config.tipo_geometria === 'pared' &&
      esMampara &&
      perfil.render.mostrar_montantes_laterales_mampara
    ) {
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

    // ── Bandas perimetrales ──
    if (
      config.tipo_geometria === 'pared' &&
      esMuro &&
      aberturas[0] &&
      perfil.render.mostrar_bandas_perimetrales
    ) {
      const ab = aberturas[0];
      const altPecho = clamp(
        ab.inferior - 0.045,
        -alto / 2 + 0.08,
        alto / 2 - 0.12,
      );
      const gPecho = new THREE.BoxGeometry(
        Math.max(ancho - 0.04, 0.12),
        perfil.render.grosor_banda_perimetral_inferior,
        Math.min(Math.max(prof * 0.86, 0.03), 0.075),
      );
      gPecho.translate(0, altPecho, 0);
      addGeo(gPecho, 'opaque');

      const altBanda = clamp(
        ab.superior + 0.035,
        -alto / 2 + 0.24,
        alto / 2 - 0.05,
      );
      const gBanda = new THREE.BoxGeometry(
        Math.max(ancho - 0.02, 0.12),
        perfil.render.grosor_banda_perimetral_superior,
        Math.min(Math.max(prof * 0.86, 0.03), 0.07),
      );
      gBanda.translate(0, altBanda, 0);
      addGeo(gBanda, 'opaque');
    }

    // ── Marcos + vidrio de aberturas ──
    if (config.tipo_geometria === 'pared') {
      this._generarAberturasGeometria(
        aberturas,
        prof,
        esMampara,
        esVentana,
        esPuerta,
        perfil,
        addGeo,
      );
    }

    return results;
  }

  /**
   * Merge an array of compatible geometries.
   * @see https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils.mergeGeometries
   */
  mergearGeometrias(geometries: GeometryRef[]): GeometryRef | null {
    const geos = geometries as THREE.BufferGeometry[];
    const merged = mergeBufferGeometries(geos, false);
    if (merged) {
      merged.computeVertexNormals();
    }
    return merged;
  }

  /**
   * Dispose a geometry and free GPU resources.
   */
  disposeGeometry(geometry: GeometryRef): void {
    (geometry as THREE.BufferGeometry).dispose();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _generarAberturasGeometria(
    aberturas: AberturaRenderizable[],
    prof: number,
    esMampara: boolean,
    esVentana: boolean,
    esPuerta: boolean,
    perfil: ReturnType<typeof resolverPerfilVisualArquitectonico>,
    addGeo: (geo: THREE.BufferGeometry, category: MaterialCategory) => void,
  ): void {
    for (const ab of aberturas) {
      const frameDepth = clamp(
        Math.max(prof * 0.92, ab.profundidad_marco),
        0.02,
        Math.max(prof, 0.02),
      );
      const grosorBase = clamp(
        ab.grosor_marco,
        0.02,
        Math.min(ab.ancho * 0.2, ab.alto * 0.2),
      );
      const grosor = esMampara
        ? Math.min(grosorBase, perfil.render.grosor_perfil_mampara_max)
        : esVentana
          ? clamp(
              grosorBase,
              perfil.render.grosor_perfil_ventana_min,
              perfil.render.grosor_perfil_ventana_max,
            )
          : grosorBase;
      const anchoInt = Math.max(0.08, ab.ancho - grosor * 2);
      const altoInt = Math.max(0.08, ab.alto - grosor * 2);
      const cx = (ab.izquierda + ab.derecha) / 2;
      const cy = (ab.inferior + ab.superior) / 2;
      const usarMetal = esMampara || ab.tipo === 'ventana';
      const matCat: MaterialCategory = usarMetal ? 'metal' : 'opaque';

      const altArranque =
        ab.superior - Math.min(ab.ancho / 2, ab.alto * 0.4);
      const altJamba = Math.max(0.08, altArranque - ab.inferior + grosor);

      // Dintel superior
      if (ab.forma !== 'arco') {
        const gTop = new THREE.BoxGeometry(ab.ancho, grosor, frameDepth);
        gTop.translate(cx, ab.superior - grosor / 2, 0);
        addGeo(gTop, matCat);
      }
      // Alféizar
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
      // FIX: Glass pane z-offset to prevent z-fighting with hole inner side walls.
      //
      // Root cause: ExtrudeGeometry creates inner side faces at hole boundaries that
      // span from z=-prof/2 to z=+prof/2. With glass at z=0, fragments compete for
      // the same depth buffer values. On WebGPU (Three.js r182) this is exacerbated
      // by higher depth precision and pipeline cache behavior.
      //
      // Solution: Push glass pane forward by 15% of wall depth so it sits clearly in
      // front of the wall center, avoiding coplanarity with the extrusion's inner faces.
      // Glass remains visually centered within the hole (offset is < 2cm for typical walls).
      //
      // Ref: https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry (side wall generation)
      // Ref: https://github.com/mrdoob/three.js/issues/32570 (WebGPU transparent regression)
      if (ab.tipo === 'ventana') {
        const espesorVidrio = Math.min(frameDepth * 0.22, GLASS_MAX_THICKNESS);
        const glassZOffset = prof * GLASS_Z_OFFSET_FACTOR;
        const gGlass = new THREE.BoxGeometry(anchoInt, altoInt, espesorVidrio);
        gGlass.translate(cx, cy, glassZOffset);
        addGeo(gGlass, 'glass');

        if ((esMampara || esVentana) && anchoInt > 1.05) {
          const gMont = new THREE.BoxGeometry(
            grosor * 0.7,
            altoInt,
            Math.min(frameDepth * 0.92, 0.04),
          );
          gMont.translate(cx, cy, 0);
          addGeo(gMont, 'metal');
        }
      }

      // Hoja de puerta
      if (
        ab.tipo === 'puerta' &&
        ab.insertar_cerramiento &&
        ab.forma !== 'arco' &&
        !esPuerta
      ) {
        const espesorHoja = Math.max(0.02, Math.min(prof * 0.45, 0.05));
        const zPuerta = prof / 2 - frameDepth / 2;
        const gDoor = new THREE.BoxGeometry(anchoInt, altoInt, espesorHoja);
        gDoor.translate(cx, cy, zPuerta);
        addGeo(gDoor, 'opaque');
      }
    }
  }
}
