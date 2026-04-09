'use client';

import React from 'react';

interface AvatarCardProps {
  nombre: string;
  descripcion?: string | null;
  thumbnailUrl?: string | null;
  seleccionado?: boolean;
  equipado?: boolean;
  isPremium?: boolean;
  onClick: () => void;
}

export const AvatarCard: React.FC<AvatarCardProps> = ({
  nombre,
  thumbnailUrl,
  seleccionado = false,
  equipado = false,
  isPremium = false,
  onClick,
}) => {
  const [imageError, setImageError] = React.useState(false);

  return (
    <button
      onClick={onClick}
      title={nombre}
      className="group relative aspect-square overflow-hidden rounded transition-all duration-200 p-[2px]">
      <div className={[
        'relative w-full h-full rounded overflow-hidden',
        'bg-[#0a0a0c]',
        seleccionado
          ? 'ring-2 ring-[#c8aa6e] shadow-[0_0_25px_rgba(200,170,110,0.6),_0_0_50px_rgba(200,170,110,0.3)] scale-105 z-10'
          : 'border border-[#2b2518]/60 hover:ring-2 hover:ring-[#c8aa6e] hover:shadow-[0_0_15px_rgba(200,170,110,0.5)] transition-all duration-300',
      ].join(' ')}>
      {/* Imagen / Preview */}
      {thumbnailUrl && !imageError ? (
        <img
          src={thumbnailUrl}
          alt={nombre}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110 opacity-90 group-hover:opacity-100"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,_#1a1c23_0%,_#0a0a0c_100%)] relative">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23222' fill-opacity='0.4'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23222' fill-opacity='0.4'/%3E%3Cline x1='0' y1='4' x2='4' y2='0' stroke='%23333' stroke-opacity='0.3' stroke-width='0.5'/%3E%3Cline x1='4' y1='8' x2='8' y2='4' stroke='%23333' stroke-opacity='0.3' stroke-width='0.5'/%3E%3C/svg%3E\")", backgroundSize: '8px 8px' }} />
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-[#c8aa6e]/40 drop-shadow-sm select-none">
              {nombre.substring(0, 2).toUpperCase()}
            </span>
            <span className="text-[10px] mt-1 text-[#c8aa6e]/20">🧍</span>
          </div>
        </div>
      )}

      {/* Equipado badge */}
      {equipado && (
        <div className="absolute top-0.5 right-0.5 z-10 rounded-full bg-[#c8aa6e] w-4 h-4 flex items-center justify-center shadow-md">
          <span className="text-[8px] text-[#0a0a0c] font-black">✓</span>
        </div>
      )}

      {/* Free/Premium badge */}
      {!isPremium && (
        <div className="absolute top-0 left-0 z-10 pointer-events-none">
          <div className="flex h-4 items-center rounded-br-md border-r border-b border-emerald-300/25 bg-black/35 px-1.5 shadow-[0_2px_8px_rgba(16,185,129,0.14)] backdrop-blur-[2px]">
            <span className="text-[5px] font-black uppercase tracking-[0.18em] leading-none text-emerald-300">Free</span>
          </div>
        </div>
      )}

      {/* Glow inferior con nombre */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-4 pb-1 px-1">
        <p className="text-[7px] font-bold text-[#f0e6d2]/80 text-center truncate leading-tight uppercase tracking-wider">
          {nombre}
        </p>
      </div>

      {/* Borde glow seleccionado */}
      {seleccionado && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[#c8aa6e] to-transparent shadow-[0_0_12px_#c8aa6e] animate-pulse" />
      )}
      </div>
    </button>
  );
};
