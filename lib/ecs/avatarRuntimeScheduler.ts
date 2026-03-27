export interface AvatarRuntimePolicyInput {
  avatarCount: number;
  graphicsQuality?: string;
  documentVisible?: boolean;
}

export interface AvatarRuntimePolicy {
  updateIntervalMs: number;
  cullingEveryTicks: number;
  animationEveryTicks: number;
}

export interface AvatarRuntimeDecision {
  runMovement: boolean;
  runSpatialIndex: boolean;
  runCulling: boolean;
  runAnimation: boolean;
  runRenderCommit: boolean;
}

export function resolveAvatarRuntimePolicy(input: AvatarRuntimePolicyInput): AvatarRuntimePolicy {
  const avatarCount = Math.max(0, input.avatarCount || 0);
  const quality = (input.graphicsQuality ?? 'high').toLowerCase();

  if (input.documentVisible === false) {
    return {
      updateIntervalMs: 200,
      cullingEveryTicks: 1,
      animationEveryTicks: 2,
    };
  }

  let updateIntervalMs = 16;
  let cullingEveryTicks = 1;
  let animationEveryTicks = 1;

  if (avatarCount > 180) {
    updateIntervalMs = 50;
    cullingEveryTicks = 2;
    animationEveryTicks = 2;
  } else if (avatarCount > 100) {
    updateIntervalMs = 33;
    cullingEveryTicks = 2;
    animationEveryTicks = 2;
  } else if (avatarCount > 60) {
    updateIntervalMs = 22;
    cullingEveryTicks = 1;
    animationEveryTicks = 1;
  }

  if (quality === 'low') {
    updateIntervalMs += 6;
    cullingEveryTicks = Math.max(cullingEveryTicks, 2);
    animationEveryTicks = Math.max(animationEveryTicks, 2);
  }

  return {
    updateIntervalMs,
    cullingEveryTicks,
    animationEveryTicks,
  };
}

export class AvatarRuntimeScheduler {
  private accumulatedMs = 0;
  private tickCount = 0;

  next(deltaSeconds: number, policy: AvatarRuntimePolicy): AvatarRuntimeDecision {
    this.accumulatedMs += Math.max(0, deltaSeconds * 1000);
    if (this.accumulatedMs < policy.updateIntervalMs) {
      return {
        runMovement: false,
        runSpatialIndex: false,
        runCulling: false,
        runAnimation: false,
        runRenderCommit: false,
      };
    }

    this.accumulatedMs = this.accumulatedMs % policy.updateIntervalMs;
    this.tickCount += 1;

    const runCulling = this.tickCount % Math.max(policy.cullingEveryTicks, 1) === 0;
    const runAnimation = this.tickCount % Math.max(policy.animationEveryTicks, 1) === 0;

    return {
      runMovement: true,
      runSpatialIndex: true,
      runCulling,
      runAnimation,
      runRenderCommit: true,
    };
  }

  reset(): void {
    this.accumulatedMs = 0;
    this.tickCount = 0;
  }
}
