/**
 * @module customizer/preview/ObjectPreviewScene
 * @description R3F scene for 3D object preview in the customizer.
 * Contains all object preview sub-components: GLB loader, built-in geometry,
 * error boundary, and poster fallback.
 *
 * Clean Architecture: Presentation layer — R3F components, zero business logic.
 * Ref: Three.js dispose guide — explicit cleanup of cloned materials on unmount.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls, useGLTF } from '@react-three/drei';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { GeometriaProceduralObjeto3D } from '../../3d/GeometriaProceduralObjeto3D';
import { esObjetoArquitectonicoProcedural } from '@/src/core/domain/entities/objetosArquitectonicos';

// ─── Fallback cube ───────────────────────────────────────────────────────────
export const ObjectPreviewFallback: React.FC<{ color?: string | null }> = ({ color }) => (
  <group>
    <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
      <boxGeometry args={[0.9, 0.9, 0.9]} />
      <meshStandardMaterial color={color || '#c8aa6e'} roughness={0.45} metalness={0.08} />
    </mesh>
  </group>
);

// ─── Built-in geometry preview ───────────────────────────────────────────────
export const BuiltInObjectPreview: React.FC<{ objeto: CatalogoObjeto3D }> = ({ objeto }) => {
  const ancho = Number(objeto.ancho) || 1;
  const alto = Number(objeto.alto) || 1;
  const profundidad = Number(objeto.profundidad) || 0.15;

  const maxDim = Math.max(ancho, alto, profundidad);
  const escala = 1.8 / maxDim;
  const dimensiones: [number, number, number] = [ancho * escala, alto * escala, profundidad * escala];

  const esProcedural = esObjetoArquitectonicoProcedural({
    built_in_geometry: objeto.built_in_geometry,
    built_in_color: objeto.built_in_color,
    tipo: objeto.tipo,
    ancho,
    alto,
    profundidad,
    configuracion_geometria: objeto.configuracion_geometria,
  });

  if (esProcedural) {
    return (
      <group position={[0, (alto * escala) / 2, 0]}>
        <GeometriaProceduralObjeto3D
          objeto={{
            built_in_geometry: objeto.built_in_geometry,
            built_in_color: objeto.built_in_color,
            ancho,
            alto,
            profundidad,
            configuracion_geometria: objeto.configuracion_geometria,
          }}
          dimensiones={dimensiones}
          opacidad={1}
          transparente={false}
          resaltar={false}
        />
      </group>
    );
  }

  return (
    <group position={[0, (alto * escala) / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={dimensiones} />
        <meshStandardMaterial color={objeto.built_in_color || '#94a3b8'} roughness={0.6} metalness={0.05} />
      </mesh>
    </group>
  );
};

// ─── GLB model preview with dispose ──────────────────────────────────────────
export const Object3DPreview = ({
  modelUrl,
  onReady,
}: {
  modelUrl: string;
  onReady?: () => void;
}) => {
  const { scene } = useGLTF(modelUrl);
  const disposableMaterialsRef = useRef<THREE.Material[]>([]);

  useEffect(() => { useGLTF.preload(modelUrl); }, [modelUrl]);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const nextDisposableMaterials: THREE.Material[] = [];

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / (maxDim || 1);

    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale + 0.02, -center.z * scale);

    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : [mesh.material.clone()];
        materials.forEach((m) => {
          m.side = THREE.DoubleSide;
          nextDisposableMaterials.push(m);
        });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      }
    });

    disposableMaterialsRef.current = nextDisposableMaterials;
    return clone;
  }, [scene]);

  useEffect(() => { onReady?.(); }, [clonedScene, onReady]);

  // Dispose cloned materials on unmount — Three.js dispose guide
  useEffect(() => {
    return () => {
      disposableMaterialsRef.current.forEach((material) => material.dispose());
      disposableMaterialsRef.current = [];
    };
  }, [clonedScene]);

  return <primitive object={clonedScene} />;
};

// ─── Error boundary for GLB loading ──────────────────────────────────────────
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ObjectPreviewErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError?.();
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Poster fallback (thumbnail or built-in) ────────────────────────────────
// Refactor 2026-05-04: usar useEffect + group ref para garantizar disposal
// del SpriteMaterial + Texture al cambiar `src` o desmontar. Antes los
// recursos se acumulaban en GPU cada cambio de objeto previsualizado.
const HtmlFullscreenImage: React.FC<{ src: string; alt: string }> = ({ src }) => {
  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    let cancelado = false;
    let sprite: THREE.Sprite | null = null;
    let material: THREE.SpriteMaterial | null = null;
    let texture: THREE.Texture | null = null;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(src, (loaded) => {
      if (cancelado) {
        loaded.dispose();
        return;
      }
      texture = loaded;
      texture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      sprite = new THREE.Sprite(material);
      sprite.scale.set(2.4, 2.4, 1);
      group.add(sprite);
    });

    return () => {
      cancelado = true;
      if (sprite) group.remove(sprite);
      material?.dispose();
      texture?.dispose();
    };
  }, [src]);

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.8, -0.2]}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
};

export const ObjectPreviewPoster: React.FC<{ selectedObject: CatalogoObjeto3D }> = ({ selectedObject }) => {
  if (selectedObject.thumbnail_url) {
    return <HtmlFullscreenImage src={selectedObject.thumbnail_url} alt={selectedObject.nombre} />;
  }

  if (selectedObject.modelo_url) {
    return (
      <mesh position={[0, 0.8, -0.2]}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial color="#10141f" transparent opacity={0.92} />
      </mesh>
    );
  }

  if (selectedObject.built_in_geometry) {
    return <BuiltInObjectPreview objeto={selectedObject} />;
  }

  return <ObjectPreviewFallback color={selectedObject.built_in_color} />;
};

// ─── Composed scene ──────────────────────────────────────────────────────────
interface ObjectPreviewSceneProps {
  hasModel: boolean;
  onError: () => void;
  selectedObject: CatalogoObjeto3D;
}

export const ObjectPreviewScene: React.FC<ObjectPreviewSceneProps> = ({
  hasModel,
  onError,
  selectedObject,
}) => (
  <>
    <ambientLight intensity={hasModel ? 1.5 : 1.2} />
    <hemisphereLight intensity={hasModel ? 1.1 : 0.8} color="#f3f8ff" groundColor="#1a2333" />
    {hasModel ? (
      <>
        <directionalLight position={[0, 2.5, 4]} intensity={2.4} color="#ffffff" />
        <pointLight position={[8, 8, 8]} intensity={2.0} color="#ffffff" />
        <pointLight position={[-8, 4, -8]} intensity={1.5} color="#c8aa6e" />
        <pointLight position={[0, -5, 10]} intensity={1.2} color="#87ceeb" />
        <directionalLight position={[0, 10, 0]} intensity={1.5} color="#ffffff" />
        <directionalLight position={[5, 5, -5]} intensity={0.8} color="#ffd700" />
        <ObjectPreviewErrorBoundary
          key={`object-boundary-${selectedObject.id}-${selectedObject.modelo_url || 'sin-modelo'}`}
          fallback={<ObjectPreviewFallback color={selectedObject.built_in_color} />}
          onError={onError}
        >
          <Object3DPreview modelUrl={selectedObject.modelo_url!} />
        </ObjectPreviewErrorBoundary>
        <OrbitControls enablePan={false} enableZoom enableDamping dampingFactor={0.08} rotateSpeed={0.85} minDistance={1} maxDistance={6} target={[0, 0.65, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[1.5, 64]} />
          <meshStandardMaterial color="#3d4452" roughness={0.5} transparent opacity={0.4} />
        </mesh>
      </>
    ) : (
      <>
        <directionalLight position={[3, 4, 5]} intensity={1.8} color="#ffffff" />
        <pointLight position={[-4, 3, -3]} intensity={0.8} color="#87ceeb" />
        <BuiltInObjectPreview objeto={selectedObject} />
        <OrbitControls enablePan={false} enableZoom enableDamping dampingFactor={0.08} rotateSpeed={0.85} minDistance={1.5} maxDistance={8} target={[0, 0.8, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[2, 64]} />
          <meshStandardMaterial color="#3d4452" roughness={0.5} transparent opacity={0.4} />
        </mesh>
      </>
    )}
  </>
);
