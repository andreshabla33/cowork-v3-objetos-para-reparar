/**
 * @module tests/stress/fase2-sfu/domain/LoadTestScenario
 *
 * Value objects puros que describen un escenario de stress SFU.
 * Sin dependencias externas — Domain layer.
 */

export type VideoResolution = '180p' | '360p' | '480p' | '720p';
export type VideoCodec = 'vp8' | 'vp9' | 'h264';

export interface LoadTestScenario {
  /** Nombre del escenario (aparece en logs). */
  readonly name: string;
  /** Room name en LiveKit Cloud — debe ser único por corrida para aislar. */
  readonly roomName: string;
  /** Cantidad de peers que publican audio/video sintético. */
  readonly publishers: number;
  /** Cantidad de peers que solo subscriben tracks. */
  readonly subscribers: number;
  /** Duración de esta fase en segundos. */
  readonly durationSeconds: number;
  readonly videoResolution: VideoResolution;
  readonly videoCodec: VideoCodec;
  /** Bitrate de audio en bps. Opus default de LiveKit = 20kbps. */
  readonly audioBitrateBps: number;
}

/**
 * Plan de ramp-up: una secuencia de escenarios ejecutados en orden.
 * Ej: [10, 25, 50, 75, 100] peers durante 2min cada uno.
 */
export interface RampUpPlan {
  readonly baseRoomName: string;
  readonly tiers: readonly number[];
  readonly durationPerTierSeconds: number;
  readonly videoResolution: VideoResolution;
  readonly videoCodec: VideoCodec;
  readonly audioBitrateBps: number;
  /** Ratio 0..1 de peers que publican (resto solo subscribe). */
  readonly publisherRatio: number;
}

/**
 * Expande un RampUpPlan a una lista concreta de LoadTestScenario.
 * Pure function.
 */
export function expandRampUp(plan: RampUpPlan): readonly LoadTestScenario[] {
  return plan.tiers.map((peerCount, tierIndex) => {
    const publishers = Math.max(1, Math.round(peerCount * plan.publisherRatio));
    const subscribers = peerCount - publishers;
    return {
      name: `tier_${tierIndex + 1}_${peerCount}peers`,
      roomName: `${plan.baseRoomName}_tier${tierIndex + 1}`,
      publishers,
      subscribers,
      durationSeconds: plan.durationPerTierSeconds,
      videoResolution: plan.videoResolution,
      videoCodec: plan.videoCodec,
      audioBitrateBps: plan.audioBitrateBps,
    };
  });
}
