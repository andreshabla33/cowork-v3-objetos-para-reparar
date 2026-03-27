/**
 * AnimatedBackground Component - Design System
 * Fondo con gradientes neon animados estilo Glassmorphism 2026
 */

import React from 'react';

interface AnimatedBackgroundProps {
  variant?: 'default' | 'subtle' | 'intense';
  showGrid?: boolean;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  variant = 'default',
  showGrid = true,
}) => {
  const intensityConfig = {
    default: {
      blob1: 'bg-violet-600/15',
      blob2: 'bg-cyan-500/10',
      blob3: 'bg-fuchsia-600/10',
    },
    subtle: {
      blob1: 'bg-violet-600/10',
      blob2: 'bg-cyan-500/5',
      blob3: 'bg-fuchsia-600/5',
    },
    intense: {
      blob1: 'bg-violet-600/25',
      blob2: 'bg-cyan-500/20',
      blob3: 'bg-fuchsia-600/15',
    },
  };

  const config = intensityConfig[variant];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blob superior izquierdo */}
      <div 
        className={`absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full ${config.blob1} blur-[180px] animate-pulse`} 
      />
      
      {/* Blob inferior derecho */}
      <div 
        className={`absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full ${config.blob2} blur-[180px] animate-pulse`}
        style={{ animationDelay: '1.5s' }} 
      />
      
      {/* Blob central */}
      <div 
        className={`absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full ${config.blob3} blur-[120px] animate-pulse`}
        style={{ animationDelay: '3s' }} 
      />
      
      {/* Grid pattern sutil */}
      {showGrid && (
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      )}
    </div>
  );
};

export default AnimatedBackground;
