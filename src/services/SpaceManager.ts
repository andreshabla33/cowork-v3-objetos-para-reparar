import * as THREE from 'three';
import { Floor, Subfloor, FloorType } from '../core/domain/entities';
import { getAlbedoTexture, TEXTURE_REGISTRY } from '../core/infrastructure/textureRegistry';

export class SpaceManager {
  private scene: THREE.Scene;
  private floorGroups: Map<string, THREE.Group>;
  private activeFloorId: string | null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.floorGroups = new Map();
    this.activeFloorId = null;
  }

  /**
   * Instancia un nuevo "Piso" como un THREE.Group principal en la escena.
   */
  public addFloor(floor: Floor): void {
    if (this.floorGroups.has(floor.id)) return;

    const floorGroup = new THREE.Group();
    floorGroup.name = `Floor_${floor.id}`;
    // Por defecto, un nuevo piso no es visible hasta que se cambie a él.
    floorGroup.visible = false; 

    // Aquí podríamos ajustar la posición del grupo si quisieramos apilarlos visualmente
    // en lugar de usar un sistema de "teletransporte", p. ej:
    // floorGroup.position.y = floor.level * 10; 

    this.scene.add(floorGroup);
    this.floorGroups.set(floor.id, floorGroup);

    // Si es el primer piso en ser agregado, lo activamos.
    if (!this.activeFloorId) {
      this.changeFloor(floor.id);
    }
  }

  /**
   * Añade dinámicamente un "Subpiso" (geometría) al grupo del Piso correspondiente.
   * Aplica materiales PBR según el tipo de suelo definido (Domain Layer: FloorType).
   */
  public addSubfloorToFloor(subfloor: Subfloor): void {
    const parentFloor = this.floorGroups.get(subfloor.floorId);
    if (!parentFloor) {
      console.warn(`[SpaceManager] El piso contenedor ${subfloor.floorId} no existe.`);
      return;
    }

    const { width, depth } = subfloor.dimensions;
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);

    let material: THREE.Material;

    if (subfloor.floorType && TEXTURE_REGISTRY[subfloor.floorType]) {
      // Uso del sistema de texturas PBR (Infrastructure Layer)
      const typeConfig = TEXTURE_REGISTRY[subfloor.floorType];
      const albedoMap = getAlbedoTexture(subfloor.floorType);

      // Clone map to set specific repeat without affecting cached original globally if needed, 
      // but since canvas textures are cheap, we can just use clone for unique UV mapping per plane size.
      const localMap = albedoMap.clone();
      localMap.needsUpdate = true;
      localMap.repeat.set(width / typeConfig.tileSize, depth / typeConfig.tileSize);

      material = new THREE.MeshStandardMaterial({
        map: localMap,
        roughness: typeConfig.roughness,
        metalness: typeConfig.metalness,
        transparent: typeConfig.transparent || (subfloor.appearance?.opacity !== undefined && subfloor.appearance.opacity < 1),
        opacity: subfloor.appearance?.opacity ?? typeConfig.opacity,
        emissive: typeConfig.emissiveColor ? new THREE.Color(typeConfig.emissiveColor) : new THREE.Color(0x000000),
        emissiveIntensity: typeConfig.emissiveIntensity || 0,
        side: THREE.DoubleSide
      });
    } else {
      // Fallback a color simple si no hay floorType
      material = new THREE.MeshStandardMaterial({
        color: subfloor.appearance?.color || '#cccccc',
        transparent: subfloor.appearance?.opacity !== undefined && subfloor.appearance.opacity < 1,
        opacity: subfloor.appearance?.opacity ?? 1,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Subfloor_${subfloor.id}`;
    
    mesh.position.set(
      subfloor.position.x,
      subfloor.position.y,
      subfloor.position.z
    );

    mesh.receiveShadow = true;
    parentFloor.add(mesh);
  }

  /**
   * Sistema de Cambio de Piso (Ocultar Piso A para mostrar Piso B)
   * Optimiza rendimiento mediante scene graph visibility culling.
   */
  public changeFloor(targetFloorId: string): void {
    if (!this.floorGroups.has(targetFloorId)) {
      console.error(`[SpaceManager] Imposible cambiar al piso ${targetFloorId}: No encontrado.`);
      return;
    }

    if (this.activeFloorId === targetFloorId) return;

    // Ocultar el piso actual
    if (this.activeFloorId) {
      const currentFloorGroup = this.floorGroups.get(this.activeFloorId);
      if (currentFloorGroup) currentFloorGroup.visible = false;
    }

    // Mostrar el nuevo piso
    const targetFloorGroup = this.floorGroups.get(targetFloorId);
    if (targetFloorGroup) {
      targetFloorGroup.visible = true;
      this.activeFloorId = targetFloorId;
      console.log(`[SpaceManager] Cambio de piso exitoso. Nuevo piso activo: ${targetFloorId}`);
    }
  }

  public getActiveFloorId(): string | null {
    return this.activeFloorId;
  }
}
