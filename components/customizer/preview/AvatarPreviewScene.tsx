/**
 * @module customizer/preview/AvatarPreviewScene
 * @description R3F scene for avatar 3D preview inside the customizer modal.
 * Self-contained: owns its lighting, ground plane, and orbit controls.
 *
 * Clean Architecture: Presentation layer — pure R3F component, no business logic.
 * Ref: R3F docs — "split by semantic function (lighting, models, controls)"
 */

import React from 'react';
import { OrbitControls } from '@react-three/drei';
import { GLTFAvatar } from '../../avatar3d/GLTFAvatar';
import type { Avatar3DConfig } from '../../avatar3d/shared';

interface AvatarPreviewSceneProps {
  avatarConfig: Avatar3DConfig | null;
}

export const AvatarPreviewScene: React.FC<AvatarPreviewSceneProps> = ({ avatarConfig }) => (
  <>
    <ambientLight intensity={0.9} />
    <pointLight position={[10, 10, 10]} intensity={1.5} />
    <pointLight position={[0, -0.5, -2]} intensity={0.8} color="#ffffff" />
    <directionalLight position={[-5, 5, 5]} intensity={0.8} />
    <group position={[0, -1.1, 0]}>
      <GLTFAvatar
        avatarConfig={avatarConfig}
        animationState="idle"
        direction="front"
        scale={0.8}
      />
    </group>
    <OrbitControls
      enablePan={false}
      enableZoom={true}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.85}
      minDistance={2}
      maxDistance={5}
    />
    {/* Ground plane */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
      <circleGeometry args={[2.5, 64]} />
      <meshStandardMaterial color="#3d4452" roughness={0.4} metalness={0.1} transparent opacity={0.6} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.06, 0]}>
      <circleGeometry args={[2.55, 64]} />
      <meshBasicMaterial color="#c8aa6e" transparent opacity={0.2} />
    </mesh>
  </>
);
