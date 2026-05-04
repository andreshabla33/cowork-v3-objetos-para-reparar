/**
 * @module tests/stress/fase2-sfu/infrastructure/LkCliAdapter
 *
 * Implementa ILkLoadTestAdapter via `child_process.spawn` del livekit-cli.
 *
 * Binario oficial: https://github.com/livekit/livekit-cli
 * Subcomando: `lk load-test`
 *
 * Clean Architecture: Infrastructure — depende de Node APIs concretas.
 */

import { spawn } from 'node:child_process';
import type { LoadTestScenario } from '../domain/LoadTestScenario';
import type { ILkLoadTestAdapter } from '../application/LoadTestRunner';

export interface LkCliCredentials {
  readonly url: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  /** Binario — default `lk` (homebrew) o `livekit-cli` legacy. */
  readonly binary?: string;
}

export class LkCliAdapter implements ILkLoadTestAdapter {
  constructor(private readonly creds: LkCliCredentials) {}

  async run(scenario: LoadTestScenario): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const binary = this.creds.binary ?? 'lk';
    // Args alineados con lk CLI v2.13+ — publishers separado por video/audio,
    // resolution como string ("high"|"medium"|"low").
    // Ref: lk load-test --help
    const resolutionMap: Record<string, string> = {
      '360p': 'low', '720p': 'medium', '1080p': 'high',
      low: 'low', medium: 'medium', high: 'high',
    };
    const args = [
      'load-test',
      '--url', this.creds.url,
      '--api-key', this.creds.apiKey,
      '--api-secret', this.creds.apiSecret,
      '--room', scenario.roomName,
      '--video-publishers', String(scenario.publishers),
      '--audio-publishers', String(scenario.publishers),
      '--subscribers', String(scenario.subscribers),
      '--duration', `${scenario.durationSeconds}s`,
      '--video-resolution', resolutionMap[scenario.videoResolution] ?? 'medium',
      ...(scenario.videoCodec === 'vp8' || scenario.videoCodec === 'h264'
        ? ['--video-codec', scenario.videoCodec]
        : []),
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (err) => {
        // ENOENT = binary no instalado. Mensaje accionable.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(
            `livekit-cli not found on PATH. Install con: brew install livekit-cli  |  ` +
            `curl -sSL https://get.livekit.io/cli | bash`,
          ));
        } else {
          reject(err);
        }
      });
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }
}
