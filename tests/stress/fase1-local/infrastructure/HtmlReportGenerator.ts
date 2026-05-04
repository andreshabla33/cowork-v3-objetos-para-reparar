/**
 * @module tests/stress/fase1-local/infrastructure/HtmlReportGenerator
 *
 * Genera un HTML standalone con gráficos a partir de un StressRunResult + LeakVerdict.
 * Usa Chart.js CDN (no bundler, no build step). Apto para compartir como archivo
 * único o artefacto de CI.
 *
 * Clean Architecture: Infrastructure. Domain (verdict + samples) es input puro.
 * Chart.js ref: https://www.chartjs.org/docs/latest/
 */

import type { StressRunResult, LeakVerdict } from '../domain/LeakDetectionCriteria';
import type { BaselineVerdict } from '../domain/BaselineComparison';

export interface HtmlReportInput {
  readonly profile: string;
  readonly capturedAt: string;
  readonly gitCommit: string | null;
  readonly run: StressRunResult;
  readonly verdict: LeakVerdict;
  readonly baselineComparison?: BaselineVerdict;
  readonly baselineCapturedAt?: string;
}

export class HtmlReportGenerator {
  render(input: HtmlReportInput): string {
    const passEmoji = input.verdict.pass ? '✅' : '❌';
    const baselineSection = input.baselineComparison
      ? this.renderBaselineSection(input.baselineComparison, input.baselineCapturedAt)
      : '<p>Sin baseline comparison (primera corrida o compare-baseline omitido).</p>';

    const samples = input.run.samples;
    const labels = samples.map((_, i) => i);
    const fpsSeries = samples.map((s) => s.fps);
    const heapSeries = samples.map((s) => s.heapUsedMb);
    const geomSeries = samples.map((s) => s.geometriesCount);
    const texSeries = samples.map((s) => s.texturesCount);
    const drawCallsSeries = samples.map((s) => s.drawCalls);

    return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Stress Fase 1 — ${input.profile} — ${passEmoji}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body { font: 13px/1.5 system-ui, -apple-system, sans-serif; margin: 0; background: #0a0a0a; color: #eaeaea; }
  header { padding: 16px 24px; background: #151515; border-bottom: 1px solid #2a2a2a; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .verdict-${input.verdict.pass ? 'pass' : 'fail'} {
    color: ${input.verdict.pass ? '#4ade80' : '#f87171'};
    font-weight: 700;
  }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  section { background: #121212; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 14px; text-transform: uppercase; color: #9ca3af; margin: 0 0 12px; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #2a2a2a; }
  th { color: #9ca3af; font-weight: 600; }
  .regress { color: #f87171; font-weight: 700; }
  .ok { color: #4ade80; }
  code { background: #1f1f1f; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  canvas { max-height: 240px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 768px) { .grid2 { grid-template-columns: 1fr; } }
</style>
</head><body>
<header>
  <h1>Stress Fase 1 — Profile: ${input.profile} <span class="verdict-${input.verdict.pass ? 'pass' : 'fail'}">${passEmoji} ${input.verdict.pass ? 'PASS' : 'FAIL'}</span></h1>
  <div>
    <code>${input.capturedAt}</code>
    ${input.gitCommit ? `· commit <code>${input.gitCommit.slice(0, 8)}</code>` : ''}
    · ${input.run.botsSpawned} bots · ${Math.round(input.run.durationMs / 1000)}s · ${samples.length} samples
  </div>
</header>
<main>

<section>
  <h2>Verdict SLO</h2>
  <table>
    <tr><th>Métrica</th><th>Valor</th></tr>
    <tr><td>FPS P99</td><td>${input.verdict.metrics.fpsP99} ${input.verdict.metrics.p99FallbackApplied ? '<em>(P95 fallback)</em>' : ''}</td></tr>
    <tr><td>FPS P95</td><td>${input.verdict.metrics.fpsP95}</td></tr>
    <tr><td>FPS Median</td><td>${input.verdict.metrics.fpsMedian}</td></tr>
    <tr><td>Heap growth (MB)</td><td>${input.verdict.metrics.heapGrowthMb}</td></tr>
    <tr><td>Monotonic growth</td><td>${input.verdict.metrics.monotonicGrowthDetected ? '<span class="regress">DETECTED</span>' : '<span class="ok">ninguno</span>'}</td></tr>
  </table>
  ${input.verdict.reasons.length ? `<p><strong>Reasons:</strong> <code>${input.verdict.reasons.join(', ')}</code></p>` : ''}
</section>

<section>
  <h2>Baseline comparison</h2>
  ${baselineSection}
</section>

<section>
  <h2>Samples (time series)</h2>
  <div class="grid2">
    <canvas id="fpsChart"></canvas>
    <canvas id="heapChart"></canvas>
    <canvas id="geomChart"></canvas>
    <canvas id="drawChart"></canvas>
  </div>
</section>

</main>
<script>
  const labels = ${JSON.stringify(labels)};
  const datasets = {
    fps:   ${JSON.stringify(fpsSeries)},
    heap:  ${JSON.stringify(heapSeries)},
    geom:  ${JSON.stringify(geomSeries)},
    tex:   ${JSON.stringify(texSeries)},
    draws: ${JSON.stringify(drawCallsSeries)}
  };
  const common = { responsive: true, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { ticks: { color: '#6b7280' }, grid: { color: '#2a2a2a' } }, y: { ticks: { color: '#6b7280' }, grid: { color: '#2a2a2a' } } } };
  new Chart(document.getElementById('fpsChart'), { type: 'line', data: { labels, datasets: [{ label: 'FPS', data: datasets.fps, borderColor: '#4ade80', tension: 0.2 }] }, options: common });
  new Chart(document.getElementById('heapChart'), { type: 'line', data: { labels, datasets: [{ label: 'Heap (MB)', data: datasets.heap, borderColor: '#60a5fa', tension: 0.2 }] }, options: common });
  new Chart(document.getElementById('geomChart'), { type: 'line', data: { labels, datasets: [{ label: 'Geometries', data: datasets.geom, borderColor: '#a78bfa' }, { label: 'Textures', data: datasets.tex, borderColor: '#f472b6' }] }, options: common });
  new Chart(document.getElementById('drawChart'), { type: 'line', data: { labels, datasets: [{ label: 'Draw calls', data: datasets.draws, borderColor: '#fbbf24' }] }, options: common });
</script>
</body></html>`;
  }

  private renderBaselineSection(comp: BaselineVerdict, capturedAt?: string): string {
    const rows = comp.comparisons.map((c) => {
      const statusClass = c.regressed ? 'regress' : 'ok';
      const statusText = c.regressed ? 'REGRES' : 'OK';
      const sign = c.deltaPct >= 0 ? '+' : '';
      return `<tr>
        <td>${c.metric}</td>
        <td>${c.baseline.toFixed(1)}</td>
        <td>${c.current.toFixed(1)}</td>
        <td>${sign}${c.deltaAbsolute.toFixed(2)}</td>
        <td>${sign}${c.deltaPct.toFixed(1)}%</td>
        <td class="${statusClass}">${statusText}</td>
      </tr>`;
    }).join('');
    return `
      <p>${comp.passed ? '<span class="ok">✓ Sin regresión</span>' : `<span class="regress">× ${comp.regressions.length} regresión(es)</span>`} vs baseline ${capturedAt ? `(${capturedAt})` : ''}</p>
      <table>
        <tr><th>Métrica</th><th>Baseline</th><th>Current</th><th>Δ abs</th><th>Δ %</th><th>Estado</th></tr>
        ${rows}
      </table>
    `;
  }
}
