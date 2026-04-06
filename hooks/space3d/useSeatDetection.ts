/**
 * useSeatDetection — encapsulates the 1-second seat proximity detection
 * interval that was previously inline in Player3D.
 *
 * Extracted to reduce Player3D complexity and allow independent testing.
 */
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { AnimationState } from '@/components/avatar3d/shared';
import { resolverAsientoUsuario, type AsientoRuntime3D } from '@/components/space3d/asientosRuntime';
import { ANIMATION_SIT_DOWN_DURATION } from '@/components/space3d/shared';

export interface UseSeatDetectionParams {
  animationStateRef: React.MutableRefObject<AnimationState>;
  contextualAnim: AnimationState | null;
  positionRef: React.MutableRefObject<{ x: number; z: number }>;
  asientosRef: React.MutableRefObject<AsientoRuntime3D[]>;
  seatCaptureCooldownSeatIdRef: React.MutableRefObject<string | null>;
  seatCaptureCooldownUntilRef: React.MutableRefObject<number>;
  seatApproachDurationMsRef: React.MutableRefObject<number>;
  seatTransitionTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  asientoOcupadoPorOtroUsuario: (asiento: AsientoRuntime3D) => boolean;
  reservarAsientoPersistente: (asiento: AsientoRuntime3D) => Promise<boolean>;
  logSitDebug: (fase: string, payload: Record<string, unknown>) => void;
  setSeatRuntime: (updater: (prev: AsientoRuntime3D | null) => AsientoRuntime3D | null) => void;
  setContextualAnim: (anim: AnimationState | null) => void;
  obtenerOffsetVerticalSentado: (asiento: AsientoRuntime3D | null) => number;
}

export function useSeatDetection(params: UseSeatDetectionParams) {
  const {
    animationStateRef,
    contextualAnim,
    positionRef,
    asientosRef,
    seatCaptureCooldownSeatIdRef,
    seatCaptureCooldownUntilRef,
    seatApproachDurationMsRef,
    seatTransitionTimerRef,
    asientoOcupadoPorOtroUsuario,
    reservarAsientoPersistente,
    logSitDebug,
    setSeatRuntime,
    setContextualAnim,
    obtenerOffsetVerticalSentado,
  } = params;

  // Shadow contextualAnim into a ref so the interval callback never goes stale
  const contextualAnimRef = useRef<AnimationState | null>(null);
  useEffect(() => { contextualAnimRef.current = contextualAnim; }, [contextualAnim]);

  const sitCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sitCheckRef.current) clearInterval(sitCheckRef.current);
    sitCheckRef.current = setInterval(() => {
      void (async () => {
        if (animationStateRef.current !== 'idle' || contextualAnimRef.current) return;
        const px = positionRef.current?.x;
        const pz = positionRef.current?.z;
        if (px == null || pz == null) return;

        const asientoDetectado = resolverAsientoUsuario({ x: px, z: pz }, null, asientosRef.current);
        if (!asientoDetectado) return;
        if (asientoOcupadoPorOtroUsuario(asientoDetectado)) return;
        if (
          seatCaptureCooldownSeatIdRef.current === asientoDetectado.id &&
          performance.now() < seatCaptureCooldownUntilRef.current
        ) {
          logSitDebug('captura_bloqueada_cooldown', {
            asientoId: asientoDetectado.id,
            restanteMs: Math.round(seatCaptureCooldownUntilRef.current - performance.now()),
          });
          return;
        }

        const distanciaAlAsiento = Math.hypot(
          asientoDetectado.posicion.x - positionRef.current.x,
          asientoDetectado.posicion.z - positionRef.current.z,
        );

        if (distanciaAlAsiento > asientoDetectado.radioCaptura) {
          logSitDebug('captura_omitida', {
            asientoId: asientoDetectado.id,
            distancia: Number(distanciaAlAsiento.toFixed(3)),
            radioCaptura: Number(asientoDetectado.radioCaptura.toFixed(3)),
            radioActivacion: Number(asientoDetectado.radioActivacion.toFixed(3)),
            rotacion: Number(asientoDetectado.rotacion.toFixed(3)),
          });
          return;
        }

        const reservado = await reservarAsientoPersistente(asientoDetectado);
        if (!reservado) return;

        seatApproachDurationMsRef.current = THREE.MathUtils.clamp(
          Math.round(Math.max(ANIMATION_SIT_DOWN_DURATION, distanciaAlAsiento * 850)),
          ANIMATION_SIT_DOWN_DURATION,
          2000,
        );

        logSitDebug('captura_iniciada', {
          asientoId: asientoDetectado.id,
          distancia: Number(distanciaAlAsiento.toFixed(3)),
          radioCaptura: Number(asientoDetectado.radioCaptura.toFixed(3)),
          posicionAsiento: {
            x: Number(asientoDetectado.posicion.x.toFixed(3)),
            y: Number(asientoDetectado.posicion.y.toFixed(3)),
            z: Number(asientoDetectado.posicion.z.toFixed(3)),
          },
          rotacion: Number(asientoDetectado.rotacion.toFixed(3)),
          duracionMs: seatApproachDurationMsRef.current,
          offsetVerticalEstimado: Number(obtenerOffsetVerticalSentado(asientoDetectado).toFixed(3)),
          perfilAsiento: asientoDetectado.perfil.tipoPerfil,
          aproximacionFrontal: Number(asientoDetectado.perfil.aproximacionFrontal.toFixed(3)),
        });

        setSeatRuntime((prev) => prev?.id === asientoDetectado.id ? prev : asientoDetectado);
        setContextualAnim('sit_down');
        if (seatTransitionTimerRef.current) clearTimeout(seatTransitionTimerRef.current);
        seatTransitionTimerRef.current = setTimeout(() => {
          positionRef.current.x = asientoDetectado.posicion.x;
          positionRef.current.z = asientoDetectado.posicion.z;
          setContextualAnim('sit');
        }, seatApproachDurationMsRef.current);
      })();
    }, 1000);
    return () => {
      if (sitCheckRef.current) clearInterval(sitCheckRef.current);
    };
  }, [asientoOcupadoPorOtroUsuario, reservarAsientoPersistente]);
}
