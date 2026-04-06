'use client';

import React, { useState, useRef, useEffect, Suspense, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useStore } from '@/store/useStore';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { GLTFAvatar } from './avatar3d/GLTFAvatar';
import { useAvatar3D } from './avatar3d/useAvatar3D';
import type { Avatar3DConfig } from './avatar3d/shared';
import { UserAvatar } from './UserAvatar';
import { AvatarCard } from './AvatarCard';
import { ObjectCard } from './ObjectCard';
import { useAvatarCatalog } from '../hooks/customizer/useAvatarCatalog';
import { useProfileEditor } from '../hooks/customizer/useProfileEditor';
import { glass, colors, composites, typography, radius, animation } from '@/styles/design-tokens';
import { GeometriaProceduralObjeto3D } from './3d/GeometriaProceduralObjeto3D';
import { esObjetoArquitectonicoProcedural } from '@/src/core/domain/entities/objetosArquitectonicos';

const PreviewCaptureBridge = ({ captureToken, onCapture }: { captureToken: number | null; onCapture: (blob: Blob) => void }) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (captureToken === null) return;

    let cancelled = false;

    const capture = () => {
      gl.render(scene, camera);
      gl.domElement.toBlob((blob) => {
        if (!cancelled && blob) {
          onCapture(blob);
        }
      }, 'image/png');
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(capture);
    } else {
      capture();
    }

    return () => {
      cancelled = true;
    };
  }, [camera, captureToken, gl, onCapture, scene]);

  return null;
};

const PreviewRendererLifecycle = () => {
  const { gl } = useThree();

  useEffect(() => {
    return () => {
      if (typeof gl.forceContextLoss === 'function') {
        gl.forceContextLoss();
      }
      gl.dispose();
    };
  }, [gl]);

  return null;
};

const ObjectPreviewFallback: React.FC<{ color?: string | null }> = ({ color }) => (
  <group>
    <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
      <boxGeometry args={[0.9, 0.9, 0.9]} />
      <meshStandardMaterial color={color || '#c8aa6e'} roughness={0.45} metalness={0.08} />
    </mesh>
  </group>
);

const BuiltInObjectPreview: React.FC<{ objeto: CatalogoObjeto3D }> = ({ objeto }) => {
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
        <meshStandardMaterial
          color={objeto.built_in_color || '#94a3b8'}
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
};

interface ObjectPreviewErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: () => void;
}

interface ObjectPreviewErrorBoundaryState {
  hasError: boolean;
}

class ObjectPreviewErrorBoundary extends React.Component<ObjectPreviewErrorBoundaryProps, ObjectPreviewErrorBoundaryState> {
  constructor(props: ObjectPreviewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const Object3DPreview = ({ modelUrl, onReady }: { modelUrl: string; onReady?: () => void }) => {
  const { scene } = useGLTF(modelUrl);
  const disposableMaterialsRef = useRef<THREE.Material[]>([]);

  useEffect(() => {
    useGLTF.preload(modelUrl);
  }, [modelUrl]);

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
    clone.position.set(
      -center.x * scale,
      -box.min.y * scale + 0.02,
      -center.z * scale
    );
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : [mesh.material.clone()];
          materials.forEach((m) => {
            m.side = THREE.DoubleSide;
            nextDisposableMaterials.push(m);
          });
          mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
        }
      }
    });
    disposableMaterialsRef.current = nextDisposableMaterials;
    return clone;
  }, [scene]);

  useEffect(() => {
    onReady?.();
  }, [clonedScene, onReady]);

  useEffect(() => {
    return () => {
      disposableMaterialsRef.current.forEach((material) => material.dispose());
      disposableMaterialsRef.current = [];
    };
  }, [clonedScene]);

  return <primitive object={clonedScene} />;
};

