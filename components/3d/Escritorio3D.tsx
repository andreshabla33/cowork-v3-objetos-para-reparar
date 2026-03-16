/**
 * @module components/3d/Escritorio3D
 * Componente 3D para escritorios persistentes reclamables.
 * Renderiza un escritorio con indicador de dueño, tooltip de interacción
 * y glow de proximidad. Soporta: reclamar, liberar y mover.
 */

import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '@/store/useStore';
import { hapticFeedback } from '@/lib/mobileDetect';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { FACTOR_ESCALA_OBJETOS_ESCENA } from '../space3d/shared';

interface Escritorio3DProps {
  objeto: EspacioObjeto;
  playerPosition: { x: number; z: number };
  currentUserId: string | null;
  onReclamar: (id: string) => void;
  onLiberar: (id: string) => void;
  onMover?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotar?: (id: string, rotationY: number) => Promise<boolean>;
  onEliminar?: (id: string) => Promise<boolean>;
  ownerName?: string | null;
}

const PROXIMIDAD_INTERACCION = 3; // unidades 3D

export const Escritorio3D: React.FC<Escritorio3DProps> = ({
  objeto,
  playerPosition,
  currentUserId,
  onReclamar,
  onLiberar,
  onMover,
  onRotar,
  onEliminar,
  ownerName,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [cercano, setCercano] = useState(false);
  const cercanoRef = useRef(false);
  const [hover, setHover] = useState(false);

  const esPropio = objeto.owner_id === currentUserId;
  const esLibre = objeto.owner_id === null;
  const posicion: [number, number, number] = [objeto.posicion_x, objeto.posicion_y, objeto.posicion_z];

  // Color según estado
  const colorEscritorio = useMemo(() => {
    if (esPropio) return '#4f46e5'; // Indigo — tu escritorio
    if (!esLibre) return '#475569'; // Slate — ocupado por otro
    return '#1e293b'; // Dark — libre
  }, [esPropio, esLibre]);

  // Proximidad check en useFrame — ref para click handler, state para renders
  useFrame(() => {
    const dx = playerPosition.x - posicion[0];
    const dz = playerPosition.z - posicion[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ahora = dist < PROXIMIDAD_INTERACCION;
    cercanoRef.current = ahora;
    if (ahora !== cercano) setCercano(ahora);
  });

  // --- Hito 8: Edit Mode Integration ---
  const isEditMode = useStore((s) => s.isEditMode);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const setSelectedObjectId = useStore((s) => s.setSelectedObjectId);
  const setIsDragging = useStore((s) => s.setIsDragging);
  const isSelected = selectedObjectId === objeto.id;

  const handleClick = (e: any) => {
    e.stopPropagation();

    if (isEditMode) {
      setSelectedObjectId(objeto.id);
      hapticFeedback('light');
      return;
    }

    const estaCerca = cercanoRef.current;
    if (!estaCerca) return;
    if (esLibre) {
      onReclamar(objeto.id);
    } else if (esPropio) {
      onLiberar(objeto.id);
    }
  };

  const handleRotate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRotar) {
      const success = await onRotar(objeto.id, objeto.rotacion_y || 0);
      if (success) {
        console.log('[Escritorio3D] Rotated successfully');
      }
    }
    hapticFeedback('medium');
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de que deseas eliminar este escritorio?')) {
      if (onEliminar) {
        const success = await onEliminar(objeto.id);
        if (success) {
          setSelectedObjectId(null);
        }
      }
    }
    hapticFeedback('heavy');
  };

  return (
    <group position={posicion} rotation={[0, objeto.rotacion_y || 0, 0]} scale={[FACTOR_ESCALA_OBJETOS_ESCENA, FACTOR_ESCALA_OBJETOS_ESCENA, FACTOR_ESCALA_OBJETOS_ESCENA]}>
      {/* Mesa */}
      <mesh
        ref={meshRef}
        position={[0, 0.4, 0]}
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerDown={(e) => {
          if (isEditMode && isSelected) {
            e.stopPropagation();
            (e.target as any).setPointerCapture(e.pointerId);
            setIsDragging(true);
          }
        }}
        onPointerUp={(e) => {
          if (isEditMode && isSelected) {
            e.stopPropagation();
            (e.target as any).releasePointerCapture(e.pointerId);
            setIsDragging(false);
          }
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[2.4, 0.12, 1.2]} />
        <meshStandardMaterial
          color={colorEscritorio}
          emissive={cercano ? (esLibre ? '#22c55e' : esPropio ? '#6366f1' : '#ef4444') : '#000000'}
          emissiveIntensity={cercano ? 0.4 : 0}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* Patas de la mesa */}
      {[[-1, 0, -0.45], [1, 0, -0.45], [-1, 0, 0.45], [1, 0, 0.45]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.17, pos[2]]} castShadow>
          <boxGeometry args={[0.08, 0.34, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.8} />
        </mesh>
      ))}

      {/* Silla detrás del escritorio */}
      <mesh position={[0, 0.3, -0.9]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.5]} />
        <meshStandardMaterial
          color={esPropio ? '#4338ca' : esLibre ? '#334155' : '#1e293b'}
          roughness={0.7}
        />
      </mesh>

      {/* Indicador de dueño (bolita de color sobre la mesa) */}
      {!esLibre && (
        <mesh position={[0, 0.55, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={esPropio ? '#22c55e' : '#f59e0b'}
            emissive={esPropio ? '#22c55e' : '#f59e0b'}
            emissiveIntensity={0.8}
          />
        </mesh>
      )}

      {/* Selection Highlight (Modo Edición) */}
      {isSelected && (
        <>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[2.5, 0.2, 1.3]} />
            <meshBasicMaterial color="#6366f1" transparent opacity={0.3} side={THREE.BackSide} />
          </mesh>
          <pointLight color="#6366f1" intensity={3} distance={5} position={[0, 1, 0]} />
        </>
      )}

      {/* Botones de Edición (UI Flotante) */}
      {isSelected && isEditMode && (
        <Html position={[0, 1.8, 0]} center>
          <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={handleRotate}
              className="w-10 h-10 rounded-full bg-indigo-600/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl hover:bg-indigo-500 transition-colors group"
              title="Rotar 90°"
            >
              <svg className="w-5 h-5 group-active:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="w-10 h-10 rounded-full bg-red-600/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl hover:bg-red-500 transition-colors"
              title="Eliminar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={() => setSelectedObjectId(null)}
              className="w-10 h-10 rounded-full bg-zinc-800/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl hover:bg-zinc-700 transition-colors"
              title="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </Html>
      )}


      {/* Glow de proximidad (solo si no está seleccionado) */}
      {cercano && !isSelected && (
        <pointLight
          color={esLibre ? '#22c55e' : esPropio ? '#6366f1' : '#ef4444'}
          intensity={1.5}
          distance={4}
          position={[0, 0.8, 0]}
        />
      )}
    </group>
  );
};
