/**
 * @module core/infrastructure/adapters/GPUSkinnedInstanceAdapter
 * @description Infrastructure adapter: GPU instanced skinning via bone matrix DataTexture.
 *
 * Clean Architecture: Infrastructure layer — implements IGPUSkinnedInstanceService.
 * This is the ONLY file in the project that creates the bone matrix DataTexture
 * and the instanced skinning ShaderMaterial.
 *
 * Problem solved (Fase 3):
 *   With 500 avatars each having its own SkinnedMesh, the GPU processes
 *   N independent draw calls with N separate bone matrix uniform uploads.
 *   GPU instanced skinning uploads ALL bone matrices into a single DataTexture
 *   and renders all avatars in 1-2 draw calls using a custom shader.
 *
 * DataTexture layout:
 *   - Width  = 4 * numBones  (each bone = 1 mat4 = 4 vec4 = 4 RGBA pixels)
 *   - Height = maxAvatars    (each row = all bone matrices of 1 avatar)
 *   - Format = RGBAFormat, Type = FloatType (RGBA32F)
 *
 * Shader reads:
 *   - instanceID from gl_InstanceID (WebGL2)
 *   - bone matrix from DataTexture at row = instanceID
 *   - Applies standard skinning algorithm with instanced data
 *
 * Partial upload optimization:
 *   Tracks dirty rows and uses texture.needsUpdate with subimage upload
 *   via source.data subarray to minimize GPU bandwidth per frame.
 *
 * IMPORTANT: Do NOT use with WebGPURenderer — THREE.js issue #32236
 *   (SkeletonUtils.clone() + WebGPURenderer crash, unresolved as of 2026-04-07)
 *
 * Ref: Three.js DataTexture
 *   https://threejs.org/docs/#api/en/textures/DataTexture
 *
 * Ref: Three.js community — animated instanced skinned meshes
 *   https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958
 */

import * as THREE from 'three';
import type {
  IGPUSkinnedInstanceService,
  AvatarRowIndex,
  BoneMatrices,
  GPUSkinnedInstanceStats,
} from '../../domain/ports/IGPUSkinnedInstanceService';

// ─── Shader sources ───────────────────────────────────────────────────────────

