'use client';

import React from 'react';
import type { CatalogoObjeto3D } from '@/types/objetos3d';

interface ObjectCardProps {
  nombre: string;
  categoria: string;
  thumbnailUrl?: string | null;
  interactuable?: boolean;
  sentable?: boolean;
  seleccionado?: boolean;
  isPremium?: boolean;
  onClick: () => void;
  builtInColor?: string | null;
  builtInGeometry?: string | null;
  catalogData?: CatalogoObjeto3D;
  onDragStart?: (e: React.DragEvent, data: CatalogoObjeto3D) => void;
}

export const ObjectCard: React.FC<ObjectCardProps> = ({
  nombre,
  thumbnailUrl,
  interactuable = false,
  sentable = false,
  seleccionado = false,
  isPremium = false,
  onClick,
  builtInColor,
  builtInGeometry,
  catalogData,
  onDragStart,
}) => {
  const [imageError, setImageError] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (catalogData && onDragStart) {
      onDragStart(e, catalogData);
      // Crear imagen fantasma para el drag
      const ghost = document.createElement('div');
      ghost.style.cssText = 'width:60px;height:60px;background:#0397ab33;border:2px solid #04c8e0;border-radius:8px;position:absolute;top:-9999px;display:flex;align-items:center;justify-content:center;font-size:24px;';
      ghost.textContent = '📦';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 30, 30);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
  };

  const hasThumbnail = !!thumbnailUrl;
  const hasBuiltIn = !!builtInGeometry && !!builtInColor;

  return (
    <button
      onClick={onClick}
      draggable={!!catalogData}
      onDragStart={handleDragStart}
      title={nombre}
      className="group relative aspect-square overflow-hidden rounded transition-all duration-200 p-[2px]"
    >
      <div className={[
        'relative w-full h-full rounded overflow-hidden',
        catalogData ? 'cursor-grab active:cursor-grabbing' : '',
        'bg-[#0a0a0c]',
        seleccionado
          ? 'ring-2 ring-[#c8aa6e] shadow-[0_0_25px_rgba(200,170,110,0.6),_0_0_50px_rgba(200,170,110,0.3)] scale-105 z-10'
          : 'border border-[#2b2518]/60 hover:ring-2 hover:ring-[#c8aa6e] hover:shadow-[0_0_15px_rgba(200,170,110,0.5)] transition-all duration-300',
      ].join(' ')}>
      {/* Imagen / Preview */}
      {hasThumbnail && !imageError ? (
        <img
          src={thumbnailUrl!}
          alt={nombre}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110 opacity-90 group-hover:opacity-100"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : hasBuiltIn ? (
        <div className="flex h-full w-full items-center justify-center" style={{ background: `radial-gradient(circle, ${builtInColor}33, ${builtInColor}11)` }}>
          <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: builtInColor!, opacity: 0.7 }} />
        </div>
      ) : null}

      {/* Fallback icon */}
      <div className={`flex h-full w-full absolute inset-0 items-center justify-center text-2xl text-[#0397ab]/30 z-0 ${(hasThumbnail && !imageError) || hasBuiltIn ? 'hidden' : ''}`}>
        📦
      </div>

      {/* Badges compactos */}
      {interactuable && (
        <div className="absolute top-0.5 right-0.5 z-10 rounded-full bg-amber-500/80 w-4 h-4 flex items-center justify-center shadow-sm">
          <span className="text-[8px]">{sentable ? '🪑' : '⚡'}</span>
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

      {/* Drag indicator (ahora en la parte superior derecha junto al badge si existe) */}
      {catalogData && (
        <div className="absolute top-0.5 right-5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-3 h-3 text-[#04c8e0] drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
          </svg>
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
