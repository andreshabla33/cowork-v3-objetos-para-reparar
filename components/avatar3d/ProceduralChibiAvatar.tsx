/**
 * @module components/avatar3d/ProceduralChibiAvatar
 * @description Procedural chibi-style avatar with cached geometries.
 *
 * Clean Architecture: Presentation layer (React component).
 * Uses GeometryCacheAdapter from Infrastructure layer for geometry sharing.
 *
 * OPTIMIZATION: All geometries are cached via getOrCreate() — multiple chibi
 * avatars share the same GPU buffers. Before caching: ~30 unique geometries
 * per avatar instance. After: ~17 shared geometries across ALL instances.
 *
 * Ref: Three.js docs — "Share materials and geometries if you can"
 * Ref: R3F docs — "every geometry you create will be processed"
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getGeometryCacheAdapter } from '@/src/core/infrastructure/adapters/GeometryCacheAdapter';

interface ProceduralAvatarProps {
  config: {
    skinColor?: string;
    clothingColor?: string;
    hairColor?: string;
    hairStyle?: string;
    accessory?: string;
    eyeColor?: string;
  };
  isMoving?: boolean;
  direction?: string;
}

/**
 * Cached geometry keys and factories for all chibi body parts.
 * Each geometry is created once and shared across all chibi instances.
 */
function useChibiGeometries() {
  return useMemo(() => {
    const cache = getGeometryCacheAdapter();
    const g = (key: string, factory: () => THREE.BufferGeometry) =>
      cache.getOrCreate(`chibi:${key}`, factory) as THREE.BufferGeometry;

    return {
      // Body
      torso: g('capsule:0.28:0.35:12:24', () => new THREE.CapsuleGeometry(0.28, 0.35, 12, 24)),
      collar: g('cyl:0.18:0.22:0.1:16', () => new THREE.CylinderGeometry(0.18, 0.22, 0.1, 16)),
      // Head
      head: g('sphere:0.38:24:24', () => new THREE.SphereGeometry(0.38, 24, 24)),
      ear: g('sphere:0.08:12:12', () => new THREE.SphereGeometry(0.08, 12, 12)),
      // Hair — default
      hairCapDefault: g('sphere:0.36:24:24:half', () => new THREE.SphereGeometry(0.36, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2)),
      hairBangDefault: g('box:0.5:0.15:0.15', () => new THREE.BoxGeometry(0.5, 0.15, 0.15)),
      // Hair — spiky
      hairSpikyMain: g('cone:0.25:0.4:8', () => new THREE.ConeGeometry(0.25, 0.4, 8)),
      hairSpikySide: g('cone:0.12:0.25:6', () => new THREE.ConeGeometry(0.12, 0.25, 6)),
      // Hair — long
      hairCapLong: g('sphere:0.4:24:24:half', () => new THREE.SphereGeometry(0.4, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2)),
      hairLongBack: g('capsule:0.25:0.5:8:16', () => new THREE.CapsuleGeometry(0.25, 0.5, 8, 16)),
      // Hair — ponytail
      hairPonytail: g('capsule:0.1:0.4:8:12', () => new THREE.CapsuleGeometry(0.1, 0.4, 8, 12)),
      // Eyes
      eyeWhite: g('sphere:0.08:16:16', () => new THREE.SphereGeometry(0.08, 16, 16)),
      eyeIris: g('sphere:0.05:12:12', () => new THREE.SphereGeometry(0.05, 12, 12)),
      eyePupil: g('sphere:0.025:8:8', () => new THREE.SphereGeometry(0.025, 8, 8)),
      // Face
      eyebrow: g('box:0.1:0.02:0.02', () => new THREE.BoxGeometry(0.1, 0.02, 0.02)),
      mouth: g('torus:0.06:0.015:8:16:pi', () => new THREE.TorusGeometry(0.06, 0.015, 8, 16, Math.PI)),
      cheek: g('circle:0.05:16', () => new THREE.CircleGeometry(0.05, 16)),
      // Arms & hands
      arm: g('capsule:0.08:0.25:8:12', () => new THREE.CapsuleGeometry(0.08, 0.25, 8, 12)),
      hand: g('sphere:0.08:12:12', () => new THREE.SphereGeometry(0.08, 12, 12)), // same as ear
      // Legs & shoes
      leg: g('capsule:0.1:0.2:8:12', () => new THREE.CapsuleGeometry(0.1, 0.2, 8, 12)),
      shoe: g('box:0.12:0.08:0.18', () => new THREE.BoxGeometry(0.12, 0.08, 0.18)),
      // Accessories — glasses
      glassLens: g('torus:0.08:0.015:8:16', () => new THREE.TorusGeometry(0.08, 0.015, 8, 16)),
      glassBridge: g('box:0.08:0.015:0.015', () => new THREE.BoxGeometry(0.08, 0.015, 0.015)),
      // Accessories — hat
      hatBrim: g('cyl:0.35:0.35:0.05:24', () => new THREE.CylinderGeometry(0.35, 0.35, 0.05, 24)),
      hatTop: g('cyl:0.22:0.25:0.25:24', () => new THREE.CylinderGeometry(0.22, 0.25, 0.25, 24)),
      // Accessories — headphones
      headband: g('torus:0.32:0.03:8:24:pi', () => new THREE.TorusGeometry(0.32, 0.03, 8, 24, Math.PI)),
      headphoneCup: g('cyl:0.1:0.1:0.08:16', () => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16)),
      // Shadow
      shadow: g('circle:0.4:32', () => new THREE.CircleGeometry(0.4, 32)),
    };
  }, []);
}

