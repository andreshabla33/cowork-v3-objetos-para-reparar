import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type TipoParticula = 'nieve' | 'petalos' | 'confetti' | 'ninguno';

interface ParticulasClimaProps {
  /** Tipo de partículas según temporada o evento */
  tipo?: TipoParticula;
  /** Cantidad de partículas (default 200) */
  cantidad?: number;
  /** Centro de emisión (posición del jugador) */
  centro?: { x: number; z: number };
}

/**
 * Sistema de partículas ligero basado en temporada/evento.
 * - Nieve: diciembre-febrero (partículas blancas cayendo)
 * - Pétalos: marzo-mayo (partículas rosas flotando)
 * - Confetti: activado manualmente para eventos/celebraciones
 * 
 * Usa Points de Three.js para rendimiento óptimo.
 * Se desactiva con tipo='ninguno' o en battery saver.
 */
export const ParticulasClima: React.FC<ParticulasClimaProps> = ({ tipo: tipoProp, cantidad = 200, centro }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const velocidadesRef = useRef<Float32Array | null>(null);

  // Auto-detectar tipo por mes si no se especifica
  const tipo = useMemo(() => {
    if (tipoProp) return tipoProp;
    const mes = new Date().getMonth(); // 0-11
    if (mes >= 11 || mes <= 1) return 'nieve' as TipoParticula;
    if (mes >= 2 && mes <= 4) return 'petalos' as TipoParticula;
    return 'ninguno' as TipoParticula;
  }, [tipoProp]);

  const config = useMemo(() => {
    switch (tipo) {
      case 'nieve': return { color: '#ffffff', size: 0.08, speed: 0.5, spread: 30, height: 15, opacity: 0.7 };
      case 'petalos': return { color: '#f9a8d4', size: 0.12, speed: 0.3, spread: 25, height: 12, opacity: 0.6 };
      case 'confetti': return { color: '#fbbf24', size: 0.1, speed: 0.8, spread: 20, height: 10, opacity: 0.9 };
      default: return null;
    }
  }, [tipo]);

  // Generar posiciones iniciales
  const { positions, colors } = useMemo(() => {
    if (!config) return { positions: new Float32Array(0), colors: new Float32Array(0) };

    const pos = new Float32Array(cantidad * 3);
    const col = new Float32Array(cantidad * 3);
    const vel = new Float32Array(cantidad);
    const baseColor = new THREE.Color(config.color);

    for (let i = 0; i < cantidad; i++) {
      pos[i * 3] = (Math.random() - 0.5) * config.spread;
      pos[i * 3 + 1] = Math.random() * config.height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * config.spread;
      vel[i] = config.speed * (0.5 + Math.random() * 0.5);

      // Variación de color para confetti
      if (tipo === 'confetti') {
        const hue = Math.random();
        const c = new THREE.Color().setHSL(hue, 0.9, 0.6);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      } else {
        col[i * 3] = baseColor.r; col[i * 3 + 1] = baseColor.g; col[i * 3 + 2] = baseColor.b;
      }
    }

    velocidadesRef.current = vel;
    return { positions: pos, colors: col };
  }, [config, cantidad, tipo]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !config || !velocidadesRef.current) return;

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const vel = velocidadesRef.current;
    const cx = centro?.x ?? 50;
    const cz = centro?.z ?? 50;

    for (let i = 0; i < cantidad; i++) {
      // Caída
      posArr[i * 3 + 1] -= vel[i] * delta;

      // Movimiento lateral sutil (viento)
      posArr[i * 3] += Math.sin(Date.now() * 0.001 + i) * 0.002;
      if (tipo === 'petalos') {
        posArr[i * 3 + 2] += Math.cos(Date.now() * 0.0008 + i * 0.5) * 0.003;
      }

      // Resetear si llega al suelo
      if (posArr[i * 3 + 1] < 0) {
        posArr[i * 3] = cx + (Math.random() - 0.5) * config.spread;
        posArr[i * 3 + 1] = config.height;
        posArr[i * 3 + 2] = cz + (Math.random() - 0.5) * config.spread;
      }
    }

    // Centrar en jugador
    pointsRef.current.position.x = cx - config.spread / 2;
    pointsRef.current.position.z = cz - config.spread / 2;

    posAttr.needsUpdate = true;
  });

  if (!config || tipo === 'ninguno') return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={cantidad}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={cantidad}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={config.size}
        transparent
        opacity={config.opacity}
        vertexColors
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};
