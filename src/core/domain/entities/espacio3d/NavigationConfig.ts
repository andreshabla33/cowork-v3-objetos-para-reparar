/**
 * @module domain/entities/espacio3d/NavigationConfig
 *
 * Clean Architecture — Domain layer (puro, sin React/Three/Recast).
 *
 * Constantes y value objects para el sistema de navegación con pathfinding.
 * Las decisiones de algoritmo (NavMesh, A*, etc.) viven en Infrastructure;
 * Domain solo expone parámetros conceptuales (radio del agente, slope max,
 * tile size, etc.) que cualquier implementación debe respetar.
 *
 * Refs:
 *  - https://github.com/isaac-mason/recast-navigation-js — implementación
 *    canónica que adopta estos parámetros como input de `generateTileCache`.
 *  - Recast Navigation paper (Mononen 2009): definiciones de slope, climb,
 *    walkable area en navegación 3D.
 */

import type { Posicion2D } from './AsientoEntity';

// ─── Value object: configuración del navmesh ──────────────────────────────────

/**
 * Parámetros conceptuales del grafo de navegación. Los valores default están
 * calibrados para Cowork (avatar radio 0.42m, terreno 50×50m+, mundos
 * multi-empresa con muchos muebles).
 *
 * Invariantes:
 *  - `cellSize > 0`, `cellHeight > 0`
 *  - `walkableRadius >= 0`
 *  - `walkableSlopeAngleDeg ∈ [0, 90]`
 *  - `tileSize > 0` solo si `useTiledNavMesh` true
 */
export interface NavigationConfig {
  /** Tamaño de cada voxel del recast rasterizer (mundo unidades). */
  readonly cellSize: number;
  /** Alto del voxel — granularidad vertical para detectar pisos. */
  readonly cellHeight: number;
  /** Radio del agente. Recast infla los obstáculos por este margen. */
  readonly walkableRadius: number;
  /** Altura del agente (cabeza-pies). */
  readonly walkableHeight: number;
  /** Máximo escalón que el agente puede subir sin "saltar". */
  readonly walkableClimb: number;
  /** Ángulo máximo de pendiente caminable (grados). */
  readonly walkableSlopeAngleDeg: number;
  /** Lado de cada tile cuando usamos navmesh tiled (cells). */
  readonly tileSize: number;
  /** Máximo de obstáculos dinámicos simultáneos en el TileCache (cap 64 oficial). */
  readonly maxObstacles: number;
}

/**
 * Default oficial para Cowork. `walkableRadius = RADIO_COLISION_AVATAR`
 * (shared.ts) — match exacto con el collision radius del Domain de movimiento.
 *
 * `tileSize = 32` está en el rango recomendado de la doc oficial de recast
 * (32-64). Tile más chico = más granularidad pero más memoria; más grande =
 * menos tiles pero rebuilds más caros al meter obstáculos.
 *
 * `maxObstacles = 64` es el cap absoluto del TileCache (`DT_BUFFER_TOO_SMALL`
 * después de 64 queued).
 *
 * Ref: https://github.com/isaac-mason/recast-navigation-js (README — TileCache)
 */
export const DEFAULT_NAVIGATION_CONFIG: NavigationConfig = Object.freeze({
  cellSize: 0.2,
  cellHeight: 0.2,
  walkableRadius: 0.42,
  walkableHeight: 2.0,
  walkableClimb: 0.4,
  walkableSlopeAngleDeg: 45,
  tileSize: 32,
  maxObstacles: 64,
});

// ─── Value object: agente de navegación ───────────────────────────────────────

/**
 * Parámetros de un agente individual en el crowd. Recast los usa para
 * velocity-based steering + collision avoidance entre agents.
 *
 * Ref: API oficial `crowd.addAgent(pos, params)` — README recast-navigation-js.
 */
export interface NavigationAgentParams {
  readonly radius: number;
  readonly height: number;
  readonly maxAcceleration: number;
  readonly maxSpeed: number;
  /** Rango (m) para detectar otros agentes y aplicar steering avoidance. */
  readonly collisionQueryRange: number;
  /** Peso del comportamiento de separación entre agents (0-2 típico). */
  readonly separationWeight: number;
}

/**
 * Default agent params. `maxSpeed` matchea `MOVE_SPEED` del módulo legacy
 * (4 m/s — shared.ts). `collisionQueryRange` 4× radius para que el avatar
 * "vea" otros avatares antes de chocarlos.
 */
export const DEFAULT_AGENT_PARAMS: NavigationAgentParams = Object.freeze({
  radius: 0.42,
  height: 1.8,
  maxAcceleration: 8.0,
  maxSpeed: 4.0,
  collisionQueryRange: 1.68,
  separationWeight: 1.0,
});

// ─── Value object: pose del agente reportada por el crowd ────────────────────

/**
 * Pose 2D del agente. Recast trabaja en 3D pero el plano útil para Cowork
 * es X/Z (el Y lo derivamos del terreno). Velocity se reporta para que el
 * Presentation pueda calcular la dirección del sprite/animación
 * (`obtenerDireccionDesdeVector`).
 */
export interface NavigationAgentPose {
  readonly position: Posicion2D;
  readonly velocity: Posicion2D;
  /** `true` si el agente sigue procesando un path (no llegó al target). */
  readonly isMoving: boolean;
}

// ─── Identificador opaco del agente — emitido por la Infrastructure ──────────

/**
 * Token opaco que la Infrastructure emite al `addAgent` y luego acepta para
 * `moveAgent`/`removeAgent`. El Domain NO conoce el tipo concreto (Agent
 * de recast es una clase del WASM); solo lo pasa como referencia.
 */
export type NavigationAgentId = string & { readonly __brand: 'NavigationAgentId' };
