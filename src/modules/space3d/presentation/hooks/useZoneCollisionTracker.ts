/**
 * @module space3d/hooks/useZoneCollisionTracker
 *
 * Trackea la zona actual del avatar (`zonaColisionRef`) y notifica al
 * padre vía `onZoneCollision(zonaId | null)` solo cuando hay cambio
 * (edge-triggered, no level). Filtra Rapier callbacks redundantes
 * (mismo zonaId entra/sale múltiples frames por jitter del simulator).
 *
 * Extraído de `Scene3D.tsx` (ITEM 15 P1-07).
 */

import { useCallback, useRef } from 'react';

export interface UseZoneCollisionTrackerParams {
  onZoneCollision?: (zonaId: string | null) => void;
}

export interface UseZoneCollisionTrackerReturn {
  handleZoneEnter: (payload: any) => void;
  handleZoneExit: (payload: any) => void;
}

const extractZonaId = (payload: any): string | null =>
  payload?.other?.rigidBodyObject?.userData?.zonaId
  ?? payload?.other?.colliderObject?.userData?.zonaId
  ?? null;

export function useZoneCollisionTracker(
  params: UseZoneCollisionTrackerParams,
): UseZoneCollisionTrackerReturn {
  const { onZoneCollision } = params;
  const zonaColisionRef = useRef<string | null>(null);

  const handleZoneEnter = useCallback((payload: any) => {
    const zonaId = extractZonaId(payload);
    if (!zonaId || zonaColisionRef.current === zonaId) return;
    zonaColisionRef.current = zonaId;
    onZoneCollision?.(zonaId);
  }, [onZoneCollision]);

  const handleZoneExit = useCallback((payload: any) => {
    const zonaId = extractZonaId(payload);
    if (!zonaId || zonaColisionRef.current !== zonaId) return;
    zonaColisionRef.current = null;
    onZoneCollision?.(null);
  }, [onZoneCollision]);

  return { handleZoneEnter, handleZoneExit };
}
