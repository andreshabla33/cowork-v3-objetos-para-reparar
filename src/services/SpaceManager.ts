/**
 * @module services/SpaceManager
 * Gestión de pisos y subsuelos en el espacio 3D.
 *
 * Optimizaciones activas (Roadmap REMEDIATION-002):
 *  - THREE.InstancedMesh: agrupa subsuelos con el mismo FloorType en 1 draw call.
 *  - THREE.Frustum culling manual: descarta grupos fuera de la cámara antes del render.
 *
 * Impacto esperado: 10-50x reducción de draw calls a escala (N subsuelos → 1 por tipo).
 *
 * @see https://threejs.org/docs/#api/en/objects/InstancedMesh
 * @see https://threejs.org/docs/#api/en/math/Frustum
 */

import * as THREE from 'three';
import { Floor, Subfloor, FloorType } from '../core/domain/entities';
import { getAlbedoTexture, TEXTURE_REGISTRY } from '../../lib/rendering/textureRegistry';

// ─── Tipos internos ──────────────────────────────────────────────────────────

/** Agrupa subsuelos del mismo FloorType en un único InstancedMesh */
interface InstancedFloorGroup {
  mesh: THREE.InstancedMesh;
  /** Map subfloorId → índice de instancia */
  instances: Map<string, number>;
  nextIndex: number;
  floorType: FloorType | '__fallback__';
}

// ─── SpaceManager ────────────────────────────────────────────────────────────

export class SpaceManager {
  private scene: THREE.Scene;
  /** Grupos principales por piso (controlan visibilidad global del piso) */
  private floorGroups: Map<string, THREE.Group>;
  private activeFloorId: string | null;

  /**
   * InstancedMesh por (floorId, floorType).
   * Key: `${floorId}::${typeKey}` para agrupar dentro del mismo piso.
   */
  private instancedGroups: Map<string, InstancedFloorGroup>;

