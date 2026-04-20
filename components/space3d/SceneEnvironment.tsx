/**
 * @module components/space3d/SceneEnvironment
 *
 * Sub-componente extraído de Scene3D.tsx (CLEAN-ARCH-F4).
 * Responsabilidad única: iluminación, cielo, IBL, ciclo día/noche y partículas.
 *
 * Tier 2 (GPU ≥ 2): drei `<Sky>` (Preetham atmospheric scattering) +
 * `<Environment preset="city">` (HDR IBL) + `<hemisphereLight>` para rebote
 * cielo/suelo. Todo gated por `gpuRenderConfig` — Tier 0/1 conservan el
 * comportamiento legacy (SkyDome custom renderizado desde Scene3D).
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Sky, Environment } from '@react-three/drei';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ParticulasClima } from '../3d/ParticulasClima';
import { computeSunPosition } from '@/src/core/domain/entities/espacio3d/ScenePolicy';
import type { AdaptiveRenderConfig } from '@/lib/gpuCapabilities';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneEnvironmentProps {
  /** Activa el ciclo dinámico de día/noche */
  enableDayNightCycle?: boolean;
  /** Tema visual del espacio ('default' | 'arcade' | 'nature') */
  theme?: string;
  /**
   * Config adaptativa por GPU tier. Cuando `useSky` / `useEnvironmentMap`
   * están activos (tier ≥ 2) se usa drei `<Sky>` y `<Environment>`. Tier
   * bajo conserva luces estáticas y skydome custom en Scene3D.
   */
  gpuRenderConfig?: AdaptiveRenderConfig;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Gestiona iluminación, cielo, IBL y efectos ambientales de la escena 3D.
 *
 * Criterios de optimización (Three.js best practices):
 *  - Tier 2+: 1 Sky shader + 1 Environment PMREM + DayNightCycle (si enabled)
 *  - Tier 0/1: ambient + directional (legacy), sin IBL, sin Sky shader
 *  - DayNightCycle anima luces en useFrame con lerp suave
 *  - Sun position recalculada cada 5 min para drei `<Sky>`
 *
 * Ref oficial R3F — https://r3f.docs.pmnd.rs/ (Environment + Sky)
 * Ref Three.js Journey — https://threejs-journey.com/lessons/realistic-render
 */
export const SceneEnvironment: React.FC<SceneEnvironmentProps> = ({
  enableDayNightCycle = false,
  theme = 'default',
  gpuRenderConfig,
}) => {
  const lightColor = theme === 'arcade' ? '#00ff41' : '#ffffff';
  const useSky = gpuRenderConfig?.useSky ?? false;
  const useEnvironmentMap = gpuRenderConfig?.useEnvironmentMap ?? false;

  // ── Sun position: recalcular cada 5 min para acoplar a la hora real ──
  // El arco completo del día es 12h → 5 min de throttle = 0.7% de precisión.
  // Suficiente para transiciones suaves sin recomputar el Sky en cada frame.
  const [sunPosition, setSunPosition] = useState<[number, number, number]>(() => {
    const hour = typeof Date !== 'undefined' ? new Date().getHours() + new Date().getMinutes() / 60 : 12;
    return computeSunPosition(hour);
  });
  useEffect(() => {
    if (!useSky) return;
    const update = () => {
      const now = new Date();
      setSunPosition(computeSunPosition(now.getHours() + now.getMinutes() / 60));
    };
    const interval = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [useSky]);

  // ── Sky (drei Preetham) — reemplaza SkyDome custom en tier ≥ 2 ──
  // Cuando useSky=true, Scene3D debe OCULTAR su SkyDome para evitar overdraw.
  // `distance={450000}` es el default del demo de drei; el sol se renderiza
  // como un disco brillante en la posición calculada desde la hora.
  const skyElement = useMemo(() => {
    if (!useSky) return null;
    return (
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        inclination={0.5}
        azimuth={0.25}
        // Turbidity bajo = cielo limpio. Rayleigh alto = más azul.
        // Mie = dispersión atmosférica (halo alrededor del sol).
        turbidity={8}
        rayleigh={1.5}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
    );
  }, [useSky, sunPosition]);

  // ── Environment (IBL) — reflexiones PBR ambientales en tier ≥ 2 ──
  // Preset 'city' da un look de oficina moderna. resolution + intensity
  // se ajustan por tier via gpuRenderConfig.
  const envElement = useMemo(() => {
    if (!useEnvironmentMap || !gpuRenderConfig) return null;
    return (
      <Environment
        preset="city"
        resolution={gpuRenderConfig.environmentResolution}
        environmentIntensity={gpuRenderConfig.environmentIntensity}
        // background={false} para NO usar el HDR como fondo — el Sky shader
        // se encarga del background, el env map solo provee reflexiones.
        background={false}
      />
    );
  }, [useEnvironmentMap, gpuRenderConfig]);

  return (
    <>
      {skyElement}
      {envElement}

      {enableDayNightCycle ? (
        <DayNightCycle enabled={true} />
      ) : (
        <>
          {/* Luz ambiental base — intensidad rebalanceada para ACES + IBL */}
          <ambientLight intensity={useEnvironmentMap ? 0.4 : 0.7} color={lightColor} />
          {/*
            hemisphereLight (solo tier ≥ 2): simula rebote cielo→suelo.
            Sky arriba (azul claro) + ground abajo (gris tierra). Le da
            "vida" al shading sin costo perceptible.
            Ref: https://threejs.org/docs/#api/en/lights/HemisphereLight
          */}
          {useSky && (
            <hemisphereLight args={['#87ceeb', '#5a5a5a', 0.35]} />
          )}
          {/* Directional con shadow — intensidad subida post r155 cuando hay ACES */}
          <directionalLight
            position={[10, 20, 10]}
            intensity={useEnvironmentMap ? 2.0 : 1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={80}
            shadow-camera-near={0.1}
          />
        </>
      )}
      {/* Partículas climáticas (nieve, lluvia) — condicional en su interior */}
      <ParticulasClima />
    </>
  );
};

SceneEnvironment.displayName = 'SceneEnvironment';
