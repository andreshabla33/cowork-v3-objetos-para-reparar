'use client';
/**
 * @module space3d/world/FogProximityController
 *
 * Ajusta dinámicamente `scene.fog.far` según la distancia del avatar a las
 * paredes perimetrales del espacio. Pattern UX clásico de games AAA:
 * cuando el player se acerca al "limit" del map, la niebla se cierra
 * gradualmente — da sensación de mundo cerrado sin romper la inmersión.
 *
 * ## Math
 *
 *   t = clamp((TRANSITION_START - minDist) / TRANSITION_START, 0, 1)
 *   fog.far = lerp(baseFar, MIN_FAR_AT_WALL, t)
 *
 *   - minDist: distancia del avatar al borde más cercano del envelope
 *     (positiva cuando dentro). Usa coordenadas de mundo XZ.
 *   - TRANSITION_START: a partir de esta distancia (m) empieza el efecto.
 *   - MIN_FAR_AT_WALL: valor mínimo del fog.far cuando avatar en el borde.
 *   - Lerp suave por frame (factor 0.15) para evitar saltos abruptos.
 *
 * Si `zonesEnvelope` es null (sin zonas activas) → restaura `baseFar`.
 *
 * ## Performance
 *
 * useFrame canónico: muta `scene.fog.far` directamente, NO setState.
 * Zero re-renders. Compute cost: 4 floats + 1 min + 1 lerp por frame.
 *
 * ## Clean Architecture
 *
 * Presentation R3F-side. Lee:
 *   - `zonesEnvelope` (computed por Scene3D, ya disponible)
 *   - `playerPosRef` (mutable ref, ya existe en Scene3D, sin re-render)
 * Muta `scene.fog.far` (built-in three.js). Cero dependencia en Domain/App.
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
  /** Valor base de `fog.far` (el del scenePolicy) — se restaura cuando avatar lejos */
  baseFar: number;
}

/** Distancia (m) a la cual empieza el cierre de niebla. */
const TRANSITION_START_M = 15;

/** Valor mínimo de fog.far cuando avatar está exactamente en la pared. */
const MIN_FAR_AT_WALL_M = 30;

/** Factor de lerp por frame — 0.15 da una transición visible pero suave (~10 frames a 60 fps). */
const FOG_LERP_FACTOR = 0.15;

export const FogProximityController: React.FC<FogProximityControllerProps> = ({
  zonesEnvelope,
  playerPosRef,
  baseFar,
}) => {
  const { scene } = useThree();

  useFrame(() => {
    const fog = scene.fog;
    if (!fog || !(fog instanceof THREE.Fog)) return;

    if (!zonesEnvelope) {
      // Sin envelope (espacio sin zonas) — mantener fog base.
      // Lerp para evitar salto si el envelope cambia.
      fog.far = THREE.MathUtils.lerp(fog.far, baseFar, FOG_LERP_FACTOR);
      return;
    }

    const { x, z } = playerPosRef.current;
    const halfX = zonesEnvelope.sizeX / 2;
    const halfZ = zonesEnvelope.sizeZ / 2;

    // Distancias signadas al borde de cada lado. Positivas cuando dentro.
    const distEast = (zonesEnvelope.centerX + halfX) - x;
    const distWest = x - (zonesEnvelope.centerX - halfX);
    const distNorth = z - (zonesEnvelope.centerZ - halfZ);
    const distSouth = (zonesEnvelope.centerZ + halfZ) - z;

    // Mínima distancia al borde más cercano. Si player está fuera del envelope
    // (multi-zona separadas o decoración exterior), minDist será negativa
    // y el clamp la lleva a 0 → max fog.
    const minDist = Math.max(0, Math.min(distEast, distWest, distNorth, distSouth));

    // t: 0 cuando avatar lejos del borde, 1 cuando en la pared.
    const t = THREE.MathUtils.clamp(
      (TRANSITION_START_M - minDist) / TRANSITION_START_M,
      0,
      1,
    );

    const targetFar = THREE.MathUtils.lerp(baseFar, MIN_FAR_AT_WALL_M, t);

    // Lerp por frame hacia el target — evita saltos abruptos al cruzar
    // umbrales o al teletransportarse.
    fog.far = THREE.MathUtils.lerp(fog.far, targetFar, FOG_LERP_FACTOR);
  });

  return null;
};

FogProximityController.displayName = 'FogProximityController';
