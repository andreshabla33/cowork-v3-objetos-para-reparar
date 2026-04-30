/**
 * @module components/onboarding/OnboardingAvatarStep
 * @description Post-onboarding step for selecting a 3D avatar before entering the workspace.
 * Reuses existing Presentation components (AvatarPanel, PreviewCanvas, AvatarPreviewScene)
 * and the useAvatarCatalog hook — zero code duplication.
 *
 * Clean Architecture: Presentation layer — UI composition only.
 * Business logic (catalog loading, avatar persistence) delegated to useAvatarCatalog
 * which internally uses Application-layer use cases.
 *
 * Inserted between cargo/departamento completion and setView('dashboard').
 * The onboarding is technically already complete (cargo saved) when this step renders.
 * "Omitir" is always available — users get the avatarLoader fallback if they skip.
 */

import React, { useEffect, useCallback, useState } from 'react';
import { AvatarPanel } from '../customizer/panels/AvatarPanel';
import { PreviewCanvas } from '../customizer/preview/PreviewCanvas';
import { AvatarPreviewScene } from '../customizer/preview/AvatarPreviewScene';
import { useAvatarCatalog } from '@/hooks/customizer/useAvatarCatalog';

export interface OnboardingAvatarStepProps {
 /** Called when the user finishes selecting an avatar (or clicks "Continuar") */
 onComplete: () => void;
 /** Called when the user clicks "Omitir" — defaults to onComplete */
 onSkip?: () => void;
}

export const OnboardingAvatarStep: React.FC<OnboardingAvatarStepProps> = ({
 onComplete,
 onSkip,
}) => {
 const catalog = useAvatarCatalog();
 const [isReady, setIsReady] = useState(false);

 // Load avatar catalog on mount
 useEffect(() => {
 const load = async () => {
 await catalog.loadCatalogs();
 setIsReady(true);
 };
 void load();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // No-op capture handler (not needed for onboarding preview)
 const handleCapture = useCallback(() => {}, []);

 const handleSkip = useCallback(() => {
 (onSkip ?? onComplete)();
 }, [onSkip, onComplete]);

 // ─── Loading ──────────────────────────────────────────────────────────
 if (!isReady) {
 return (
 <div className="fixed inset-0 bg-[#050508] flex items-center justify-center">
 <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
 <div className="text-center relative z-10">
 <div className="w-10 h-10 border-3 border-[rgba(46,150,245,0.3)]/30 border-[#2E96F5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
 <p className="text-[#4A6485] text-xs font-bold uppercase tracking-widest">
 Cargando avatares...
 </p>
 </div>
 </div>
 );
 }

 // ─── Main Layout ──────────────────────────────────────────────────────
 return (
 <div className="fixed inset-0 bg-[#050508] flex items-center justify-center p-4">
 {/* Background grid */}
 <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
 {/* Glow effects */}
 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-[#4FB0FF]/10 /5 to-transparent blur-[120px] rounded-full pointer-events-none" />
 <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-[#2E96F5]/10 via-[#4FB0FF]/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

 <div className="w-full max-w-4xl relative z-10">
 {/* Outer glow border */}
 <div className="absolute -inset-1 bg-gradient-to-r from-[#4FB0FF]/20 /20 to-[#2E96F5]/20 rounded-[32px] blur-xl opacity-60" />

 <div className="relative backdrop-blur-xl bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-[28px] p-6">
 {/* Header */}
 <div className="text-center mb-5">
 <div className="relative group mx-auto w-12 h-12 mb-3">
 <div className="absolute -inset-2 rounded-xl bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] blur-lg opacity-40" />
 <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] flex items-center justify-center">
 <span className="text-xl">🎭</span>
 </div>
 </div>
 <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B2240] via-[#1E86E5] to-[#0B2240] mb-1">
 Elige tu avatar
 </h1>
 <p className="text-[#4A6485] text-xs">
 Selecciona el avatar 3D que te representará en el espacio virtual.
 </p>
 </div>

 {/* Content: Preview + Panel */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* 3D Preview */}
 <div className="relative rounded-xl overflow-hidden bg-white/60 border border-[rgba(46,150,245,0.14)] aspect-[4/3] md:aspect-auto md:min-h-[360px]">
 <PreviewCanvas
 cameraFov={30}
 cameraPosition={[0, 0.8, 5]}
 captureToken={null}
 onCapture={handleCapture}
 frameloop="always"
 fallback={
 <mesh>
 <boxGeometry args={[0.5, 0.5, 0.5]} />
 <meshStandardMaterial color="#6366f1" />
 </mesh>
 }
 >
 <AvatarPreviewScene avatarConfig={catalog.previewConfig} />
 </PreviewCanvas>

 {/* Subtle label */}
 <div className="absolute bottom-2 left-2 bg-[#0B2240]/35 backdrop-blur-[10px] backdrop-blur-sm rounded px-2 py-0.5">
 <span className="text-[9px] text-[#4A6485] font-bold uppercase tracking-wider">
 Vista previa 3D
 </span>
 </div>
 </div>

 {/* Avatar Grid Panel */}
 <div className="flex flex-col">
 <div className="flex-1 overflow-y-auto max-h-[360px] pr-1">
 <AvatarPanel catalog={catalog} />
 </div>
 </div>
 </div>

 {/* Action buttons */}
 <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(46,150,245,0.14)]">
 <button
 type="button"
 onClick={handleSkip}
 className="px-5 py-2.5 text-[#4A6485] hover:text-[#1B3A5C] text-xs font-bold uppercase tracking-widest transition-colors"
 >
 Omitir
 </button>

 <button
 type="button"
 onClick={onComplete}
 disabled={!catalog.equippedAvatarId}
 className="px-6 py-2.5 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] hover:from-[#3BA3F7] hover:to-[#1E86E5] disabled:from-[#9CB0CA] disabled:to-[#9CB0CA] disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)] hover:shadow-[0_4px_14px_-4px_rgba(46,150,245,0.3)]"
 >
 Continuar
 </button>
 </div>
 </div>
 </div>
 </div>
 );
};
