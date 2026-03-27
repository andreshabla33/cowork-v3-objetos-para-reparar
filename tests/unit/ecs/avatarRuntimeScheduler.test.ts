import { describe, expect, it } from 'vitest';
import {
  AvatarRuntimeScheduler,
  resolveAvatarRuntimePolicy,
} from '../../../lib/ecs/avatarRuntimeScheduler';

describe('avatarRuntimeScheduler', () => {
  it('resolves aggressive policy when avatar count is high', () => {
    const policy = resolveAvatarRuntimePolicy({
      avatarCount: 220,
      graphicsQuality: 'medium',
      documentVisible: true,
    });

    expect(policy.updateIntervalMs).toBeGreaterThanOrEqual(50);
    expect(policy.cullingEveryTicks).toBeGreaterThanOrEqual(2);
    expect(policy.animationEveryTicks).toBeGreaterThanOrEqual(2);
  });

  it('resolves throttled policy when document is hidden', () => {
    const policy = resolveAvatarRuntimePolicy({
      avatarCount: 20,
      graphicsQuality: 'high',
      documentVisible: false,
    });

    expect(policy.updateIntervalMs).toBe(200);
    expect(policy.cullingEveryTicks).toBe(1);
    expect(policy.animationEveryTicks).toBe(2);
  });

  it('schedules work only after reaching update interval', () => {
    const scheduler = new AvatarRuntimeScheduler();
    const policy = resolveAvatarRuntimePolicy({
      avatarCount: 80,
      graphicsQuality: 'high',
      documentVisible: true,
    });

    const first = scheduler.next(0.005, policy);
    const second = scheduler.next(0.020, policy);

    expect(first.runMovement).toBe(false);
    expect(second.runMovement).toBe(true);
    expect(second.runRenderCommit).toBe(true);
  });

  it('alternates culling/animation based on policy cadence', () => {
    const scheduler = new AvatarRuntimeScheduler();
    const policy = {
      updateIntervalMs: 10,
      cullingEveryTicks: 2,
      animationEveryTicks: 3,
    };

    const decisions = [
      scheduler.next(0.011, policy),
      scheduler.next(0.011, policy),
      scheduler.next(0.011, policy),
    ];

    expect(decisions[0].runCulling).toBe(false);
    expect(decisions[1].runCulling).toBe(true);
    expect(decisions[2].runAnimation).toBe(true);
  });
});
