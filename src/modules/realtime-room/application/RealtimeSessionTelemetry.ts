import { logger } from '@/lib/logger';

export type RealtimeTelemetryCategory = 'remote_media' | 'subscription_policy' | 'meeting_access' | 'meeting_realtime' | 'meeting_quality' | 'space_realtime';
export type RealtimeTelemetrySeverity = 'info' | 'warn' | 'error';

export interface RealtimeTelemetryEvent {
  timestamp: number;
  category: RealtimeTelemetryCategory;
  name: string;
  severity: RealtimeTelemetrySeverity;
  scope: string;
  sessionKey: string;
  data: Record<string, unknown>;
}

export interface RealtimeTelemetrySnapshot {
  sessionKey: string;
  totalEvents: number;
  latestEventAt: number | null;
  events: RealtimeTelemetryEvent[];
  countsByCategory: Record<string, number>;
  countsByName: Record<string, number>;
  countsBySeverity: Record<string, number>;
}

export interface RealtimeSessionTelemetryOptions {
  enabled?: boolean;
  scope?: string;
  sessionKey: string;
  maxEvents?: number;
}

interface SessionBucket {
  events: RealtimeTelemetryEvent[];
}

declare global {
  interface Window {
    __coworkRealtimeTelemetry__?: Record<string, RealtimeTelemetrySnapshot>;
  }
}

export class RealtimeSessionTelemetry {
  private static buckets = new Map<string, SessionBucket>();
  private enabled: boolean;
  private scope: string;
  private sessionKey: string;
  private maxEvents: number;
  private log = logger.child('realtime-session-telemetry');

  constructor(options: RealtimeSessionTelemetryOptions) {
    this.enabled = options.enabled ?? false;
    this.scope = options.scope ?? 'RealtimeTelemetry';
    this.sessionKey = options.sessionKey;
    this.maxEvents = options.maxEvents ?? 250;

    if (!RealtimeSessionTelemetry.buckets.has(this.sessionKey)) {
      RealtimeSessionTelemetry.buckets.set(this.sessionKey, { events: [] });
    }
  }

  record(input: {
    category: RealtimeTelemetryCategory;
    name: string;
    severity?: RealtimeTelemetrySeverity;
    data?: Record<string, unknown>;
  }): void {
    const bucket = RealtimeSessionTelemetry.buckets.get(this.sessionKey);
    if (!bucket) {
      return;
    }

    const event: RealtimeTelemetryEvent = {
      timestamp: Date.now(),
      category: input.category,
      name: input.name,
      severity: input.severity ?? 'info',
      scope: this.scope,
      sessionKey: this.sessionKey,
      data: input.data ?? {},
    };

    bucket.events.push(event);
    if (bucket.events.length > this.maxEvents) {
      bucket.events.splice(0, bucket.events.length - this.maxEvents);
    }

    this.publishBrowserSnapshot();

    if (!this.enabled) {
      return;
    }

    const eventKey = `${event.category}:${event.name}`;
    if (event.severity === 'error') {
      this.log.error('Realtime telemetry event recorded', {
        event: eventKey,
        scope: this.scope,
        sessionKey: this.sessionKey,
        data: event.data,
      });
      return;
    }
    if (event.severity === 'warn') {
      this.log.warn('Realtime telemetry event recorded', {
        event: eventKey,
        scope: this.scope,
        sessionKey: this.sessionKey,
        data: event.data,
      });
      return;
    }
    this.log.debug('Realtime telemetry event recorded', {
      event: eventKey,
      scope: this.scope,
      sessionKey: this.sessionKey,
      data: event.data,
    });
  }

  getSnapshot(): RealtimeTelemetrySnapshot {
    const bucket = RealtimeSessionTelemetry.buckets.get(this.sessionKey);
    const events = bucket?.events ?? [];
    const countsByCategory: Record<string, number> = {};
    const countsByName: Record<string, number> = {};
    const countsBySeverity: Record<string, number> = {};

    events.forEach((event) => {
      countsByCategory[event.category] = (countsByCategory[event.category] ?? 0) + 1;
      countsByName[event.name] = (countsByName[event.name] ?? 0) + 1;
      countsBySeverity[event.severity] = (countsBySeverity[event.severity] ?? 0) + 1;
    });

    return {
      sessionKey: this.sessionKey,
      totalEvents: events.length,
      latestEventAt: events.length > 0 ? events[events.length - 1].timestamp : null,
      events: [...events],
      countsByCategory,
      countsByName,
      countsBySeverity,
    };
  }

  clear(): void {
    RealtimeSessionTelemetry.buckets.set(this.sessionKey, { events: [] });
    this.publishBrowserSnapshot();
  }

  private publishBrowserSnapshot(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const registry = window.__coworkRealtimeTelemetry__ ?? {};
    registry[this.sessionKey] = this.getSnapshot();
    window.__coworkRealtimeTelemetry__ = registry;
  }
}
