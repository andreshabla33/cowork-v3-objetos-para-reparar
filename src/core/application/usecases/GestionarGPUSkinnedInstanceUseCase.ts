/**
 * @module core/application/usecases/GestionarGPUSkinnedInstanceUseCase
 * @description Use case: Manage GPU instanced skinning via bone matrix DataTexture.
 *
 * Clean Architecture: Application layer — orchestrates IGPUSkinnedInstanceService port.
 * No Three.js dependencies — works with opaque types and primitive arrays.
 *
 * Problem solved (Fase 3):
 *   With 500 avatars each having its own SkinnedMesh, the GPU processes
 *   N independent draw calls with N separate bone matrix uniform uploads.
 *   GPU instanced skinning uploads ALL bone matrices into a single DataTexture
 *   and renders all avatars in 1-2 draw calls using a custom shader.
 *
 * IMPORTANT: Do NOT migrate to WebGPURenderer — THREE.js issue #32236
 *   (SkeletonUtils.clone() + WebGPURenderer crash, unresolved as of 2026-04-07)
 *
 * Ref: Three.js DataTexture
 *   https://threejs.org/docs/#api/en/textures/DataTexture
 */

import type {
  IGPUSkinnedInstanceService,
  AvatarRowIndex,
  BoneMatrices,
  GPUSkinnedInstanceStats,
} from '../../domain/ports/IGPUSkinnedInstanceService';

export class GestionarGPUSkinnedInstanceUseCase {
  constructor(private readonly service: IGPUSkinnedInstanceService) {}

  /**
   * Initialize the DataTexture and custom ShaderMaterial.
   * Must be called once before adding avatars.
   *
   * @param maxAvatares  Maximum concurrent avatar instances
   * @param numHuesos    Number of bones per avatar skeleton (must be consistent)
   */
  inicializar(maxAvatares: number, numHuesos: number): void {
    this.service.initialize(maxAvatares, numHuesos);
  }

  /**
   * Register a new avatar and return its row index in the DataTexture.
   * Throws if maxAvatares capacity is exceeded.
   */
  agregarAvatar(avatarId: string): AvatarRowIndex {
    return this.service.addAvatar(avatarId);
  }

  /**
   * Unregister an avatar and free its row in the DataTexture.
   * The freed row becomes available for future agregarAvatar() calls.
   */
  eliminarAvatar(avatarId: string): void {
    this.service.removeAvatar(avatarId);
  }

  /**
   * Upload updated bone matrices for one avatar to the DataTexture.
   * Uses partial needsUpdate (offset/size) for minimal GPU upload.
   *
   * @param avatarId  Avatar identifier (must be registered via agregarAvatar)
   * @param matrices  Float32Array of numHuesos × 16 floats (column-major mat4)
   */
  actualizarMatricesHuesos(avatarId: string, matrices: BoneMatrices): void {
    this.service.updateBoneMatrices(avatarId, matrices);
  }

  /**
   * Flush all dirty rows to the GPU.
   * Call ONCE per frame AFTER all actualizarMatricesHuesos() calls.
   * Batches GPU uploads for maximum efficiency.
   */
  sincronizarConGPU(): void {
    this.service.flushDirtyRows();
  }

  /**
   * Get the custom ShaderMaterial for use in InstancedMesh or BatchedMesh.
   * Returns opaque reference (THREE.ShaderMaterial at runtime).
   */
  obtenerShaderMaterial(): unknown {
    return this.service.getShaderMaterial();
  }

  /**
   * Get the DataTexture for direct use in custom shaders.
   * Returns opaque reference (THREE.DataTexture at runtime).
   */
  obtenerDataTexture(): unknown {
    return this.service.getDataTexture();
  }

  /**
   * Get statistics for monitoring dashboards.
   */
  obtenerEstadisticas(): GPUSkinnedInstanceStats {
    return this.service.getStats();
  }

  /**
   * Dispose the DataTexture and ShaderMaterial, freeing GPU memory.
   * Call on workspace 3D unmount.
   */
  limpiar(): void {
    this.service.dispose();
  }
}
