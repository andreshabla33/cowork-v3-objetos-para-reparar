import type { User } from '@/types';
import type { InviteDataPacket, NudgeDataPacket, Unsealed, WaveDataPacket } from '../domain/types';
import type { AccionXP } from '@/lib/gamificacion';

export interface SpaceInteractionCoordinatorState {
  selectedRemoteUser: User | null;
  followTargetId: string | null;
}

export interface SpaceInteractionCoordinatorRuntime {
  resolveUserById: (userId: string) => User | null;
  resolveUserPosition: (userId: string) => { x: number; z: number } | null;
  getCurrentUserContext: () => {
    id: string | null;
    name: string;
    x: number;
    y: number;
    profilePhoto: string | null;
  };
  sendInteraction: (packet: Unsealed<WaveDataPacket> | Unsealed<NudgeDataPacket> | Unsealed<InviteDataPacket>) => void;
  grantXP: (action: AccionXP, cooldownMs?: number) => void;
  setTeleportTarget: (target: { x: number; z: number } | null) => void;
  setMoveTarget: (target: { x: number; z: number } | null) => void;
  hapticFeedback: (type: 'light' | 'medium' | 'heavy') => void;
}

export interface SpaceInteractionCoordinatorOptions {
  onStateChange?: (state: SpaceInteractionCoordinatorState) => void;
}

const DEFAULT_RUNTIME: SpaceInteractionCoordinatorRuntime = {
  resolveUserById: () => null,
  resolveUserPosition: () => null,
  getCurrentUserContext: () => ({
    id: null,
    name: '',
    x: 0,
    y: 0,
    profilePhoto: null,
  }),
  sendInteraction: () => {},
  grantXP: () => {},
  setTeleportTarget: () => {},
  setMoveTarget: () => {},
  hapticFeedback: () => {},
};

export class SpaceInteractionCoordinator {
  private runtime: SpaceInteractionCoordinatorRuntime = DEFAULT_RUNTIME;
  private options: SpaceInteractionCoordinatorOptions;
  private state: SpaceInteractionCoordinatorState = {
    selectedRemoteUser: null,
    followTargetId: null,
  };

  constructor(options: SpaceInteractionCoordinatorOptions = {}) {
    this.options = options;
  }

  setRuntime(runtime: Partial<SpaceInteractionCoordinatorRuntime>): void {
    this.runtime = {
      ...this.runtime,
      ...runtime,
    };
  }

  getState(): SpaceInteractionCoordinatorState {
    return this.state;
  }

  setSelectedRemoteUser(user: User | null): void {
    this.state = {
      ...this.state,
      selectedRemoteUser: user,
    };
    this.emitState();
  }

  setFollowTargetId(userId: string | null): void {
    this.state = {
      ...this.state,
      followTargetId: userId,
    };
    this.emitState();
  }

  handleClickRemoteAvatar(userId: string): void {
    const user = this.runtime.resolveUserById(userId);
    if (!user) return;

    this.state = {
      ...this.state,
      selectedRemoteUser: this.state.selectedRemoteUser?.id === userId ? null : user,
    };
    this.runtime.hapticFeedback('light');
    this.emitState();
  }

  handleGoToUser(userId: string): void {
    const ecsData = this.runtime.resolveUserPosition(userId);
    if (ecsData) {
      this.runtime.setMoveTarget(null);
      this.runtime.setTeleportTarget({ x: ecsData.x * 16, z: ecsData.z * 16 });
      this.runtime.hapticFeedback('medium');
    }

    this.clearSelection();
  }

  handleWaveUser(userId: string): void {
    const currentUser = this.runtime.getCurrentUserContext();
    this.runtime.sendInteraction({
      type: 'wave',
      payload: {
        from: currentUser.id ?? '',
        fromName: currentUser.name,
        to: userId,
      },
    });
    this.runtime.grantXP('interaccion_social', 15000);
    this.runtime.hapticFeedback('medium');
    this.clearSelection();
  }

  handleNudgeUser(userId: string): void {
    const currentUser = this.runtime.getCurrentUserContext();
    this.runtime.sendInteraction({
      type: 'nudge',
      payload: {
        from: currentUser.id ?? '',
        fromName: currentUser.name,
        to: userId,
      },
    });
    this.runtime.grantXP('interaccion_social', 15000);
    this.runtime.hapticFeedback('heavy');
    this.clearSelection();
  }

  handleInviteUser(userId: string): void {
    const currentUser = this.runtime.getCurrentUserContext();
    this.runtime.sendInteraction({
      type: 'invite',
      payload: {
        from: currentUser.id ?? '',
        fromName: currentUser.name,
        to: userId,
        x: currentUser.x,
        y: currentUser.y,
      },
    });
    this.runtime.grantXP('interaccion_social', 15000);
    this.runtime.hapticFeedback('medium');
    this.clearSelection();
  }

  handleFollowUser(userId: string): void {
    this.state = {
      ...this.state,
      followTargetId: this.state.followTargetId === userId ? null : userId,
      selectedRemoteUser: null,
    };
    this.runtime.hapticFeedback('medium');
    this.emitState();
  }

  handleAcceptInvite(): void {
    this.runtime.hapticFeedback('medium');
  }

  private clearSelection(): void {
    this.state = {
      ...this.state,
      selectedRemoteUser: null,
    };
    this.emitState();
  }

  private emitState(): void {
    this.options.onStateChange?.(this.state);
  }
}
