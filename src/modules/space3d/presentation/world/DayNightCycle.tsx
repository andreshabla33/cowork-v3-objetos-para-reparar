import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface DayNightCycleProps {
  /** Si está habilitado el ciclo (puede desactivarse en settings) */
  enabled?: boolean;
}

/**
 * Ciclo día/noche basado en hora real del usuario.
 * Ajusta ambientLight y directionalLight con transición suave.
 * 
 * Horarios:
 * 06-10: Amanecer (cálido, intensidad media)
 * 10-16: Día (neutro, intensidad alta)
 * 16-19: Atardecer (cálido/naranja, intensidad media-baja)
 * 19-22: Anochecer (frío/azul, intensidad media)
 * 22-06: Noche (tono azul/púrpura, siempre visible)
 */
export const DayNightCycle: React.FC<DayNightCycleProps> = ({ enabled = true }) => {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const currentAmbientColor = useRef(new THREE.Color('#707070'));
  const currentDirColor = useRef(new THREE.Color('#ffffff'));
  const currentAmbientIntensity = useRef(0.7);
  const currentDirIntensity = useRef(1.2);
  const initialized = useRef(false);

  // Configuración de períodos del día
  const timeConfig = useMemo(() => [
    // { hora, ambientColor, ambientIntensity, dirColor, dirIntensity }
    { h: 0,  ac: '#4a4a6e', ai: 0.55, dc: '#6060a0', di: 0.7 },  // Medianoche (workspace visible)
    { h: 5,  ac: '#4a4a6e', ai: 0.55, dc: '#6060a0', di: 0.7 },  // Pre-amanecer
    { h: 6,  ac: '#6a5a4a', ai: 0.6,  dc: '#ffa040', di: 0.8 },  // Amanecer
    { h: 8,  ac: '#707060', ai: 0.65, dc: '#ffcc80', di: 1.0 },  // Mañana temprana
    { h: 10, ac: '#707070', ai: 0.7,  dc: '#ffffff', di: 1.2 },   // Mañana
    { h: 14, ac: '#707070', ai: 0.7,  dc: '#ffffff', di: 1.2 },   // Mediodía
    { h: 16, ac: '#6a5a4a', ai: 0.65, dc: '#ffaa60', di: 1.0 },   // Tarde
    { h: 18, ac: '#5a4a4a', ai: 0.6,  dc: '#ff8050', di: 0.85 },  // Atardecer
    { h: 20, ac: '#4a4a5a', ai: 0.58, dc: '#7070b0', di: 0.75 },  // Anochecer
    { h: 22, ac: '#4a4a6e', ai: 0.55, dc: '#6060a0', di: 0.7 },   // Noche
    { h: 24, ac: '#4a4a6e', ai: 0.55, dc: '#6060a0', di: 0.7 },   // Medianoche (wrap)
  ], []);

  useFrame(() => {
    if (!enabled || !ambientRef.current || !directionalRef.current) return;

    const now = new Date();
    const hourDecimal = now.getHours() + now.getMinutes() / 60;

    // Encontrar segmento actual
    let prevIdx = 0;
    for (let i = 0; i < timeConfig.length - 1; i++) {
      if (hourDecimal >= timeConfig[i].h && hourDecimal < timeConfig[i + 1].h) {
        prevIdx = i;
        break;
      }
    }

    const prev = timeConfig[prevIdx];
    const next = timeConfig[prevIdx + 1];
    const t = (hourDecimal - prev.h) / (next.h - prev.h);

    // Target values
    const targetAc = new THREE.Color(prev.ac).lerp(new THREE.Color(next.ac), t);
    const targetDc = new THREE.Color(prev.dc).lerp(new THREE.Color(next.dc), t);
    const targetAi = THREE.MathUtils.lerp(prev.ai, next.ai, t);
    const targetDi = THREE.MathUtils.lerp(prev.di, next.di, t);

    // Primer frame: saltar directamente al valor correcto sin lerp
    if (!initialized.current) {
      currentAmbientColor.current.copy(targetAc);
      currentDirColor.current.copy(targetDc);
      currentAmbientIntensity.current = targetAi;
      currentDirIntensity.current = targetDi;
      initialized.current = true;
    } else {
      // Smooth lerp (evita cambios bruscos frame a frame)
      const lerpFactor = 0.02;
      currentAmbientColor.current.lerp(targetAc, lerpFactor);
      currentDirColor.current.lerp(targetDc, lerpFactor);
      currentAmbientIntensity.current = THREE.MathUtils.lerp(currentAmbientIntensity.current, targetAi, lerpFactor);
      currentDirIntensity.current = THREE.MathUtils.lerp(currentDirIntensity.current, targetDi, lerpFactor);
    }

    // Aplicar
    ambientRef.current.color.copy(currentAmbientColor.current);
    ambientRef.current.intensity = currentAmbientIntensity.current;
    directionalRef.current.color.copy(currentDirColor.current);
    directionalRef.current.intensity = currentDirIntensity.current;
  });

  if (!enabled) return null;

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.7} />
      <directionalLight ref={directionalRef} position={[10, 20, 10]} intensity={1.2} castShadow />
    </>
  );
};
