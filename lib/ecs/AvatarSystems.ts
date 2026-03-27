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
import { resolveAvatarRenderPolicy, type AvatarRenderPolicyInput } from './avatarRenderPolicy';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TELEPORT_DISTANCE = 8;

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

  update(camera: THREE.Camera, frustum: THREE.Frustum, options: AvatarRenderPolicyInput = {}): void {
    this._frameCounter++;
    if (this._frameCounter < 5) return;
    this._frameCounter = 0;

    const entities = avatarStore.getAll();
    const thresholds = resolveAvatarRenderPolicy({
      ...options,
      avatarCount: options.avatarCount ?? entities.length,
    });

    if (options.documentVisible === false) {
      for (let i = 0; i < entities.length; i++) {
        entities[i].isVisible = false;
      }
      return;
    }

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];

      // Distancia al jugador
      _tempVec.set(e.currentX, 1, e.currentZ);
      e.distanceToCamera = _tempVec.distanceTo(camera.position);

      // Visibilidad
      const isNearby = e.distanceToCamera < thresholds.lodNear;
      const isTooFar = e.distanceToCamera > thresholds.cullDistance;
      const inFrustum = frustum.containsPoint(_tempVec);
      e.isVisible = isNearby || (inFrustum && !isTooFar);

      // LOD
      if (e.distanceToCamera > thresholds.lodMid) e.lodLevel = 'low';
      else if (e.distanceToCamera > thresholds.lodNear) e.lodLevel = 'mid';
      else e.lodLevel = 'high';

      // Sombras: solo cerca
      e.castShadow = thresholds.shadowDistance > 0 && e.distanceToCamera < thresholds.shadowDistance;

      // FPS de animación según distancia
      if (e.distanceToCamera > thresholds.lodMid) e.animFPS = thresholds.farAnimFps;
      else if (e.distanceToCamera > thresholds.lodNear) e.animFPS = thresholds.midAnimFps;
      else e.animFPS = thresholds.nearAnimFps;
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
  update(delta: number, options: AvatarRenderPolicyInput = {}): string[] {
    const changed: string[] = [];
    if (options.documentVisible === false) return changed;
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
