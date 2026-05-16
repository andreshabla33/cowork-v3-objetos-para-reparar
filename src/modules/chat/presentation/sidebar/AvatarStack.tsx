'use client';
/**
 * @module chat/presentation/sidebar/AvatarStack
 *
 * Avatar stack reutilizable estilo Gather / Atlassian AvatarGroup —
 * círculos solapados horizontalmente + indicador `+N` si hay más.
 *
 * Patrón canónico (Atlassian Design System, Primer):
 *   https://atlassian.design/components/avatar-group
 *   https://primer.style/components/avatar-stack/
 *
 * Clean Architecture: Presentation puro. Cero deps de Domain.
 */

import React from 'react';

export interface AvatarStackItem {
  id: string;
  name: string;
  /** URL del avatar/foto. Si null/undefined se muestra la inicial. */
  imageUrl?: string | null;
}

export interface AvatarStackProps {
  users: AvatarStackItem[];
  /** Máximo visible antes de mostrar +N. Default 4. */
  max?: number;
  /** Tamaño del círculo en px. Default 24. */
  size?: number;
  /** Color del borde (debe contrastar con el fondo del sidebar). Default white. */
  borderColor?: string;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({
  users,
  max = 4,
  size = 24,
  borderColor = 'white',
}) => {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  const overlap = Math.max(6, Math.floor(size * 0.35));

  return (
    <div className="inline-flex items-center" style={{ minHeight: size }}>
      {visible.map((u, i) => {
        const initial = (u.name?.[0] ?? '?').toUpperCase();
        return (
          <div
            key={u.id}
            title={u.name}
            className="rounded-full overflow-hidden flex items-center justify-center bg-indigo-500 text-white font-bold flex-shrink-0"
            style={{
              width: size,
              height: size,
              fontSize: size * 0.4,
              border: `2px solid ${borderColor}`,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: visible.length - i,
            }}
          >
            {u.imageUrl ? (
              <img
                src={u.imageUrl}
                alt={u.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="rounded-full bg-zinc-200 text-zinc-700 font-bold flex items-center justify-center flex-shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.36,
            border: `2px solid ${borderColor}`,
            marginLeft: -overlap,
          }}
          title={`+${overflow} más`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

AvatarStack.displayName = 'AvatarStack';
