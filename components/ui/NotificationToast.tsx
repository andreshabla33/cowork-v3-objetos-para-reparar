/**
 * @module components/ui/NotificationToast
 *
 * Renderiza notificaciones del store (uiSlice.notifications) como
 * toasts flotantes. Auto-dismiss después de 4 segundos con animación de salida.
 *
 * Tipos soportados: success, error, info, mention, entry
 *
 * Usar en: WorkspaceLayout (una sola instancia global).
 * Las notificaciones se agregan via useStore().addNotification(msg, type)
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';

const TOAST_DURATION_MS = 4000;
const EXIT_ANIMATION_MS = 300;

const typeStyles: Record<string, { bg: string; icon: string; border: string }> = {
  success: { bg: 'bg-emerald-900/90', icon: '✓', border: 'border-emerald-500/50' },
  error:   { bg: 'bg-red-900/90',     icon: '✕', border: 'border-red-500/50' },
  info:    { bg: 'bg-blue-900/90',    icon: 'ℹ', border: 'border-blue-500/50' },
  mention: { bg: 'bg-indigo-900/90',  icon: '@', border: 'border-indigo-500/50' },
  entry:   { bg: 'bg-zinc-800/90',    icon: '→', border: 'border-zinc-500/50' },
};

interface ToastItemProps {
  id: string;
  message: string;
  type: string;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ id, message, type, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const dismissTimer = setTimeout(() => {
      setIsExiting(true);
    }, TOAST_DURATION_MS);

    const removeTimer = setTimeout(() => {
      onRemove(id);
    }, TOAST_DURATION_MS + EXIT_ANIMATION_MS);

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(removeTimer);
    };
  }, [id, onRemove]);

  const style = typeStyles[type] || typeStyles.info;

  return (
    <div
      className={`
        pointer-events-auto max-w-sm w-full flex items-center gap-3
        px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
        ${style.bg} ${style.border}
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      <span className="text-lg flex-shrink-0">{style.icon}</span>
      <p className="text-sm text-white/90 leading-snug">{message}</p>
    </div>
  );
};

/**
 * Componente global para renderizar notificaciones.
 * Montar UNA vez en WorkspaceLayout o App.
 */
export const NotificationToast: React.FC = () => {
  const notifications = useStore((s) => s.notifications);
  const removeNotification = useStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.slice(0, 3).map((notif) => (
        <ToastItem
          key={notif.id}
          id={notif.id}
          message={notif.message}
          type={notif.type}
          onRemove={removeNotification}
        />
      ))}
    </div>,
    document.body,
  );
};
