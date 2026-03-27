/**
 * Input Component - Design System
 * Input con efecto glassmorphism
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
  ...props
}) => {
  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label className="block text-[10px] lg:text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute inset-y-0 left-4 lg:left-3 flex items-center pointer-events-none opacity-30 group-focus-within:opacity-100 transition-opacity">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full
            bg-black/40 
            border ${error ? 'border-red-500/50' : 'border-white/5'}
            rounded-xl lg:rounded-lg
            ${icon ? 'pl-12 lg:pl-10' : 'pl-4 lg:pl-3'} 
            pr-4 lg:pr-3 
            py-4 lg:py-3 md:py-2.5
            text-sm lg:text-xs
            text-white placeholder-zinc-600
            focus:outline-none 
            focus:ring-2 focus:ring-violet-500/50 
            focus:border-violet-500/50 
            transition-all
            ${className}
          `.trim().replace(/\s+/g, ' ')}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-[10px] lg:text-[9px] text-red-400 font-medium">{error}</p>
      )}
    </div>
  );
};

export default Input;
