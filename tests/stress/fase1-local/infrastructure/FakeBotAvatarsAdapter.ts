/**
 * @module tests/stress/fase1-local/infrastructure/FakeBotAvatarsAdapter
 *
 * Implementa IFakeAvatarAdapter contra el avatarStore del proyecto.
 * Los bots aparecen como "usuarios remotos" para el renderer sin pasar
 * por Supabase Presence ni LiveKit — el stress se mide aislado del networking.
 *
 * Clean Architecture: Infrastructure layer — depende de avatarStore (singleton
 * concreto) y del port IFakeAvatarAdapter del Application layer.
 */

import { avatarStore } from '@/lib/ecs/AvatarECS';
import type { IFakeAvatarAdapter } from '../application/BotSpawnerUseCase';
import type { BotSpec } from '../domain/BotBehavior';

interface InternalBotState {
  spec: BotSpec;
  currentTargetX: number;
  currentTargetZ: number;
  lastRetargetTs: number;
}

/** Intervalo entre re-target de random walk (ms). Cada bot pide nuevo target cada ~2s. */
const RETARGET_INTERVAL_MS = 2000;

export class FakeBotAvatarsAdapter implements IFakeAvatarAdapter {
  private readonly bots = new Map<string, InternalBotState>();

  addBot(spec: BotSpec): void {
    // Upsert directo al ECS — mismo path que usan los avatares remotos reales.
    // Ref: lib/ecs/AvatarECS.ts:205 (syncWithOnlineUsers) usa el mismo upsert.
    avatarStore.upsert(spec.userId, {
      currentX: spec.initialPosition.x,
      currentZ: spec.initialPosition.z,
      targetX: spec.initialPosition.x,
      targetZ: spec.initialPosition.z,
      direction: 'south',
      name: spec.name,
      status: 'available',
      empresaId: null,
      esFantasma: false,
      isCameraOn: spec.withFakeVideoBubble,
      avatarConfig: null,
      avatar3DConfig: spec.avatarModelUrl
        ? { modelo_url: spec.avatarModelUrl, escala: 1, animaciones: [] } as unknown as any
        : null,
      profilePhoto: null,
      hasReceivedFirstRealTarget: true, // saltar el skip-first-lerp (bot ya empieza en posición)
    });
    this.bots.set(spec.userId, {
      spec,
      currentTargetX: spec.initialPosition.x,
      currentTargetZ: spec.initialPosition.z,
      lastRetargetTs: Date.now(),
    });
  }

  removeBot(userId: string): void {
    if (!this.bots.has(userId)) return;
    avatarStore.remove(userId);
    this.bots.delete(userId);
  }

  tickMovement(_dtSeconds: number): void {
    const now = Date.now();
    for (const bot of this.bots.values()) {
      if (bot.spec.movement.kind === 'stationary') continue;
      // Re-target periódico solo — el movementSystem del proyecto interpola
      // current → target con damp (commit d420870). Aquí solo movemos el target.
      if (now - bot.lastRetargetTs < RETARGET_INTERVAL_MS) continue;
      if (bot.spec.movement.kind === 'random_walk') {
        const step = bot.spec.movement.stepRangeWorld;
        bot.currentTargetX += (Math.random() - 0.5) * 2 * step;
        bot.currentTargetZ += (Math.random() - 0.5) * 2 * step;
        // Clamp a un rectángulo grande para evitar que se salgan del universo.
        bot.currentTargetX = Math.max(0, Math.min(bot.currentTargetX, 100));
        bot.currentTargetZ = Math.max(0, Math.min(bot.currentTargetZ, 100));
      } else if (bot.spec.movement.kind === 'circle_orbit') {
        const m = bot.spec.movement;
        const angle = (now / 1000) * m.angularVelocity;
        bot.currentTargetX = bot.spec.initialPosition.x + Math.cos(angle) * m.radiusWorld;
        bot.currentTargetZ = bot.spec.initialPosition.z + Math.sin(angle) * m.radiusWorld;
      }
      const entity = avatarStore.get(bot.spec.userId);
      if (entity) {
        entity.targetX = bot.currentTargetX;
        entity.targetZ = bot.currentTargetZ;
        entity.isMoving = true;
      }
      bot.lastRetargetTs = now;
    }
  }

  listActiveBotIds(): readonly string[] {
    return Array.from(this.bots.keys());
  }
}
