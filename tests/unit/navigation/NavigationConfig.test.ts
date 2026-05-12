/**
 * Tests del Domain de navigation (pathfinding/obstacle-avoidance).
 *
 * Cobertura del value object + constantes canónicas — protege contra
 * cambios accidentales en parámetros que afectan tanto al adapter recast
 * como al mapper de obstáculos. Ningún test toca recast WASM directamente
 * (eso vive en la capa Infrastructure y se valida vía build/integration).
 *
 * Ref: src/core/domain/entities/espacio3d/NavigationConfig.ts
 * Ref: https://github.com/isaac-mason/recast-navigation-js (rangos oficiales)
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAVIGATION_CONFIG,
  DEFAULT_AGENT_PARAMS,
  type NavigationConfig,
  type NavigationAgentParams,
} from '../../../src/core/domain/entities/espacio3d/NavigationConfig';

// ─── DEFAULT_NAVIGATION_CONFIG ──────────────────────────────────────────────

describe('DEFAULT_NAVIGATION_CONFIG — invariantes del navmesh', () => {
  it('cellSize y cellHeight son positivos (recast invariant)', () => {
    expect(DEFAULT_NAVIGATION_CONFIG.cellSize).toBeGreaterThan(0);
    expect(DEFAULT_NAVIGATION_CONFIG.cellHeight).toBeGreaterThan(0);
  });

  it('walkableRadius matchea el RADIO_COLISION_AVATAR del Domain de movimiento (0.42m)', () => {
    // Si esto se desincroniza, el navmesh permitirá pasar al avatar por
    // espacios donde el sliding sí colisiona (o vice versa) → bug visible.
    expect(DEFAULT_NAVIGATION_CONFIG.walkableRadius).toBe(0.42);
  });

  it('walkableHeight >= 1.8m (altura humana razonable)', () => {
    // Avatar typical height ~1.8m. Si es menor, recast considera caminable
    // espacios bajos (escritorios, sillas) que en realidad no lo son.
    expect(DEFAULT_NAVIGATION_CONFIG.walkableHeight).toBeGreaterThanOrEqual(1.8);
  });

  it('walkableSlopeAngleDeg ∈ [0, 90]', () => {
    expect(DEFAULT_NAVIGATION_CONFIG.walkableSlopeAngleDeg).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_NAVIGATION_CONFIG.walkableSlopeAngleDeg).toBeLessThanOrEqual(90);
  });

  it('tileSize está en el rango recomendado oficial (32-64)', () => {
    // Doc oficial: "TileCache assumes small tiles (around 32-64 squared)".
    // Tile más chico = más granularidad pero más memoria.
    // Tile más grande = menos tiles pero rebuilds más caros al meter obstáculos.
    expect(DEFAULT_NAVIGATION_CONFIG.tileSize).toBeGreaterThanOrEqual(32);
    expect(DEFAULT_NAVIGATION_CONFIG.tileSize).toBeLessThanOrEqual(64);
  });

  it('maxObstacles <= 64 (cap absoluto del TileCache)', () => {
    // Recast tira DT_BUFFER_TOO_SMALL si exceeds 64 queued obstacles.
    // Hard limit, no extensible — debemos respetarlo.
    expect(DEFAULT_NAVIGATION_CONFIG.maxObstacles).toBeLessThanOrEqual(64);
  });

  it('walkableClimb < walkableHeight (recast geometric invariant)', () => {
    // El step que el agente puede subir debe ser menor que su altura,
    // si no recast genera navmesh inválido.
    expect(DEFAULT_NAVIGATION_CONFIG.walkableClimb).toBeLessThan(
      DEFAULT_NAVIGATION_CONFIG.walkableHeight,
    );
  });

  it('es Object.freeze (inmutable)', () => {
    expect(Object.isFrozen(DEFAULT_NAVIGATION_CONFIG)).toBe(true);
  });
});

// ─── DEFAULT_AGENT_PARAMS ───────────────────────────────────────────────────

describe('DEFAULT_AGENT_PARAMS — invariantes del crowd agent', () => {
  it('radius matchea walkableRadius del navmesh', () => {
    // Si el agent radius difiere del walkable radius del navmesh, recast
    // puede colocar agents en espacios donde no pueden caminar realmente.
    expect(DEFAULT_AGENT_PARAMS.radius).toBe(DEFAULT_NAVIGATION_CONFIG.walkableRadius);
  });

  it('maxSpeed matchea MOVE_SPEED del módulo legacy (4 m/s)', () => {
    // Calibrado contra `shared.ts MOVE_SPEED = 4`. Si se desincroniza,
    // el avatar manejado por crowd se mueve a velocidad diferente que
    // el sliding legacy → comportamiento inconsistente.
    expect(DEFAULT_AGENT_PARAMS.maxSpeed).toBe(4.0);
  });

  it('collisionQueryRange >= 4× radius (heuristic)', () => {
    // El agente "ve" otros agents a esta distancia. Demasiado chico = no
    // hay tiempo para steering avoidance. Demasiado grande = costo CPU.
    expect(DEFAULT_AGENT_PARAMS.collisionQueryRange).toBeGreaterThanOrEqual(
      DEFAULT_AGENT_PARAMS.radius * 4,
    );
  });

  it('separationWeight razonable (0-2 típico recast)', () => {
    expect(DEFAULT_AGENT_PARAMS.separationWeight).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_AGENT_PARAMS.separationWeight).toBeLessThanOrEqual(2);
  });

  it('maxAcceleration > maxSpeed (puede alcanzar velocidad max en <1s)', () => {
    // Aceleración insuficiente = agent siempre en transient state, nunca
    // alcanza el moveSpeed real. >maxSpeed garantiza respuesta inmediata.
    expect(DEFAULT_AGENT_PARAMS.maxAcceleration).toBeGreaterThan(
      DEFAULT_AGENT_PARAMS.maxSpeed,
    );
  });

  it('es Object.freeze (inmutable)', () => {
    expect(Object.isFrozen(DEFAULT_AGENT_PARAMS)).toBe(true);
  });
});

// ─── Tipos exportados — smoke test del contrato ─────────────────────────────

describe('NavigationConfig / NavigationAgentParams — type contract', () => {
  it('NavigationConfig acepta override parcial sin perder readonly', () => {
    // Las constantes son `readonly` — el compiler debe permitir leer pero
    // no mutar in-place. Si esto rompe, el type contract cambió.
    const config: NavigationConfig = {
      ...DEFAULT_NAVIGATION_CONFIG,
      cellSize: 0.5,
    };
    expect(config.cellSize).toBe(0.5);
    expect(config.tileSize).toBe(DEFAULT_NAVIGATION_CONFIG.tileSize);
  });

  it('NavigationAgentParams permite override del radius', () => {
    const params: NavigationAgentParams = {
      ...DEFAULT_AGENT_PARAMS,
      radius: 0.6,
    };
    expect(params.radius).toBe(0.6);
    expect(params.maxSpeed).toBe(DEFAULT_AGENT_PARAMS.maxSpeed);
  });
});
