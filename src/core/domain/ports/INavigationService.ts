/**
 * @module domain/ports/INavigationService
 *
 * Clean Architecture — Domain port (interface). La Infrastructure provee
 * la implementación (RecastNavigationAdapter); Application/Module consumen
 * a través de este puerto sin acoplarse a recast-navigation-js.
 *
 * Modelo conceptual:
 *  1. `build(walkableMesh, obstaclesAABB)` construye el grafo de navegación
 *     a partir de un mesh caminable (típicamente el terreno) + obstáculos
 *     estáticos en forma de AABB. El Infrastructure decide si es navmesh,
 *     tiled, single-tile, etc.
 *  2. Obstáculos dinámicos (admin coloca/mueve muebles) se manejan con
 *     `addObstacle` / `removeObstacle` — la implementación canónica
 *     (recast TileCache) los aplica incrementalmente sin rebuild completo.
 *  3. Agentes (avatares) se registran con `addAgent` y se mueven con
 *     `moveAgent(id, target)` — el servicio computa el path + aplica
 *     steering + obstacle avoidance entre agents.
 *  4. `tick(deltaMs)` debe llamarse cada frame para que el crowd avance
 *     los agents y el TileCache procese las queued obstacle updates.
 *  5. `getAgentPose(id)` retorna la pose actual del agent para que el
 *     Presentation actualice la posición visual del avatar.
 *
 * Refs:
 *  - https://github.com/isaac-mason/recast-navigation-js (implementación canon)
 *  - Mononen 2009 — Recast Navigation paper
 */

import type {
  NavigationConfig,
  NavigationAgentParams,
  NavigationAgentPose,
  NavigationAgentId,
} from '@/src/core/domain/entities/espacio3d/NavigationConfig';
import type { Posicion2D } from '@/src/core/domain/entities/espacio3d/AsientoEntity';

// ─── AABB de obstáculo estático (input para build) ──────────────────────────

/**
 * Obstáculo descrito como AABB orientado. `rotationY` permite cubos rotados
 * (sillas, escritorios) sin necesidad de bounding box axis-aligned grande.
 */
export interface NavigationObstaculo {
  readonly id: string;
  /** Centro del obstáculo en world coords. */
  readonly position: { x: number; y: number; z: number };
  /** Mitad de la extensión en cada eje (recast convention). */
  readonly halfExtents: { x: number; y: number; z: number };
  /** Rotación alrededor del eje Y en radianes. */
  readonly rotationY: number;
}

// ─── Mesh caminable como datos puros (positions + indices) ──────────────────

/**
 * El terreno caminable en formato neutro. Domain NO depende de THREE.Mesh;
 * la Infrastructure lo convierte a/desde THREE.BufferGeometry según necesidad.
 *
 * `positions` es flat `[x0,y0,z0, x1,y1,z1, ...]`.
 * `indices` flat counter-clockwise (convención OpenGL/recast).
 */
export interface NavigationWalkableSurface {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

// ─── Resultado de un build ──────────────────────────────────────────────────

export interface NavigationBuildResult {
  readonly success: boolean;
  /** Diagnóstico humano cuando `success === false`. */
  readonly error?: string;
}

// ─── Puerto principal ───────────────────────────────────────────────────────

export interface INavigationService {
  /**
   * Inicializa el motor (carga WASM de recast). Idempotente.
   */
  initialize(): Promise<void>;

  /**
   * Construye/reconstruye el navmesh + tilecache a partir del terreno
   * caminable + obstáculos estáticos iniciales.
   *
   * Llamar cuando:
   *  - cambia el terreno (otra empresa, otra escena)
   *  - se carga la escena por primera vez
   *
   * Los obstáculos dinámicos posteriores deben usar `addObstacle`/`removeObstacle`,
   * no un rebuild completo.
   */
  build(
    walkableSurface: NavigationWalkableSurface,
    initialObstaculos: readonly NavigationObstaculo[],
    config: NavigationConfig,
  ): NavigationBuildResult;

  /**
   * Agrega un obstáculo dinámico (admin colocó un mueble). Retorna `false`
   * si el TileCache está saturado (>= maxObstacles).
   */
  addObstacle(obstaculo: NavigationObstaculo): boolean;

  /**
   * Remueve un obstáculo previamente agregado.
   */
  removeObstacle(obstaculoId: string): boolean;

  /**
   * Registra un agente (avatar) en el crowd. Retorna el id opaco para
   * referenciarlo en operaciones posteriores.
   */
  addAgent(initialPosition: Posicion2D, params: NavigationAgentParams): NavigationAgentId;

  /**
   * Solicita que el agente se mueva al target. El servicio computa el path
   * + aplica steering. El agente avanza progresivamente — la pose se lee
   * con `getAgentPose`.
   *
   * Caso de uso: click-to-move (target en world coords).
   */
  moveAgent(agentId: NavigationAgentId, target: Posicion2D): void;

  /**
   * Mueve el agente a velocity constante (m/s) en lugar de a un target.
   * El crowd aplica steering + avoidance manteniendo la dirección deseada.
   *
   * Caso de uso: input directo (WASD/joystick) — el usuario manda dirección,
   * NO destino. Recast resuelve obstáculos sin parar al avatar.
   *
   * Pasar velocity {0,0} para detener el agent.
   *
   * Ref: recast-navigation-js CrowdAgent.requestMoveVelocity
   */
  moveAgentVelocity(agentId: NavigationAgentId, velocity: Posicion2D): void;

  /**
   * Cancela el target actual del agente — se queda parado donde está.
   */
  stopAgent(agentId: NavigationAgentId): void;

  /**
   * Teleporta al agente (cambio brusco de posición sin path). Útil para
   * spawn inicial o cuando un usuario remoto cambia de chunk.
   */
  teleportAgent(agentId: NavigationAgentId, position: Posicion2D): void;

  /**
   * Remueve un agente del crowd. Llamar al desmontar el avatar.
   */
  removeAgent(agentId: NavigationAgentId): void;

  /**
   * Pose actual del agente (posición interpolada + velocity + isMoving).
   * Llamar en `useFrame` para sincronizar la posición visual.
   */
  getAgentPose(agentId: NavigationAgentId): NavigationAgentPose | null;

  /**
   * Tick periódico. Internamente:
   *  - actualiza el crowd (advance agents según steering + dt)
   *  - procesa queued obstacle updates en el TileCache
   *
   * Llamar en `useFrame(delta)` — recast espera segundos en delta.
   */
  tick(deltaSeconds: number): void;

  /**
   * Libera memoria. Llamar al desmontar la escena.
   */
  dispose(): void;
}
