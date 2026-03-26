import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface VideoPaginationProps {
  paginaActual: number;
  totalPaginas: number;
  onAnterior: () => void;
  onSiguiente: () => void;
  variant?: 'bottom' | 'sides';
}

export const VideoPagination: React.FC<VideoPaginationProps> = ({
  paginaActual,
  totalPaginas,
  onAnterior,
  onSiguiente,
  variant = 'bottom',
}) => {
  if (totalPaginas <= 1) return null;

  if (variant === 'sides') {
    return (
      <div className="pointer-events-none flex w-full items-center justify-between gap-3">
        <button
          onClick={onAnterior}
          disabled={paginaActual === 0}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-950/82 text-white/80 shadow-2xl backdrop-blur-xl transition-all hover:bg-zinc-900/92 hover:text-white disabled:opacity-30 disabled:hover:bg-zinc-950/82"
          aria-label="Página anterior"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="pointer-events-none flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/72 px-3 py-2 shadow-2xl backdrop-blur-xl">
          {Array.from({ length: totalPaginas }).map((_, i) => (
            <div
              key={i}
              className={`h-2 transition-all rounded-full ${
                paginaActual === i ? 'w-6 bg-indigo-400' : 'w-2 bg-white/30'
              }`}
            />
          ))}
        </div>

        <button
          onClick={onSiguiente}
          disabled={paginaActual === totalPaginas - 1}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-950/82 text-white/80 shadow-2xl backdrop-blur-xl transition-all hover:bg-zinc-900/92 hover:text-white disabled:opacity-30 disabled:hover:bg-zinc-950/82"
          aria-label="Página siguiente"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 mt-2 mb-2 p-2 bg-black/40 rounded-full backdrop-blur-sm self-center">
      <button
        onClick={onAnterior}
        disabled={paginaActual === 0}
        className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
        aria-label="Página anterior"
      >
        <ChevronLeft size={24} />
      </button>

      <div className="flex items-center gap-1.5 px-2">
        {Array.from({ length: totalPaginas }).map((_, i) => (
          <div
            key={i}
            className={`h-2 transition-all rounded-full ${
              paginaActual === i ? 'w-6 bg-indigo-500' : 'w-2 bg-white/30'
            }`}
          />
        ))}
      </div>

      <button
        onClick={onSiguiente}
        disabled={paginaActual === totalPaginas - 1}
        className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
        aria-label="Página siguiente"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
};
