/**
 * @module space3d/hooks/useOrbitDprRegression
 *
 * Sketchfab-style movement regression: cuando el usuario interactúa con
 * `OrbitControls` (drag / wheel / pinch), bajamos temporalmente el DPR al
 * mínimo para que el render procese ~40% menos pixeles durante el pan,
 * liberando GPU. Al soltar, restauramos el DPR original con debounce 200ms
 * para evitar flicker en drags rápidos consecutivos.
 *
 * Adicionalmente expone un `userInteractionTimestampRef` que actualiza en
 * cada `start`/`end` — `CameraFollow` lo consume para auto-return al
 * framing isométrico tras `ZOOM_RETURN_IDLE_MS` de inactividad.
 *
 * Extraído de `Scene3D.tsx` (deuda ITEM 15 P1-07 — god-component 1464 LOC).
 *
 * Clean Architecture — Presentation hook puro. No accede a Domain ni a
 * Infrastructure: solo coordina refs locales + callbacks para
 * `<OrbitControls onStart/onEnd>`. Side-effect único: cleanup del timeout
 * al unmount.
 *
 * Refs:
 *  - https://r3f.docs.pmnd.rs/advanced/scaling-performance
 *    *"Movement regression (like Sketchfab) appears preferred: detect user
 *     interaction via controls and call regress(), automatically scaling
 *     quality during movement."*
 *  - https://drei.docs.pmnd.rs/controls/orbit-controls (props `onStart` / `onEnd`)
 */

import React, { useCallback, useEffect, useRef } from 'react';

export interface UseOrbitDprRegressionParams {
  /** DPR actual del Canvas; cuando el modo `auto` está activo. */
  adaptiveDpr?: number;
  /** DPR mínimo permitido — destino temporal durante orbit. */
  minDpr?: number;
  /** Setter del DPR (debe controlar el `<Canvas dpr>`). */
  setAdaptiveDpr?: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseOrbitDprRegressionReturn {
  /** Callback para `<OrbitControls onStart>`. */
  handleOrbitStart: () => void;
  /** Callback para `<OrbitControls onEnd>`. */
  handleOrbitEnd: () => void;
  /**
   * Timestamp (ms) de la última interacción manual con OrbitControls. Lo
   * actualizan los handlers en `start` y `end`. Consumido por `CameraFollow`
   * para gatear el auto-return al framing default tras zoom idle.
   */
  userInteractionTimestampRef: React.MutableRefObject<number>;
}

export function useOrbitDprRegression(
  params: UseOrbitDprRegressionParams,
): UseOrbitDprRegressionReturn {
  const { adaptiveDpr, minDpr, setAdaptiveDpr } = params;

  const orbitDprBaseRef = useRef<number | null>(null);
  const orbitRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp de la última interacción manual con la cámara. CameraFollow lo
  // consume para disparar auto-return al framing default tras
  // ZOOM_RETURN_IDLE_MS de inactividad (ver CameraFramingPolicy).
  const userInteractionTimestampRef = useRef<number>(0);

  const handleOrbitStart = useCallback(() => {
    userInteractionTimestampRef.current = Date.now();
    if (!setAdaptiveDpr || adaptiveDpr === undefined || minDpr === undefined) return;
    if (orbitRestoreTimeoutRef.current) {
      clearTimeout(orbitRestoreTimeoutRef.current);
      orbitRestoreTimeoutRef.current = null;
    }
    // Guarda el baseline solo la primera vez de un drag (no pisar con
    // minDpr si ya estaba en regression de un drag anterior muy reciente).
    if (orbitDprBaseRef.current === null) {
      orbitDprBaseRef.current = adaptiveDpr;
    }
    setAdaptiveDpr(minDpr);
  }, [adaptiveDpr, minDpr, setAdaptiveDpr]);

  const handleOrbitEnd = useCallback(() => {
    // Resetea el timestamp al MOMENTO del soltar — el idle timer empieza a
    // contar desde aquí, no desde el inicio del drag.
    userInteractionTimestampRef.current = Date.now();
    if (!setAdaptiveDpr) return;
    if (orbitRestoreTimeoutRef.current) clearTimeout(orbitRestoreTimeoutRef.current);
    orbitRestoreTimeoutRef.current = setTimeout(() => {
      const base = orbitDprBaseRef.current;
      if (base !== null) {
        setAdaptiveDpr(base);
        orbitDprBaseRef.current = null;
      }
      orbitRestoreTimeoutRef.current = null;
    }, 200);
  }, [setAdaptiveDpr]);

  // Cleanup timeout on unmount para evitar callback zombie después del unmount.
  useEffect(() => {
    return () => {
      if (orbitRestoreTimeoutRef.current) clearTimeout(orbitRestoreTimeoutRef.current);
    };
  }, []);

  return { handleOrbitStart, handleOrbitEnd, userInteractionTimestampRef };
}
