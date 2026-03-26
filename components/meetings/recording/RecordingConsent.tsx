/**
 * Modal de consentimiento para grabación de reunión
 */

import React from 'react';

interface RecordingConsentProps {
  isOpen: boolean;
  onAccept: () => void;
  onReject: () => void;
  recordedBy: string;
  meetingTitle?: string;
}

export const RecordingConsent: React.FC<RecordingConsentProps> = ({
  isOpen,
  onAccept,
  onReject,
  recordedBy,
  meetingTitle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Grabación de Reunión</h3>
            <p className="text-sm text-zinc-400">Se requiere tu consentimiento</p>
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded-xl p-4 mb-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            <span className="font-semibold text-white">{recordedBy}</span> desea grabar 
            {meetingTitle ? (
              <> la reunión "<span className="text-indigo-400">{meetingTitle}</span>"</>
            ) : (
              ' esta reunión'
            )}.
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            La grabación incluirá audio y video. Podrás acceder al archivo posteriormente.
          </p>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex items-start gap-2 text-xs text-zinc-400">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Transcripción automática disponible</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-zinc-400">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Resumen AI de los puntos clave</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-zinc-400">
            <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Almacenado de forma segura</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors"
          >
            Rechazar
          </button>
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingConsent;
