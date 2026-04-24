/**
 * @module tests/stress/fase3-playwright/application/JourneyOrchestrator
 *
 * Orquesta N journeys simultáneos. Limita concurrencia para no saturar el
 * runner con demasiados Chromium en paralelo.
 *
 * Clean Architecture: Application — depende de Domain + ports.
 */

import type { ClientJourneyScript } from '../domain/ClientJourneyScript';
import type { JourneyResult, E2ESlos, E2EVerdict } from '../domain/E2ESlos';
import { evaluateE2EAggregate } from '../domain/E2ESlos';

/** Port: ejecutor de un journey individual. Infrastructure lo implementa. */
export interface IClientJourneyExecutor {
  execute(script: ClientJourneyScript): Promise<JourneyResult>;
}

export interface OrchestratorRunReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly totalJourneys: number;
  readonly concurrency: number;
  readonly journeys: readonly JourneyResult[];
  readonly verdict: E2EVerdict;
}

export class JourneyOrchestrator {
  constructor(
    private readonly executor: IClientJourneyExecutor,
    private readonly slos: E2ESlos,
    private readonly isLaptopProfile: boolean = false,
  ) {}

  /**
   * Lanza N journeys limitando concurrencia a `maxConcurrent`.
   * Cada journey ejecuta en un browser aislado.
   */
  async runAll(
    scripts: readonly ClientJourneyScript[],
    maxConcurrent: number,
  ): Promise<OrchestratorRunReport> {
    const startedAt = new Date().toISOString();
    const results: JourneyResult[] = [];
    const queue = [...scripts];
    const inFlight: Promise<void>[] = [];

    const runOne = async (script: ClientJourneyScript): Promise<void> => {
      try {
        const result = await this.executor.execute(script);
        results.push(result);
      } catch (err) {
        // Un journey fallado no aborta el batch — registramos como failed y seguimos.
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          journeyId: script.journeyId,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          steps: [{ kind: 'login', startTs: Date.now(), endTs: Date.now(), success: false, error: message }],
          observedMetrics: {
            roomConnectedMs: null,
            chatInsertsAttempted: 0,
            chatInsertsSucceeded: 0,
            moveParticipantAttempted: 0,
            moveParticipantSucceeded: 0,
            fpsP99: 0,
            ghostCleanupDetectedMs: null,
          },
        });
      }
    };

    while (queue.length > 0 || inFlight.length > 0) {
      while (queue.length > 0 && inFlight.length < maxConcurrent) {
        const script = queue.shift()!;
        const task = runOne(script);
        inFlight.push(task);
        task.finally(() => {
          const idx = inFlight.indexOf(task);
          if (idx >= 0) inFlight.splice(idx, 1);
        });
      }
      if (inFlight.length > 0) {
        await Promise.race(inFlight);
      }
    }

    const verdict = evaluateE2EAggregate(results, this.slos, this.isLaptopProfile);
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      totalJourneys: scripts.length,
      concurrency: maxConcurrent,
      journeys: results,
      verdict,
    };
  }
}
