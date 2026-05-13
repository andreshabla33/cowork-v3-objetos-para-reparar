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
    // polygonOffset evita z-fighting con el plano base de Scene3D (y=-0.01)
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
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

    // ─── VERTEX: pasar posición de mundo al fragment ──────────────────────
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vFloorWorldPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvFloorWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    // ─── FRAGMENT: inyectar lib + reemplazar map_fragment ─────────────────
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFloorWorldPos;
uniform vec3 uPalette[4];
uniform vec2 uTileSize;
uniform float uVariant;
${FLOOR_SHADER_LIB}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 floorPattern = evaluateFloorPattern(vFloorWorldPos.xz);
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