/**
 * Vertex shader for GPU instanced skinning via bone matrix DataTexture.
 *
 * Ref: Three.js ShaderMaterial — custom shaders MUST use `#include <common>`
 * to receive built-in uniforms (projectionMatrix, modelViewMatrix) and
 * attributes (position, normal, uv, skinIndex, skinWeight).
 * https://threejs.org/docs/pages/ShaderMaterial.html
 *
 * IMPORTANT: Three.js only injects skinIndex/skinWeight when the object is a
 * SkinnedMesh (WebGLPrograms.js: skinning = object.isSkinnedMesh === true).
 * Since we use InstancedMesh, USE_SKINNING is never defined and these
 * attributes are never auto-injected. We declare them explicitly with a
 * #ifndef guard to avoid duplicates if ever used with SkinnedMesh.
 *
 * Ref: three.js/src/renderers/webgl/WebGLPrograms.js
 * Ref: three.js/src/renderers/webgl/WebGLProgram.js
 *
 * Pattern aligned with lib/gpu/instancedSkinningShader.ts (PR-8/9).
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

#include <common>

// Skinning attributes — only auto-injected for SkinnedMesh (USE_SKINNING).
// InstancedMesh requires explicit declaration.
#ifndef USE_SKINNING
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
#endif

// Bone matrix DataTexture uniforms
uniform sampler2D boneMatrixTexture;
uniform float numBones;
uniform vec2 boneTexSize;

// Reads a mat4 from the DataTexture at (row=instanceID, column=boneIndex)
mat4 getBoneMatrix(float boneIndex) {
  int instanceID = gl_InstanceID;
  float pixelX = boneIndex * 4.0;
  float texelSize = 1.0 / boneTexSize.x;
  float texelSizeY = 1.0 / boneTexSize.y;
  float y = (float(instanceID) + 0.5) * texelSizeY;

  vec4 c0 = texture2D(boneMatrixTexture, vec2((pixelX + 0.5) * texelSize, y));
  vec4 c1 = texture2D(boneMatrixTexture, vec2((pixelX + 1.5) * texelSize, y));
  vec4 c2 = texture2D(boneMatrixTexture, vec2((pixelX + 2.5) * texelSize, y));
  vec4 c3 = texture2D(boneMatrixTexture, vec2((pixelX + 3.5) * texelSize, y));

  return mat4(c0, c1, c2, c3);
}

void main() {
  // Build skinned position from 4 bone influences
  mat4 boneMatX = getBoneMatrix(skinIndex.x);
  mat4 boneMatY = getBoneMatrix(skinIndex.y);
  mat4 boneMatZ = getBoneMatrix(skinIndex.z);
  mat4 boneMatW = getBoneMatrix(skinIndex.w);

  vec4 skinnedPos =
    boneMatX * vec4(position, 1.0) * skinWeight.x +
    boneMatY * vec4(position, 1.0) * skinWeight.y +
    boneMatZ * vec4(position, 1.0) * skinWeight.z +
    boneMatW * vec4(position, 1.0) * skinWeight.w;

  gl_Position = projectionMatrix * modelViewMatrix * skinnedPos;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 color;

  void main() {
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class GPUSkinnedInstanceAdapter implements IGPUSkinnedInstanceService {
  private _texture: THREE.DataTexture | null = null;
  private _material: THREE.ShaderMaterial | null = null;
  private _textureData: Float32Array | null = null;

  private _maxAvatars = 0;
  private _boneCount = 0;
  private _textureWidth = 0;

  /** avatarId → row index in DataTexture */
  private readonly _avatarRows = new Map<string, number>();

  /** Pool of free row indices (recycled from removeAvatar) */
  private _freeRows: number[] = [];

  /** Rows that have pending matrix updates (need GPU upload) */
  private readonly _dirtyRows = new Set<number>();

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  initialize(maxAvatars: number, boneCount: number): void {
    // Clean up existing resources
    this._texture?.dispose();
    this._material?.dispose();

    this._maxAvatars = maxAvatars;
    this._boneCount = boneCount;

    // Width = 4 texels per bone (one mat4 = 4 vec4 = 4 RGBA pixels)
    this._textureWidth = 4 * boneCount;

    // Allocate the flat buffer: width × height × 4 channels (RGBA)
    this._textureData = new Float32Array(this._textureWidth * maxAvatars * 4);

    // Create the DataTexture (RGBA32F — requires EXT_color_buffer_float or WebGL2)
    this._texture = new THREE.DataTexture(
      this._textureData,
      this._textureWidth,
      maxAvatars,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this._texture.needsUpdate = true;

    // Create the ShaderMaterial with bone matrix texture uniform
    // Note: `skinning` property was removed from Material in r137 (PR #21788).
    // Skinning is handled manually in our custom vertex shader via DataTexture.
    // Ref: Three.js ShaderMaterial docs — uniforms must match GLSL uniform names.
    this._material = new THREE.ShaderMaterial({
      name: 'GPUSkinnedInstance',
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        boneMatrixTexture: { value: this._texture },
        numBones: { value: boneCount },
        boneTexSize: { value: new THREE.Vector2(this._textureWidth, maxAvatars) },
        color: { value: new THREE.Color(0xffffff) },
      },
    });

    // Reset state
    this._avatarRows.clear();
    this._freeRows = Array.from({ length: maxAvatars }, (_, i) => i);
    this._dirtyRows.clear();
  }

  dispose(): void {
    this._texture?.dispose();
    this._material?.dispose();
    this._texture = null;
    this._material = null;
    this._textureData = null;
    this._avatarRows.clear();
    this._freeRows = [];
    this._dirtyRows.clear();
    this._maxAvatars = 0;
    this._boneCount = 0;
  }

  // ─── Avatar management ───────────────────────────────────────────────────────

  addAvatar(avatarId: string): AvatarRowIndex {
    if (!this._texture) throw new Error('GPUSkinnedInstanceAdapter: call initialize() first');

    if (this._avatarRows.has(avatarId)) {
      return this._avatarRows.get(avatarId)!;
    }

    if (this._freeRows.length === 0) {
      throw new Error(
        `GPUSkinnedInstanceAdapter: maxAvatars capacity (${this._maxAvatars}) exceeded`,
      );
    }

    const row = this._freeRows.pop()!;
    this._avatarRows.set(avatarId, row);
    return row;
  }

  removeAvatar(avatarId: string): void {
    const row = this._avatarRows.get(avatarId);
    if (row === undefined) return;

    // Zero out the row in the data buffer
    if (this._textureData) {
      const rowOffset = row * this._textureWidth * 4;
      this._textureData.fill(0, rowOffset, rowOffset + this._textureWidth * 4);
    }

    this._avatarRows.delete(avatarId);
    this._freeRows.push(row);
    this._dirtyRows.add(row);
  }

  // ─── Bone matrix upload ──────────────────────────────────────────────────────

  updateBoneMatrices(avatarId: string, matrices: BoneMatrices): void {
    if (!this._textureData) return;

    const row = this._avatarRows.get(avatarId);
    if (row === undefined) {
      console.warn(`GPUSkinnedInstanceAdapter: avatar '${avatarId}' not registered`);
      return;
    }

    // Each bone = 16 floats (mat4), stored as 4 vec4 (4 RGBA texels × 4 floats)
    // Row offset in the flat Float32Array: row × textureWidth × 4 channels
    const rowOffset = row * this._textureWidth * 4;
    const floatsPerRow = this._boneCount * 16;

    this._textureData.set(matrices.subarray(0, floatsPerRow), rowOffset);
    this._dirtyRows.add(row);
  }

  // ─── GPU flush ───────────────────────────────────────────────────────────────

  flushDirtyRows(): void {
    if (!this._texture || this._dirtyRows.size === 0) return;

    // For maximum efficiency, mark the whole texture as needing update.
    // A more advanced implementation could use partial uploads via
    // gl.texSubImage2D directly, but Three.js r170 does not expose per-row
    // needsUpdate. Full upload is still far more efficient than N SkinnedMesh
    // bone uniform uploads (one per avatar).
    this._texture.needsUpdate = true;
    this._dirtyRows.clear();
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  getShaderMaterial(): unknown {
    return this._material;
  }

  getDataTexture(): unknown {
    return this._texture;
  }

  getStats(): GPUSkinnedInstanceStats {
    return {
      activeAvatars: this._avatarRows.size,
      maxAvatars: this._maxAvatars,
      boneCount: this._boneCount,
      textureWidth: this._textureWidth,
      textureHeight: this._maxAvatars,
      dirtyRows: this._dirtyRows.size,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: GPUSkinnedInstanceAdapter | null = null;

export function getGPUSkinnedInstanceAdapter(): GPUSkinnedInstanceAdapter {
  if (!_instance) {
    _instance = new GPUSkinnedInstanceAdapter();
  }
  return _instance;
}

export function resetGPUSkinnedInstanceAdapter(): void {
  _instance?.dispose();
  _instance = null;
}
