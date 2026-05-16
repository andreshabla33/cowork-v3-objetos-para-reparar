/**
 * @module domain/types/pose
 *
 * Tipo discriminado de pose espacial agnóstico de la dimensión.
 *
 * Clean Architecture — Capa de Domain
 *
 * Permite que la misma lógica de proximidad, audio espacial, cámara y
 * pathfinding corra en `apps/cowork-3d` (R3F + Three.js, xyz + yaw) y en
 * `apps/cowork-2d` (Phaser 4, xy + facing) sin reescribir use cases.
 *
 * El adapter R3F convierte `THREE.Vector3` ↔ `Pose3D` en infrastructure.
 * El adapter Phaser convierte `Phaser.Math.Vector2` ↔ `Pose2D`.
 *
 * Ref: ROADMAP_MONOREPO_PHASER4.md — Fase 0.2.
 */

/**
 * Pose 3D — coords en espacio mundo + orientación horizontal.
 *
 * - `x, y, z`: posición en metros mundo (sistema R3F: Y arriba).
 * - `yaw`: rotación alrededor del eje Y en radianes, 0 mira a -Z (default Three.js).
 */
export interface Pose3D {
  readonly kind: '3d';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * Pose 2D — coords top-down + orientación cardinal.
 *
 * - `x, y`: posición en unidades del mapa (Phaser top-down: Y abajo).
 * - `facing`: ángulo en radianes, 0 mira a +X (este).
 */
export interface Pose2D {
  readonly kind: '2d';
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

export type Pose = Pose3D | Pose2D;

// ─── Constructores helpers ────────────────────────────────────────────────────

export const pose3d = (x: number, y: number, z: number, yaw = 0): Pose3D => ({
  kind: '3d',
  x,
  y,
  z,
  yaw,
});

export const pose2d = (x: number, y: number, facing = 0): Pose2D => ({
  kind: '2d',
  x,
  y,
  facing,
});

// ─── Type guards ──────────────────────────────────────────────────────────────

export const is3d = (p: Pose): p is Pose3D => p.kind === '3d';
export const is2d = (p: Pose): p is Pose2D => p.kind === '2d';
