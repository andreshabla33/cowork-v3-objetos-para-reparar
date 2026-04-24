/**
 * @module tests/stress/fase1-local/application/BotSpawnerUseCase
 *
 * Use case: spawn/despawn de N bots en el ECS del espacio 3D.
 * Orquesta Domain (BotSpec generator) + Infrastructure (AvatarECS adapter).
 *
 * Clean Architecture:
 *   - Depende solo de Domain + port IFakeAvatarAdapter.
 *   - No importa React, Three.js, Supabase, LiveKit directamente.
 */

import type { BotSpec, WorldBounds } from '../domain/BotBehavior';
import { generateBotSpecs } from '../domain/BotBehavior';

/** Port del adapter que materializa bots en el ECS. Infrastructure lo implementa. */
export interface IFakeAvatarAdapter {
  addBot(spec: BotSpec): void;
  removeBot(userId: string): void;
  tickMovement(dt: number): void;
  listActiveBotIds(): readonly string[];
}

/** Configuración de un run de stress Fase 1. */
export interface StressRunConfig {
  readonly botCount: number;
  readonly bounds: WorldBounds;
  readonly avatarModelUrls: readonly string[];
  readonly withFakeVideoBubbleRatio: number;
}

export class BotSpawnerUseCase {
  constructor(private readonly adapter: IFakeAvatarAdapter) {}

  /** Spawnea N bots según el config. Retorna los specs materializados. */
  spawn(config: StressRunConfig): readonly BotSpec[] {
    const specs = generateBotSpecs({
      count: config.botCount,
      bounds: config.bounds,
      avatarModelUrls: config.avatarModelUrls,
      withFakeVideoBubbleRatio: config.withFakeVideoBubbleRatio,
    });
    for (const spec of specs) {
      this.adapter.addBot(spec);
    }
    return specs;
  }

  /** Despawnea TODOS los bots activos. Idempotente. */
  despawnAll(): number {
    const active = this.adapter.listActiveBotIds();
    for (const id of active) {
      this.adapter.removeBot(id);
    }
    return active.length;
  }

  /**
   * Tick de movimiento — debe llamarse cada frame desde useFrame del renderer
   * para que los bots se muevan. Delta en segundos (estándar r3f useFrame).
   */
  tick(dtSeconds: number): void {
    this.adapter.tickMovement(dtSeconds);
  }

  /** Cantidad actual de bots activos. */
  activeCount(): number {
    return this.adapter.listActiveBotIds().length;
  }
}
