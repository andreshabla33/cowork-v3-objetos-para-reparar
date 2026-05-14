/**
 * @module tests/stress/fase3-playwright/domain/E2ESlos
 *
 * SLOs de la Fase 3 — los bloqueantes para GO a producción.
 *
 * Refs oficiales:
 *   - LiveKit RoomEvent: https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html
 *   - Playwright metrics: https://playwright.dev/docs/test-reporters
 */

export interface JourneyStepResult {
  readonly kind: string;
  readonly startTs: number;
  readonly endTs: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface JourneyResult {
  readonly journeyId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly JourneyStepResult[];
  /** Métricas observadas durante el journey. */
  readonly observedMetrics: {
    readonly roomConnectedMs: number | null;
    readonly chatInsertsAttempted: number;
    readonly chatInsertsSucceeded: number;
    readonly moveParticipantAttempted: number;
    readonly moveParticipantSucceeded: number;
    readonly fpsP99: number;
    readonly ghostCleanupDetectedMs: number | null;
    /** Draw calls P99 sampleado desde window.__cowork_metrics. */
    readonly drawCallsP99?: number;
    /** JS heap usado P99 en MB (Performance.getMetrics CDP). */
    readonly jsHeapMbP99?: number;
    /** Time-to-scene-ready en ms desde canvas creado. */
    readonly sceneReadyMs?: number;
  };
}

export interface E2ESlos {
  readonly maxRoomConnectedMs: number;
  readonly minChatInsertRate: number;
  readonly minMoveParticipantRate: number;
  readonly minFpsP99Desktop: number;
  readonly minFpsP99Laptop: number;
  /** SLO iris-xe: peor caso documentado en logs (Intel Iris Xe + ANGLE). */
  readonly minFpsP99IrisXe: number;
  /** Draw calls P99 máximo permitido (cualquier perfil). */
  readonly maxDrawCallsP99: number;
  /** JS heap usado máximo en MB. */
  readonly maxJsHeapMb: number;
  /** Tiempo a "scene ready" en ms (desde canvas creado). */
  readonly maxSceneReadyMs: number;
  readonly maxGhostCleanupMs: number;
}

export const DEFAULT_E2E_SLOS: E2ESlos = {
  maxRoomConnectedMs: 5_000,
  minChatInsertRate: 0.98,
  minMoveParticipantRate: 0.98,
  minFpsP99Desktop: 40,
  minFpsP99Laptop: 25,
  minFpsP99IrisXe: 22, // baseline real medido en logs Iris Xe — margen pequeño
  maxDrawCallsP99: 200, // sale de zona alerta (umbral interno renderer-metrics)
  maxJsHeapMb: 500,
  maxSceneReadyMs: 4_000,
  maxGhostCleanupMs: 5_000,
};

export interface E2EVerdict {
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly totalJourneys: number;
  readonly passedJourneys: number;
}

export type HardwareProfile = 'desktop' | 'laptop' | 'iris-xe';

function resolveMinFps(slos: E2ESlos, profile: HardwareProfile): number {
  if (profile === 'iris-xe') return slos.minFpsP99IrisXe;
  if (profile === 'laptop') return slos.minFpsP99Laptop;
  return slos.minFpsP99Desktop;
}

/** Evalúa múltiples journeys agregados contra los SLOs. Pure function. */
export function evaluateE2EAggregate(
  journeys: readonly JourneyResult[],
  slos: E2ESlos,
  isLaptopProfile: boolean | HardwareProfile,
): E2EVerdict {
  const reasons: string[] = [];
  if (journeys.length === 0) {
    return { pass: false, reasons: ['no_journeys_executed'], totalJourneys: 0, passedJourneys: 0 };
  }

  // Backwards-compat: si recibe boolean usa el comportamiento previo.
  const profile: HardwareProfile = typeof isLaptopProfile === 'boolean'
    ? (isLaptopProfile ? 'laptop' : 'desktop')
    : isLaptopProfile;
  const minFps = resolveMinFps(slos, profile);

  let chatAttempts = 0;
  let chatSucceeded = 0;
  let moveAttempts = 0;
  let moveSucceeded = 0;
  let roomConnectedViolations = 0;
  let fpsViolations = 0;
  let dcViolations = 0;
  let heapViolations = 0;
  let sceneReadyViolations = 0;
  let ghostCleanupViolations = 0;
  let journeysAllStepsOk = 0;

  for (const j of journeys) {
    chatAttempts += j.observedMetrics.chatInsertsAttempted;
    chatSucceeded += j.observedMetrics.chatInsertsSucceeded;
    moveAttempts += j.observedMetrics.moveParticipantAttempted;
    moveSucceeded += j.observedMetrics.moveParticipantSucceeded;

    if (j.observedMetrics.roomConnectedMs !== null &&
        j.observedMetrics.roomConnectedMs > slos.maxRoomConnectedMs) {
      roomConnectedViolations++;
    }
    if (j.observedMetrics.fpsP99 > 0 && j.observedMetrics.fpsP99 < minFps) {
      fpsViolations++;
    }
    if (j.observedMetrics.drawCallsP99 !== undefined &&
        j.observedMetrics.drawCallsP99 > slos.maxDrawCallsP99) {
      dcViolations++;
    }
    if (j.observedMetrics.jsHeapMbP99 !== undefined &&
        j.observedMetrics.jsHeapMbP99 > slos.maxJsHeapMb) {
      heapViolations++;
    }
    if (j.observedMetrics.sceneReadyMs !== undefined &&
        j.observedMetrics.sceneReadyMs > slos.maxSceneReadyMs) {
      sceneReadyViolations++;
    }
    if (j.observedMetrics.ghostCleanupDetectedMs !== null &&
        j.observedMetrics.ghostCleanupDetectedMs > slos.maxGhostCleanupMs) {
      ghostCleanupViolations++;
    }
    if (j.steps.every(s => s.success)) journeysAllStepsOk++;
  }

  const chatRate = chatAttempts === 0 ? 1 : chatSucceeded / chatAttempts;
  const moveRate = moveAttempts === 0 ? 1 : moveSucceeded / moveAttempts;

  if (chatRate < slos.minChatInsertRate) {
    reasons.push(`chat_insert_rate_${(chatRate * 100).toFixed(1)}pct_below_${(slos.minChatInsertRate * 100).toFixed(1)}pct`);
  }
  if (moveRate < slos.minMoveParticipantRate) {
    reasons.push(`moveparticipant_rate_${(moveRate * 100).toFixed(1)}pct_below_${(slos.minMoveParticipantRate * 100).toFixed(1)}pct`);
  }
  if (roomConnectedViolations > 0) {
    reasons.push(`room_connected_slow_${roomConnectedViolations}_of_${journeys.length}`);
  }
  if (fpsViolations > 0) {
    reasons.push(`fps_below_${minFps}fps_${fpsViolations}_of_${journeys.length}_(profile:${profile})`);
  }
  if (dcViolations > 0) {
    reasons.push(`draw_calls_above_${slos.maxDrawCallsP99}_in_${dcViolations}_of_${journeys.length}`);
  }
  if (heapViolations > 0) {
    reasons.push(`js_heap_above_${slos.maxJsHeapMb}mb_in_${heapViolations}_of_${journeys.length}`);
  }
  if (sceneReadyViolations > 0) {
    reasons.push(`scene_ready_slow_${sceneReadyViolations}_of_${journeys.length}`);
  }
  if (ghostCleanupViolations > 0) {
    reasons.push(`ghost_cleanup_slow_${ghostCleanupViolations}_of_${journeys.length}`);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    totalJourneys: journeys.length,
    passedJourneys: journeysAllStepsOk,
  };
}
