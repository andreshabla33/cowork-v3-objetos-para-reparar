/**
 * Modal — Aurora GLASS Design System.
 * Liquid Glass surface, profundidad real (z-depth). Sin colores hardcoded.
 *
 * Estilos canónicos en `styles/aurora-glass.css` (`.ag-modal*`).
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
  contentClassName?: string;
  title?: string;
  subtitle?: string;
}

const SIZE_TAILWIND: Record<ModalSize, string> = {
  xs:    'max-w-xs',
  sm:    'max-w-xs sm:max-w-sm',
  md:    'max-w-sm sm:max-w-md',
  lg:    'max-w-sm sm:max-w-md lg:max-w-lg',
  xl:    'max-w-md sm:max-w-lg lg:max-w-xl',
  '2xl': 'max-w-lg sm:max-w-xl lg:max-w-2xl',
  '3xl': 'max-w-xl sm:max-w-2xl lg:max-w-3xl',
  '4xl': 'max-w-2xl sm:max-w-3xl lg:max-w-4xl',
  '5xl': 'max-w-3xl sm:max-w-4xl lg:max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className = '',
  contentClassName = '',
  title,
  subtitle,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`ag-modal-overlay ${className}`}
        onClick={closeOnOverlayClick ? onClose : undefined}
        role="presentation"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className={`ag-modal w-full ${SIZE_TAILWIND[size]} ${contentClassName}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'ag-modal-title' : undefined}
        >
          {(title || showCloseButton) && (
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--cw-line)' }}
            >
              {title && (
                <div>
                  <h2
                    id="ag-modal-title"
                    className="ag-h2"
                    style={{ fontSize: 18 }}
                  >
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--cw-ink-500)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="ag-btn ag-btn--ghost ag-btn--icon"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <div>{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Modal;
