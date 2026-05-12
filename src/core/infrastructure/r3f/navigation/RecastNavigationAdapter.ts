/**
 * @module infrastructure/r3f/navigation/RecastNavigationAdapter
 *
 * Clean Architecture — Infrastructure adapter. Implementa
 * `INavigationService` usando `recast-navigation-js` v0.43+.
 *
 * Encapsula:
 *  - Init asíncrono del WASM (idempotente)
 *  - Build del navmesh + TileCache desde `walkableSurface` + obstáculos
 *  - Crowd lifecycle (add/move/remove agents)
 *  - TileCache update pattern oficial (multi-step si hay obstáculos pesados)
 *  - Cleanup de referencias en `dispose()`
 *
 * El resto del codebase consume `INavigationService` — esta lib NO sale
 * de Infrastructure (regla #4 clean-arch: hooks puros, sin libs externas
 * en Module/Domain/Application).
 *
 * Refs oficiales:
 *  - https://github.com/isaac-mason/recast-navigation-js (README — APIs)
 *  - https://docs.recast-navigation-js.isaacmason.com (TypeDoc)
 *  - Mononen — funnel algorithm para paths any-angle
 *
 * Versión target: 0.43.1 (Sep 2025).
 */

import {
  init,
  Crowd,
  NavMeshQuery,
  type NavMesh,
  type TileCache,
  type CrowdAgent,
} from 'recast-navigation';
import { generateTileCache } from 'recast-navigation/generators';
import { logger } from '@/core/infrastructure/observability/logger';
import type {
  INavigationService,
  NavigationObstaculo,
  NavigationWalkableSurface,
  NavigationBuildResult,
} from '@/src/core/domain/ports/INavigationService';
import type {
  NavigationConfig,
  NavigationAgentParams,
  NavigationAgentPose,
  NavigationAgentId,
} from '@/src/core/domain/entities/espacio3d/NavigationConfig';
import type { Posicion2D } from '@/src/core/domain/entities/espacio3d/AsientoEntity';

const log = logger.child('recast-nav');

// ─── State interno del adapter ──────────────────────────────────────────────

interface ObstacleRecord {
  /** Handle opaco que retorna `tileCache.addBoxObstacle` — necesario para remove. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly handle: any;
}

interface AgentRecord {
  readonly agent: CrowdAgent;
  /** Última posición Y conocida — recast trabaja en 3D pero Cowork es Y=ground. */
  yGround: number;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class RecastNavigationAdapter implements INavigationService {
  private initialized = false;
  private navMesh: NavMesh | null = null;
  private tileCache: TileCache | null = null;
  private navMeshQuery: NavMeshQuery | null = null;
  private crowd: Crowd | null = null;

  /** Obstacles registrados por id de Cowork → handle de recast. */
  private readonly obstacles = new Map<string, ObstacleRecord>();

  /** Agentes registrados por id opaco → record con CrowdAgent. */
  private readonly agents = new Map<NavigationAgentId, AgentRecord>();

  private agentIdCounter = 0;
  private yGroundDefault = 0;

  // ─── Init ────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await init();
    this.initialized = true;
    log.info('recast-navigation initialized');
  }

  // ─── Build ───────────────────────────────────────────────────────────────

