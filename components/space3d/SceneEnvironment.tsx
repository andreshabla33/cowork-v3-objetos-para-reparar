/**
 * @module components/space3d/SceneEnvironment
 *
 * Sub-componente extraído de Scene3D.tsx (CLEAN-ARCH-F4).
 * Responsabilidad única: iluminación, ciclo día/noche y partículas climáticas.
 *
 * Antes estaba incrustado en el render JSX de Scene3D (líneas 702–711).
 * Ahora Scene3D importa <SceneEnvironment /> para mantener <200 líneas.
 */

import React from 'react';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ParticulasClima } from '../3d/ParticulasClima';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneEnvironmentProps {
  /** Activa el ciclo dinámico de día/noche */
  enableDayNightCycle?: boolean;
  /** Tema visual del espacio ('default' | 'arcade' | 'nature') */
  theme?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Gestiona la iluminación y efectos ambientales de la escena 3D.
 *
 * Criterios de optimización (Three.js best practices):
 *  - Solo 1 directionalLight con shadow casting (más costosas)
 *  - ambientLight estático para iluminación base
 *  - DayNightCycle anima las luces en un Worker off-thread cuando sea posible
 */
export const SceneEnvironment: React.FC<SceneEnvironmentProps> = ({
  enableDayNightCycle = false,
  theme = 'default',
}) => {
  const lightColor = theme === 'arcade' ? '#00ff41' : '#ffffff';

  return (
    <>
      {enableDayNightCycle ? (
        <DayNightCycle enabled={true} />
      ) : (
        <>
          {/* Luz ambiental base — sin shadows (barato) */}
          <ambientLight intensity={0.7} color={lightColor} />
          {/* Una sola directional light con shadow — presupuesto de shadow map */}
          <directionalLight
            position={[10, 20, 10]}
            intensity={1.2}
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
