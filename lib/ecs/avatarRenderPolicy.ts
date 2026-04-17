export interface AvatarRenderPolicyInput {
  graphicsQuality?: string;
  avatarCount?: number;
  documentVisible?: boolean;
}

/**
 * Resuelve la calidad gráfica efectiva para el LOD policy clampando el ajuste
 * del usuario por las capabilities del GPU detectado.
 *
 * Regla:
 *   - gpuTier 0 (sin aceleración) → force 'low' siempre.
 *   - gpuTier 1 (WebGL1 o GPU integrada débil) → máximo 'low'.
 *   - gpuTier 2 (WebGL2 + GPU integrada potente) → máximo 'medium'.
 *   - gpuTier 3 (WebGPU + dedicated) → respeta userQuality tal cual.
 *
 * Motivación: antes del fix, un user en Intel UHD con graphicsQuality='high'
 * por defecto entraba al policy 'high' (lodNear=12, lodMid=30, shadow=12m),
 * con 100 avatares = 30-40 renderizados high tier → 500+ useFrame hooks y
 * freezes en frames >33ms. Este clamp garantiza que el hardware bajo corre
 * como máximo 'low' sin importar el setting del usuario (que puede estar
 * persistido de un dispositivo anterior).
 *
 * El usuario puede seguir subiendo el setting en su UI, pero el policy
 * respetado por el runtime es el efectivo resultante del clamp.
 */
export function resolveEffectiveGraphicsQuality(
  userQuality: string | undefined,
  gpuTier: number | undefined,
): 'low' | 'medium' | 'high' {
  const normalized = (userQuality as 'low' | 'medium' | 'high' | undefined) ?? 'medium';

  if (gpuTier === undefined || gpuTier === null) return normalized;
  if (gpuTier <= 1) return 'low';
  if (gpuTier === 2 && normalized === 'high') return 'medium';
  return normalized;
}

export interface AvatarRenderPolicy {
  lodNear: number;
  lodMid: number;
  cullDistance: number;
  shadowDistance: number;
  nearAnimFps: number;
  midAnimFps: number;
  farAnimFps: number;
  fullAvatarBudget: number;
  crowdFallbackDistance: number;
}

export function resolveAvatarRenderPolicy(input: AvatarRenderPolicyInput = {}): AvatarRenderPolicy {
  const quality = input.graphicsQuality ?? 'medium';
  const avatarCount = input.avatarCount ?? 0;

  const policy: AvatarRenderPolicy = quality === 'low'
    ? {
        lodNear: 8,
        lodMid: 18,
        cullDistance: 50,
        shadowDistance: 0,
        nearAnimFps: 24,
        midAnimFps: 16,
        farAnimFps: 10,
        fullAvatarBudget: 14,
        crowdFallbackDistance: 8,
      }
    : quality === 'high'
      ? {
          lodNear: 12,
          lodMid: 30,
          cullDistance: 80,
          shadowDistance: 12,
          nearAnimFps: 60,
          midAnimFps: 30,
          farAnimFps: 15,
          fullAvatarBudget: 38,
          crowdFallbackDistance: 15,
        }
      : {
          lodNear: 10,
          lodMid: 24,
          cullDistance: 65,
          shadowDistance: 8,
          nearAnimFps: 45,
          midAnimFps: 24,
          farAnimFps: 12,
          fullAvatarBudget: 26,
          crowdFallbackDistance: 12,
        };

  if (avatarCount >= 60) {
    policy.lodNear = Math.max(6, policy.lodNear - 2);
    policy.lodMid = Math.max(policy.lodNear + 6, policy.lodMid - 6);
    policy.cullDistance = Math.max(38, policy.cullDistance - 10);
    policy.shadowDistance = Math.max(0, policy.shadowDistance - 3);
    policy.nearAnimFps = Math.min(policy.nearAnimFps, 30);
    policy.midAnimFps = Math.min(policy.midAnimFps, 18);
    policy.farAnimFps = Math.min(policy.farAnimFps, 10);
    policy.fullAvatarBudget = Math.max(10, Math.floor(policy.fullAvatarBudget * 0.75));
    policy.crowdFallbackDistance = Math.max(7, policy.crowdFallbackDistance - 2);
  }

  if (avatarCount >= 100) {
    policy.lodNear = Math.max(5, policy.lodNear - 1);
    policy.lodMid = Math.max(policy.lodNear + 5, policy.lodMid - 4);
    policy.cullDistance = Math.max(32, policy.cullDistance - 8);
    policy.shadowDistance = 0;
    policy.nearAnimFps = Math.min(policy.nearAnimFps, 24);
    policy.midAnimFps = Math.min(policy.midAnimFps, 14);
    policy.farAnimFps = Math.min(policy.farAnimFps, 8);
    policy.fullAvatarBudget = Math.max(8, Math.floor(policy.fullAvatarBudget * 0.8));
    policy.crowdFallbackDistance = Math.max(6, policy.crowdFallbackDistance - 1);
  }

  if (input.documentVisible === false) {
    policy.fullAvatarBudget = 0;
  }

  return policy;
}