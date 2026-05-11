'use client';
/**
 * @module components/3d/SkyDome
 *
 * Clean Architecture — Infrastructure/Presentation layer.
 * Componente React puro de Three.js (vía R3F) que renderiza el cielo gradiente.
 *
 * Antes estaba inline en Scene3D.tsx (líneas 856-883) mezclando shader GLSL
 * con el orquestador de escena. Aquí queda encapsulado: Scene3D solo pasa
 * los colores resueltos desde la capa de dominio y las dimensiones desde
 * ScenePolicy.
 *
 * Patrón de skydome verificado contra docs oficiales:
 *   - SphereGeometry + ShaderMaterial con side=BackSide y depthWrite=false.
 *   - Ref: https://github.com/mrdoob/three.js/issues/23259 (mantenedores
 *     Three.js recomiendan este patrón para fondos con shader custom, ya
 *     que scene.background no admite ShaderMaterial directamente).
 *   - Sin useFrame → R3F invalida solo cuando cambian los props (compatible
 *     con frameloop="demand").
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SkyDomeProps {
  /** Color del horizonte (parte baja de la esfera). Hex ej: '#0a1a2a'. */
  bottomColor: string;
  /** Color del cenit (parte alta de la esfera). Hex ej: '#22447a'. */
  topColor: string;
  /** Radio de la esfera. Debe envolver toda la geometría visible. */
  radius?: number;
  /** Segmentos horizontales — 16 basta para un gradiente suave (low-poly). */
  widthSegments?: number;
  /** Segmentos verticales — 8 basta para un gradiente suave (low-poly). */
  heightSegments?: number;
}

// ─── Shader (módulo-level, se reusa entre instancias) ─────────────────────────

const VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform vec3 bottomColor;
  uniform vec3 topColor;
  varying vec3 vWorldPos;
  void main() {
    float h = normalize(vWorldPos).y;
    float t = pow(max(h, 0.0), 0.6);
    gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
  }
`;

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Skydome gradiente low-poly. Esfera interior (BackSide) con shader simplísimo
 * de 2 colores verticales. Se renderiza una sola vez por cambio de props.
 */
export const SkyDome: React.FC<SkyDomeProps> = ({
  bottomColor,
  topColor,
  radius = 500,
  widthSegments = 16,
  heightSegments = 8,
}) => {
  // Uniforms memoizados por color — THREE.Color se instancia una vez y el
  // shaderMaterial muta .value in-place si el string del prop no cambia.
  const uniforms = useMemo(
    () => ({
      bottomColor: { value: new THREE.Color(bottomColor) },
      topColor: { value: new THREE.Color(topColor) },
    }),
    // Intencional: queremos recrear uniforms solo si el hex string cambia;
    // las mutaciones in-place en useFrame no aplican aquí (no hay animación).
    [bottomColor, topColor],
  );

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, widthSegments, heightSegments]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
      />
    </mesh>
  );
};

SkyDome.displayName = 'SkyDome';
