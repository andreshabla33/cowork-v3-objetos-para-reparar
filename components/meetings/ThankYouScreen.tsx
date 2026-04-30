/**
 * @module components/meetings/ThankYouScreen
 * @description Post-meeting thank-you screen for external guests.
 * Extracted from App.tsx to comply with Single Responsibility Principle.
 *
 * Ref: React 19 — pure presentational component, no side effects.
 */

import React from 'react';

interface ThankYouScreenProps {
  onClose: () => void;
}

export const ThankYouScreen: React.FC<ThankYouScreenProps> = ({ onClose }) => (
  <div className="min-h-screen bg-gradient-to-br from-white/60 via-[rgba(46,150,245,0.06)] to-white/60 flex items-center justify-center p-4">
    <div className="bg-white/60 backdrop-blur-sm border border-[rgba(46,150,245,0.14)] rounded-3xl p-10 max-w-lg text-center">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
        <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">¡Gracias por participar!</h2>
      <p className="text-white/60 mb-2">La reunión ha finalizado.</p>
      <p className="text-white/50 text-sm mb-8">
        Esperamos que haya sido una gran experiencia. Si el organizador configuró un resumen, lo recibirás por email.
      </p>
      <button
        onClick={onClose}
        className="px-6 py-3 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] hover:opacity-90 rounded-xl text-white font-bold transition-all"
      >
        Cerrar
      </button>
      <p className="text-white/30 text-xs mt-8">Powered by Cowork</p>
    </div>
  </div>
);
