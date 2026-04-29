import React, { useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';

import * as THREE from 'three';

interface ObjetoInteractivoProps {
  position: [number, number, number];
  tipo: 'pizarra' | 'coffee' | 'reloj' | 'planta';
  onInteract?: (tipo: string) => void;
  playerPosition?: { x: number; z: number };
}

/**
 * Objetos interactivos 3D para el workspace.
 * Se activan por proximidad del jugador.
 * - Pizarra: muestra tooltip "Abrir pizarra"
 * - Coffee machine: "Tomar café" (+5 XP)
 * - Reloj: hora actual
 * - Planta: decorativa con animación sutil
 */
const ObjetoInteractivo: React.FC<ObjetoInteractivoProps> = ({ position, tipo, onInteract, playerPosition }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [cercano, setCercano] = useState(false);
  const cercanoRef = useRef(false);
  const [hover, setHover] = useState(false);

  useFrame(() => {
    if (!playerPosition || !meshRef.current) return;
    const dx = playerPosition.x - position[0];
    const dz = playerPosition.z - position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ahora = dist < 3;
    if (ahora !== cercanoRef.current) {
      cercanoRef.current = ahora;
      setCercano(ahora);
    }

    // Animación sutil de flotación para planta
    if (tipo === 'planta') {
      meshRef.current.position.y = position[1] + Math.sin(Date.now() * 0.002) * 0.05;
    }
  });

  const config: Record<string, { color: string; size: [number, number, number]; emoji: string; label: string; yOffset: number }> = {
    pizarra: { color: '#1e293b', size: [2, 1.5, 0.1], emoji: '📋', label: 'Pizarra', yOffset: 0.75 },
    coffee: { color: '#78350f', size: [0.4, 0.6, 0.4], emoji: '☕', label: 'Café (+5 XP)', yOffset: 0.3 },
    reloj: { color: '#374151', size: [0.6, 0.6, 0.05], emoji: '🕐', label: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }), yOffset: 0.3 },
    planta: { color: '#166534', size: [0.3, 0.8, 0.3], emoji: '🌿', label: 'Planta', yOffset: 0.4 },
  };

  const cfg = config[tipo] || config.planta;

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); if (cercano && onInteract) onInteract(tipo); }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={cfg.size} />
        <meshStandardMaterial
          color={cfg.color}
          emissive={cercano ? '#2563eb' : '#000000'}
          emissiveIntensity={cercano ? 0.3 : 0}
        />
      </mesh>


      {/* Glow de proximidad */}
      {cercano && (
        <pointLight color="#2563eb" intensity={2} distance={3} />
      )}
    </group>
  );
};

interface ObjetosInteractivosProps {
  playerPosition?: { x: number; z: number };
  onInteract?: (tipo: string) => void;
}

/**
 * Colección de objetos interactivos en el espacio.
 * Posiciones hardcodeadas para demo, en producción vendrían de BD.
 */
export const ObjetosInteractivos: React.FC<ObjetosInteractivosProps> = ({ playerPosition, onInteract }) => {
  const objetos: { pos: [number, number, number]; tipo: ObjetoInteractivoProps['tipo'] }[] = [
    { pos: [15, 1.5, 5], tipo: 'pizarra' },
    { pos: [8, 0.8, 15], tipo: 'coffee' },
    { pos: [20, 1.5, 20], tipo: 'reloj' },
    { pos: [5, 0.4, 5], tipo: 'planta' },
    { pos: [18, 0.4, 12], tipo: 'planta' },
  ];

  return (
    <>
      {objetos.map((obj, i) => (
        <ObjetoInteractivo
          key={i}
          position={obj.pos}
          tipo={obj.tipo}
          playerPosition={playerPosition}
          onInteract={onInteract}
        />
      ))}
    </>
  );
};