const ObjectPreviewPoster: React.FC<{ selectedObject: CatalogoObjeto3D }> = ({ selectedObject }) => {
  if (selectedObject.thumbnail_url) {
    return (
      <group>
        <HtmlFullscreenImage src={selectedObject.thumbnail_url} alt={selectedObject.nombre} />
      </group>
    );
  }

  if (selectedObject.modelo_url) {
    return (
      <group>
        <mesh position={[0, 0.8, -0.2]}>
          <planeGeometry args={[2.4, 2.4]} />
          <meshBasicMaterial color="#10141f" transparent opacity={0.92} />
        </mesh>
      </group>
    );
  }

  if (selectedObject.built_in_geometry) {
    return <BuiltInObjectPreview objeto={selectedObject} />;
  }

  return <ObjectPreviewFallback color={selectedObject.built_in_color} />;
};

const HtmlFullscreenImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => (
  <group>
    <mesh position={[0, 0.8, -0.2]}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
    <primitive
      object={new THREE.Group()}
      onUpdate={(group: THREE.Group) => {
        if (group.children.length > 0) return;
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(src, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
          const sprite = new THREE.Sprite(material);
          sprite.scale.set(2.4, 2.4, 1);
          group.add(sprite);
        });
      }}
    />
  </group>
);

const PreviewCanvas: React.FC<{
  cameraFov: number;
  cameraPosition: [number, number, number];
  captureToken: number | null;
  children: React.ReactNode;
  fallback: React.ReactNode;
  onCapture: (blob: Blob) => void;
  frameloop?: 'always' | 'demand';
  pixelRatio?: number | [number, number];
  powerPreference?: WebGLPowerPreference;
  shadows?: boolean;
}> = ({
  cameraFov,
  cameraPosition,
  captureToken,
  children,
  fallback,
  onCapture,
  frameloop = 'demand',
  pixelRatio = [1, 1.5],
  powerPreference = 'high-performance',
  shadows = false,
}) => (
  <Canvas
    frameloop={frameloop}
    shadows={shadows}
    dpr={pixelRatio}
    camera={{ position: cameraPosition, fov: cameraFov }}
    gl={{ alpha: true, antialias: true, powerPreference, failIfMajorPerformanceCaveat: false }}
    onCreated={({ gl }) => {
      gl.setClearColor('#000000', 0);
    }}
  >
    <PreviewRendererLifecycle />
    <PreviewCaptureBridge captureToken={captureToken} onCapture={onCapture} />
    <Suspense fallback={fallback}>{children}</Suspense>
  </Canvas>
);

const AvatarPreviewScene: React.FC<{ avatarConfig: Avatar3DConfig | null }> = ({ avatarConfig }) => (
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
    <OrbitControls enablePan={false} enableZoom={true} enableDamping dampingFactor={0.08} rotateSpeed={0.85} minDistance={2} maxDistance={5} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
      <circleGeometry args={[2.5, 64]} />
      <meshStandardMaterial
        color="#3d4452"
        roughness={0.4}
        metalness={0.1}
        transparent={true}
        opacity={0.6}
      />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.06, 0]}>
      <circleGeometry args={[2.55, 64]} />
      <meshBasicMaterial color="#c8aa6e" transparent opacity={0.2} />
    </mesh>
  </>
);

const ObjectPreviewScene: React.FC<{
  hasModel: boolean;
  onError: () => void;
  selectedObject: CatalogoObjeto3D;
}> = ({ hasModel, onError, selectedObject }) => (
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
        <OrbitControls enablePan={false} enableZoom={true} enableDamping dampingFactor={0.08} rotateSpeed={0.85} minDistance={1} maxDistance={6} target={[0, 0.65, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[1.5, 64]} />
          <meshStandardMaterial
            color="#3d4452"
            roughness={0.5}
            transparent={true}
            opacity={0.4}
          />
        </mesh>
      </>
    ) : (
      <>
        <directionalLight position={[3, 4, 5]} intensity={1.8} color="#ffffff" />
        <pointLight position={[-4, 3, -3]} intensity={0.8} color="#87ceeb" />
        <BuiltInObjectPreview objeto={selectedObject} />
        <OrbitControls enablePan={false} enableZoom={true} enableDamping dampingFactor={0.08} rotateSpeed={0.85} minDistance={1.5} maxDistance={8} target={[0, 0.8, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[2, 64]} />
          <meshStandardMaterial color="#3d4452" roughness={0.5} transparent opacity={0.4} />
        </mesh>
      </>
    )}
  </>
);

