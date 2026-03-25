/**
 * GPU Capabilities Detection
 * ==========================
 * Detecta las capacidades gráficas del dispositivo (WebGPU / WebGL2 / WebGL1)
 * y calcula un "tier" de rendimiento para adaptar automáticamente la calidad.
 *
 * Tier 3 = WebGPU disponible, GPU dedicada o integrada potente
 * Tier 2 = WebGL2 con buenas extensiones
 * Tier 1 = WebGL1 o dispositivo limitado
 * Tier 0 = Sin aceleración por hardware (software renderer)
 */

export interface GpuInfo {
  tier: 0 | 1 | 2 | 3;
  api: 'webgpu' | 'webgl2' | 'webgl1' | 'none';
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  webgpuAvailable: boolean;
  webgl2Available: boolean;
  estimatedVRAM: 'high' | 'medium' | 'low' | 'unknown';
}

export interface AdaptiveRenderConfig {
  shadows: boolean;
  antialias: boolean;
  dpr: number;
  maxDpr: number;
  minDpr: number;
  powerPreference: 'high-performance' | 'default' | 'low-power';
  toneMappingExposure: number;
  maxVideoStreams: number;
}

let cachedInfo: GpuInfo | null = null;

async function detectWebGPU(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

function detectWebGL(): { api: 'webgl2' | 'webgl1' | 'none'; renderer: string; vendor: string; maxTextureSize: number } {
  const canvas = document.createElement('canvas');

  const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  if (gl2) {
    const ext = gl2.getExtension('WEBGL_debug_renderer_info');
    return {
      api: 'webgl2',
      renderer: ext ? gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor: ext ? gl2.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown',
      maxTextureSize: gl2.getParameter(gl2.MAX_TEXTURE_SIZE),
    };
  }

  const gl1 = canvas.getContext('webgl') as WebGLRenderingContext | null;
  if (gl1) {
    const ext = gl1.getExtension('WEBGL_debug_renderer_info');
    return {
      api: 'webgl1',
      renderer: ext ? gl1.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor: ext ? gl1.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown',
      maxTextureSize: gl1.getParameter(gl1.MAX_TEXTURE_SIZE),
    };
  }

  return { api: 'none', renderer: 'none', vendor: 'none', maxTextureSize: 0 };
}

function estimateVRAM(renderer: string): 'high' | 'medium' | 'low' | 'unknown' {
  const r = renderer.toLowerCase();
  // GPU dedicadas conocidas
  if (/rtx|radeon rx|arc a/i.test(r)) return 'high';
  if (/gtx|geforce|radeon(?! hd [234])/i.test(r)) return 'medium';
  // GPU integradas
  if (/intel.*uhd|intel.*iris|apple.*m[1-4]/i.test(r)) return 'medium';
  if (/intel.*hd|mali|adreno|powervr/i.test(r)) return 'low';
  // Software renderers
  if (/swiftshader|llvmpipe|software/i.test(r)) return 'low';
  return 'unknown';
}

function computeTier(webgpu: boolean, api: string, renderer: string, maxTex: number): 0 | 1 | 2 | 3 {
  if (api === 'none') return 0;
  const vram = estimateVRAM(renderer);

  if (webgpu && (vram === 'high' || vram === 'medium')) return 3;
  if (api === 'webgl2' && maxTex >= 8192 && vram !== 'low') return 2;
  if (api === 'webgl2') return 1;
  return 1;
}

export async function detectGpuCapabilities(): Promise<GpuInfo> {
  if (cachedInfo) return cachedInfo;

  const webgpuAvailable = await detectWebGPU();
  const { api, renderer, vendor, maxTextureSize } = detectWebGL();
  const webgl2Available = api === 'webgl2';
  const tier = computeTier(webgpuAvailable, api, renderer, maxTextureSize);

  cachedInfo = {
    tier,
    api: webgpuAvailable ? 'webgpu' : api,
    renderer,
    vendor,
    maxTextureSize,
    webgpuAvailable,
    webgl2Available,
    estimatedVRAM: estimateVRAM(renderer),
  };

  console.log(
    `🖥️ GPU Tier ${tier} | ${cachedInfo.api.toUpperCase()} | ${renderer} | VRAM: ${cachedInfo.estimatedVRAM} | MaxTex: ${maxTextureSize}`
  );

  return cachedInfo;
}

export function getGpuInfoSync(): GpuInfo | null {
  return cachedInfo;
}

export function adaptiveConfigFromTier(
  tier: 0 | 1 | 2 | 3,
  qualityOverride?: string,
  batterySaver?: boolean,
): AdaptiveRenderConfig {
  const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

  if (qualityOverride === 'low' || tier === 0) {
    return {
      shadows: false,
      antialias: false,
      dpr: 1,
      maxDpr: 1,
      minDpr: 1,
      powerPreference: 'low-power',
      toneMappingExposure: 1,
      maxVideoStreams: 4,
    };
  }

  if (qualityOverride === 'medium' || tier === 1) {
    return {
      shadows: false,
      antialias: true,
      dpr: Math.min(deviceDpr, 1.5),
      maxDpr: 1.5,
      minDpr: 0.9,
      powerPreference: batterySaver ? 'low-power' : 'default',
      toneMappingExposure: 1,
      maxVideoStreams: 6,
    };
  }

  if (tier === 2) {
    return {
      shadows: true,
      antialias: true,
      dpr: Math.min(deviceDpr, 2),
      maxDpr: 2,
      minDpr: 1,
      powerPreference: batterySaver ? 'low-power' : 'default',
      toneMappingExposure: 1.1,
      maxVideoStreams: 8,
    };
  }

  // Tier 3 (WebGPU capable)
  return {
    shadows: true,
    antialias: true,
    dpr: deviceDpr,
    maxDpr: deviceDpr,
    minDpr: 1,
    powerPreference: batterySaver ? 'default' : 'high-performance',
    toneMappingExposure: 1.2,
    maxVideoStreams: 12,
  };
}
