/**
 * @module components/meetings/recording/v2/RecordingManagerOverlays
 * @description Sub-componentes UI fullscreen del RecordingManagerV2: modal
 * de procesamiento (con barra de progreso) y toast de error.
 *
 * Clean Architecture: capa de presentación pura. Recibe props, no toca state
 * global. Aislados del hook useRecordingV2 para reducir el archivo principal
 * (split del god-component 720L → composition root delgado).
 */

import React from 'react';
import type { ProcessingState } from '@/hooks/meetings/useRecordingV2';

interface ProcessingModalProps {
  step: ProcessingState['step'];
  progress: number;
  message: string;
}

export const RecordingProcessingModal: React.FC<ProcessingModalProps> = ({ step, progress, message }) => {
  if (step !== 'stopping' && step !== 'processing') return null;

  return (
    <div className="fixed inset-0 bg-[#0B2240]/35 backdrop-blur-sm z-[300] flex items-center justify-center">
      <div className="bg-white/60 rounded-2xl p-6 max-w-md w-full mx-4 border border-[rgba(46,150,245,0.14)] shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 border-4 border-[#2E96F5]/30 rounded-full"></div>
            <div
              className="absolute inset-0 border-4 border-[#2E96F5] rounded-full border-t-transparent animate-spin"
              style={{ animationDuration: '1s' }}
            ></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">🧠</span>
            </div>
          </div>

          <h3 className="text-white font-bold text-lg mb-2">Procesando Análisis</h3>
          <p className="text-[#1B3A5C] text-sm mb-4">{message}</p>

          <div className="w-full bg-[rgba(46,150,245,0.08)] rounded-full h-2 mb-2">
            <div
              className="bg-[#2E96F5] h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-[#6B83A0] text-xs">{progress}% completado</p>
        </div>
      </div>
    </div>
  );
};

interface ErrorToastProps {
  step: ProcessingState['step'];
  message: string;
  onClose: () => void;
}

export const RecordingErrorToast: React.FC<ErrorToastProps> = ({ step, message, onClose }) => {
  if (step !== 'error') return null;

  return (
    <div className="fixed top-24 right-4 z-[301] animate-slide-in">
      <div className="bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="font-bold text-sm">Error en procesamiento</p>
          <p className="text-xs opacity-80">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
