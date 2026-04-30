/**
 * Button — Aurora GLASS Design System.
 *
 * Las clases visuales viven en `styles/aurora-glass.css` (`.ag-btn*`).
 * Este componente solo orquesta variantes / tamaño / loading / icono.
 *
 * Para un nuevo tema (p.ej. aurora-night) basta cambiar `data-theme` en
 * `<html>`. No hay colores hardcoded aquí.
 */

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  pill?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'ag-btn--primary',
  secondary: 'ag-btn--secondary',
  ghost:     'ag-btn--ghost',
  danger:    'ag-btn--danger',
};

const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'ag-btn--sm',
  md: '',
  lg: 'ag-btn--lg',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'right',
  pill = false,
  className = '',
  disabled,
  ...props
}) => {
  const classes = [
    'ag-btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    pill ? 'ag-btn--pill' : '',
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="inline-flex">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span className="inline-flex">{icon}</span>}
        </>
      )}
    </button>
  );
};

export default Button;
