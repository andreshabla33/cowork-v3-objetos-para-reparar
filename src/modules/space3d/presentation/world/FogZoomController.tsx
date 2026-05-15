'use client';
/**
 * @module space3d/world/FogZoomController
 *
 * Ajusta dinámicamente `scene.fog.near/far` según la distancia del OrbitControls
 * (cámara → target). Cuando el avatar hace zoom-out, la niebla se cierra para
 * ocultar el borde del terrain — patrón AAA estándar de Roblox legacy fog y
 * Minecraft `linear` mode (linear fog con near/far driven por camera distance).
 *
 * ## Math
 *
 *   camDist  = controls.getDistance()                        // m
 *   rawRatio = (camDist - minD) / (maxD - minD)              // 0..1 del rango
 *   t        = max(0, (rawRatio - TRIGGER) / (1 - TRIGGER))  // arranca en TRIGGER
 *   target.near = lerp(baseNear, MIN_NEAR_AT_ZOOMOUT, t)
 *   target.far  = lerp(baseFar,  MIN_FAR_AT_ZOOMOUT,  t)
 *   fog.{near|far} = lerp(fog.{near|far}, target.{...}, FOG_LERP)
 *
 *   Invariante CRÍTICA: `near < far`. Si lerp llega a igualarlos, clamp.
 *
 *   El TRIGGER al 50% del rango da:
 *     - Zoom in / mid: fog base (vista clara)
 *     - Zoom > 50%: niebla rolling in progresiva
 *     - Zoom max: niebla cerrada → horizonte tapado
 *
 * ## Performance
 *
 * useFrame canónico: muta `scene.fog.near/far` directamente, NO setState.
 * Zero re-renders. Lee `OrbitControls.minDistance/maxDistance` directamente
 * del ref — sin props extras → el controller se auto-ajusta cuando el modo
 * de cámara cambia los límites (isometric vs drawing vs free).
 *
 * ## Clean Architecture
 *
 * Presentation R3F-side. Cero deps de Domain/Application. Lee:
 *   - `orbitControlsRef` (ya existente en Scene3D, sin re-render).
 *   - `baseNear/baseFar` del scenePolicy (paridad con `<fog args>`).
 * Muta `scene.fog.near/far`. Restaura base cuando controls no monta aún.
 *
 * Refs:
 *   - https://threejs.org/manual/en/fog.html (linear fog patron AAA)
 *   - https://threejs.org/docs/#examples/en/controls/OrbitControls.getDistance
 *   - https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

import React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export interface FogZoomControllerProps {
  /** Ref al OrbitControls activo (compartido con SceneCamera). */
  orbitControlsRef: React.MutableRefObject<OrbitControlsType | null>;
  /** Valor base de `fog.near` (del scenePolicy) — usado en zoom-in / mid. */
  baseNear: number;
  /** Valor base de `fog.far` (del scenePolicy) — usado en zoom-in / mid. */
  baseFar: number;
}

/** Valor de `fog.far` al zoom-out máximo — agresivo para ocluir el borde
 *  del terrain + cubrir el horizonte del sky shader. Valor calibrado para
 *  que el patron AAA "atmósfera unificada al zoom-out" funcione visualmente. */
const MIN_FAR_AT_ZOOMOUT_M = 50;

/** Valor de `fog.near` al zoom-out máximo — niebla arranca cerca de cámara.
 *  Debe ser MENOR que MIN_FAR_AT_ZOOMOUT_M para no invertir la fog math. */
const MIN_NEAR_AT_ZOOMOUT_M = 15;

/** % del rango de zoom (0..1) a partir del cual arranca el cierre de niebla.
 *  0.6 = solo el último 40% del rango. En isometric (5–18 m), 0.6 ≈ 12.8 m
 *  → zoom in/mid totalmente claro, solo el zoom alto cierra fog. */
const ZOOMOUT_TRIGGER_RATIO = 0.6;

/** Lerp por frame — 0.12 da transición suave (~12-15 frames a 60 fps). */
const FOG_LERP_FACTOR = 0.12;

export const FogZoomController: React.FC<FogZoomControllerProps> = ({
  orbitControlsRef,
  baseNear,
  baseFar,
}) => {
  useFrame(({ scene }) => {
    const fog = scene.fog;
    if (!fog || !(fog instanceof THREE.Fog)) return;

    const controls = orbitControlsRef.current;

    let targetNear: number;
    let targetFar: number;

    if (!controls) {
      // Sin controls montados aún (primer frame) — fog base.
      targetNear = baseNear;
      targetFar = baseFar;
    } else {
      const camDist = controls.getDistance();
      const minD = controls.minDistance;
      const maxD = controls.maxDistance;
      const range = maxD - minD;

      if (range <= 0) {
        targetNear = baseNear;
        targetFar = baseFar;
      } else {
        const rawRatio = THREE.MathUtils.clamp((camDist - minD) / range, 0, 1);

        // t: 0 antes del TRIGGER, 1 al zoom-out máximo. Rampa lineal.
        const t = THREE.MathUtils.clamp(
          (rawRatio - ZOOMOUT_TRIGGER_RATIO) / (1 - ZOOMOUT_TRIGGER_RATIO),
          0,
          1,
        );

        targetNear = THREE.MathUtils.lerp(baseNear, MIN_NEAR_AT_ZOOMOUT_M, t);
        targetFar = THREE.MathUtils.lerp(baseFar, MIN_FAR_AT_ZOOMOUT_M, t);
      }
    }

    fog.near = THREE.MathUtils.lerp(fog.near, targetNear, FOG_LERP_FACTOR);
    fog.far = THREE.MathUtils.lerp(fog.far, targetFar, FOG_LERP_FACTOR);

    // Safety clamp: garantizar near < far (invariante de THREE.Fog).
    if (fog.near >= fog.far) {
      fog.near = fog.far - 1;
    }
  });

  return null;
};

FogZoomController.displayName = 'FogZoomController';
