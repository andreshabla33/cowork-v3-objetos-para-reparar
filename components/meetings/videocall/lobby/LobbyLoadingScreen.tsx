/**
 * @module components/meetings/videocall/lobby/LobbyLoadingScreen
 *
 * Pantalla de carga para el lobby de reuniones.
 * Presentation layer — sin lógica de negocio.
 */

'use client';

import React from 'react';

export const LobbyLoadingScreen: React.FC = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-[#050508]">
    {/* Fondo animado neon — consistente con el resto del proyecto */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[-30%] left-[-20%] h-[70%] w-[70%] rounded-full bg-[#2E96F5]/15 blur-[180px] animate-pulse" />
      <div className="absolute bottom-[-30%] right-[-20%] h-[70%] w-[70%] rounded-full bg-cyan-500/10 blur-[180px] animate-pulse" style={{ animationDelay: '1.5s' }} />
    </div>
    <div className="relative flex flex-col items-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#2E96F5]/30 border-t-[#4FB0FF]" />
      <p className="text-sm text-[#4A6485]">Cargando reunión...</p>
    </div>
  </div>
);
