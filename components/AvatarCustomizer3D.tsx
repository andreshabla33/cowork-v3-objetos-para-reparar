'use client';

import React, { useState, useRef, useEffect, Suspense, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useStore } from '@/store/useStore';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { GLTFAvatar } from './avatar3d/GLTFAvatar';
import { useAvatar3D } from './avatar3d/useAvatar3D';
import { UserAvatar } from './UserAvatar';
import { AvatarCard } from './AvatarCard';
import { ObjectCard } from './ObjectCard';
import { supabase } from '../lib/supabase';
import { glass, colors, composites, typography, radius, animation } from '@/styles/design-tokens';

// Componente para capturar el thumbnail de avatares desde el canvas
const SceneCapturer = ({ onCapture }: { onCapture: (blob: Blob) => void }) => {
  const { gl, scene, camera } = useThree();
  
  useEffect(() => {
    (window as any).captureAvatarThumbnail = () => {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL('image/png');
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => onCapture(blob));
    };
    return () => { delete (window as any).captureAvatarThumbnail; };
  }, [gl, scene, camera, onCapture]);

  return null;
};

// Componente para capturar el thumbnail de objetos desde el canvas
const SceneCapturerObject = ({ onCapture }: { onCapture: (blob: Blob) => void }) => {
  const { gl, scene, camera } = useThree();
  
  useEffect(() => {
    (window as any).captureObjectThumbnail = () => {
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL('image/png');
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => onCapture(blob));
    };
    return () => { delete (window as any).captureObjectThumbnail; };
  }, [gl, scene, camera, onCapture]);

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

   componentDidCatch(error: unknown) {
     console.error('❌ Error cargando preview 3D del objeto:', error);
     this.props.onError?.();
   }

   render() {
     if (this.state.hasError) {
       return this.props.fallback;
     }

     return this.props.children;
   }
 }

// Componente para previsualizar el modelo 3D del objeto con auto-ajuste
const Object3DPreview = ({ modelUrl }: { modelUrl: string }) => {
  const { scene } = useGLTF(modelUrl);
  
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    
    // Centrar y escalar automáticamente
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.5 / (maxDim || 1); // Evitar división por cero
    
    clone.scale.setScalar(scale);
    clone.position.set(
      -center.x * scale,
      -box.min.y * scale + 0.02,
      -center.z * scale
    );
    
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = Array.isArray(child.material) 
            ? child.material.map((m: any) => m.clone()) 
            : child.material.clone();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((m: any) => {
            m.side = THREE.DoubleSide;
          });
        }
      }
    });
    return clone;
  }, [scene]);

  return <primitive object={clonedScene} />;
};

interface AvatarCustomizer3DProps {
  compact?: boolean;
  onClose?: () => void;
  onPrepararObjeto?: (objeto: CatalogoObjeto3D) => void;
  modoColocacionActivo?: boolean;
}

