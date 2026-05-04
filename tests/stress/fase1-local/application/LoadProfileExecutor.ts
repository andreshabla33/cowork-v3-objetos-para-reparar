/**
 * @module tests/stress/fase1-local/application/LoadProfileExecutor
 *
 * Orquesta la ejecución de un LoadProfile (static / ramp / spike) sobre el
 * BotSpawnerUseCase + MemoryLeakDetector. Publica progreso en callback para
 * que el Panel (Presentation) lo muestre en consola.
 *
 * Clean Architecture: Application — Domain (LoadProfile) + Application ports.
 * No toca Three.js ni Chromium.
 */

import type { LoadProfile } from '../domain/LoadProfiles';
import { peakBotCount, totalDurationSec } from '../domain/LoadProfiles';
import type { StressRunResult } from '../domain/LeakDetectionCriteria';
import type { BotSpawnerUseCase, DynamicResizeConfig, StressRunConfig } from './BotSpawnerUseCase';
import type { MemoryLeakDetector } from './MemoryLeakDetector';

export interface ProgressEvent {
  readonly phase: string;
  readonly elapsedSec: number;
  readonly totalSec: number;
  readonly currentBots: number;
  readonly peakBots: number;
}

export type ProgressCallback = (ev: ProgressEvent) => void;

const noop: ProgressCallback = () => {};

export class LoadProfileExecutor {
  constructor(
    private readonly spawner: BotSpawnerUseCase,
    private readonly detector: MemoryLeakDetector,
  ) {}

  /**
   * Ejecuta un profile completo. Retorna el resultado con samples.
   * Llamante debe `spawner.despawnAll()` después si quiere validar cycle.
   */
  async execute(
    profile: LoadProfile,
    resizeConfig: DynamicResizeConfig,
    onProgress: ProgressCallback = noop,
  ): Promise<StressRunResult> {
    this.detector.setSamplingInterval(profile.samplingIntervalMs);

    const total = totalDurationSec(profile);
    const peak = peakBotCount(profile);

    const s = profile.shape;
    if (s.kind === 'static') {
      return this.executeStatic(
        { ...resizeConfig, botCount: s.botCount },
        s.durationSec,
        peak,
        total,
        onProgress,
      );
    }
    if (s.kind === 'ramp') {
      return this.executeRamp(profile, resizeConfig, total, onProgress);
    }
    return this.executeSpike(profile, resizeConfig, total, onProgress);
  }

  private async executeStatic(
    config: StressRunConfig,
    durationSec: number,
    peak: number,
    total: number,
    onProgress: ProgressCallback,
  ): Promise<StressRunResult> {
    onProgress({ phase: 'spawning', elapsedSec: 0, totalSec: total, currentBots: 0, peakBots: peak });
    this.spawner.spawn(config);
    this.detector.start();

    const tickMs = 1000;
    const start = Date.now();
    while (Date.now() - start < durationSec * 1000) {
      await sleep(Math.min(tickMs, durationSec * 1000 - (Date.now() - start)));
      onProgress({
        phase: 'sampling',
        elapsedSec: Math.round((Date.now() - start) / 1000),
        totalSec: total,
        currentBots: this.spawner.activeCount(),
        peakBots: peak,
      });
    }
    return this.detector.stop(this.spawner.activeCount());
  }

  private async executeRamp(
    profile: LoadProfile,
    resizeConfig: DynamicResizeConfig,
    total: number,
    onProgress: ProgressCallback,
  ): Promise<StressRunResult> {
    if (profile.shape.kind !== 'ramp') throw new Error('not a ramp profile');
    const { fromBots, toBots, stepBots, stepDurationSec, holdAtMaxSec } = profile.shape;

    onProgress({ phase: 'ramp_start', elapsedSec: 0, totalSec: total, currentBots: 0, peakBots: toBots });
    this.spawner.spawn({
      botCount: fromBots,
      bounds: resizeConfig.bounds,
      avatarModelUrls: resizeConfig.avatarModelUrls,
      withFakeVideoBubbleRatio: resizeConfig.withFakeVideoBubbleRatio,
    });
    this.detector.start();

    const runStart = Date.now();
    let currentTarget = fromBots;
    while (currentTarget < toBots) {
      // Hold al step actual.
      await sleep(stepDurationSec * 1000);
      // Escalar al siguiente nivel.
      currentTarget = Math.min(currentTarget + stepBots, toBots);
      this.spawner.setTargetCount(currentTarget, resizeConfig);
      onProgress({
        phase: `ramping_to_${currentTarget}`,
        elapsedSec: Math.round((Date.now() - runStart) / 1000),
        totalSec: total,
        currentBots: this.spawner.activeCount(),
        peakBots: toBots,
      });
    }
    // Hold final en peak.
    await sleep(holdAtMaxSec * 1000);
    onProgress({
      phase: 'holding_peak',
      elapsedSec: Math.round((Date.now() - runStart) / 1000),
      totalSec: total,
      currentBots: this.spawner.activeCount(),
      peakBots: toBots,
    });
    return this.detector.stop(this.spawner.activeCount());
  }

  private async executeSpike(
    profile: LoadProfile,
    resizeConfig: DynamicResizeConfig,
    total: number,
    onProgress: ProgressCallback,
  ): Promise<StressRunResult> {
    if (profile.shape.kind !== 'spike') throw new Error('not a spike profile');
    const { baselineBots, spikeBots, baselineBeforeSec, spikeDurationSec, baselineAfterSec } = profile.shape;

    this.spawner.spawn({
      botCount: baselineBots,
      bounds: resizeConfig.bounds,
      avatarModelUrls: resizeConfig.avatarModelUrls,
      withFakeVideoBubbleRatio: resizeConfig.withFakeVideoBubbleRatio,
    });
    this.detector.start();
    const runStart = Date.now();

    onProgress({ phase: 'baseline_before', elapsedSec: 0, totalSec: total, currentBots: baselineBots, peakBots: spikeBots });
    await sleep(baselineBeforeSec * 1000);

    // SPIKE.
    this.spawner.setTargetCount(spikeBots, resizeConfig);
    onProgress({
      phase: 'spike',
      elapsedSec: Math.round((Date.now() - runStart) / 1000),
      totalSec: total,
      currentBots: spikeBots,
      peakBots: spikeBots,
    });
    await sleep(spikeDurationSec * 1000);

    // Vuelta a baseline.
    this.spawner.setTargetCount(baselineBots, resizeConfig);
    onProgress({
      phase: 'baseline_after',
      elapsedSec: Math.round((Date.now() - runStart) / 1000),
      totalSec: total,
      currentBots: baselineBots,
      peakBots: spikeBots,
    });
    await sleep(baselineAfterSec * 1000);

    return this.detector.stop(this.spawner.activeCount());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
