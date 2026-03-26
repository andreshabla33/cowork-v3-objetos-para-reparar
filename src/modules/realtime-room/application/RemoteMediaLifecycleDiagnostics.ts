export type RemoteMediaLifecycleEvent =
  | 'track_subscribed'
  | 'track_subscription_skipped'
  | 'track_attached'
  | 'track_unsubscribed'
  | 'track_detach_skipped'
  | 'track_detached'
  | 'video_lifecycle_listener_bound'
  | 'video_lifecycle_listener_unbound'
  | 'video_lifecycle_signal'
  | 'video_render_exposed'
  | 'video_render_hidden'
  | 'participant_disconnected'
  | 'remote_cleanup';

export interface RemoteMediaLifecycleDiagnosticsPayload {
  [key: string]: unknown;
}

export interface RemoteMediaLifecycleDiagnosticsOptions {
  enabled?: boolean;
  scope?: string;
}

export class RemoteMediaLifecycleDiagnostics {
  private enabled: boolean;
  private scope: string;

  constructor(options: RemoteMediaLifecycleDiagnosticsOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.scope = options.scope ?? 'RemoteMediaLifecycle';
  }

  log(event: RemoteMediaLifecycleEvent, payload: RemoteMediaLifecycleDiagnosticsPayload = {}): void {
    if (!this.enabled) return;
    console.log(`[${this.scope}] ${event}`, payload);
  }

  warn(event: RemoteMediaLifecycleEvent, payload: RemoteMediaLifecycleDiagnosticsPayload = {}): void {
    if (!this.enabled) return;
    console.warn(`[${this.scope}] ${event}`, payload);
  }
}
