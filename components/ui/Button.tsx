/**
 * Button Component - Design System
 * Botones con variantes y efectos
 */

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantClasses = {
  primary: `
    relative overflow-hidden
    bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500
    text-white
    shadow-2xl shadow-violet-600/30
    hover:shadow-violet-600/40
    disabled:opacity-50 disabled:cursor-not-allowed
  `,
  secondary: `
    bg-zinc-900 hover:bg-zinc-800
    border border-white/5
    text-white
    disabled:opacity-50
  `,
  ghost: `
    bg-transparent hover:bg-white/5
    text-zinc-400 hover:text-white
    disabled:opacity-50
  `,
  danger: `
    bg-red-600 hover:bg-red-500
    text-white
    shadow-lg shadow-red-600/20
    disabled:opacity-50
  `,
};

const sizeClasses = {
  sm: 'px-3 py-2 text-[9px] lg:text-[8px] rounded-lg',
  md: 'px-4 py-3 text-xs lg:text-[10px] rounded-xl',
  lg: 'px-6 py-4 text-sm lg:text-xs rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'right',
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        font-black uppercase tracking-wider
        transition-all active:scale-[0.98]
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      disabled={disabled || loading}
      {...props}
    >
      {/* Hover overlay para primary */}
      {variant === 'primary' && (
        <span className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 opacity-0 hover:opacity-100 transition-opacity duration-300" />
      )}
      
      <span className="relative flex items-center gap-2">
        {loading ? (
          <div className="w-4 h-4 lg:w-3 lg:h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            {icon && iconPosition === 'left' && icon}
            {children}
            {icon && iconPosition === 'right' && icon}
          </>
        )}
      </span>
    </button>
  );
};

export default Button;
