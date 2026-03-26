/**
 * PR-6: Sistemas ECS para Avatares
 *
 * Cada sistema procesa TODOS los avatares en un solo loop.
 * Reemplaza 500 useFrame individuales con 3 sistemas centralizados.
 *
 * Llamados desde un único useFrame en el renderer:
 *   movementSystem.update(delta)
 *   cullingSystem.update(camera, frustum)
 *   animationSystem.update(delta)
 */

import * as THREE from 'three';
import { avatarStore, type AvatarEntity } from './AvatarECS';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TELEPORT_DISTANCE = 8;
const LOD_NEAR = 10;
const LOD_MID = 25;
const CULL_DISTANCE = 80;
const SHADOW_DISTANCE = 12;

// ─── MovementSystem ──────────────────────────────────────────────────────────

/**
 * Interpola las posiciones de TODOS los avatares en un solo loop.
 * Antes: 500 useFrame con LERP individual.
 * Ahora: 1 loop que procesa los 500 en ~0.1ms.
 */
export const movementSystem = {
  update(delta: number): void {
    const entities = avatarStore.getAll();
    const lerpMoving = 1 - Math.pow(1 - 0.4, delta * 60);
    const lerpIdle = 1 - Math.pow(1 - 0.25, delta * 60);

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.teleportPhase !== 'none') continue;

      const dx = e.targetX - e.currentX;
      const dz = e.targetZ - e.currentZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Salto grande → teleport
      if (dist > TELEPORT_DISTANCE * 0.8) {
        e.teleportPhase = 'out';
        e.teleportOrigin = [e.currentX, 0, e.currentZ];
        e.teleportDest = [e.targetX, 0, e.targetZ];

        // Programar finalización del teleport (300ms out, 400ms in)
        setTimeout(() => {
          e.currentX = e.targetX;
          e.currentZ = e.targetZ;
          e.teleportPhase = 'in';
          setTimeout(() => { e.teleportPhase = 'none'; }, 400);
        }, 300);
        continue;
      }

      // Interpolación suave
      if (dist > 0.005) {
        const s = e.isMoving ? lerpMoving : lerpIdle;
        e.currentX = THREE.MathUtils.lerp(e.currentX, e.targetX, s);
        e.currentZ = THREE.MathUtils.lerp(e.currentZ, e.targetZ, s);
      }
    }
  },

  /**
   * Recibe datos de broadcast/realtime para un avatar específico.
   * Reemplaza updateTargetPosition() de cada RemoteAvatarInterpolated.
   */
  setTarget(userId: string, x: number, z: number, direction?: string, isMoving?: boolean, animState?: string): void {
    const entity = avatarStore.get(userId);
    if (!entity) return;

    entity.targetX = x;
    entity.targetZ = z;
    if (direction !== undefined) entity.direction = direction;
    if (isMoving !== undefined) entity.isMoving = isMoving;
    if (animState !== undefined) entity.animState = animState as any;
    entity.lastServerUpdate = Date.now();
  },
};

// ─── CullingSystem ───────────────────────────────────────────────────────────

const _tempVec = new THREE.Vector3();

/**
 * Calcula visibilidad, LOD y flags de sombra para TODOS los avatares.
 * Antes: cada RemoteAvatarInterpolated hacía esto individualmente.
 * Ahora: 1 loop que procesa los 500 en ~0.05ms.
 *
 * Se ejecuta cada 5 frames (no cada frame) para ahorrar CPU.
 */
export const cullingSystem = {
  _frameCounter: 0,

  update(camera: THREE.Camera, frustum: THREE.Frustum): void {
    this._frameCounter++;
    if (this._frameCounter < 5) return;
    this._frameCounter = 0;

    const entities = avatarStore.getAll();

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];

      // Distancia al jugador
      _tempVec.set(e.currentX, 1, e.currentZ);
      e.distanceToCamera = _tempVec.distanceTo(camera.position);

      // Visibilidad
      const isNearby = e.distanceToCamera < LOD_NEAR;
      const isTooFar = e.distanceToCamera > CULL_DISTANCE;
      const inFrustum = frustum.containsPoint(_tempVec);
      e.isVisible = isNearby || (inFrustum && !isTooFar);

      // LOD
      if (e.distanceToCamera > LOD_MID) e.lodLevel = 'low';
      else if (e.distanceToCamera > LOD_NEAR) e.lodLevel = 'mid';
      else e.lodLevel = 'high';

      // Sombras: solo cerca
      e.castShadow = e.distanceToCamera < SHADOW_DISTANCE;

      // FPS de animación según distancia
      if (e.distanceToCamera > 30) e.animFPS = 15;
      else if (e.distanceToCamera > 15) e.animFPS = 30;
      else e.animFPS = 60;
    }
  },
};

// ─── AnimationSystem ─────────────────────────────────────────────────────────

/**
 * Actualiza el estado de animación de cada avatar con throttling por distancia.
 * Avatares lejanos se actualizan a 15 FPS en vez de 60.
 *
 * Retorna los IDs de avatares cuya animación cambió (para re-render selectivo).
 */
export const animationSystem = {
  update(delta: number): string[] {
    const changed: string[] = [];
    const now = performance.now();
    const entities = avatarStore.getAll();

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.isVisible) continue;

      const frameInterval = 1000 / e.animFPS;
      if (now - e.lastAnimUpdate < frameInterval) continue;
      e.lastAnimUpdate = now;

      // Determinar animación basada en estado de movimiento
      const newAnim = e.isMoving ? 'walk' : 'idle';
      if (newAnim !== e.animState) {
        e.animState = newAnim as any;
        changed.push(e.userId);
      }
    }

    return changed;
  },
};
