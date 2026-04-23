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
/**
 * Lambdas equivalentes al lerp previo `1 - Math.pow(1 - f, delta*60)`.
 * Relación: lambda = -ln(1 - f) * 60.
 *  - f=0.4 moving  → lambda ≈ 30.6
 *  - f=0.25 idle   → lambda ≈ 17.3
 *
 * Usados con `THREE.MathUtils.damp(x, y, lambda, dt)` — patrón oficial
 * three.js documentado en https://threejs.org/docs/#api/en/math/MathUtils.damp
 * para interpolación framerate-independent. Mismo comportamiento visual
 * que el lerp manual anterior pero con la forma canónica publicada.
 */
const LAMBDA_MOVING = 30.6;
const LAMBDA_IDLE = 17.3;

export const movementSystem = {
  update(delta: number): void {
    const entities = avatarStore.getAll();

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

      // Interpolación suave con damp oficial three.js (framerate-independent).
      if (dist > 0.005) {
        const lambda = e.isMoving ? LAMBDA_MOVING : LAMBDA_IDLE;
        e.currentX = THREE.MathUtils.damp(e.currentX, e.targetX, lambda, delta);
        e.currentZ = THREE.MathUtils.damp(e.currentZ, e.targetZ, lambda, delta);
      }
    }
  },

  /**
   * Recibe datos de broadcast/realtime para un avatar específico.
   * Reemplaza updateTargetPosition() de cada RemoteAvatarInterpolated.
   *
   * Fix 2026-04-23 (net-code pattern — Valve/Fiedler/Colyseus):
   * en el PRIMER broadcast real, saltar la entidad directamente al target
   * sin animar desde el spawn default (0,0) o (500,500). Evita el
   * "teleport visible" del avatar al aparecer en escena. A partir del
   * segundo broadcast, lerp normal hacia target.
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

    if (!entity.hasReceivedFirstRealTarget) {
      // Primer broadcast real — snap sin animación. Ref net-code docs:
      // https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
      // https://gafferongames.com/post/snapshot_interpolation/
      entity.currentX = x;
      entity.currentZ = z;
      entity.hasReceivedFirstRealTarget = true;
    }
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
