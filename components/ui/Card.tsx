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
  glass: 'bg-white border border-[#E3EAF2]',
  solid: 'bg-white border border-[#E3EAF2]',
  outline: 'bg-transparent border border-[#E3EAF2]',
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
        ${hover ? 'hover:bg-slate-50 hover:border-sky-300 transition-all cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      whileHover={hover ? { scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
    >
      {glow && (
        <div className="absolute -inset-0.5 bg-sky-400/10 rounded-2xl lg:rounded-xl blur-lg opacity-60 pointer-events-none" />
      )}
      <div className="relative">{children}</div>
    </Component>
  );
};

export default Card;
