'use client';

import React from 'react';

interface ParticipantAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isSpeaking?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-12 h-12 text-lg',
  md: 'w-20 h-20 text-2xl',
  lg: 'w-28 h-28 text-4xl',
  xl: 'w-36 h-36 text-5xl',
};

export const ParticipantAvatar: React.FC<ParticipantAvatarProps> = ({
  name,
  avatarUrl,
  size = 'lg',
  isSpeaking = false,
  className = '',
}) => {
  const [imageError, setImageError] = React.useState(false);

  // Reset error state when url changes
  React.useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  const getInitials = (name: string): string => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getGradientColor = (name: string): string => {
    const colors = [
      'from-indigo-500 to-purple-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-red-600',
      'from-pink-500 to-rose-600',
      'from-cyan-500 to-blue-600',
      'from-amber-500 to-orange-600',
      'from-violet-500 to-indigo-600',
      'from-lime-500 to-green-600',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const showImage = avatarUrl && !imageError;

  return (
    <div className={`relative ${className}`}>
      {/* Anillo de hablante activo */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-full animate-pulse">
          <div className="absolute inset-[-4px] rounded-full bg-gradient-to-r from-green-400 to-emerald-500 opacity-75 blur-sm" />
          <div className="absolute inset-[-2px] rounded-full border-2 border-green-400 animate-ping opacity-50" />
        </div>
      )}
      
      {/* Avatar container */}
      <div
        className={`
          ${sizeClasses[size]}
          rounded-full
          flex items-center justify-center
          overflow-hidden
          relative
          ${isSpeaking ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-zinc-900' : 'ring-2 ring-white/20'}
          shadow-xl
          transition-all duration-300
        `}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={`
              w-full h-full
              bg-gradient-to-br ${getGradientColor(name)}
              flex items-center justify-center
              font-bold text-white
              select-none
            `}
          >
            {getInitials(name)}
          </div>
        )}
      </div>
      
      {/* Nombre debajo del avatar */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-white text-sm font-medium px-3 py-1 bg-black/60 backdrop-blur-sm rounded-full">
          {name}
        </span>
      </div>
    </div>
  );
};

export default ParticipantAvatar;