interface AvatarCustomizer3DProps {
  compact?: boolean;
  onClose?: () => void;
  onPrepararObjeto?: (objeto: CatalogoObjeto3D) => void;
  modoColocacionActivo?: boolean;
  modoReemplazoActivo?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  todos: 'Todos',
  mobiliario: 'Mobiliario',
  construccion: 'Construcción',
  accesorios: 'Accesorios',
  plantas: 'Plantas',
  tech: 'Tech',
  tecnologia: 'Tech',
  pared: 'Paredes',
  otro: 'Otros',
};

const CATEGORY_ICONS: Record<string, string> = {
  todos: '🌐',
  mobiliario: '🛋️',
  construccion: '🏗️',
  accesorios: '✨',
  plantas: '🌿',
  tech: '💻',
  tecnologia: '💻',
  pared: '🧱',
  otro: '📦',
};

const reorderAvatars = <T extends { id: string }>(avatars: T[], equippedAvatarId: string | null): T[] => {
  if (!equippedAvatarId) return avatars;
  const equipped = avatars.find((avatar) => avatar.id === equippedAvatarId);
  if (!equipped) return avatars;
  return [equipped, ...avatars.filter((avatar) => avatar.id !== equippedAvatarId)];
};

export const AvatarCustomizer3D: React.FC<AvatarCustomizer3DProps> = ({ compact = false, onClose, onPrepararObjeto, modoColocacionActivo = false, modoReemplazoActivo = false }) => {
  const { currentUser } = useStore();
  const { avatarConfig } = useAvatar3D(currentUser?.id);
  const [activeTab, setActiveTab] = useState<'profile' | 'avatares' | 'objetos'>('profile');

  // Cargar catálogos y gestionar estado
  const catalog = useAvatarCatalog();

  // Gestionar perfil del usuario
  const profile = useProfileEditor({ onClose });

  // Estados locales para la captura de thumbnails
  const [captureRequest, setCaptureRequest] = useState<{ kind: 'avatar' | 'object'; token: number } | null>(null);

  // Cargar catálogos al montar el componente
  useEffect(() => {
    void catalog.loadCatalogs();
  }, []);

  const objectCategories = useMemo(() => {
    const categories = Array.from(new Set(catalog.availableObjects.map((object) => object.categoria).filter(Boolean)));
    return ['todos', ...categories];
  }, [catalog.availableObjects]);

  const filteredObjects = useMemo(() => {
    if (catalog.selectedCategory === 'todos') return catalog.availableObjects;
    return catalog.availableObjects.filter((object) => object.categoria === catalog.selectedCategory);
  }, [catalog.availableObjects, catalog.selectedCategory]);

  // Actualizar selección de objeto si la categoría actual no tiene objetos
  useEffect(() => {
    if (filteredObjects.length === 0) return;
    const existeSeleccion = filteredObjects.some((object) => object.id === catalog.selectedObjectId);
    if (!existeSeleccion && filteredObjects.length > 0) {
      catalog.selectObject(filteredObjects[0].id);
    }
  }, [filteredObjects, catalog.selectedObjectId]);

  const selectedObject = useMemo(
    () => catalog.availableObjects.find((object) => object.id === catalog.selectedObjectId) || null,
    [catalog.availableObjects, catalog.selectedObjectId]
  );

  useEffect(() => {
    if (selectedObject?.modelo_url) {
      useGLTF.preload(selectedObject.modelo_url);
    }
  }, [selectedObject]);

  const handlePrepararObjeto = useCallback(() => {
    if (!selectedObject || !onPrepararObjeto) return;
    onPrepararObjeto(selectedObject);
    if (onClose) onClose();
  }, [selectedObject, onPrepararObjeto, onClose]);

  const handleObjectDragStart = useCallback((e: React.DragEvent, data: CatalogoObjeto3D) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    if (onClose) setTimeout(() => onClose(), 150);
  }, [onClose]);

  const handleObjectModelError = useCallback(async (objectId: string, modelUrl?: string | null) => {
    if (!objectId) return;
    await catalog.reportInvalidObjectModel(objectId, !catalog.availableObjects.find((o) => o.id === objectId)?.built_in_geometry);
  }, [catalog]);

  // Tabs config
  const tabs = [
    { key: 'profile' as const, label: 'Perfil', icon: '👤' },
    { key: 'avatares' as const, label: 'Avatares', icon: '🧍' },
    { key: 'objetos' as const, label: 'Objetos', icon: '📦' },
  ];

  const handlePreviewCapture = useCallback((blob: Blob) => {
    const kind = captureRequest?.kind;
    setCaptureRequest(null);
    if (!kind) return;
    void catalog.captureThumbnail(blob);
  }, [captureRequest?.kind, catalog]);

  const requestAvatarCapture = useCallback(() => {
    if (catalog.isCapturing) return;
    setCaptureRequest({ kind: 'avatar', token: Date.now() });
  }, [catalog.isCapturing]);

  const requestObjectCapture = useCallback(() => {
    if (catalog.isCapturing) return;
    setCaptureRequest({ kind: 'object', token: Date.now() });
  }, [catalog.isCapturing]);

  // 3D Preview Panel
  const renderPreviewPanel = () => {
    if (activeTab === 'objetos' && selectedObject) {
      const hasModel = !!selectedObject.modelo_url && !catalog.invalidObjectModelIds.has(selectedObject.id);
      const hasPreview3D = hasModel || !!selectedObject.built_in_geometry;

      return (
        <>
          {hasModel && (
            <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
              <button
                onClick={requestObjectCapture}
                disabled={catalog.isCapturing}
                title="Capturar miniatura del objeto"
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${catalog.isCapturing ? 'bg-zinc-800 cursor-not-allowed' : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'}
                `}
              >
                {catalog.isCapturing ? <div className="w-3 h-3 border-2 border-[#c8aa6e] border-t-transparent rounded-full animate-spin" /> : '📸'}
              </button>
            </div>
          )}

          <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-3 pointer-events-none">
            <div className="flex items-start justify-between gap-3 z-10">
              <div>
                {!selectedObject.premium && (
                  <div className="inline-flex items-center rounded-sm border border-emerald-400/30 bg-emerald-500/80 px-2 py-0.5 shadow-sm backdrop-blur-[2px] mb-2">
                    <span className="text-[6px] font-black uppercase tracking-[0.2em] text-white leading-none">Free</span>
                  </div>
                )}
                <h2 className="text-base font-black text-white drop-shadow-lg">{selectedObject.nombre}</h2>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#0397ab]/70">
                  {CATEGORY_ICONS[selectedObject.categoria] || '📦'} {CATEGORY_LABELS[selectedObject.categoria] || selectedObject.categoria}
                </p>
              </div>
              {(selectedObject.es_interactuable || selectedObject.es_sentable) && (
                <span className="rounded-full bg-black/40 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] text-amber-300 backdrop-blur-md border border-amber-500/20">
                  {selectedObject.es_sentable ? '🪑 Sit' : '⚡ Inter.'}
                </span>
              )}
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden my-2 pointer-events-auto">
              {hasPreview3D ? (
                <PreviewCanvas
                  cameraFov={35}
                  cameraPosition={hasModel ? [0, 1, 3] : [0, 1.5, 4]}
                  captureToken={captureRequest?.kind === 'object' ? captureRequest.token : null}
                  fallback={<ObjectPreviewPoster selectedObject={selectedObject} />}
                  onCapture={handlePreviewCapture}
                  frameloop="demand"
                  pixelRatio={[1, 1.5]}
                  shadows={false}
                >
                  <ObjectPreviewScene
                    hasModel={hasModel}
                    onError={() => handleObjectModelError(selectedObject.id, selectedObject.modelo_url)}
                    selectedObject={selectedObject}
                  />
                </PreviewCanvas>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl text-[#0397ab]/20">
                   📦
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 z-10 pointer-events-auto">
              <p className="flex-1 text-[9px] text-[#a09b8c] font-medium truncate">
                {selectedObject.descripcion || 'Arrastra al espacio o haz clic en Colocar.'}
              </p>
              <button
                onClick={handlePrepararObjeto}
                disabled={!onPrepararObjeto}
                className={`flex-shrink-0 px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded transition-all duration-300 ${
                  !onPrepararObjeto
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                    : 'bg-[#0397ab] text-white border border-[#04c8e0] shadow-[0_0_15px_rgba(4,200,224,0.4)] hover:shadow-[0_0_25px_rgba(4,200,224,0.6)] hover:bg-[#04c8e0]'
                }`}
              >
                {modoReemplazoActivo ? '♻ Reemplazar' : modoColocacionActivo ? '✓ Activo' : '🎯 Colocar'}
              </button>
            </div>
          </div>
        </>
      );
    }

    // Avatar preview
    return (
      <>
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
           <button
             onClick={requestAvatarCapture}
             disabled={catalog.isCapturing}
             title="Capturar miniatura"
             className={`
               w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
               ${catalog.isCapturing ? 'bg-zinc-800 cursor-not-allowed' : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'}
             `}
           >
             {catalog.isCapturing ? <div className="w-3 h-3 border-2 border-[#c8aa6e] border-t-transparent rounded-full animate-spin" /> : '📸'}
           </button>
        </div>

        <PreviewCanvas
          cameraFov={30}
          cameraPosition={[0, 0.8, 5]}
          captureToken={captureRequest?.kind === 'avatar' ? captureRequest.token : null}
          fallback={null}
          onCapture={handlePreviewCapture}
          frameloop="always"
          pixelRatio={[1, 1.5]}
          shadows={false}
        >
          <AvatarPreviewScene avatarConfig={catalog.previewConfig || avatarConfig} />
        </PreviewCanvas>
        <div className="absolute bottom-3 left-3 text-[9px] text-white/30 pointer-events-none">
          Arrastra para rotar · Scroll para zoom
        </div>
      </>
    );
  };

  return (
    <div className={compact
      ? "p-3 flex flex-col gap-3 h-full"
      : "p-4 flex flex-col lg:flex-row gap-4 h-full overflow-hidden sm:p-3"
    }>
      {/* ====== Panel izquierdo: Preview 3D ====== */}
      <div className={`
        ${compact ? 'h-56' : 'lg:flex-1 min-h-[300px]'}
        bg-[#1a1c23] bg-[radial-gradient(ellipse_at_center,_#2d3748_0%,_#1a1c23_50%,_#0f1419_100%)]
        rounded-md border border-[#2b2518] shadow-[0_0_30px_rgba(3,151,171,0.1)_inset]
        overflow-hidden relative
      `}>
        {renderPreviewPanel()}

        {(profile.saved || catalog.avatarSaved) && (
          <div className="absolute top-3 right-3 bg-emerald-500/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-full animate-in fade-in shadow-lg shadow-emerald-500/30">
            ✓ Guardado
          </div>
        )}

        {/* User info chip */}
        <div className={`absolute bottom-3 right-3 flex items-center gap-2 ${glass.card} rounded-xl p-1.5 pr-3`}>
          <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="xs" showStatus status={currentUser.status} />
          <div>
            <p className="text-[9px] font-bold text-white/80 leading-tight">{profile.displayName || currentUser.name}</p>
            <p className="text-[7px] text-white/30">{currentUser.cargo || 'Colaborador'}</p>
          </div>
        </div>
      </div>

      {/* ====== Panel derecho: Personalización ====== */}
      <div className={`${compact ? 'flex-1 min-h-0' : 'lg:w-[380px] xl:w-[420px]'} flex flex-col gap-3 min-h-0`}>
        {/* Tabs */}
        <div className="flex gap-1 bg-[#0a0a0c] border border-[#1e2328] p-1 rounded-md flex-shrink-0 relative">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 py-2.5 rounded text-[9px] font-black uppercase tracking-widest transition-all duration-300 relative overflow-hidden
                ${activeTab === tab.key
                  ? `bg-[#0397ab] text-white shadow-[0_0_15px_rgba(3,151,171,0.5)] border border-[#04c8e0]`
                  : `text-[#a09b8c] hover:text-[#f0e6d2] hover:bg-[#1e2328] border border-transparent`
                }
              `}
            >
              {activeTab === tab.key && (
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 Mix-blend-overlay"></div>
              )}
              <span className="relative z-10 drop-shadow-md flex items-center justify-center gap-1.5">
                {tab.icon} {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
          {/* ===== TAB PERFIL ===== */}
          {activeTab === 'profile' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Foto de perfil */}
              <section className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="xl" />
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (file) void profile.uploadProfilePhoto(file);
                      };
                      input.click();
                    }}
                    disabled={profile.uploading}
                    className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    {profile.uploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (file) void profile.uploadProfilePhoto(file);
                      };
                      input.click();
                    }}
                    disabled={profile.uploading}
                    className={`px-3 py-1.5 ${composites.buttonPrimary} text-[9px] rounded-lg`}
                  >
                    {profile.profilePhoto ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {profile.profilePhoto && (
                    <button
                      onClick={() => void profile.removeProfilePhoto()}
                      disabled={profile.uploading}
                      className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 rounded-lg text-[9px] font-bold text-red-400 transition-all border border-red-500/20"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-zinc-600 text-center">
                  Tu foto aparecerá en chats, perfil y menciones. Max 5MB.
                </p>
              </section>

              {/* Nombre */}
              <section>
                <label className={`${typography.label.xs} text-violet-400 mb-1.5 block`}>Nombre</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      // Update local state directly without calling hook - hook will sync on blur
                      const input = e.currentTarget;
                      setTimeout(() => {
                        if (input.value === newName) {
                          void profile.updateDisplayName(newName);
                        }
                      }, 300);
                    }}
                    className={`flex-1 ${composites.inputBase} px-3 py-2 text-xs ${radius.input}`}
                    placeholder="Tu nombre"
                  />
                  <button
                    onClick={() => void profile.updateDisplayName(profile.displayName)}
                    disabled={profile.displayName.trim() === currentUser.name}
                    className={`px-3 py-2 ${composites.buttonPrimary} text-[9px] ${radius.button} disabled:opacity-30`}
                  >
                    Guardar
                  </button>
                </div>
              </section>

              {/* Vista previa chat */}
              <section className={`${glass.card} ${radius.card} p-3`}>
                <label className={`${typography.label.xs} text-violet-400 mb-2 block`}>Vista previa en chat</label>
                <div className="flex items-center gap-2.5 p-2.5 bg-black/30 rounded-xl">
                  <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="sm" showStatus status={currentUser.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{profile.displayName || currentUser.name}</p>
                    <p className="text-[9px] text-white/35">{currentUser.cargo || 'Colaborador'}</p>
                  </div>
                  <span className="text-[8px] text-white/25">12:00</span>
                </div>
                <div className="ml-10 mt-1 p-2.5 bg-violet-600/15 rounded-xl rounded-tl-none border border-violet-500/10">
                  <p className="text-[11px] text-white/70">Hola equipo, ¿cómo va el proyecto?</p>
                </div>
              </section>
            </div>
          )}

          {/* ===== TAB AVATARES ===== */}
          {activeTab === 'avatares' && (
            <div className="space-y-2 animate-in fade-in duration-200">
              {/* Info del avatar seleccionado */}
              {catalog.selectedAvatarId && (() => {
                const sel = catalog.availableAvatars.find(a => a.id === catalog.selectedAvatarId);
                return sel ? (
                  <div className="bg-[#0a0a0c] border border-[#1e2328] rounded-md p-2.5 relative">
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#c8aa6e] opacity-50" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#c8aa6e] opacity-50" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-black text-[#f0e6d2] uppercase tracking-wide truncate">{sel.nombre}</h3>
                        <p className="text-[9px] text-[#a09b8c] mt-0.5">{sel.descripcion || 'Avatar 3D listo para el espacio virtual.'}</p>
                      </div>
                      {catalog.equippedAvatarId === sel.id && (
                        <span className="flex-shrink-0 rounded bg-[#c8aa6e]/90 px-2 py-0.5 text-[8px] font-black uppercase text-[#0a0a0c]">✓ Equipado</span>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}

              {catalog.loadingAvatars ? (
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  Cargando modelos...
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar pb-4">
                  {catalog.availableAvatars.map((avatar) => (
                    <AvatarCard
                      key={avatar.id}
                      onClick={() => void catalog.changeEquippedAvatar(avatar.id)}
                      nombre={avatar.nombre}
                      descripcion={avatar.descripcion}
                      thumbnailUrl={avatar.thumbnail_url}
                      seleccionado={catalog.selectedAvatarId === avatar.id}
                      equipado={catalog.equippedAvatarId === avatar.id}
                      isPremium={avatar.premium || false}
                    />
                  ))}
                </div>
              )}

              {catalog.avatarSaved && (
                <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300 text-center">
                  ✓ Avatar equipado correctamente.
                </div>
              )}
            </div>
          )}

          {/* ===== TAB OBJETOS ===== */}
          {activeTab === 'objetos' && (
            <div className="space-y-2 animate-in fade-in duration-200">
              {/* Category pills horizontal */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-shrink-0">
                {objectCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => catalog.selectCategory(category)}
                    className={`
                      flex-shrink-0 rounded px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all duration-200
                      ${catalog.selectedCategory === category
                        ? `bg-[#0397ab] text-white shadow-[0_0_10px_rgba(3,151,171,0.4)] border border-[#04c8e0]`
                        : `bg-[#0a0a0c] text-[#a09b8c] hover:bg-[#1e2328] hover:text-[#f0e6d2] border border-[#1e2328]`
                      }
                    `}
                  >
                    {CATEGORY_ICONS[category] || '📦'} {CATEGORY_LABELS[category] || category}
                  </button>
                ))}
              </div>

              {/* Selected object detail + action */}
              {selectedObject && (
                <div className="bg-[#0a0a0c] border border-[#1e2328] rounded-md p-2.5 relative">
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#0397ab] opacity-50" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#0397ab] opacity-50" />
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[10px] font-black text-[#f0e6d2] uppercase tracking-wide truncate">{selectedObject.nombre}</h3>
                      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#0397ab]">
                        {CATEGORY_LABELS[selectedObject.categoria] || selectedObject.categoria}
                      </p>
                    </div>
                    <button
                      onClick={handlePrepararObjeto}
                      disabled={!onPrepararObjeto}
                      className={`flex-shrink-0 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider transition-all duration-200 rounded ${
                        !onPrepararObjeto
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                          : modoColocacionActivo
                            ? 'bg-emerald-600 text-white border border-emerald-400'
                            : 'bg-[#0397ab] text-white border border-[#04c8e0] hover:bg-[#04c8e0]'
                      }`}
                    >
                      {modoColocacionActivo ? '✓ Activo' : '🎯 Colocar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Objects grid */}
              {catalog.loadingObjects ? (
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  Cargando objetos...
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar pb-4">
                  {filteredObjects.map((object) => (
                    <ObjectCard
                      key={object.id}
                      nombre={object.nombre}
                      categoria={CATEGORY_LABELS[object.categoria] || object.categoria}
                      thumbnailUrl={object.thumbnail_url}
                      interactuable={object.es_interactuable}
                      sentable={object.es_sentable}
                      seleccionado={catalog.selectedObjectId === object.id}
                      isPremium={object.premium || false}
                      onClick={() => catalog.selectObject(object.id)}
                      builtInColor={object.built_in_color}
                      builtInGeometry={object.built_in_geometry}
                      catalogData={object}
                      onDragStart={handleObjectDragStart}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarCustomizer3D;
