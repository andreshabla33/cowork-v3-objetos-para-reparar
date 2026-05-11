/**
 * Card — Aurora GLASS Design System.
 * Superficie translúcida (Liquid Glass). Sin colores hardcoded.
 *
 * Estilos canónicos en `styles/aurora-glass.css` (`.ag-card`, `.ag-surface`).
 */

import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'glass' | 'surface' | 'flat';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const VARIANT_CLASS: Record<NonNullable<CardProps['variant']>, string> = {
  glass:   'ag-card',
  surface: 'ag-surface ag-surface--ring',
  flat:    'ag-surface ag-surface--flat',
};

const PADDING_CLASS: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'glass',
  hover = false,
  padding = 'md',
  onClick,
}) => {
  const Component = onClick ? motion.button : motion.div;
  const interactive = !!onClick && hover ? 'ag-card--interactive' : '';

  const classes = [
    VARIANT_CLASS[variant],
    interactive,
    PADDING_CLASS[padding],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component
      className={classes}
      onClick={onClick}
      whileHover={hover ? { y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
    >
      {children}
    </Component>
  );
};

export default Card;