export const ProceduralChibiAvatar: React.FC<ProceduralAvatarProps> = ({
  config,
  isMoving = false,
  direction = 'front'
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const time = useRef(0);
  const geo = useChibiGeometries();

  const {
    skinColor = '#fcd34d',
    clothingColor = '#6366f1',
    hairColor = '#4b2c20',
    hairStyle = 'default',
    accessory = 'none',
    eyeColor = '#3b82f6'
  } = config || {};

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    time.current += delta;

    const bounceSpeed = isMoving ? 12 : 2;
    const bounceHeight = isMoving ? 0.15 : 0.05;
    groupRef.current.position.y = Math.sin(time.current * bounceSpeed) * bounceHeight;

    const rotations: Record<string, number> = {
      left: -Math.PI / 2,
      right: Math.PI / 2,
      up: Math.PI,
      front: 0,
      down: 0,
    };
    groupRef.current.rotation.y = rotations[direction] || 0;
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh position={[0, 0.45, 0]} geometry={geo.torso} castShadow>
        <meshStandardMaterial color={clothingColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.75, 0]} geometry={geo.collar} castShadow>
        <meshStandardMaterial color={clothingColor} roughness={0.6} />
      </mesh>

      {/* Head group */}
      <group position={[0, 1.05, 0]}>
        <mesh geometry={geo.head} castShadow>
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.35, 0, 0]} geometry={geo.ear} castShadow>
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        <mesh position={[0.35, 0, 0]} geometry={geo.ear} castShadow>
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>

        {/* Hair — default */}
        {hairStyle === 'default' && (
          <>
            <mesh position={[0, 0.15, 0]} geometry={geo.hairCapDefault} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.1, 0.25]} geometry={geo.hairBangDefault} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
          </>
        )}

        {/* Hair — spiky */}
        {hairStyle === 'spiky' && (
          <>
            <mesh position={[0, 0.25, 0]} geometry={geo.hairSpikyMain} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
            <mesh position={[0.15, 0.2, 0]} rotation={[0, 0, -0.4]} geometry={geo.hairSpikySide} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
            <mesh position={[-0.15, 0.2, 0]} rotation={[0, 0, 0.4]} geometry={geo.hairSpikySide} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
          </>
        )}

        {/* Hair — long */}
        {hairStyle === 'long' && (
          <>
            <mesh position={[0, 0.1, 0]} geometry={geo.hairCapLong} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.2, -0.15]} geometry={geo.hairLongBack} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
          </>
        )}

        {/* Hair — ponytail */}
        {hairStyle === 'ponytail' && (
          <>
            <mesh position={[0, 0.15, 0]} geometry={geo.hairCapDefault} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.1, -0.35]} rotation={[0.5, 0, 0]} geometry={geo.hairPonytail} castShadow>
              <meshStandardMaterial color={hairColor} roughness={0.8} />
            </mesh>
          </>
        )}

        {/* Eyes */}
        <group position={[0, 0, 0.32]}>
          <mesh position={[-0.12, 0, 0]} geometry={geo.eyeWhite}>
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.12, 0, 0.05]} geometry={geo.eyeIris}>
            <meshBasicMaterial color={eyeColor} />
          </mesh>
          <mesh position={[-0.12, 0, 0.08]} geometry={geo.eyePupil}>
            <meshBasicMaterial color="#000000" />
          </mesh>
          <mesh position={[0.12, 0, 0]} geometry={geo.eyeWhite}>
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.12, 0, 0.05]} geometry={geo.eyeIris}>
            <meshBasicMaterial color={eyeColor} />
          </mesh>
          <mesh position={[0.12, 0, 0.08]} geometry={geo.eyePupil}>
            <meshBasicMaterial color="#000000" />
          </mesh>
        </group>

        {/* Eyebrows */}
        <mesh position={[-0.12, 0.12, 0.33]} rotation={[0, 0, 0.1]} geometry={geo.eyebrow}>
          <meshBasicMaterial color={hairColor} />
        </mesh>
        <mesh position={[0.12, 0.12, 0.33]} rotation={[0, 0, -0.1]} geometry={geo.eyebrow}>
          <meshBasicMaterial color={hairColor} />
        </mesh>

        {/* Mouth */}
        <mesh position={[0, -0.12, 0.34]} geometry={geo.mouth}>
          <meshBasicMaterial color="#d97706" />
        </mesh>

        {/* Cheeks */}
        <mesh position={[-0.22, -0.05, 0.28]} geometry={geo.cheek}>
          <meshBasicMaterial color="#fca5a5" transparent opacity={0.5} />
        </mesh>
        <mesh position={[0.22, -0.05, 0.28]} geometry={geo.cheek}>
          <meshBasicMaterial color="#fca5a5" transparent opacity={0.5} />
        </mesh>
      </group>

      {/* Arms */}
      <mesh position={[-0.42, 0.5, 0]} rotation={[0, 0, 0.4]} geometry={geo.arm} castShadow>
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      <mesh position={[0.42, 0.5, 0]} rotation={[0, 0, -0.4]} geometry={geo.arm} castShadow>
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>

      {/* Hands */}
      <mesh position={[-0.52, 0.3, 0]} geometry={geo.hand} castShadow>
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      <mesh position={[0.52, 0.3, 0]} geometry={geo.hand} castShadow>
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.12, 0, 0]} geometry={geo.leg} castShadow>
        <meshStandardMaterial color={clothingColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.12, 0, 0]} geometry={geo.leg} castShadow>
        <meshStandardMaterial color={clothingColor} roughness={0.6} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.12, -0.18, 0.05]} geometry={geo.shoe} castShadow>
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[0.12, -0.18, 0.05]} geometry={geo.shoe} castShadow>
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>

      {/* Accessories — glasses */}
      {accessory === 'glasses' && (
        <group position={[0, 1.05, 0.35]}>
          <mesh position={[-0.12, 0, 0]} geometry={geo.glassLens}>
            <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0.12, 0, 0]} geometry={geo.glassLens}>
            <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0]} geometry={geo.glassBridge}>
            <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* Accessories — hat */}
      {accessory === 'hat' && (
        <group position={[0, 1.45, 0]}>
          <mesh geometry={geo.hatBrim} castShadow>
            <meshStandardMaterial color="#7c3aed" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.15, 0]} geometry={geo.hatTop} castShadow>
            <meshStandardMaterial color="#7c3aed" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* Accessories — headphones */}
      {accessory === 'headphones' && (
        <group position={[0, 1.15, 0]}>
          <mesh position={[0, 0.25, 0]} geometry={geo.headband}>
            <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[-0.35, 0, 0]} rotation={[0, Math.PI / 2, 0]} geometry={geo.headphoneCup} castShadow>
            <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0.35, 0, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={geo.headphoneCup} castShadow>
            <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* Shadow */}
      <mesh position={[0, -0.19, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geo.shadow}>
        <meshBasicMaterial color="#000000" transparent opacity={0.25} />
      </mesh>
    </group>
  );
};

export default ProceduralChibiAvatar;
