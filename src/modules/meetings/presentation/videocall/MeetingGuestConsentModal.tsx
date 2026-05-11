import React from 'react';
import type { MeetingConsentRequest } from './meetingRoom.types';

interface MeetingGuestConsentModalProps {
  request: MeetingConsentRequest | null;
  isExternalGuest: boolean;
  onRespond: (accepted: boolean) => void;
}

export const MeetingGuestConsentModal: React.FC<MeetingGuestConsentModalProps> = ({
  request,
  isExternalGuest,
  onRespond,
}) => {
  if (!request || !isExternalGuest) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#0B2240]/35 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-zinc-700 bg-white/60 p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
            <svg className="h-7 w-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-bold text-white">Solicitud de grabación</h3>
          <p className="text-sm text-[#4A6485]">
            <span className="font-semibold text-[#1E86E5]">{request.by}</span> desea grabar esta reunión con análisis conductual.
          </p>
        </div>
        <div className="mb-5 space-y-2 rounded-xl border border-[rgba(46,150,245,0.14)] bg-white/500 p-4 text-xs text-[#4A6485]">
          <p>• Se analizarán expresiones faciales, tono de voz y lenguaje corporal</p>
          <p>• Los datos se usan exclusivamente para evaluación profesional</p>
          <p>• Puedes rechazar sin afectar tu participación en la reunión</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onRespond(false)}
            className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[#1B3A5C] transition-colors hover:bg-[rgba(46,150,245,0.08)]"
          >
            Rechazar
          </button>
          <button
            onClick={() => onRespond(true)}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-400 hover:to-green-500"
          >
            Aceptar grabación
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingGuestConsentModal;
