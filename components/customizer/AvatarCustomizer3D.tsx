/**
 * @module customizer/AvatarCustomizer3D
 * @description Lightweight orchestrator for the 3D avatar/object customizer modal.
 * Composes extracted sub-modules: preview scenes, tab panels, and shared constants.
 *
 * Clean Architecture: Presentation layer — orchestrates hooks + child components.
 * Original 920-line monolith decomposed on 2026-04-13 following:
 *   - React 19: single responsibility, lift state up, pass slices down
 *   - R3F v9: split by semantic function (lighting, models, controls)
 *   - Three.js r170+: explicit dispose of cloned materials on unmount
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useStore } from '@/store/useStore';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { useAvatar3D } from '../avatar3d/useAvatar3D';
import { useAvatarCatalog } from '@/hooks/customizer/useAvatarCatalog';
import { useProfileEditor } from '@/hooks/customizer/useProfileEditor';
import { glass } from '@/styles/design-tokens';
import { UserAvatar } from '../UserAvatar';
import { CATEGORY_LABELS, CATEGORY_ICONS } from './shared/customizerConstants';

// ─── Extracted sub-modules ──────────────────────────────────────────────────
import { PreviewCanvas } from './preview/PreviewCanvas';
import { AvatarPreviewScene } from './preview/AvatarPreviewScene';
import { ObjectPreviewScene, ObjectPreviewPoster } from './preview/ObjectPreviewScene';
import { ProfilePanel } from './panels/ProfilePanel';
import { AvatarPanel } from './panels/AvatarPanel';
import { ObjectPanel } from './panels/ObjectPanel';

// ─── Props ──────────────────────────────────────────────────────────────────
interface AvatarCustomizer3DProps {
  compact?: boolean;
  onClose?: () => void;
  onPrepararObjeto?: (objeto: CatalogoObjeto3D) => void;
  modoColocacionActivo?: boolean;
  modoReemplazoActivo?: boolean;
}

// ─── Tab config ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'profile' as const, label: 'Perfil', icon: '👤' },
  { key: 'avatares' as const, label: 'Avatares', icon: '🧍' },
  { key: 'objetos' as const, label: 'Objetos', icon: '📦' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Component ──────────────────────────────────────────────────────────────
export const AvatarCustomizer3D: React.FC<AvatarCustomizer3DProps> = ({
  compact = false,
  onClose,
  onPrepararObjeto,
  modoColocacionActivo = false,
  modoReemplazoActivo = false,
}) => {
  const { currentUser } = useStore();
  const { avatarConfig } = useAvatar3D(currentUser?.id);
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  // ─── Hooks ──────────────────────────────────────────────────────────────
  const catalog = useAvatarCatalog();
  const profile = useProfileEditor({ onClose });

  // ─── Local state for thumbnail capture ──────────────────────────────────
  const [captureRequest, setCaptureRequest] = useState<{ kind: 'avatar' | 'object'; token: number } | null>(null);

  // ─── Load catalogs on mount ─────────────────────────────────────────────
  useEffect(() => { void catalog.loadCatalogs(); }, []);

  // ─── Derived state ──────────────────────────────────────────────────────
  const objectCategories = useMemo(() => {
    const categories = Array.from(new Set(catalog.availableObjects.map((o) => o.categoria).filter(Boolean)));
    return ['todos', ...categories];
  }, [catalog.availableObjects]);

  const filteredObjects = useMemo(() => {
    if (catalog.selectedCategory === 'todos') return catalog.availableObjects;
    return catalog.availableObjects.filter((o) => o.categoria === catalog.selectedCategory);
  }, [catalog.availableObjects, catalog.selectedCategory]);

  // Sincroniza tab → categoría válida. Cuando el user entra al tab "objetos"
  // pero `selectedCategory` quedó en 'avatares' (default del hook) o en una
  // categoría que ya no existe en el catálogo cargado, resetea a 'todos'.
  // Sin esto, el filtro retorna [] y la grid se ve vacía aunque haya objetos.
  useEffect(() => {
    if (activeTab !== 'objetos') return;
    if (catalog.availableObjects.length === 0) return;
    if (objectCategories.includes(catalog.selectedCategory)) return;
    catalog.selectCategory('todos');
  }, [activeTab, catalog, objectCategories]);

  // Auto-select first object if current selection not in filtered list
  useEffect(() => {
    if (filteredObjects.length === 0) return;
    const existeSeleccion = filteredObjects.some((o) => o.id === catalog.selectedObjectId);
    if (!existeSeleccion) catalog.selectObject(filteredObjects[0].id);
  }, [filteredObjects, catalog.selectedObjectId]);

  const selectedObject = useMemo(
    () => catalog.availableObjects.find((o) => o.id === catalog.selectedObjectId) || null,
    [catalog.availableObjects, catalog.selectedObjectId],
  );

  // Preload GLB when selected object changes
  useEffect(() => { if (selectedObject?.modelo_url) useGLTF.preload(selectedObject.modelo_url); }, [selectedObject]);

  // ─── Callbacks ──────────────────────────────────────────────────────────
  const handlePrepararObjeto = useCallback(() => {
    if (!selectedObject || !onPrepararObjeto) return;
    onPrepararObjeto(selectedObject);
    onClose?.();
  }, [selectedObject, onPrepararObjeto, onClose]);

  const handleObjectDragStart = useCallback((e: React.DragEvent, data: CatalogoObjeto3D) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    if (onClose) setTimeout(() => onClose(), 150);
  }, [onClose]);

  const handleObjectModelError = useCallback(async (objectId: string) => {
    if (!objectId) return;
    await catalog.reportInvalidObjectModel(objectId, !catalog.availableObjects.find((o) => o.id === objectId)?.built_in_geometry);
  }, [catalog]);

  const handlePreviewCapture = useCallback((blob: Blob) => {
    const kind = captureRequest?.kind;
    setCaptureRequest(null);
    if (!kind) return;
    void catalog.captureThumbnail(blob);
  }, [captureRequest?.kind, catalog]);

  const requestAvatarCapture = useCallback(() => {
    if (catalog.isCapturing) return;
    // Ambos estados deben setearse: el local (dispara captureToken de PreviewCanvas)
    // y el del hook (le dice a captureThumbnail qué avatar actualizar). Antes solo
    // se seteaba el local → captureThumbnail retornaba early porque su captureRequest
    // nunca se inicializaba → los PNGs NO se subían ni actualizaban thumbnail_url.
    const id = catalog.selectedAvatarId;
    if (!id) return;
    catalog.requestThumbnailCapture('avatar', id);
    setCaptureRequest({ kind: 'avatar', token: Date.now() });
  }, [catalog.isCapturing, catalog.selectedAvatarId, catalog.requestThumbnailCapture]);

  const requestObjectCapture = useCallback(() => {
    if (catalog.isCapturing) return;
    const id = catalog.selectedObjectId;
    if (!id) return;
    catalog.requestThumbnailCapture('objeto', id);
    setCaptureRequest({ kind: 'object', token: Date.now() });
  }, [catalog.isCapturing, catalog.selectedObjectId, catalog.requestThumbnailCapture]);

  // ─── Auto-captura de miniaturas faltantes ──────────────────────────────
  // Cuando el usuario selecciona un avatar cuyo thumbnail_url es null, tras
  // 2.5s (tiempo suficiente para que el GLB cargue + primera animación se
  // estabilice en el preview) disparamos el mismo flujo del botón 📸. Es
  // transparente para el usuario y cierra el loop para cualquier avatar
  // nuevo sin miniatura (backfill, pipeline manual, etc.).
  //
  // Ref doc: fix_avatar_thumbnails_captura_2026_03_12 (mecanismo de captura).
  // Ref R3F Canvas.gl.domElement.toBlob — depende de preserveDrawingBuffer.
  const autoCaptureAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const previewId = catalog.previewConfig?.id;
    if (!previewId) return;
    if (catalog.isCapturing || captureRequest) return;
    const avatar = catalog.availableAvatars.find((a) => a.id === previewId);
    if (!avatar || avatar.thumbnail_url) return;
    if (autoCaptureAttemptedRef.current.has(previewId)) return;

    const timer = setTimeout(() => {
      if (autoCaptureAttemptedRef.current.has(previewId)) return;
      autoCaptureAttemptedRef.current.add(previewId);
      catalog.requestThumbnailCapture('avatar', previewId);
      setCaptureRequest({ kind: 'avatar', token: Date.now() });
    }, 2500);
    return () => clearTimeout(timer);
  }, [
    catalog.previewConfig?.id,
    catalog.availableAvatars,
    catalog.isCapturing,
    captureRequest,
    catalog.requestThumbnailCapture,
  ]);

  // ─── 3D Preview renderer ───────────────────────────────────────────────
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  catalog.isCapturing
                    ? 'bg-zinc-800 cursor-not-allowed'
                    : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'
                }`}
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
                    onError={() => handleObjectModelError(selectedObject.id)}
                    selectedObject={selectedObject}
                  />
                </PreviewCanvas>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl text-[#0397ab]/20">📦</div>
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

    // Avatar preview (default for profile + avatares tabs)
    return (
      <>
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
          <button
            onClick={requestAvatarCapture}
            disabled={catalog.isCapturing}
            title="Capturar miniatura"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              catalog.isCapturing
                ? 'bg-zinc-800 cursor-not-allowed'
                : 'bg-[#c8aa6e]/20 hover:bg-[#c8aa6e] text-[#c8aa6e] hover:text-[#0a0a0c] border border-[#c8aa6e]/30'
            }`}
          >
            {catalog.isCapturing ? <div className="w-3 h-3 border-2 border-[#c8aa6e] border-t-transparent rounded-full animate-spin" /> : '📸'}
          </button>
        </div>

        {/* Render condicional del Canvas: NO montar GLTFAvatar mientras
            ambos configs son null. Si lo montamos con null, GLTFAvatar resuelve
            a DEFAULT_MODEL_URL (avatar default builtin) y lo muestra durante
            ~1-2s hasta que llega el avatar real → flash visual.
            La condición usa el config efectivo (mismo que pasa el Canvas). */}
        {(catalog.previewConfig || avatarConfig) ? (
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
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0B2240]/40 to-[#1B3A5C]/20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-[#4FB0FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-white/70 font-medium uppercase tracking-wider">
                Cargando avatar…
              </span>
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-3 text-[9px] text-white/30 pointer-events-none">
          Arrastra para rotar · Scroll para zoom
        </div>
      </>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={compact
      ? 'p-3 flex flex-col gap-3 h-full'
      : 'p-4 flex flex-col lg:flex-row gap-4 h-full overflow-hidden sm:p-3'
    }>
      {/* ====== Left panel: 3D Preview ====== */}
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
        <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-white/70 backdrop-blur-md border border-white/60 shadow-[0_4px_12px_-4px_rgba(46,100,175,0.15)] rounded-xl p-1.5 pr-3">
          <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="xs" showStatus status={currentUser.status} />
          <div>
            <p className="text-[9px] font-bold text-[#0B2240] leading-tight">{profile.displayName || currentUser.name}</p>
            <p className="text-[7px] text-[#4A6485]">{currentUser.cargo || 'Colaborador'}</p>
          </div>
        </div>
      </div>

      {/* ====== Right panel: Customization tabs ====== */}
      <div className={`${compact ? 'flex-1 min-h-0' : 'lg:w-[380px] xl:w-[420px]'} flex flex-col gap-3 min-h-0`}>
        {/* Tab bar */}
        <div className="flex gap-1 bg-white/50 border border-[rgba(46,150,245,0.14)] p-1 rounded-xl flex-shrink-0 relative backdrop-blur-sm">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all duration-300 relative overflow-hidden
                ${activeTab === tab.key
                  ? 'bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white shadow-[0_4px_14px_-4px_rgba(46,150,245,0.5)] border border-[rgba(46,150,245,0.3)]'
                  : 'text-[#4A6485] hover:text-[#1B3A5C] hover:bg-[rgba(46,150,245,0.06)] border border-transparent'
                }
              `}
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                {tab.icon} {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
          {activeTab === 'profile' && (
            <ProfilePanel profile={profile} currentUser={currentUser} />
          )}

          {activeTab === 'avatares' && (
            <AvatarPanel catalog={catalog} />
          )}

          {activeTab === 'objetos' && (
            <ObjectPanel
              catalog={catalog}
              objectCategories={objectCategories}
              filteredObjects={filteredObjects}
              selectedObject={selectedObject}
              onPrepararObjeto={handlePrepararObjeto}
              onDragStart={handleObjectDragStart}
              modoColocacionActivo={modoColocacionActivo}
              canPlace={!!onPrepararObjeto}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarCustomizer3D;
