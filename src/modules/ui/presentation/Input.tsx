/**
 * Input — Aurora GLASS Design System.
 * Sin hardcoding de colores. Estilos en `styles/aurora-glass.css`.
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  fullWidth = true,
  className = '',
  id,
  ...props
}) => {
  const inputId = id ?? props.name ?? undefined;

  const inputClasses = [
    'ag-input',
    icon ? 'ag-input--with-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label className="ag-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="ag-field">
        {icon && (
          <span className="ag-field__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={inputClasses}
          aria-invalid={!!error || undefined}
          {...props}
          style={
            error
              ? { borderColor: 'var(--cw-error)', ...(props.style ?? {}) }
              : props.style
          }
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--cw-error)' }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
