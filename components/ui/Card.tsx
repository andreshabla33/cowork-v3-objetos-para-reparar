/**
 * Card Component - Design System
 * Card con efecto glassmorphism
 */

import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'glass' | 'solid' | 'outline';
  hover?: boolean;
  glow?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const variantClasses = {
  glass: 'backdrop-blur-xl bg-white/[0.03] border border-white/[0.08]',
  solid: 'bg-zinc-900 border border-zinc-800',
  outline: 'bg-transparent border border-white/[0.08]',
};

const paddingClasses = {
  none: '',
  sm: 'p-3 lg:p-2',
  md: 'p-5 lg:p-4 md:p-3',
  lg: 'p-6 lg:p-5 md:p-4',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'glass',
  hover = false,
  glow = false,
  padding = 'md',
  onClick,
}) => {
  const Component = onClick ? motion.button : motion.div;
  
  return (
    <Component
      className={`
        relative
        rounded-2xl lg:rounded-xl
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${hover ? 'hover:bg-white/[0.05] hover:border-violet-500/30 transition-all cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      whileHover={hover ? { scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
    >
      {glow && (
        <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20 rounded-2xl lg:rounded-xl blur-lg opacity-40 pointer-events-none" />
      )}
      <div className="relative">{children}</div>
    </Component>
  );
};

export default Card;
