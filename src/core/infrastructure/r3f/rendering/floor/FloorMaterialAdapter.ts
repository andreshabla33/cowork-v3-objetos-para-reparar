/**
 * @module infrastructure/r3f/rendering/floor/FloorMaterialAdapter
 *
 * Adapter Three.js que implementa `IFloorMaterialFactory`.
 *
 * Estrategia (validada contra Three.js 0.182 docs oficiales):
 *  - `MeshStandardMaterial` por FloorType → PBR completo (luces, sombras,
 *    roughness, metalness) free de Three.js core.
 *  - `onBeforeCompile` inyecta el fragment shader procedural en
 *    `#include <map_fragment>` → diffuseColor procede del shader, no de
 *    un map sampleado. VRAM ~0 por suelo.
 *  - `customProgramCacheKey` devuelve la familia de patrón → varios
 *    FloorType con misma topología comparten 1 GL program GPU
 *    (ver issue #19377 mrdoob/three.js).
 *  - Cache en `Map<FloorType, Material>` → 1 sola instancia por tipo,
 *    compartida entre todas las zonas.
 *
 * Refs oficiales:
 *  - https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
 *  - https://threejs.org/docs/#api/en/materials/Material.customProgramCacheKey
 *  - https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
 */

import * as THREE from 'three';
import type {
  IFloorMaterialFactory,
  MaterialAbstracto,
} from '@/core/domain/ports/IFloorMaterialFactory';
import { FloorType, normalizarTipoSuelo } from '@/core/domain/entities';
import { FLOOR_SPECS, programCacheKey, type FloorSpec } from './floorMaterialSpecs';
import { FLOOR_SHADER_LIB } from './floorShaderLib.glsl';

// ─── Construcción del material ───────────────────────────────────────────────

function construirMaterial(floorType: FloorType): THREE.MeshStandardMaterial {
  const spec = FLOOR_SPECS[floorType];

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    emissive: spec.emissive ? new THREE.Color(spec.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: spec.emissiveIntensity ?? 0,
    side: THREE.DoubleSide,
    // Explicit depth/transparency defaults — claros para evitar regresión.
    // NO polygonOffset: causaba dos issues simultáneos antes del 2026-05-15:
    //  1. "Transparencia" perceptible — el bias de -1 confundía el depth
    //     test en ángulos bajos, generando flicker que el ojo lee como
    //     semi-transparencia.
    //  2. Piso decorativo "ganaba" depth contra avatar/tablas en perspectiva
    //     baja, cubriendo zapatos y patas.
    // El Y-offset del piso (renderOrder + 3mm sobre el suelo principal) ya
    // es suficiente para z-fight con precision sub-mm del depth buffer 24-bit
    // a viewing distance ~5-10m. polygonOffset era over-engineering.
    depthWrite: true,
  });

  // Defines compile-time: el shader elige patrón sin branching dinámico
  mat.defines = {
    [`FLOOR_PATTERN_${spec.pattern}`]: '',
  };

  // Uniforms del shader (almacenados en userData para refs estables)
  const paletteColors = spec.palette.map((hex) => new THREE.Color(hex));

  mat.userData.floorUniforms = {
    uPalette: { value: paletteColors },
    uTileSize: { value: new THREE.Vector2(spec.tileSize, spec.tileSize) },
    uVariant: { value: spec.variant },
  };

  mat.onBeforeCompile = (shader) => {
    // Compartir refs de uniforms — críticos si quisiéramos mutarlos en runtime
    shader.uniforms.uPalette = mat.userData.floorUniforms.uPalette;
    shader.uniforms.uTileSize = mat.userData.floorUniforms.uTileSize;
    shader.uniforms.uVariant = mat.userData.floorUniforms.uVariant;

    // ─── VERTEX: pasar posición de mundo, piso center y piso size al fragment ───
    //
    // `aPisoSize` (vec2): attribute opcional por geometry — si está set, el
    // fragment shader entra en modo mesh-local auto-fit (tiles enteros encajan
    // en el piso). Si NO está set, WebGL devuelve vec2(0) por default y el
    // fragment cae al modo world-space (suelo principal infinito).
    //
    // `vPisoCenter` se deriva de `modelMatrix[3].xz` — la translation del
    // mesh en world space, que es exactamente el centro del piso.
    //
    // Ref: https://threejs.org/docs/#api/en/core/BufferAttribute
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aPisoSize;
varying vec3 vFloorWorldPos;
varying vec2 vPisoCenter;
varying vec2 vPisoSize;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vFloorWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vPisoCenter = vec2(modelMatrix[3].x, modelMatrix[3].z);
vPisoSize = aPisoSize;`,
      );

    // ─── FRAGMENT: inyectar lib + reemplazar map_fragment ─────────────────
    //
    // El shader procedural ahora tiene 2 capas de anti-aliasing:
    //   1. fwidth-based AA dentro de cada pattern function — kill detalle
    //      sub-pixel adaptivamente según footprint del pixel en pattern-space.
    //      Ref: https://iquilezles.org/articles/filtering/
    //   2. Distance-based LOD fade aquí abajo — backup para distancias muy
    //      grandes donde fwidth no es suficiente (mountains lejanas).
    //
    // `cameraPosition` es uniform built-in de Three.js — auto-inyectado.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFloorWorldPos;
varying vec2 vPisoCenter;
varying vec2 vPisoSize;
uniform vec3 uPalette[4];
uniform vec2 uTileSize;
uniform float uVariant;
${FLOOR_SHADER_LIB}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 floorPattern = evaluateFloorPattern(vFloorWorldPos.xz);
// Distance-based LOD: backup para distancias > 20m donde fwidth alone no
// alcanza (ej. suelo principal extendiéndose a 100m+). Fade a paleta media.
float distToCam = length(vFloorWorldPos - cameraPosition);
float lodFade = smoothstep(20.0, 50.0, distToCam);
vec3 avgFloorColor = (uPalette[0] + uPalette[1]) * 0.5;
floorPattern = mix(floorPattern, avgFloorColor, lodFade);
diffuseColor.rgb *= floorPattern;`,
      );
  };

  // Clave de cache de programa GPU: familia + variante → suelos con misma
  // topología pero distinta paleta comparten 1 GL program.
  mat.customProgramCacheKey = () => programCacheKey(spec);

  mat.name = `floor:${floorType}`;
  return mat;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

