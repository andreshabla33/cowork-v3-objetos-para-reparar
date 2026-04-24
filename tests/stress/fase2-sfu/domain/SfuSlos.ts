/**
 * @module tests/stress/fase2-sfu/domain/SfuSlos
 *
 * Service Level Objectives para la Fase 2 del stress test (SFU).
 *
 * Refs oficiales:
 *   - LiveKit Cloud quotas: https://docs.livekit.io/home/cloud/quotas-and-limits/
 *   - ConnectionQuality enum: https://docs.livekit.io/reference/client-sdk-js/enums/ConnectionQuality.html
 *   - Opus codec latency (RFC 6716): https://datatracker.ietf.org/doc/html/rfc6716
 */

/** Métricas agregadas de una corrida de load-test. */
export interface SfuRunMetrics {
  readonly publishLatencyP95Ms: number;
  readonly subscribeLatencyP95Ms: number;
  readonly packetLossRatio: number;
  readonly involuntaryReconnects: number;
  readonly connectedPeers: number;
  readonly expectedPeers: number;
  readonly sustainedLostQuality: number; // count de peers con quality='lost' >3s
}

export interface SfuSlos {
  readonly maxPublishLatencyP95Ms: number;
  readonly maxSubscribeLatencyP95Ms: number;
  readonly maxPacketLossRatio: number;
  readonly maxInvoluntaryReconnects: number;
  /** Ratio mínimo de peers conectados / esperados. */
  readonly minConnectRateRatio: number;
  readonly maxSustainedLostQualityPeers: number;
}

export const DEFAULT_SFU_SLOS: SfuSlos = {
  maxPublishLatencyP95Ms: 200,
  maxSubscribeLatencyP95Ms: 500,
  maxPacketLossRatio: 0.02,
  maxInvoluntaryReconnects: 0,
  minConnectRateRatio: 0.99,
  maxSustainedLostQualityPeers: 0,
};

export interface SfuVerdict {
  readonly scenarioName: string;
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly metrics: SfuRunMetrics;
}

export function evaluateSfuRun(
  scenarioName: string,
  metrics: SfuRunMetrics,
  slos: SfuSlos,
): SfuVerdict {
  const reasons: string[] = [];
  if (metrics.publishLatencyP95Ms > slos.maxPublishLatencyP95Ms) {
    reasons.push(`publish_latency_p95_${metrics.publishLatencyP95Ms}ms_exceeds_${slos.maxPublishLatencyP95Ms}ms`);
  }
  if (metrics.subscribeLatencyP95Ms > slos.maxSubscribeLatencyP95Ms) {
    reasons.push(`subscribe_latency_p95_${metrics.subscribeLatencyP95Ms}ms_exceeds_${slos.maxSubscribeLatencyP95Ms}ms`);
  }
  if (metrics.packetLossRatio > slos.maxPacketLossRatio) {
    reasons.push(`packet_loss_${(metrics.packetLossRatio * 100).toFixed(2)}pct_exceeds_${(slos.maxPacketLossRatio * 100).toFixed(2)}pct`);
  }
  if (metrics.involuntaryReconnects > slos.maxInvoluntaryReconnects) {
    reasons.push(`involuntary_reconnects_${metrics.involuntaryReconnects}_exceeds_${slos.maxInvoluntaryReconnects}`);
  }
  const connectRatio = metrics.expectedPeers === 0 ? 1 : metrics.connectedPeers / metrics.expectedPeers;
  if (connectRatio < slos.minConnectRateRatio) {
    reasons.push(`connect_rate_${(connectRatio * 100).toFixed(1)}pct_below_${(slos.minConnectRateRatio * 100).toFixed(1)}pct`);
  }
  if (metrics.sustainedLostQuality > slos.maxSustainedLostQualityPeers) {
    reasons.push(`sustained_lost_quality_${metrics.sustainedLostQuality}_exceeds_${slos.maxSustainedLostQualityPeers}`);
  }
  return {
    scenarioName,
    pass: reasons.length === 0,
    reasons,
    metrics,
  };
}
