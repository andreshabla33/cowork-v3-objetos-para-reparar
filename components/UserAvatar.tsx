/**
 * UserAvatar - Componente reutilizable de avatar de usuario
 * 
 * Sistema Dual Identity (Tendencia 2026):
 * - Muestra foto de perfil real si existe
 * - Fallback a iniciales con color basado en nombre
 * - Indicador de estado online (opcional)
 * - Tamaños: xs (24px), sm (32px), md (40px), lg (56px), xl (80px)
 */

import React from 'react';
import { PresenceStatus } from '../types';

interface UserAvatarProps {
  name: string;
  profilePhoto?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: PresenceStatus;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP = {
  xs: { container: 'w-6 h-6', text: 'text-[8px]', status: 'w-2 h-2 -bottom-0 -right-0', ring: 'ring-1' },
  sm: { container: 'w-8 h-8', text: 'text-[10px]', status: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5', ring: 'ring-1' },
  md: { container: 'w-10 h-10', text: 'text-xs', status: 'w-3 h-3 -bottom-0.5 -right-0.5', ring: 'ring-2' },
  lg: { container: 'w-14 h-14', text: 'text-sm', status: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5', ring: 'ring-2' },
  xl: { container: 'w-20 h-20', text: 'text-lg', status: 'w-4 h-4 -bottom-1 -right-1', ring: 'ring-2' },
};

const STATUS_COLORS: Record<string, string> = {
  [PresenceStatus.AVAILABLE]: 'bg-green-500',
  [PresenceStatus.BUSY]: 'bg-red-500',
  [PresenceStatus.AWAY]: 'bg-yellow-500',
  [PresenceStatus.DND]: 'bg-purple-500',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-indigo-600', 'bg-violet-600', 'bg-fuchsia-600', 'bg-pink-600',
    'bg-rose-600', 'bg-red-600', 'bg-orange-600', 'bg-amber-600',
    'bg-emerald-600', 'bg-teal-600', 'bg-cyan-600', 'bg-sky-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  profilePhoto,
  size = 'md',
  showStatus = false,
  status,
  className = '',
  onClick,
}) => {
  const s = SIZE_MAP[size];
  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  return (
    <div
      className={`relative inline-flex shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {profilePhoto ? (
        <img
          src={profilePhoto}
          alt={name}
          className={`${s.container} rounded-full object-cover ${s.ring} ring-white/10`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div
        className={`${s.container} rounded-full ${bgColor} flex items-center justify-center ${s.text} font-bold text-white select-none ${s.ring} ring-white/10 ${profilePhoto ? 'hidden' : ''}`}
      >
        {initials}
      </div>

      {showStatus && status && (
        <span
          className={`absolute ${s.status} ${STATUS_COLORS[status] || 'bg-zinc-500'} rounded-full border-2 border-zinc-900`}
        />
      )}
    </div>
  );
};

export default UserAvatar;
