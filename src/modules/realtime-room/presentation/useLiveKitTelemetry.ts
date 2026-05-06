/**
 * @module modules/realtime-room/presentation/useLiveKitTelemetry
 * @description Sub-hook of the P0-03 useLiveKit decomposition: owns the
 * RealtimeSessionTelemetry instance + RemoteMediaLifecycleDiagnostics and
 * exposes the two log-enrichment helpers (`recordTelemetry`,
 * `logRemoteMediaLifecycle`) consumed by the rest of the LiveKit sub-hooks.
 *
 * Single responsibility: instrumentation. No room/track/state side effects.
 *
 * Skills: clean-architecture-refactor + official-docs-alignment.
 * Refs: docs.livekit.io (telemetry surface is internal — no external API).
 */

import { useCallback, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Workspace } from '@/types';
import { RealtimeSessionTelemetry, RemoteMediaLifecycleDiagnostics } from '@/modules/realtime-room';

type TelemetryCategory =
  | 'remote_media'
  | 'subscription_policy'
  | 'meeting_access'
  | 'meeting_realtime'
  | 'meeting_quality'
  | 'space_realtime';
type TelemetrySeverity = 'info' | 'warn' | 'error';
type RemoteMediaEvent = Parameters<RemoteMediaLifecycleDiagnostics['log']>[0];

export interface UseLiveKitTelemetryParams {
  activeWorkspace: Workspace | null;
  session: Session | null;
  livekitRoomNameRef: React.MutableRefObject<string | null>;
}

export interface UseLiveKitTelemetryReturn {
  telemetry: RealtimeSessionTelemetry;
  remoteMediaDiagnosticsRef: React.MutableRefObject<RemoteMediaLifecycleDiagnostics>;
  recordTelemetry: (
    name: string,
    data?: Record<string, unknown>,
    severity?: TelemetrySeverity,
    category?: TelemetryCategory,
  ) => void;
  logRemoteMediaLifecycle: (
    event: RemoteMediaEvent,
    payload?: Record<string, unknown>,
  ) => void;
}

export function useLiveKitTelemetry(params: UseLiveKitTelemetryParams): UseLiveKitTelemetryReturn {
  const { activeWorkspace, session, livekitRoomNameRef } = params;

  const telemetry = useMemo(() => new RealtimeSessionTelemetry({
    enabled: import.meta.env.DEV,
    scope: 'Space3DRealtime',
    sessionKey: `space3d:${activeWorkspace?.id ?? 'no-workspace'}:${session?.user?.id ?? 'anon'}`,
  }), [activeWorkspace?.id, session?.user?.id]);

  const remoteMediaDiagnosticsRef = useRef(
    new RemoteMediaLifecycleDiagnostics({ enabled: import.meta.env.DEV, scope: 'RemoteMediaLifecycle' }),
  );

  const recordTelemetry = useCallback((
    name: string,
    data: Record<string, unknown> = {},
    severity: TelemetrySeverity = 'info',
    category: TelemetryCategory = 'space_realtime',
  ) => {
    telemetry.record({ category, name, severity, data });
  }, [telemetry]);

  const logRemoteMediaLifecycle = useCallback((
    event: RemoteMediaEvent,
    payload: Record<string, unknown> = {},
  ) => {
    const enrichedPayload = { roomName: livekitRoomNameRef.current, ...payload };
    remoteMediaDiagnosticsRef.current.log(event, enrichedPayload);
    recordTelemetry(event, enrichedPayload, 'info', 'remote_media');
  }, [recordTelemetry, livekitRoomNameRef]);

  return { telemetry, remoteMediaDiagnosticsRef, recordTelemetry, logRemoteMediaLifecycle };
}
