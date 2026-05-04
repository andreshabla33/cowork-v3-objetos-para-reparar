/**
 * @module tests/stress/fase2-sfu/application/ResultParser
 *
 * Parser del stdout de `lk load-test` v2.13+.
 *
 * Output real (verificado contra lk v2.13.2 contra LiveKit Cloud):
 *
 *   Track loading:
 *   ┌────────┬───────────────────┬───────┬───────┬───────────┬───────────┐
 *   │ Tester │ Track             │ Kind  │ Pkts. │ Bitrate   │ Pkt. Loss │
 *   ├────────┼───────────────────┼───────┼───────┼───────────┼───────────┤
 *   │ Sub 0  │ TR_AMr7dEAaZfvSoM │ audio │ 1366  │ 20.0kbps  │ 0 (0%)    │
 *   │        │ TR_VCCrjB7TK2NFTY │ video │ 519   │ 116.4kbps │ 0 (0%)    │
 *   │ ...                                                                 │
 *
 *   Subscriber summaries:
 *   ┌────────┬────────┬─────────────────────────┬─────────────────┬───────┐
 *   │ Tester │ Tracks │ Bitrate                 │ Total Pkt. Loss │ Error │
 *   ├────────┼────────┼─────────────────────────┼─────────────────┼───────┤
 *   │ Sub 0  │ 4/4    │ 359.8kbps               │ 0 (0%)          │ -     │
 *   │ Total  │ 20/20  │ 1.8mbps (359.3kbps avg) │ 0 (0%)          │ 0     │
 *
 * IMPORTANTE: lk v2.13 NO expone latencias publish/subscribe ms en stdout.
 * Para latencias hay que usar webrtc-internals o LiveKit Analytics API.
 * Acá usamos solo lo que el CLI sí reporta:
 *   - subscribe success rate (Tracks N/M en summary)
 *   - packet loss agregado (Total Pkt. Loss)
 *   - bitrate total (último row "Total")
 *   - errors count (columna Error en row "Total")
 *
 * Las latencias se reportan como N/A (-1) → SLO eval las ignora si <0.
 *
 * Clean Architecture: Application — depende solo de Domain.
 */

import type { SfuRunMetrics } from '../domain/SfuSlos';

/**
 * Extrae métricas del row "Total" de la tabla "Subscriber summaries".
 * Si no encuentra el row Total, intenta sumar/promediar los rows Sub N.
 */
export function parseLkLoadTestOutput(stdout: string, expectedPeers: number): SfuRunMetrics {
  const lines = stdout.split(/\r?\n/);

  // Connected peers — derivado de "Finished connecting to room" + count de Pub/Sub.
  // Si vemos los rows en summary, contamos.
  const subRowRegex = /^│\s+Sub\s+(\d+)\s+│\s+(\d+)\/(\d+)/;
  const subRows: { tracks: number; expected: number }[] = [];
  for (const line of lines) {
    const m = subRowRegex.exec(line);
    if (m) subRows.push({ tracks: parseInt(m[2], 10), expected: parseInt(m[3], 10) });
  }

  // Total row — es el último, formato: │ Total │ 20/20 │ 1.8mbps (...) │ 0 (0%) │ 0 │
  const totalRegex = /^│\s+Total\s+│\s+(\d+)\/(\d+)\s+│\s+([\d.]+)(kbps|mbps)[^│]*│\s+(\d+)\s+\(([\d.]+)%\)\s+│\s+(\d+)/;
  let totalTracksOk = 0;
  let totalTracksExpected = 0;
  let totalBitrateKbps = 0;
  let totalPacketLoss = 0;
  let totalErrors = 0;

  for (const line of lines) {
    const m = totalRegex.exec(line);
    if (m) {
      totalTracksOk = parseInt(m[1], 10);
      totalTracksExpected = parseInt(m[2], 10);
      totalBitrateKbps = parseFloat(m[3]) * (m[4] === 'mbps' ? 1000 : 1);
      totalPacketLoss = parseFloat(m[6]) / 100;
      totalErrors = parseInt(m[7], 10);
      break;
    }
  }

  // Fallback si no hay Total row — sumamos los Sub rows.
  if (totalTracksExpected === 0 && subRows.length > 0) {
    totalTracksOk = subRows.reduce((p, r) => p + r.tracks, 0);
    totalTracksExpected = subRows.reduce((p, r) => p + r.expected, 0);
  }

  // Connected peers = subscribers que vieron al menos 1 track + publishers (asumimos OK).
  // expectedPeers nos lo pasan como parámetro desde el caller (= total de pub + sub).
  const subscribersConnected = subRows.length;
  const publisherLines = lines.filter((l) => /publishing\s+(audio|simulcast video)\s+track/.test(l));
  // Cada "publishing audio track" + "publishing simulcast video track" es 1 publisher
  // (cada publisher publica 1 audio + 1 video). Deduplicamos por identity (ibbov_pub_N).
  const pubIdentities = new Set<string>();
  for (const l of publisherLines) {
    const m = /-\s+(\S+)$/.exec(l);
    if (m) pubIdentities.add(m[1]);
  }
  const publishersConnected = pubIdentities.size;
  const connectedPeers = subscribersConnected + publishersConnected;

  // Reconnects — buscamos en stdout warnings de reconnect.
  const reconnects = lines.filter((l) =>
    /reconnect|disconnected/i.test(l) && !/finished connecting/i.test(l),
  ).length;

  return {
    connectedPeers,
    expectedPeers,
    publishLatencyP95Ms: -1, // N/A en lk v2.13 stdout
    subscribeLatencyP95Ms: -1, // N/A en lk v2.13 stdout
    packetLossRatio: totalPacketLoss,
    involuntaryReconnects: reconnects + totalErrors,
    sustainedLostQuality: 0, // N/A en stdout
    // Métricas extra v2.13.
    subscribeSuccessRatio: totalTracksExpected === 0 ? 0 : totalTracksOk / totalTracksExpected,
    totalBitrateKbps,
    tracksDelivered: totalTracksOk,
    tracksExpected: totalTracksExpected,
  };
}