  build(
    walkableSurface: NavigationWalkableSurface,
    initialObstaculos: readonly NavigationObstaculo[],
    config: NavigationConfig,
  ): NavigationBuildResult {
    if (!this.initialized) {
      return { success: false, error: 'Not initialized — call initialize() first' };
    }

    this.disposeNavData();

    const positions = walkableSurface.positions;
    const indices = walkableSurface.indices;

    if (positions.length === 0 || indices.length === 0) {
      return { success: false, error: 'Empty walkable surface' };
    }

    this.yGroundDefault = this.estimateGroundY(positions);

    // Config keys oficiales (verificadas en `@recast-navigation/generators`):
    // - cs/ch: cellSize/cellHeight en world units
    // - walkableHeight/Climb/Radius: en VOXEL units (dividir metros / cellSize)
    // - walkableSlopeAngle: grados
    // - tileSize: cells per tile side
    // - expectedLayersPerTile: número de "pisos" esperados por tile
    // - maxObstacles: cap del TileCache buffer
    const result = generateTileCache(
      Array.from(positions),
      Array.from(indices),
      {
        cs: config.cellSize,
        ch: config.cellHeight,
        walkableSlopeAngle: config.walkableSlopeAngleDeg,
        walkableHeight: Math.max(1, Math.round(config.walkableHeight / config.cellHeight)),
        walkableClimb: Math.max(1, Math.round(config.walkableClimb / config.cellHeight)),
        walkableRadius: Math.max(1, Math.round(config.walkableRadius / config.cellSize)),
        tileSize: config.tileSize,
        expectedLayersPerTile: 4,
        maxObstacles: config.maxObstacles,
      },
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const navMesh = result.navMesh;
    const tileCache = result.tileCache;
    this.navMesh = navMesh;
    this.tileCache = tileCache;
    this.navMeshQuery = new NavMeshQuery(navMesh);
    this.crowd = new Crowd(navMesh, {
      maxAgents: 32,
      maxAgentRadius: 1.0,
    });

    initialObstaculos.forEach((obs) => {
      this.addObstacle(obs);
    });

    // Procesar las queued obstacle requests iniciales (cap 64 oficial).
    tileCache.update(navMesh);

    log.info('NavMesh + TileCache built', {
      walkableTriangles: indices.length / 3,
      obstaculos: initialObstaculos.length,
    });

    return { success: true };
  }

  // ─── Obstacles ──────────────────────────────────────────────────────────

  addObstacle(obstaculo: NavigationObstaculo): boolean {
    if (!this.tileCache) {
      log.warn('addObstacle called before build');
      return false;
    }
    if (this.obstacles.size >= 64) {
      log.warn('TileCache saturated — skipping obstacle', { id: obstaculo.id });
      return false;
    }

    const { obstacle } = this.tileCache.addBoxObstacle(
      obstaculo.position,
      obstaculo.halfExtents,
      obstaculo.rotationY,
    );

    if (!obstacle) {
      log.warn('addBoxObstacle returned null', { id: obstaculo.id });
      return false;
    }

    this.obstacles.set(obstaculo.id, { handle: obstacle });
    return true;
  }

  removeObstacle(obstaculoId: string): boolean {
    if (!this.tileCache) return false;
    const record = this.obstacles.get(obstaculoId);
    if (!record) return false;

    this.tileCache.removeObstacle(record.handle);
    this.obstacles.delete(obstaculoId);
    return true;
  }

  // ─── Agents ─────────────────────────────────────────────────────────────

  addAgent(initialPosition: Posicion2D, params: NavigationAgentParams): NavigationAgentId {
    if (!this.crowd) {
      throw new Error('addAgent called before build');
    }

    const agent = this.crowd.addAgent(
      { x: initialPosition.x, y: this.yGroundDefault, z: initialPosition.z },
      {
        radius: params.radius,
        height: params.height,
        maxAcceleration: params.maxAcceleration,
        maxSpeed: params.maxSpeed,
        collisionQueryRange: params.collisionQueryRange,
        pathOptimizationRange: params.collisionQueryRange * 3,
        separationWeight: params.separationWeight,
      },
    );

    const id = `agent-${++this.agentIdCounter}` as NavigationAgentId;
    this.agents.set(id, { agent, yGround: this.yGroundDefault });
    return id;
  }

  moveAgent(agentId: NavigationAgentId, target: Posicion2D): void {
    const record = this.agents.get(agentId);
    if (!record || !this.navMeshQuery) return;

    // Snap target al polígono caminable más cercano (recast no acepta
    // targets fuera del navmesh — silenciosamente ignora).
    const closest = this.navMeshQuery.findClosestPoint({
      x: target.x,
      y: record.yGround,
      z: target.z,
    });

    if (!closest.success) {
      log.debug('Target outside navmesh — agent stays put', { agentId, target });
      return;
    }

    record.agent.requestMoveTarget(closest.point);
  }

  moveAgentVelocity(agentId: NavigationAgentId, velocity: Posicion2D): void {
    const record = this.agents.get(agentId);
    if (!record) return;
    record.agent.requestMoveVelocity({ x: velocity.x, y: 0, z: velocity.z });
  }

  stopAgent(agentId: NavigationAgentId): void {
    const record = this.agents.get(agentId);
    if (!record) return;
    record.agent.resetMoveTarget();
  }

  teleportAgent(agentId: NavigationAgentId, position: Posicion2D): void {
    const record = this.agents.get(agentId);
    if (!record) return;
    record.agent.teleport({ x: position.x, y: record.yGround, z: position.z });
  }

  removeAgent(agentId: NavigationAgentId): void {
    const record = this.agents.get(agentId);
    if (!record || !this.crowd) return;
    this.crowd.removeAgent(record.agent);
    this.agents.delete(agentId);
  }

  getAgentPose(agentId: NavigationAgentId): NavigationAgentPose | null {
    const record = this.agents.get(agentId);
    if (!record) return null;
    const pos = record.agent.position();
    const vel = record.agent.velocity();

    // Defensa contra NaN: recast puede retornar non-finite si el agente
    // está fuera del navmesh o en un estado interno raro. Sin esta guarda,
    // los NaN propagan a positionRef → SpatialAudio AudioParam crash.
    if (
      !Number.isFinite(pos.x) || !Number.isFinite(pos.z) ||
      !Number.isFinite(vel.x) || !Number.isFinite(vel.z)
    ) {
      return null;
    }

    const speedSq = vel.x * vel.x + vel.z * vel.z;
    return {
      position: { x: pos.x, z: pos.z },
      velocity: { x: vel.x, z: vel.z },
      isMoving: speedSq > 0.0025, // ~ 0.05 m/s threshold
    };
  }

  // ─── Tick ───────────────────────────────────────────────────────────────

  tick(deltaSeconds: number): void {
    if (!this.crowd || !this.tileCache || !this.navMesh) return;

    // Crowd: steering + advance agents.
    this.crowd.update(deltaSeconds);

    // TileCache: procesar queued obstacle updates. Pattern oficial:
    // hasta 5 iteraciones para evitar starvation con muchos obstáculos.
    const maxUpdates = 5;
    for (let i = 0; i < maxUpdates; i++) {
      const { upToDate } = this.tileCache.update(this.navMesh);
      if (upToDate) break;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    this.disposeNavData();
    this.initialized = false;
  }

  private disposeNavData(): void {
    this.agents.clear();
    this.obstacles.clear();
    // recast-navigation v0.43 no expone dispose explícito; nullify para que
    // el GC libere las referencias WASM. Documentado en README.
    this.crowd = null;
    this.navMeshQuery = null;
    this.tileCache = null;
    this.navMesh = null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Estima la coordenada Y promedio del piso a partir del walkable surface.
   * Recast es 3D pero Cowork tiene un terreno plano-ish — usar el promedio
   * de los vértices Y como "ground" para agents evita drift.
   */
  private estimateGroundY(positions: Float32Array): number {
    if (positions.length === 0) return 0;
    let sumY = 0;
    let count = 0;
    for (let i = 1; i < positions.length; i += 3) {
      sumY += positions[i];
      count++;
    }
    return count > 0 ? sumY / count : 0;
  }
}