type FloorMaterialAbstracto = MaterialAbstracto & {
  readonly _threeMaterial: THREE.MeshStandardMaterial;
};

export class FloorMaterialAdapter implements IFloorMaterialFactory {
  private readonly cache = new Map<FloorType, FloorMaterialAbstracto>();

  obtenerMaterial(floorType: FloorType): MaterialAbstracto {
    const tipoNormalizado = normalizarTipoSuelo(floorType);
    const cached = this.cache.get(tipoNormalizado);
    if (cached) return cached;

    const mat = construirMaterial(tipoNormalizado);
    const abstracto: FloorMaterialAbstracto = {
      id: mat.uuid,
      floorType: tipoNormalizado,
      _threeMaterial: mat,
    };
    this.cache.set(tipoNormalizado, abstracto);
    return abstracto;
  }

  precargar(floorTypes: readonly FloorType[]): void {
    for (const tipo of floorTypes) {
      this.obtenerMaterial(tipo);
    }
  }

  obtenerColorSwatch(floorType: FloorType): string {
    const tipoNormalizado = normalizarTipoSuelo(floorType);
    return FLOOR_SPECS[tipoNormalizado].swatchColor;
  }

  dispose(): void {
    for (const { _threeMaterial } of this.cache.values()) {
      _threeMaterial.dispose();
    }
    this.cache.clear();
  }

  // ─── Helpers estáticos para la capa de presentación ───────────────────────

  /**
   * Resuelve el THREE.Material concreto desde un MaterialAbstracto.
   * Solo uso interno de la capa de presentación R3F.
   */
  static resolverMaterial(abstracto: MaterialAbstracto): THREE.MeshStandardMaterial {
    const mat = (abstracto as FloorMaterialAbstracto)._threeMaterial;
    if (!mat) {
      throw new Error('[FloorMaterialAdapter] MaterialAbstracto no contiene _threeMaterial');
    }
    return mat;
  }

  /**
   * Spec del FloorType (para preview meshes que necesitan replicar opacity,
   * roughness, etc., sobre un material distinto).
   */
  static obtenerSpec(floorType: FloorType): FloorSpec {
    return FLOOR_SPECS[normalizarTipoSuelo(floorType)];
  }
}

// ─── Singleton lazy (patrón de los otros adapters de rendering) ──────────────

let _instance: FloorMaterialAdapter | null = null;

export function getFloorMaterialAdapter(): FloorMaterialAdapter {
  if (!_instance) _instance = new FloorMaterialAdapter();
  return _instance;
}

export function resetFloorMaterialAdapter(): void {
  if (_instance) _instance.dispose();
  _instance = null;
}
