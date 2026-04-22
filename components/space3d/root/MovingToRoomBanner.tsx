/**
 * @module components/space3d/root/MovingToRoomBanner
 *
 * Banner visual que aparece mientras el cliente LiveKit está haciendo
 * reconnect a una nueva Room (disparado por `moveParticipant` del servidor).
 *
 * Patrón: escucha eventos del Room global del store (isReconnecting flag
 * actualizado por `useLiveKit` listener de `RoomEvent.Reconnecting` /
 * `Connected`). Renderiza un overlay centrado por N ms máximo.
 *
 * Timeouts:
 *  - `RECONNECT_HARD_TIMEOUT_MS` (5s): si el reconnect no termina, muestra
 *    error y ofrece al usuario reintentar. Evita que el banner quede
 *    colgado indefinido si algo falla en el server side.
 *
 * Ref: https://docs.livekit.io/reference/client-sdk-js/enums/RoomEvent.html
 *      (RoomEvent.Reconnecting + Connected)
 */

import React, { useEffect, useState } from 'react';

const RECONNECT_HARD_TIMEOUT_MS = 5000;

export interface MovingToRoomBannerProps {
  /** True mientras el cliente está en `Reconnecting` state. */
  isMoving: boolean;
  /** Texto opcional — default: "Entrando a sala privada..." */
  label?: string;
}

export const MovingToRoomBanner: React.FC<MovingToRoomBannerProps> = ({
  isMoving,
  label = 'Entrando a sala privada...',
}) => {
  const [showHardTimeout, setShowHardTimeout] = useState(false);

  useEffect(() => {
    if (!isMoving) {
      setShowHardTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowHardTimeout(true), RECONNECT_HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isMoving]);

  if (!isMoving) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          background: 'rgba(20, 20, 25, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#e5e7eb',
          fontSize: 14,
          fontWeight: 500,
          maxWidth: 320,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Spinner simple CSS (sin dependencias externas). */}
        <div
          style={{
            width: 18,
            height: 18,
            border: '2px solid rgba(255, 255, 255, 0.15)',
            borderTopColor: 'rgba(59, 130, 246, 0.9)',
            borderRadius: '50%',
            animation: 'cowork-spin 0.9s linear infinite',
            flexShrink: 0,
          }}
        />
        <div>
          <div>{showHardTimeout ? '⚠️ Reconexión tardando más de lo esperado' : `🔒 ${label}`}</div>
          {showHardTimeout && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Si persiste, recarga la página.
            </div>
          )}
        </div>
        <style>
          {`@keyframes cowork-spin { to { transform: rotate(360deg); } }`}
        </style>
      </div>
    </div>
  );
};

MovingToRoomBanner.displayName = 'MovingToRoomBanner';
