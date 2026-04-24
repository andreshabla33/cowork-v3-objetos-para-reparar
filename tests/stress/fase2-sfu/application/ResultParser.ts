/**
 * @module tests/stress/fase2-sfu/application/ResultParser
 *
 * Parser del stdout de `lk load-test`. El CLI imprime un summary al final
 * con estadísticas agregadas. Este módulo convierte ese output a un
 * SfuRunMetrics tipado.
 *
 * Clean Architecture: Application — depende solo de Domain.
 *
 * NOTA: El formato exacto del output depende de la versión del CLI. El
 * parser acepta variaciones y extrae lo que puede. Si la forma del output
 * cambia, solo este archivo se actualiza.
 *
 * Ref output format: https://github.com/livekit/livekit-cli (cmd/load-test)
 */

import type { SfuRunMetrics } from '../domain/SfuSlos';

/** Líneas del summary típico (ej. versión 2.x del CLI):
 *
 *   Summary
 *   -------
 *   Total peers:       50
 *   Connected peers:   50
 *   Publish P95:       87ms
 *   Subscribe P95:     124ms
 *   Packet loss:       0.12%
 *   Reconnects:        0
 */
export function parseLkLoadTestOutput(stdout: string, expectedPeers: number): SfuRunMetrics {
  const lines = stdout.split(/\r?\n/);

  const extractNumber = (keywords: readonly string[]): number | null => {
    for (const line of lines) {
      if (keywords.every(kw => line.toLowerCase().includes(kw.toLowerCase()))) {
        const match = line.match(/([\d.]+)/);
        if (match) return parseFloat(match[1]);
      }
    }
    return null;
  };

  const extractMs = (keywords: readonly string[]): number => {
    const value = extractNumber(keywords);
    return value ?? 0;
  };

  const extractPercent = (keywords: readonly string[]): number => {
    const value = extractNumber(keywords);
    // CLI puede reportar ya sea 0.12 (ratio) o 0.12% (literal) — heurística:
    // si hay un '%' cerca, es percent y se divide a ratio. Si es <1, ratio.
    if (value === null) return 0;
    const hasPercentSign = lines.some(l =>
      keywords.every(kw => l.toLowerCase().includes(kw.toLowerCase())) && l.includes('%'),
    );
    if (hasPercentSign) return value / 100;
    return value > 1 ? value / 100 : value;
  };

  return {
    connectedPeers: extractNumber(['connected', 'peers']) ?? expectedPeers,
    expectedPeers,
    publishLatencyP95Ms: extractMs(['publish', 'p95']),
    subscribeLatencyP95Ms: extractMs(['subscribe', 'p95']),
    packetLossRatio: extractPercent(['packet', 'loss']),
    involuntaryReconnects: extractNumber(['reconnect']) ?? 0,
    sustainedLostQuality: extractNumber(['lost', 'quality']) ?? 0,
  };
}
