/**
 * @module tests/stress/fase2-sfu/application/LoadTestRunner
 *
 * Use case: ejecuta un plan de ramp-up contra el SFU de LiveKit.
 * Orquesta Domain (scenarios, SLOs) + Infrastructure (CLI adapter).
 *
 * Clean Architecture: Application — no conoce child_process ni filesystem.
 */

import type { LoadTestScenario, RampUpPlan } from '../domain/LoadTestScenario';
import { expandRampUp } from '../domain/LoadTestScenario';
import { DEFAULT_SFU_SLOS, evaluateSfuRun, type SfuRunMetrics, type SfuSlos, type SfuVerdict } from '../domain/SfuSlos';
import { parseLkLoadTestOutput } from './ResultParser';

/** Port del adapter que ejecuta el CLI. Infrastructure lo implementa. */
export interface ILkLoadTestAdapter {
  run(scenario: LoadTestScenario): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface RampUpReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly planRoom: string;
  readonly verdicts: readonly SfuVerdict[];
  readonly overallPass: boolean;
}

export class LoadTestRunner {
  constructor(
    private readonly adapter: ILkLoadTestAdapter,
    private readonly slos: SfuSlos = DEFAULT_SFU_SLOS,
  ) {}

  async runRampUp(plan: RampUpPlan): Promise<RampUpReport> {
    const startedAt = new Date().toISOString();
    const scenarios = expandRampUp(plan);
    const verdicts: SfuVerdict[] = [];

    for (const scenario of scenarios) {
      console.log(`[sfu-stress] running: ${scenario.name} — ${scenario.publishers} pub + ${scenario.subscribers} sub @ ${scenario.durationSeconds}s`);
      const output = await this.adapter.run(scenario);
      if (output.exitCode !== 0) {
        // CLI exit ≠ 0 = fallo rotundo. Registramos metric ceros + reason y seguimos (para no abortar el plan entero).
        const metrics: SfuRunMetrics = {
          publishLatencyP95Ms: 0,
          subscribeLatencyP95Ms: 0,
          packetLossRatio: 1,
          involuntaryReconnects: 0,
          connectedPeers: 0,
          expectedPeers: scenario.publishers + scenario.subscribers,
          sustainedLostQuality: 0,
        };
        verdicts.push({
          scenarioName: scenario.name,
          pass: false,
          reasons: [`cli_exit_${output.exitCode}`, 'stderr: ' + output.stderr.slice(0, 200)],
          metrics,
        });
        continue;
      }

      const expectedPeers = scenario.publishers + scenario.subscribers;
      const metrics = parseLkLoadTestOutput(output.stdout, expectedPeers);
      const verdict = evaluateSfuRun(scenario.name, metrics, this.slos);
      verdicts.push(verdict);
      console.log(`[sfu-stress] ${scenario.name}: ${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.reasons.join(', ') || 'all slos met'}`);

      // Si falla un tier, no tiene sentido escalar — abortamos ramp-up.
      if (!verdict.pass) {
        console.warn(`[sfu-stress] aborting ramp-up at ${scenario.name} — SLO violation`);
        break;
      }
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      planRoom: plan.baseRoomName,
      verdicts,
      overallPass: verdicts.length > 0 && verdicts.every(v => v.pass),
    };
  }
}
