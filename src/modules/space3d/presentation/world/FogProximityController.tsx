'use client';
/**
 * @module space3d/world/FogProximityController
 *
 * Ajusta dinámicamente `scene.fog.near` Y `scene.fog.far` según la distancia
 * del avatar a las paredes perimetrales. Pattern UX clásico de games AAA:
 * cuando el player se acerca al "limit", la niebla se cierra gradualmente.
 *
 * ## Math (linear fog — Three.js)
 *
 *   density(d) = clamp((d - near) / (far - near), 0, 1)
 *
 *   CRÍTICO: requiere SIEMPRE `near < far`. Si invertimos (`near > far`),
 *   density se negativiza en distancias cortas → fragments cercanos a la
 *   cámara renderean como fog color (look "pantalla negra"). Bug observado
 *   2026-05-15 cuando solo movíamos `far` sin tocar `near`.
 *
 * ### Algoritmo
 *
 *   t = clamp((TRANSITION_START - minDist) / TRANSITION_START, 0, 1)
 *   targetNear = lerp(baseNear, MIN_NEAR_AT_WALL, t)   // baja proporcionalmente
 *   targetFar  = lerp(baseFar,  MIN_FAR_AT_WALL,  t)   // baja proporcionalmente
 *   fog.near = lerp(fog.near, targetNear, FOG_LERP_FACTOR)
 *   fog.far  = lerp(fog.far,  targetFar,  FOG_LERP_FACTOR)
 *
 *   Safety clamp final: fog.near = min(fog.near, fog.far - 1) — defensa
 *   contra cualquier estado intermedio donde near pudiera alcanzar a far.
 *
 *   - minDist: distancia del avatar al borde más cercano del envelope.
 *   - Lerp suave por frame (factor 0.15) para transición sin saltos.
 *
 * Si `zonesEnvelope` es null (sin zonas activas) → restaura base near/far.
 *
 * ## Performance
 *
 * useFrame canónico: muta `scene.fog.near/far` directamente, NO setState.
 * Zero re-renders. Compute cost: ~10 floats + 2 lerp por frame.
 *
 * ## Clean Architecture
 *
 * Presentation R3F-side. Lee:
 *   - `zonesEnvelope` (computed por Scene3D, ya disponible)
 *   - `playerPosRef` (mutable ref, ya existe en Scene3D, sin re-render)
 * Muta `scene.fog.near/far` (built-in three.js). Cero dep en Domain/App.
 *
 * Refs:
 *   - https://threejs.org/docs/#api/en/scenes/Fog
 *   - https://r3f.docs.pmnd.rs/api/hooks#useframe
 */

import React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface ZonesEnvelope {
  /** Centro X (mundo) del bbox de zonas activas */
  centerX: number;
  /** Centro Z (mundo) del bbox de zonas activas */
  centerZ: number;
  /** Tamaño total en X (mundo) */
  sizeX: number;
  /** Tamaño total en Z (mundo) */
  sizeZ: number;
}

export interface FogProximityControllerProps {
  /** Envelope BBOX de las zonas empresa — null = no hay zonas, modo passthrough */
  zonesEnvelope: ZonesEnvelope | null;
  /** Ref a la posición del avatar en mundo XZ (mutable, actualizado por gameplay) */
  playerPosRef: React.MutableRefObject<{ x: number; z: number }>;
  /** Valor base de `fog.near` (el del scenePolicy) — se restaura cuando avatar lejos */
  baseNear: number;
  /** Valor base de `fog.far` (el del scenePolicy) — se restaura cuando avatar lejos */
  baseFar: number;
}

/** Distancia (m) a la cual empieza el cierre de niebla. */
const TRANSITION_START_M = 15;

/** Valor mínimo de fog.far cuando avatar está exactamente en la pared. */
const MIN_FAR_AT_WALL_M = 30;

/** Valor mínimo de fog.near cuando avatar está exactamente en la pared.
 *  Debe ser MENOR a MIN_FAR_AT_WALL_M para no invertir la fog math. */
const MIN_NEAR_AT_WALL_M = 2;

/** Factor de lerp por frame — 0.15 da una transición visible pero suave (~10 frames a 60 fps). */
const FOG_LERP_FACTOR = 0.15;

export const FogProximityController: React.FC<FogProximityControllerProps> = ({
  zonesEnvelope,
  playerPosRef,
  baseNear,
  baseFar,
}) => {
  const { scene } = useThree();

  useFrame(() => {
    const fog = scene.fog;
    if (!fog || !(fog instanceof THREE.Fog)) return;

    let targetNear: number;
    let targetFar: number;

    if (!zonesEnvelope) {
      // Sin envelope (espacio sin zonas) — restaurar fog base.
      targetNear = baseNear;
      targetFar = baseFar;
    } else {
      const { x, z } = playerPosRef.current;
      const halfX = zonesEnvelope.sizeX / 2;
      const halfZ = zonesEnvelope.sizeZ / 2;

      // Distancias signadas al borde de cada lado. Positivas cuando dentro.
      const distEast = (zonesEnvelope.centerX + halfX) - x;
      const distWest = x - (zonesEnvelope.centerX - halfX);
      const distNorth = z - (zonesEnvelope.centerZ - halfZ);
      const distSouth = (zonesEnvelope.centerZ + halfZ) - z;

      // Mínima distancia al borde más cercano. Clamp ≥0 cuando avatar fuera.
      const minDist = Math.max(0, Math.min(distEast, distWest, distNorth, distSouth));

      // t: 0 cuando avatar lejos del borde, 1 cuando en la pared.
      const t = THREE.MathUtils.clamp(
        (TRANSITION_START_M - minDist) / TRANSITION_START_M,
        0,
        1,
      );

      // CRÍTICO: bajar ambos near y far proporcionalmente para preservar
      // near < far. Bajar solo far inviertiría el fog en distancias cortas.
      targetNear = THREE.MathUtils.lerp(baseNear, MIN_NEAR_AT_WALL_M, t);
      targetFar = THREE.MathUtils.lerp(baseFar, MIN_FAR_AT_WALL_M, t);
    }

    // Lerp por frame hacia el target — transición suave sin saltos.
    fog.near = THREE.MathUtils.lerp(fog.near, targetNear, FOG_LERP_FACTOR);
    fog.far = THREE.MathUtils.lerp(fog.far, targetFar, FOG_LERP_FACTOR);

    // Safety clamp: garantizar near < far en TODO momento (defensa contra
    // estados intermedios de lerp donde near pudiera alcanzar far). Si
    // ocurriera, restamos 1m a near para mantener la invariante.
    if (fog.near >= fog.far) {
      fog.near = fog.far - 1;
    }
  });

  return null;
};

FogProximityController.displayName = 'FogProximityController';
