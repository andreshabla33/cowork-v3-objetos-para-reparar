/**
 * @module core/infrastructure/adapters/BatchMaterialPropertiesThreeAdapter
 * @description Infrastructure adapter: per-instance PBR material properties
 * via DataTexture + onBeforeCompile shader injection.
 *
 * Clean Architecture: Infrastructure layer — implements IBatchMaterialPropertiesService.
 * This is the ONLY file that touches Three.js shader compilation hooks.
 *
 * Multi-group design:
 *   Each material group (groupKey) gets its own DataTexture and shader injection.
 *   This matches MultiBatch architecture (1 BatchedMesh per material group).
 *   The adapter internally manages a Map<groupKey, GroupData>.
 *
 * Technique (confirmed from gkjohnson's batched-material-properties-demo):
 *   1. DataTexture stores per-instance props (2 pixels per instance):
 *      Pixel 0: [R, G, B, metalness] as Float32 (0.0-1.0)
 *      Pixel 1: [roughness, 0, 0, 0] as Float32
 *   2. material.onBeforeCompile() injects GLSL into vertex + fragment shaders
 *   3. Vertex shader samples DataTexture using gl_DrawID (batch instance index)
 *   4. Fragment shader overrides diffuseColor, metalnessFactor, roughnessFactor
 *
 * GLSL injection points (Three.js r170 MeshStandardMaterial):
 *   Vertex:   after #include <common> — declarations
 *             after #include <begin_vertex> — gl_DrawID available, sample texture
 *   Fragment: after #include <common> — declarations
 *             after #include <color_fragment> — override diffuseColor
 *             at `float metalnessFactor = metalness;` — override metalness
 *             at `float roughnessFactor = roughness;` — override roughness
 *
 * Ref: gkjohnson/batched-material-properties-demo
 *   https://github.com/gkjohnson/batched-material-properties-demo
 * Ref: Three.js r170 — Material.onBeforeCompile
 *   https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
 * Ref: Three.js r170 — DataTexture (NearestFilter for exact texel fetch)
 *   https://threejs.org/docs/#api/en/textures/DataTexture
 * Ref: Three.js r170 — batching_pars_vertex.glsl (gl_DrawID)
 */

import * as THREE from 'three';
import type {
  IBatchMaterialPropertiesService,
  InstanceMaterialProps,
  BatchMaterialPropsStats,
  BatchMaterialPropsGroupStats,
} from '../../domain/ports/IBatchMaterialPropertiesService';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Pixels per instance in the DataTexture.
 * Pixel 0: RGBA = [color.R, color.G, color.B, metalness]
 * Pixel 1: RGBA = [roughness, 0, 0, 0]  (reserved for emissive, AO, etc.)
 */
const PIXELS_PER_INSTANCE = 2;

// ─── Internal group data structure ──────────────────────────────────────────

interface GroupData {
  texture: THREE.DataTexture;
  data: Float32Array;
  maxInstances: number;
  dirtyCount: number;
}

// ─── GLSL Shader Chunks ─────────────────────────────────────────────────────

/**
 * Vertex shader injection: declare uniforms + varyings, sample DataTexture.
 *
 * gl_DrawID is provided by Three.js batching system (batching_pars_vertex.glsl).
 * It represents the instance index within the BatchedMesh.
 *
 * texelFetch with ivec2(column, row) samples exact pixel (NearestFilter).
 * Column 0 = color+metalness, Column 1 = roughness+reserved.
 */
const VERT_DECLARATIONS = /* glsl */ `
  uniform highp sampler2D batchMaterialProps;
  uniform float batchMaterialPropsHeight;
  flat varying vec3 vBatchColor;
  flat varying float vBatchMetalness;
  flat varying float vBatchRoughness;
`;

const VERT_SAMPLING = /* glsl */ `
  // ─── Fase 4D: Per-instance material properties from DataTexture ───
  {
    int instanceRow = gl_DrawID;
    // Pixel 0: color.RGB + metalness
    vec4 px0 = texelFetch(batchMaterialProps, ivec2(0, instanceRow), 0);
    vBatchColor = px0.rgb;
    vBatchMetalness = px0.a;
    // Pixel 1: roughness + reserved
    vec4 px1 = texelFetch(batchMaterialProps, ivec2(1, instanceRow), 0);
    vBatchRoughness = px1.r;
  }
`;

/**
 * Fragment shader injection: declare varyings, override material properties.
 */
const FRAG_DECLARATIONS = /* glsl */ `
  flat varying vec3 vBatchColor;
  flat varying float vBatchMetalness;
  flat varying float vBatchRoughness;
`;

