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
        <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="text-center relative z-10">
          <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
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
      <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-transparent blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-cyan-600/10 via-blue-600/5 to-transparent blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-4xl relative z-10">
        {/* Outer glow border */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-sky-500/20 to-cyan-500/20 rounded-[32px] blur-xl opacity-60" />

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-[28px] p-6">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="relative group mx-auto w-12 h-12 mb-3">
              <div className="absolute -inset-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 blur-lg opacity-40" />
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 flex items-center justify-center">
                <span className="text-xl">🎭</span>
              </div>
            </div>
            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-200 to-white mb-1">
              Elige tu avatar
            </h1>
            <p className="text-zinc-500 text-xs">
              Selecciona el avatar 3D que te representará en el espacio virtual.
            </p>
          </div>

          {/* Content: Preview + Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 3D Preview */}
            <div className="relative rounded-xl overflow-hidden bg-[#0a0a0c] border border-[#1e2328] aspect-[4/3] md:aspect-auto md:min-h-[360px]">
              <PreviewCanvas
                cameraFov={30}
                cameraPosition={[0, 0.8, 5]}
                captureToken={null}
                onCapture={handleCapture}
                frameloop="always"
                fallback={
                  <mesh>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshStandardMaterial color="#2563eb" />
                  </mesh>
                }
              >
                <AvatarPreviewScene avatarConfig={catalog.previewConfig} />
              </PreviewCanvas>

              {/* Subtle label */}
              <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded px-2 py-0.5">
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
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
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleSkip}
              className="px-5 py-2.5 text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-widest transition-colors"
            >
              Omitir
            </button>

            <button
              type="button"
              onClick={onComplete}
              disabled={!catalog.equippedAvatarId}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-sky-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