  /**
   * Frustum reutilizable — evita alloc por frame.
   * Se actualiza en updateFrustumCulling().
   */
  private readonly frustum: THREE.Frustum;
  private readonly frustumMatrix: THREE.Matrix4;
  private readonly _tmpSphere: THREE.Sphere;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.floorGroups = new Map();
    this.activeFloorId = null;
    this.instancedGroups = new Map();
    this.frustum = new THREE.Frustum();
    this.frustumMatrix = new THREE.Matrix4();
    this._tmpSphere = new THREE.Sphere();
  }

  // ─── Pisos ────────────────────────────────────────────────────────────────

  /**
   * Registra un nuevo Piso como THREE.Group en la escena.
   * Si es el primero, lo activa automáticamente.
   */
  public addFloor(floor: Floor): void {
    if (this.floorGroups.has(floor.id)) return;

    const floorGroup = new THREE.Group();
    floorGroup.name = `Floor_${floor.id}`;
    floorGroup.visible = false;

    this.scene.add(floorGroup);
    this.floorGroups.set(floor.id, floorGroup);

    if (!this.activeFloorId) {
      this.changeFloor(floor.id);
    }
  }

  // ─── Subsuelos (InstancedMesh) ────────────────────────────────────────────

  /**
   * Añade un Subfloor al piso correspondiente.
   * Subsuelos con el mismo FloorType se agrupan en un InstancedMesh para
   * minimizar draw calls (1 draw call por tipo vs 1 por subsuelo).
   */
  public addSubfloorToFloor(subfloor: Subfloor): void {
    const parentFloor = this.floorGroups.get(subfloor.floorId);
    if (!parentFloor) {
      console.warn(`[SpaceManager] El piso contenedor ${subfloor.floorId} no existe.`);
      return;
    }

    const typeKey: FloorType | '__fallback__' = subfloor.floorType ?? '__fallback__';
    const groupKey = `${subfloor.floorId}::${typeKey}`;

    let ig = this.instancedGroups.get(groupKey);

    if (!ig) {
      ig = this._createInstancedGroup(subfloor, parentFloor, groupKey, typeKey);
    }

    // Expandir capacidad si el mesh está lleno (duplica capacidad)
    if (ig.nextIndex >= ig.mesh.count) {
      ig = this._expandInstancedGroup(ig, parentFloor, groupKey);
    }

    // Escribir matriz de posición para esta instancia
    const matrix = new THREE.Matrix4();
    matrix.setPosition(subfloor.position.x, subfloor.position.y, subfloor.position.z);
    ig.mesh.setMatrixAt(ig.nextIndex, matrix);
    ig.mesh.instanceMatrix.needsUpdate = true;

    ig.instances.set(subfloor.id, ig.nextIndex);
    ig.nextIndex++;
  }

  // ─── Frustum Culling ──────────────────────────────────────────────────────

  /**
   * Actualiza visibilidad de InstancedMesh del piso activo según el frustum.
   * Llamar desde el loop de render (useFrame en R3F) para máximo beneficio.
   *
   * @param camera - Cámara activa de Three.js
   *
   * Nota: No afecta la lógica de piso activo (changeFloor), solo el culling per-mesh.
   */
  public updateFrustumCulling(camera: THREE.Camera): void {
    this.frustumMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    this.instancedGroups.forEach((ig, key) => {
      const floorId = key.split('::')[0];
      // Frustum culling solo aplica al piso activo (el resto ya está invisible)
      if (floorId !== this.activeFloorId) return;

      const geoBoundingSphere = ig.mesh.geometry.boundingSphere;
      if (!geoBoundingSphere) {
        ig.mesh.geometry.computeBoundingSphere();
      }
      if (ig.mesh.geometry.boundingSphere) {
        this._tmpSphere.copy(ig.mesh.geometry.boundingSphere);
        this._tmpSphere.applyMatrix4(ig.mesh.matrixWorld);
        ig.mesh.visible = this.frustum.intersectsSphere(this._tmpSphere);
      }
    });
  }

  // ─── Cambio de Piso ───────────────────────────────────────────────────────

  /**
   * Oculta el piso actual y muestra el destino.
   * Optimiza el render mediante scene graph visibility culling.
   */
  public changeFloor(targetFloorId: string): void {
    if (!this.floorGroups.has(targetFloorId)) {
      console.error(`[SpaceManager] Imposible cambiar al piso ${targetFloorId}: No encontrado.`);
      return;
    }

    if (this.activeFloorId === targetFloorId) return;

    if (this.activeFloorId) {
      const currentFloorGroup = this.floorGroups.get(this.activeFloorId);
      if (currentFloorGroup) currentFloorGroup.visible = false;
    }

    const targetFloorGroup = this.floorGroups.get(targetFloorId);
    if (targetFloorGroup) {
      targetFloorGroup.visible = true;
      this.activeFloorId = targetFloorId;
      console.log(`[SpaceManager] Cambio de piso exitoso. Piso activo: ${targetFloorId}`);
    }
  }

  public getActiveFloorId(): string | null {
    return this.activeFloorId;
  }

  // ─── Dispose ──────────────────────────────────────────────────────────────

  /**
   * Libera recursos de GPU (geometrías, materiales, texturas).
   * Llamar al desmontar o al cambiar de sala.
   */
  public dispose(): void {
    this.instancedGroups.forEach((ig) => {
      ig.mesh.geometry.dispose();
      if (Array.isArray(ig.mesh.material)) {
        ig.mesh.material.forEach((m) => m.dispose());
      } else {
        (ig.mesh.material as THREE.Material).dispose();
      }
    });
    this.instancedGroups.clear();
    this.floorGroups.clear();
    this.activeFloorId = null;
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private _createInstancedGroup(
    subfloor: Subfloor,
    parentFloor: THREE.Group,
    groupKey: string,
    typeKey: FloorType | '__fallback__',
  ): InstancedFloorGroup {
    const { width, depth } = subfloor.dimensions;
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);

    const material = this._buildMaterial(subfloor, typeKey);

    const INITIAL_CAPACITY = 16;
    const instancedMesh = new THREE.InstancedMesh(geometry, material, INITIAL_CAPACITY);
    instancedMesh.name = `InstancedFloor_${groupKey}`;
    instancedMesh.receiveShadow = true;
    // Desactivar frustum culling built-in: usamos updateFrustumCulling() manualmente
    instancedMesh.frustumCulled = false;

    parentFloor.add(instancedMesh);

    const ig: InstancedFloorGroup = {
      mesh: instancedMesh,
      instances: new Map(),
      nextIndex: 0,
      floorType: typeKey,
    };

    this.instancedGroups.set(groupKey, ig);
    return ig;
  }

  /**
   * Duplica la capacidad del InstancedMesh preservando matrices existentes.
   */
  private _expandInstancedGroup(
    ig: InstancedFloorGroup,
    parentFloor: THREE.Group,
    groupKey: string,
  ): InstancedFloorGroup {
    const oldMesh = ig.mesh;
    const newCapacity = oldMesh.count * 2;

    const newMesh = new THREE.InstancedMesh(oldMesh.geometry, oldMesh.material, newCapacity);
    newMesh.name = oldMesh.name;
    newMesh.receiveShadow = true;
    newMesh.frustumCulled = false;

    const tmpMatrix = new THREE.Matrix4();
    for (let i = 0; i < ig.nextIndex; i++) {
      oldMesh.getMatrixAt(i, tmpMatrix);
      newMesh.setMatrixAt(i, tmpMatrix);
    }
    newMesh.instanceMatrix.needsUpdate = true;

    parentFloor.remove(oldMesh);
    // No dispose geometry/material — el nuevo mesh los reutiliza
    parentFloor.add(newMesh);

    const expanded: InstancedFloorGroup = {
      mesh: newMesh,
      instances: ig.instances,
      nextIndex: ig.nextIndex,
      floorType: ig.floorType,
    };

    this.instancedGroups.set(groupKey, expanded);
    return expanded;
  }

  private _buildMaterial(
    subfloor: Subfloor,
    typeKey: FloorType | '__fallback__',
  ): THREE.MeshStandardMaterial {
    const { width, depth } = subfloor.dimensions;

    if (typeKey !== '__fallback__' && TEXTURE_REGISTRY[typeKey as FloorType]) {
      const typeConfig = TEXTURE_REGISTRY[typeKey as FloorType];
      const albedoMap = getAlbedoTexture(typeKey as FloorType);

      const localMap = albedoMap.clone();
      localMap.needsUpdate = true;
      localMap.repeat.set(width / typeConfig.tileSize, depth / typeConfig.tileSize);

      return new THREE.MeshStandardMaterial({
        map: localMap,
        roughness: typeConfig.roughness,
        metalness: typeConfig.metalness,
        transparent:
          typeConfig.transparent ||
          (subfloor.appearance?.opacity !== undefined && subfloor.appearance.opacity < 1),
        opacity: subfloor.appearance?.opacity ?? typeConfig.opacity,
        emissive: typeConfig.emissiveColor
          ? new THREE.Color(typeConfig.emissiveColor)
          : new THREE.Color(0x000000),
        emissiveIntensity: typeConfig.emissiveIntensity || 0,
        side: THREE.DoubleSide,
      });
    }

    return new THREE.MeshStandardMaterial({
      color: subfloor.appearance?.color ?? '#cccccc',
      transparent:
        subfloor.appearance?.opacity !== undefined && subfloor.appearance.opacity < 1,
      opacity: subfloor.appearance?.opacity ?? 1,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
  }
}