const FRAG_COLOR_OVERRIDE = /* glsl */ `
  // ─── Fase 4D: Override diffuseColor with per-instance color ───
  diffuseColor.rgb = vBatchColor;
`;

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class BatchMaterialPropertiesThreeAdapter implements IBatchMaterialPropertiesService {
  private _groups = new Map<string, GroupData>();

  // ─── Group lifecycle ────────────────────────────────────────────────────────

  initializeGroup(groupKey: string, maxInstances: number): void {
    // Dispose existing group if re-initializing
    this.disposeGroup(groupKey);

    const width = PIXELS_PER_INSTANCE; // 2 pixels wide
    const height = maxInstances;       // 1 row per instance

    // Float32 RGBA: 4 channels × 2 pixels × N instances
    const data = new Float32Array(width * height * 4);

    // Default: white color (1,1,1), metalness=0.0, roughness=0.5
    for (let i = 0; i < maxInstances; i++) {
      const base = i * width * 4; // row offset
      // Pixel 0: R, G, B, metalness
      data[base + 0] = 1.0; // R
      data[base + 1] = 1.0; // G
      data[base + 2] = 1.0; // B
      data[base + 3] = 0.0; // metalness
      // Pixel 1: roughness, reserved, reserved, reserved
      data[base + 4] = 0.5; // roughness
      data[base + 5] = 0.0;
      data[base + 6] = 0.0;
      data[base + 7] = 0.0;
    }

    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    // NearestFilter: exact texel fetch, no interpolation between instances
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    this._groups.set(groupKey, {
      texture,
      data,
      maxInstances,
      dirtyCount: 0,
    });
  }

  hasGroup(groupKey: string): boolean {
    return this._groups.has(groupKey);
  }

  disposeGroup(groupKey: string): void {
    const group = this._groups.get(groupKey);
    if (!group) return;
    group.texture.dispose();
    this._groups.delete(groupKey);
  }

  dispose(): void {
    for (const [, group] of this._groups) {
      group.texture.dispose();
    }
    this._groups.clear();
  }

  // ─── Property management ───────────────────────────────────────────────────

  setInstanceProperties(groupKey: string, instanceIndex: number, props: InstanceMaterialProps): void {
    const group = this._groups.get(groupKey);
    if (!group || instanceIndex < 0 || instanceIndex >= group.maxInstances) return;

    const base = instanceIndex * PIXELS_PER_INSTANCE * 4;
    // Pixel 0: color RGB + metalness
    group.data[base + 0] = props.r;
    group.data[base + 1] = props.g;
    group.data[base + 2] = props.b;
    group.data[base + 3] = props.metalness;
    // Pixel 1: roughness
    group.data[base + 4] = props.roughness;

    group.dirtyCount++;
  }

  setMultipleInstanceProperties(
    groupKey: string,
    entries: Array<{ index: number; props: InstanceMaterialProps }>,
  ): void {
    const group = this._groups.get(groupKey);
    if (!group) return;

    for (const { index, props } of entries) {
      if (index < 0 || index >= group.maxInstances) continue;
      const base = index * PIXELS_PER_INSTANCE * 4;
      group.data[base + 0] = props.r;
      group.data[base + 1] = props.g;
      group.data[base + 2] = props.b;
      group.data[base + 3] = props.metalness;
      group.data[base + 4] = props.roughness;
    }

    group.dirtyCount += entries.length;
  }

  flushGroup(groupKey: string): void {
    const group = this._groups.get(groupKey);
    if (!group || group.dirtyCount === 0) return;
    group.texture.needsUpdate = true;
    group.dirtyCount = 0;
  }

  flushAll(): void {
    for (const [, group] of this._groups) {
      if (group.dirtyCount === 0) continue;
      group.texture.needsUpdate = true;
      group.dirtyCount = 0;
    }
  }

  // ─── Shader injection ──────────────────────────────────────────────────────

  /**
   * Apply onBeforeCompile shader injection to a MeshStandardMaterial.
   *
   * Injection strategy:
   *   1. Add uniform + varying declarations after existing declarations
   *   2. Sample DataTexture in vertex shader after batching (gl_DrawID available)
   *   3. Override diffuseColor in fragment shader after color_fragment chunk
   *   4. Override metalnessFactor and roughnessFactor with per-instance values
   *
   * MUST be called before the material is first compiled (before first render).
   */
  applyToMaterial(groupKey: string, material: unknown): void {
    const group = this._groups.get(groupKey);
    if (!group) return;

    const mat = material as THREE.MeshStandardMaterial;
    const propsTexture = group.texture;
    const maxInstances = group.maxInstances;

    mat.onBeforeCompile = (shader) => {
      // Register the DataTexture as a shader uniform
      shader.uniforms.batchMaterialProps = { value: propsTexture };
      shader.uniforms.batchMaterialPropsHeight = { value: maxInstances };

      // ─── Vertex shader: add declarations + sampling ───────────────
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${VERT_DECLARATIONS}`,
      );

      // Sample DataTexture after begin_vertex (gl_DrawID ready from batching)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${VERT_SAMPLING}`,
      );

      // ─── Fragment shader: add declarations + overrides ────────────
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\n${FRAG_DECLARATIONS}`,
      );

      // Override diffuseColor after the color_fragment chunk
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${FRAG_COLOR_OVERRIDE}`,
      );

      // Override metalness per-instance
      shader.fragmentShader = shader.fragmentShader.replace(
        'float metalnessFactor = metalness;',
        'float metalnessFactor = vBatchMetalness;',
      );

      // Override roughness per-instance
      shader.fragmentShader = shader.fragmentShader.replace(
        'float roughnessFactor = roughness;',
        'float roughnessFactor = vBatchRoughness;',
      );
    };

    // Force recompilation with our shader modifications
    mat.needsUpdate = true;
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getPropertiesTexture(groupKey: string): THREE.DataTexture | null {
    return this._groups.get(groupKey)?.texture ?? null;
  }

  getStats(): BatchMaterialPropsStats {
    const groups = new Map<string, BatchMaterialPropsGroupStats>();
    let totalInstances = 0;

    for (const [key, group] of this._groups) {
      groups.set(key, {
        instanceCount: group.maxInstances,
        textureWidth: PIXELS_PER_INSTANCE,
        textureHeight: group.maxInstances,
        needsUpdate: group.dirtyCount > 0,
      });
      totalInstances += group.maxInstances;
    }

    return {
      groupCount: this._groups.size,
      totalInstances,
      groups,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: BatchMaterialPropertiesThreeAdapter | null = null;

export function getBatchMaterialPropertiesAdapter(): BatchMaterialPropertiesThreeAdapter {
  if (!_instance) {
    _instance = new BatchMaterialPropertiesThreeAdapter();
  }
  return _instance;
}

export function resetBatchMaterialPropertiesAdapter(): void {
  _instance?.dispose();
  _instance = null;
}
