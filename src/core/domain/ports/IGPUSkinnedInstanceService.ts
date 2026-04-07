/**
 * @module core/domain/ports/IGPUSkinnedInstanceService
 * @description Domain port for GPU instanced skinning via bone matrix DataTexture.
 *
 * Clean Architecture: Domain layer — pure interface, zero Three.js dependencies.
 * Infrastructure adapter (GPUSkinnedInstanceAdapter) provides the Three.js impl.
 *
 * Problem solved (Fase 3):
 *   With 500 avatars each having its own SkinnedMesh, the GPU processes
 *   N independent draw calls with N separate bone matrix uniform uploads.
 *   GPU instanced skinning uploads ALL bone matrices into a single DataTexture
 *   and renders all avatars in 1-2 draw calls using a custom shader.
 *
 * Architecture:
 *   DataTexture layout:
 *     - Width  = 4 * numBones  (each bone = 1 mat4 = 4 vec4 = 4 RGBA pixels)
 *     - Height = maxAvatars    (each row = all bone matrices of 1 avatar)
 *     - Format = RGBAFormat, Type = FloatType (RGBA32F)
 *   Shader:
 *     - Reads instanceID from gl_InstanceID (WebGL2)
 *     - Samples bone matrix from DataTexture at row = instanceID
 *     - Applies standard skinning algorithm with instanced data
 *
 * IMPORTANT: Do NOT use this with WebGPURenderer — THREE.js issue #32236
 *   (SkeletonUtils.clone() + WebGPURenderer crash, unresolved as of 2026-04-07)
 *
 * Ref: Three.js DataTexture
 *   https://threejs.org/docs/#api/en/textures/DataTexture
 *
 * Ref: Three.js community — animated instanced skinned meshes
 *   https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Index of an avatar's row in the DataTexture */
export type AvatarRowIndex = number;

/** Flat array of bone matrices: numBones × 16 floats (column-major mat4) */
export type BoneMatrices = Float32Array;

/** Statistics for GPU monitoring */
export interface GPUSkinnedInstanceStats {
  /** Number of active avatars in the DataTexture */
  activeAvatars: number;
  /** Maximum capacity configured at initialization */
  maxAvatars: number;
  /** Number of bones per avatar skeleton */
  boneCount: number;
  /** DataTexture dimensions in pixels */
  textureWidth: number;
  textureHeight: number;
  /** Number of avatar rows that have pending matrix updates */
  dirtyRows: number;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

export interface IGPUSkinnedInstanceService {
  /**
   * Initialize the DataTexture and custom ShaderMaterial.
   * Must be called once before adding avatars.
   *
   * @param maxAvatars  Maximum number of concurrent avatar instances
   * @param boneCount   Number of bones per avatar skeleton (must be consistent)
   */
  initialize(maxAvatars: number, boneCount: number): void;

  /**
   * Register a new avatar and return its row index in the DataTexture.
   * Throws if maxAvatars capacity is exceeded.
   *
   * @param avatarId  Unique identifier for the avatar (userId or UUID)
   * @returns         Row index for use in updateBoneMatrices()
   */
  addAvatar(avatarId: string): AvatarRowIndex;

  /**
   * Unregister an avatar and free its row in the DataTexture.
   * The row is made available for future addAvatar() calls.
   */
  removeAvatar(avatarId: string): void;

  /**
   * Upload updated bone matrices for one avatar to the DataTexture.
   * Uses partial needsUpdate (offset/size) for minimal GPU upload.
   *
   * @param avatarId  Avatar identifier (must be registered via addAvatar)
   * @param matrices  Float32Array of numBones × 16 floats
   */
  updateBoneMatrices(avatarId: string, matrices: BoneMatrices): void;

  /**
   * Flush all dirty rows to the GPU.
   * Call once per frame AFTER all updateBoneMatrices() calls.
   * This batches GPU uploads for maximum efficiency.
   */
  flushDirtyRows(): void;

  /**
   * Get the custom ShaderMaterial for use in InstancedMesh or BatchedMesh.
   * Returns opaque unknown to keep domain free of Three.js dep.
   */
  getShaderMaterial(): unknown;

  /**
   * Get the DataTexture for direct use in custom shaders.
   * Returns opaque unknown to keep domain free of Three.js dep.
   */
  getDataTexture(): unknown;

  /** Get statistics for monitoring dashboards */
  getStats(): GPUSkinnedInstanceStats;

  /**
   * Dispose the DataTexture and ShaderMaterial, freeing GPU memory.
   * Call on workspace 3D unmount.
   */
  dispose(): void;
}