interface AvatarModel {
  id: string;
  nombre: string;
  descripcion: string | null;
  modelo_url: string;
  thumbnail_url: string | null;
  escala: string;
  premium?: boolean;
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

const reorderAvatars = (avatars: AvatarModel[], equippedAvatarId: string | null) => {
  if (!equippedAvatarId) return avatars;
  const equipped = avatars.find((avatar) => avatar.id === equippedAvatarId);
  if (!equipped) return avatars;
  return [equipped, ...avatars.filter((avatar) => avatar.id !== equippedAvatarId)];
};

export const AvatarCustomizer3D: React.FC<AvatarCustomizer3DProps> = ({ compact = false, onClose, onPrepararObjeto, modoColocacionActivo = false }) => {
  const { currentUser, session } = useStore();
  const { avatarConfig } = useAvatar3D(currentUser?.id);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'avatares' | 'objetos'>('profile');
  const [availableAvatars, setAvailableAvatars] = useState<AvatarModel[]>([]);
  const [availableObjects, setAvailableObjects] = useState<CatalogoObjeto3D[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [equippedAvatarId, setEquippedAvatarId] = useState<string>('');
  const [selectedObjectId, setSelectedObjectId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(currentUser.profilePhoto || '');
  const [displayName, setDisplayName] = useState(currentUser.name || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar catálogo de avatares
  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      setLoadingAvatars(true);
      setLoadingObjects(true);
      try {
        const [avatarsRes, objectsRes, userRes] = await Promise.all([
          supabase
            .from('avatares_3d')
            .select('id, nombre, descripcion, modelo_url, thumbnail_url, escala')
            .eq('activo', true)
            .order('orden', { ascending: true }),
          supabase
            .from('catalogo_objetos_3d')
            .select('id, nombre, descripcion, categoria, tipo, modelo_url, thumbnail_url, built_in_geometry, built_in_color, ancho, profundidad, alto, es_sentable, es_interactuable, premium')
            .eq('activo', true)
            .order('orden', { ascending: true }),
          session?.user?.id
            ? supabase.from('usuarios').select('avatar_3d_id').eq('id', session.user.id).maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        if (!cancelled) {
          if (avatarsRes.error) {
            console.error('🎭 Error cargando avatares:', avatarsRes.error);
          } else if (avatarsRes.data) {
            const equippedId = userRes.data?.avatar_3d_id || avatarsRes.data[0]?.id || '';
            const orderedAvatars = reorderAvatars(avatarsRes.data, equippedId);
            setAvailableAvatars(orderedAvatars);
            setEquippedAvatarId(equippedId);
            if (orderedAvatars.length > 0) {
              const firstAvatar = orderedAvatars[0];
              setSelectedAvatarId(firstAvatar.id);
              setPreviewConfig({
                id: firstAvatar.id,
                nombre: firstAvatar.nombre,
                modelo_url: firstAvatar.modelo_url,
                escala: parseFloat(firstAvatar.escala) || 1,
              });
            }
          }

          if (objectsRes.error) {
            console.error('📦 Error cargando objetos:', objectsRes.error);
          } else if (objectsRes.data) {
            setAvailableObjects(objectsRes.data as CatalogoObjeto3D[]);
            if (objectsRes.data.length > 0) {
              setSelectedObjectId(objectsRes.data[0].id);
            }
          }
        }
      } catch (error) {
        console.error('🎭 Error inesperado loading catalogs:', error);
      } finally {
        if (!cancelled) {
          setLoadingAvatars(false);
          setLoadingObjects(false);
        }
      }
    };
    loadCatalog();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    setProfilePhoto(currentUser.profilePhoto || '');
    setDisplayName(currentUser.name || '');
  }, [currentUser.name, currentUser.profilePhoto]);

  const objectCategories = useMemo(() => {
    const categories = Array.from(new Set(availableObjects.map((object) => object.categoria).filter(Boolean)));
    return ['todos', ...categories];
  }, [availableObjects]);

  const filteredObjects = useMemo(() => {
    if (selectedCategory === 'todos') return availableObjects;
    return availableObjects.filter((object) => object.categoria === selectedCategory);
  }, [availableObjects, selectedCategory]);

  useEffect(() => {
    if (filteredObjects.length === 0) return;
    const existeSeleccion = filteredObjects.some((object) => object.id === selectedObjectId);
    if (!existeSeleccion) {
      setSelectedObjectId(filteredObjects[0].id);
    }
  }, [filteredObjects, selectedObjectId]);

  const selectedObject = useMemo(
    () => availableObjects.find((object) => object.id === selectedObjectId) || null,
    [availableObjects, selectedObjectId]
  );

  const [invalidObjectModelIds, setInvalidObjectModelIds] = useState<Record<string, true>>({});

  const handlePrepararObjeto = useCallback(() => {
    if (!selectedObject || !onPrepararObjeto) return;
    onPrepararObjeto(selectedObject);
    if (onClose) onClose();
  }, [selectedObject, onPrepararObjeto, onClose]);

  const handleObjectDragStart = useCallback((e: React.DragEvent, data: CatalogoObjeto3D) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    // Cerrar modal al iniciar drag para ver la escena (estilo Gather)
    if (onClose) setTimeout(() => onClose(), 150);
  }, [onClose]);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) { alert('La imagen no puede superar 5MB'); return; }
    if (!file.type.startsWith('image/')) { alert('Solo se permiten archivos de imagen'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${session.user.id}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('usuarios').update({ avatar_url: photoUrl }).eq('id', session.user.id);
      setProfilePhoto(photoUrl);
      useStore.setState((state) => ({ currentUser: { ...state.currentUser, profilePhoto: photoUrl } }));
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Error al subir la foto. Intenta de nuevo.');
    }
    setUploading(false);
  };

  const handleRemovePhoto = async () => {
    if (!session?.user?.id) return;
    setUploading(true);
    try {
      await supabase.from('usuarios').update({ avatar_url: null }).eq('id', session.user.id);
      setProfilePhoto('');
      useStore.setState((state) => ({ currentUser: { ...state.currentUser, profilePhoto: '' } }));
    } catch (err) { console.error('Error removing photo:', err); }
    setUploading(false);
  };

  const handleSaveName = async () => {
    if (!session?.user?.id || !displayName.trim()) return;
    try {
      await supabase.from('usuarios').update({ nombre: displayName.trim() }).eq('id', session.user.id);
      useStore.setState((state) => ({ currentUser: { ...state.currentUser, name: displayName.trim() } }));
      setSaved(true);
      setTimeout(() => { setSaved(false); if (onClose) onClose(); }, 1200);
    } catch (err) { console.error('Error updating name:', err); }
  };

  const handleAvatarChange = async (avatarId: string) => {
    setSelectedAvatarId(avatarId);
    const selected = availableAvatars.find(a => a.id === avatarId);
    if (selected) {
      setPreviewConfig({
        id: selected.id,
        nombre: selected.nombre,
        modelo_url: selected.modelo_url,
        escala: parseFloat(selected.escala) || 1,
      });
    }

    if (!session?.user?.id) return;
    try {
      const { error } = await supabase.from('usuarios').update({ avatar_3d_id: avatarId }).eq('id', session.user.id);
      if (error) {
        console.error('Error updating avatar:', error);
      } else {
        if (selected) {
          const [animRes, avatarRes] = await Promise.all([
            supabase.from('avatar_animaciones')
              .select('id, nombre, url, loop, orden, strip_root_motion')
              .eq('avatar_id', avatarId).eq('activo', true).order('orden', { ascending: true }),
            supabase.from('avatares_3d').select('textura_url').eq('id', avatarId).maybeSingle(),
          ]);
          const orderedAvatars = reorderAvatars(availableAvatars, avatarId);
          setAvailableAvatars(orderedAvatars);
          setEquippedAvatarId(avatarId);
          useStore.getState().setAvatar3DConfig({
            id: selected.id, nombre: selected.nombre, modelo_url: selected.modelo_url,
            escala: parseFloat(selected.escala) || 1, textura_url: avatarRes.data?.textura_url || null,
            animaciones: animRes.data?.map((a: any) => ({
              id: a.id, nombre: a.nombre, url: a.url, loop: a.loop ?? false,
              orden: a.orden ?? 0, strip_root_motion: a.strip_root_motion ?? false,
            })) || [],
          });
        }
        setAvatarSaved(true);
        setTimeout(() => setAvatarSaved(false), 2000);
      }
    } catch (err) { console.error('Error changing avatar:', err); }
  };

  const handleObjectModelError = useCallback(async (objectId: string, modelUrl?: string | null) => {
    if (!objectId) return;

    setInvalidObjectModelIds((prev) => prev[objectId] ? prev : { ...prev, [objectId]: true });

    const brokenObject = availableObjects.find((object) => object.id === objectId);
    const shouldDeactivate = !brokenObject?.built_in_geometry;

    setAvailableObjects((prev) => shouldDeactivate
      ? prev.filter((object) => object.id !== objectId)
      : prev.map((object) => object.id === objectId ? { ...object, modelo_url: null } : object)
    );

    try {
      const payload: Record<string, unknown> = shouldDeactivate
        ? { modelo_url: null, thumbnail_url: null, activo: false }
        : { modelo_url: null };

      const { error } = await supabase
        .from('catalogo_objetos_3d')
        .update(payload)
        .eq('id', objectId);

      if (error) throw error;
    } catch (err) {
      console.error('❌ Error limpiando modelo 3D inválido en catálogo:', { objectId, modelUrl, err });
    }
  }, [availableObjects]);

  // ===== Tabs config =====
  const tabs = [
    { key: 'profile' as const, label: 'Perfil', icon: '👤' },
    { key: 'avatares' as const, label: 'Avatares', icon: '🧍' },
    { key: 'objetos' as const, label: 'Objetos', icon: '📦' },
  ];

  const [isCapturing, setIsCapturing] = useState(false);

  // Lógica para capturar y subir el thumbnail de avatares
  const handleCaptureThumbnail = useCallback(async (blob: Blob) => {
    if (!selectedAvatarId || isCapturing) return;
    
    setIsCapturing(true);
    try {
      const fileName = `thumbnails/${selectedAvatarId}_${Date.now()}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { contentType: 'image/png', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase.from('avatares_3d')
        .update({ thumbnail_url: publicUrl })
        .eq('id', selectedAvatarId);

      if (updateError) throw updateError;

      // Actualizar estado local
      setAvailableAvatars(prev => prev.map(a => 
        a.id === selectedAvatarId ? { ...a, thumbnail_url: publicUrl } : a
      ));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('📸 Error capturando thumbnail:', err);
      alert('Error al guardar la miniatura');
    } finally {
      setIsCapturing(false);
    }
  }, [selectedAvatarId, isCapturing]);

  // Lógica para capturar y subir el thumbnail de objetos
  const handleCaptureObjectThumbnail = useCallback(async (blob: Blob) => {
    if (!selectedObjectId || isCapturing) return;
    
    setIsCapturing(true);
    try {
      const fileName = `object_thumbnails/${selectedObjectId}_${Date.now()}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars') // Usamos el mismo bucket por simplicidad o uno de objetos si existe
        .upload(fileName, blob, { contentType: 'image/png', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase.from('catalogo_objetos_3d')
        .update({ thumbnail_url: publicUrl })
        .eq('id', selectedObjectId);

      if (updateError) throw updateError;

      // Actualizar estado local
      setAvailableObjects(prev => prev.map(o => 
        o.id === selectedObjectId ? { ...o, thumbnail_url: publicUrl } : o
      ));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('📸 Error capturando thumbnail de objeto:', err);
      alert('Error al guardar la miniatura del objeto');
    } finally {
      setIsCapturing(false);
    }
  }, [selectedObjectId, isCapturing]);

  // ===== 3D Preview Panel =====
  const renderPreviewPanel = () => {
    if (activeTab === 'objetos' && selectedObject) {
      const hasModel = !!selectedObject.modelo_url && !invalidObjectModelIds[selectedObject.id];
      
      return (
        <>
          {/* Botón de captura para objetos */}
          {hasModel && (
            <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
              <button
                onClick={() => (window as any).captureObjectThumbnail?.()}
                disabled={isCapturing}
                title="Capturar miniatura del objeto"
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${isCapturing ? 'bg-zinc-800 cursor-not-allowed' : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'}
                `}
              >
                {isCapturing ? <div className="w-3 h-3 border-2 border-[#c8aa6e] border-t-transparent rounded-full animate-spin" /> : '📸'}
              </button>
            </div>
          )}

          <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-3 pointer-events-none">
            {/* Object info overlay */}
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

            {/* Central preview — 3D Canvas para objetos */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden my-2 pointer-events-auto">
              {hasModel ? (
                <Canvas 
                  key={`object-preview-${selectedObject.id}-${selectedObject.modelo_url || 'sin-modelo'}`}
                  shadows 
                  camera={{ position: [0, 1, 3], fov: 35 }}
                  gl={{ preserveDrawingBuffer: true }}
                >
                  <SceneCapturerObject onCapture={handleCaptureObjectThumbnail} />
                  <ambientLight intensity={1.5} />
                  <hemisphereLight intensity={1.1} color="#f3f8ff" groundColor="#1a2333" />
                  <directionalLight position={[0, 2.5, 4]} intensity={2.4} color="#ffffff" />
                  <pointLight position={[8, 8, 8]} intensity={2.0} color="#ffffff" />
                  <pointLight position={[-8, 4, -8]} intensity={1.5} color="#c8aa6e" />
                  <pointLight position={[0, -5, 10]} intensity={1.2} color="#87ceeb" />
                  <directionalLight position={[0, 10, 0]} intensity={1.5} color="#ffffff" castShadow />
                  <directionalLight position={[5, 5, -5]} intensity={0.8} color="#ffd700" />
                  <ObjectPreviewErrorBoundary
                    key={`object-boundary-${selectedObject.id}-${selectedObject.modelo_url || 'sin-modelo'}`}
                    fallback={<ObjectPreviewFallback color={selectedObject.built_in_color} />}
                    onError={() => handleObjectModelError(selectedObject.id, selectedObject.modelo_url)}
                  >
                    <Suspense fallback={<ObjectPreviewFallback color={selectedObject.built_in_color} />}>
                      <Object3DPreview modelUrl={selectedObject.modelo_url!} />
                    </Suspense>
                  </ObjectPreviewErrorBoundary>
                  <OrbitControls enablePan={false} enableZoom={true} minDistance={1} maxDistance={6} target={[0, 0.65, 0]} />
                  {/* Base sutil */}
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                    <circleGeometry args={[1.5, 64]} />
                    <meshStandardMaterial 
                      color="#3d4452" 
                      roughness={0.5} 
                      transparent={true}
                      opacity={0.4}
                    />
                  </mesh>
                </Canvas>
              ) : selectedObject.built_in_color ? (
                <div className="flex h-full w-full items-center justify-center" style={{ background: `radial-gradient(circle, ${selectedObject.built_in_color}33, transparent)` }}>
                  <div className="w-24 h-24 rounded-2xl shadow-2xl" style={{ backgroundColor: selectedObject.built_in_color, boxShadow: `0 0 40px ${selectedObject.built_in_color}44` }} />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl text-[#0397ab]/20">
                   📦
                </div>
              )}
            </div>

            {/* Action bar compacto */}
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
                {modoColocacionActivo ? '✓ Activo' : '🎯 Colocar'}
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
             onClick={() => (window as any).captureAvatarThumbnail?.()}
             disabled={isCapturing}
             title="Capturar miniatura"
             className={`
               w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
               ${isCapturing ? 'bg-zinc-800 cursor-not-allowed' : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'}
             `}
           >
             {isCapturing ? <div className="w-3 h-3 border-2 border-[#c8aa6e] border-t-transparent rounded-full animate-spin" /> : '📸'}
           </button>
        </div>

        <Canvas 
          shadows 
          camera={{ position: [0, 0.8, 5], fov: 30 }}
          gl={{ preserveDrawingBuffer: true }}
        >
          <SceneCapturer onCapture={handleCaptureThumbnail} />
          <Suspense fallback={null}>
            <ambientLight intensity={0.9} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            <pointLight position={[0, -0.5, -2]} intensity={0.8} color="#ffffff" />
            <directionalLight position={[-5, 5, 5]} intensity={0.8} />
            <group position={[0, -1.1, 0]}>
              <GLTFAvatar
                avatarConfig={previewConfig || avatarConfig}
                animationState="idle"
                direction="front"
                scale={0.8}
              />
            </group>
            <OrbitControls enablePan={false} enableZoom={true} minDistance={2} maxDistance={5} />
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
            {/* Aro de luz exterior para contraste */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.06, 0]}>
              <circleGeometry args={[2.55, 64]} />
              <meshBasicMaterial color="#c8aa6e" transparent opacity={0.2} />
            </mesh>
          </Suspense>
        </Canvas>
        {/* Hint */}
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
        
        {/* Toast guardado */}
        {saved && (
          <div className="absolute top-3 right-3 bg-emerald-500/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-full animate-in fade-in shadow-lg shadow-emerald-500/30">
            ✓ Guardado
          </div>
        )}

        {/* User info chip */}
        <div className={`absolute bottom-3 right-3 flex items-center gap-2 ${glass.card} rounded-xl p-1.5 pr-3`}>
          <UserAvatar name={currentUser.name} profilePhoto={profilePhoto} size="xs" showStatus status={currentUser.status} />
          <div>
            <p className="text-[9px] font-bold text-white/80 leading-tight">{displayName || currentUser.name}</p>
            <p className="text-[7px] text-white/30">{currentUser.cargo || 'Colaborador'}</p>
          </div>
        </div>
      </div>

      {/* ====== Panel derecho: Personalización ====== */}
      <div className={`${compact ? 'flex-1 min-h-0' : 'lg:w-[380px] xl:w-[420px]'} flex flex-col gap-3 min-h-0`}>
        {/* Tabs - estilo LOL/Hextech */}
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
                  <UserAvatar name={currentUser.name} profilePhoto={profilePhoto} size="xl" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    {uploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadPhoto} className="hidden" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={`px-3 py-1.5 ${composites.buttonPrimary} text-[9px] rounded-lg`}
                  >
                    {profilePhoto ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {profilePhoto && (
                    <button
                      onClick={handleRemovePhoto}
                      disabled={uploading}
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
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={`flex-1 ${composites.inputBase} px-3 py-2 text-xs ${radius.input}`}
                    placeholder="Tu nombre"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={displayName.trim() === currentUser.name}
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
                  <UserAvatar name={currentUser.name} profilePhoto={profilePhoto} size="sm" showStatus status={currentUser.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{displayName || currentUser.name}</p>
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
              {selectedAvatarId && (() => {
                const sel = availableAvatars.find(a => a.id === selectedAvatarId);
                return sel ? (
                  <div className="bg-[#0a0a0c] border border-[#1e2328] rounded-md p-2.5 relative">
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#c8aa6e] opacity-50" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#c8aa6e] opacity-50" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-black text-[#f0e6d2] uppercase tracking-wide truncate">{sel.nombre}</h3>
                        <p className="text-[9px] text-[#a09b8c] mt-0.5">{sel.descripcion || 'Avatar 3D listo para el espacio virtual.'}</p>
                      </div>
                      {equippedAvatarId === sel.id && (
                        <span className="flex-shrink-0 rounded bg-[#c8aa6e]/90 px-2 py-0.5 text-[8px] font-black uppercase text-[#0a0a0c]">✓ Equipado</span>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}
              
              {loadingAvatars ? (
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  Cargando modelos...
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar pb-4">
                  {availableAvatars.map((avatar) => (
                    <AvatarCard
                      key={avatar.id}
                      onClick={() => handleAvatarChange(avatar.id)}
                      nombre={avatar.nombre}
                      descripcion={avatar.descripcion}
                      thumbnailUrl={avatar.thumbnail_url}
                      seleccionado={selectedAvatarId === avatar.id}
                      equipado={equippedAvatarId === avatar.id}
                      isPremium={avatar.premium || false}
                    />
                  ))}
                </div>
              )}

              {avatarSaved && (
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
                    onClick={() => setSelectedCategory(category)}
                    className={`
                      flex-shrink-0 rounded px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all duration-200
                      ${selectedCategory === category
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

              {/* Objects grid — responsive auto-fit */}
              {loadingObjects ? (
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
                      seleccionado={selectedObjectId === object.id}
                      isPremium={object.premium || false}
                      onClick={() => setSelectedObjectId(object.id)}
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
