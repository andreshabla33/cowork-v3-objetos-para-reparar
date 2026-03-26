/**
 * Modal Component - Design System
 * Modal base con efecto glassmorphism y animaciones
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

const sizeClasses: Record<ModalSize, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

// Responsive adjustments (mobile-first: base=compact, lg=desktop)
const responsiveSizes: Record<ModalSize, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-xs sm:max-w-sm',
  md: 'max-w-sm sm:max-w-md',
  lg: 'max-w-sm sm:max-w-md lg:max-w-lg',
  xl: 'max-w-md sm:max-w-lg lg:max-w-xl',
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
        className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto ${className}`}
        onClick={closeOnOverlayClick ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`
            relative w-full ${responsiveSizes[size]}
            backdrop-blur-xl bg-white/[0.03] 
            border border-white/[0.08] 
            rounded-3xl lg:rounded-2xl
            shadow-2xl
            my-auto
            ${contentClassName}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Glow exterior sutil */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/10 via-fuchsia-600/10 to-cyan-500/10 rounded-3xl lg:rounded-2xl blur-xl opacity-50 pointer-events-none" />
          
          {/* Contenido */}
          <div className="relative">
            {/* Header con título opcional */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between p-6 lg:p-5 md:p-4 border-b border-white/5">
                {title && (
                  <div>
                    <h2 className="text-xl lg:text-lg font-bold text-white">{title}</h2>
                    {subtitle && <p className="text-sm lg:text-xs text-zinc-400 mt-1">{subtitle}</p>}
                  </div>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/5 rounded-xl transition-colors text-zinc-500 hover:text-white"
                  >
                    <X className="w-5 h-5 lg:w-4 lg:h-4" />
                  </button>
                )}
              </div>
            )}
            
            {/* Body */}
            <div className={!title && !showCloseButton ? '' : ''}>
              {children}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Modal;
