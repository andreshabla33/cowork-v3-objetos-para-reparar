/**
 * Region Detector — Latency Probe
 * ================================
 * Mide latencia a múltiples regiones de LiveKit Cloud y elige la mejor.
 * Usa navegación timing (fetch HEAD) para estimar RTT.
 *
 * Regiones soportadas por LiveKit Cloud:
 *   us-east-1, us-west-2, eu-west-1, eu-central-1,
 *   ap-southeast-1, ap-northeast-1, sa-east-1, ap-south-1
 *
 * Resultado se cachea en sessionStorage para evitar probes repetidos.
 */

export interface RegionProbeResult {
  region: string;
  latencyMs: number;
  label: string;
}

export interface RegionDetectionResult {
  bestRegion: string;
  bestLatencyMs: number;
  allResults: RegionProbeResult[];
  detectedAt: number;
}

const LIVEKIT_REGIONS: { region: string; label: string; probeUrl: string }[] = [
  { region: 'us-east-1', label: 'US East (Virginia)', probeUrl: 'https://us-east-1.livekit.cloud' },
  { region: 'us-west-2', label: 'US West (Oregon)', probeUrl: 'https://us-west-2.livekit.cloud' },
  { region: 'eu-west-1', label: 'EU West (Ireland)', probeUrl: 'https://eu-west-1.livekit.cloud' },
  { region: 'eu-central-1', label: 'EU Central (Frankfurt)', probeUrl: 'https://eu-central-1.livekit.cloud' },
  { region: 'ap-southeast-1', label: 'Asia Pacific (Singapore)', probeUrl: 'https://ap-southeast-1.livekit.cloud' },
  { region: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)', probeUrl: 'https://ap-northeast-1.livekit.cloud' },
  { region: 'ap-south-1', label: 'Asia Pacific (Mumbai)', probeUrl: 'https://ap-south-1.livekit.cloud' },
  { region: 'sa-east-1', label: 'South America (São Paulo)', probeUrl: 'https://sa-east-1.livekit.cloud' },
];

const CACHE_KEY = 'cowork_region_detection';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const PROBE_TIMEOUT_MS = 5000;
const PROBE_SAMPLES = 2;

/**
 * Umbral de latencia aceptable para una región "healthy". Si la MEJOR
 * región probada supera esto, el resultado es sospechoso — probablemente
 * congestion de red local en el cliente dio mediciones falsas altas, y la
 * región elegida puede estar muy lejos geográficamente. Fallback a lista
 * basada en timezone del browser.
 *
 * 350ms es el umbral razonable (audio Opus soporta hasta ~250-300ms RTT
 * con calidad decente; arriba de 400ms = jitter audible).
 * Refs:
 *   - https://docs.livekit.io/home/cloud/architecture/
 *   - https://datatracker.ietf.org/doc/html/rfc6716 (Opus codec, latency)
 */
const UNHEALTHY_LATENCY_THRESHOLD_MS = 350;

/**
 * Mapeo timezone → candidatos de región geográficamente razonables.
 * Si probe falla o devuelve latencias altas (ruteo ISP malo), usar el
 * primer candidato como fallback confiable.
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions
 */
function getRegionCandidatesByTimezone(): string[] {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('America/')) {
      // LATAM, US, CA → us-east-1 es óptimo típicamente
      return ['us-east-1', 'us-west-2', 'sa-east-1'];
    }
    if (tz.startsWith('Europe/') || tz.startsWith('Africa/')) {
      return ['eu-west-1', 'eu-central-1'];
    }
    if (tz.startsWith('Asia/')) {
      return ['ap-southeast-1', 'ap-northeast-1', 'ap-south-1'];
    }
    if (tz.startsWith('Australia/') || tz.startsWith('Pacific/')) {
      return ['ap-southeast-1', 'us-west-2'];
    }
  } catch {
    // Intl no disponible o restringido
  }
  return [];
}

async function probeLatency(url: string, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const start = performance.now();
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    const elapsed = performance.now() - start;
    return Math.round(elapsed);
  } catch {
    return Infinity;
  } finally {
    clearTimeout(timer);
  }
}

async function probeRegion(region: typeof LIVEKIT_REGIONS[number]): Promise<RegionProbeResult> {
  const samples: number[] = [];
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    const latency = await probeLatency(region.probeUrl, PROBE_TIMEOUT_MS);
    if (latency !== Infinity) samples.push(latency);
  }

  const avgLatency = samples.length > 0
    ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
    : Infinity;

  return { region: region.region, latencyMs: avgLatency, label: region.label };
}

function getCachedResult(): RegionDetectionResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as RegionDetectionResult;
    if (Date.now() - cached.detectedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheResult(result: RegionDetectionResult): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // sessionStorage no disponible
  }
}

/**
 * Detecta la región de LiveKit con menor latencia.
 * Cachea el resultado en sessionStorage por 30 min.
 */
export async function detectBestRegion(): Promise<RegionDetectionResult> {
  const cached = getCachedResult();
  if (cached) {
    console.log(`🌐 [Region] Usando caché: ${cached.bestRegion} (${cached.bestLatencyMs}ms)`);
    return cached;
  }

  console.log('🌐 [Region] Midiendo latencia a regiones LiveKit...');
  const allResults = await Promise.all(LIVEKIT_REGIONS.map(probeRegion));

  const sorted = [...allResults].sort((a, b) => a.latencyMs - b.latencyMs);
  let best = sorted[0];

  // Sanity check (fix 2026-04-23 post-test-12users): si la mejor región
  // probada supera UNHEALTHY_LATENCY_THRESHOLD_MS, el probe sufrió
  // congestion de red local — las mediciones son relativamente inútiles
  // (todas las regiones parecen malas). Forzar candidato geográfico según
  // timezone del browser en ese caso. Observado en log test PC:
  // ap-southeast-1=407ms aunque us-east-1 hubiera sido ~150ms.
  if (best.latencyMs > UNHEALTHY_LATENCY_THRESHOLD_MS) {
    const tzCandidates = getRegionCandidatesByTimezone();
    if (tzCandidates.length > 0) {
      // Re-rank: entre los candidatos geográficos, elegir el MENOR de ellos.
      const candidateResults = sorted.filter((r) => tzCandidates.includes(r.region));
      if (candidateResults.length > 0) {
        const geoOverride = candidateResults[0];
        console.warn(`🌐 [Region] Probe saludable=false (mejor ${best.region}=${best.latencyMs}ms > ${UNHEALTHY_LATENCY_THRESHOLD_MS}ms). Override a región geográfica: ${geoOverride.region} (${geoOverride.latencyMs}ms)`);
        best = geoOverride;
      }
    }
  }

  const result: RegionDetectionResult = {
    bestRegion: best.region,
    bestLatencyMs: best.latencyMs,
    allResults: sorted,
    detectedAt: Date.now(),
  };

  cacheResult(result);

  console.log(`🌐 [Region] Mejor: ${best.region} (${best.latencyMs}ms) | Top 3:`, sorted.slice(0, 3).map(r => `${r.region}=${r.latencyMs}ms`).join(', '));

  return result;
}

/**
 * Devuelve la región cacheada (sync) o null si no hay.
 */
export function getCachedRegion(): string | null {
  const cached = getCachedResult();
  return cached?.bestRegion ?? null;
}

/**
 * Fuerza re-detección limpiando el caché.
 */
export function invalidateRegionCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // noop
  }
}
