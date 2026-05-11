'use client';

import React from 'react';

export type ViewMode = 'gallery' | 'speaker' | 'sidebar';

interface ViewModeSelectorProps {
  currentMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  hasScreenShare?: boolean;
  participantCount?: number;
}

const viewModes = [
  {
    id: 'gallery' as ViewMode,
    label: 'Galería',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    description: 'Ver a todos los participantes',
  },
  {
    id: 'speaker' as ViewMode,
    label: 'Orador',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    description: 'Enfoque en quien habla',
  },
  {
    id: 'sidebar' as ViewMode,
    label: 'Lateral',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    description: 'Pantalla + participantes al lado',
  },
];

export const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  onChange,
  hasScreenShare = false,
  participantCount = 0,
}) => {
  const availableModes = viewModes.filter((mode) => {
    if (mode.id === 'sidebar' && !hasScreenShare) return false;
    return true;
  });

  if (availableModes.length <= 1) return null;

  return (
    <div data-tour-step="meeting-layout-switcher" className="flex items-center gap-1.5 rounded-2xl bg-black/55 p-1 shadow-xl backdrop-blur-md md:gap-2 md:rounded-lg md:bg-[rgba(46,150,245,0.08)] md:p-1.5">
      <div className="flex items-center gap-1">
        {availableModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            className={`
              flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium md:rounded-md md:px-3 md:py-1.5 md:text-sm
              transition-all duration-200
              ${currentMode === mode.id
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-[rgba(46,150,245,0.08)]'
              }
            `}
            title={mode.description}
          >
            {mode.icon}
            <span className="hidden md:inline">{mode.label}</span>
          </button>
        ))}
      </div>

      <div className="hidden md:flex items-center rounded-full border border-[rgba(46,150,245,0.14)] bg-white/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
        {participantCount} conectados
      </div>
    </div>
  );
};

export default ViewModeSelector;
