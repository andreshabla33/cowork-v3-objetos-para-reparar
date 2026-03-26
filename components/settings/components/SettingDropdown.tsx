import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string;
  label: string;
}

interface SettingDropdownProps {
  label: string;
  description?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const SettingDropdown: React.FC<SettingDropdownProps> = ({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);

  // Calcular posición de forma síncrona al abrir
  const calculatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      return {
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 180)
      };
    }
    return null;
  }, []);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    
    if (!isOpen) {
      // Calcular posición ANTES de abrir
      const pos = calculatePosition();
      if (pos) {
        setDropdownPosition(pos);
        setIsOpen(true);
      }
    } else {
      setIsOpen(false);
    }
  }, [isOpen, disabled, calculatePosition]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // No cerrar si el click fue en el botón o dentro del dropdown
      if (
        buttonRef.current?.contains(target) ||
        dropdownContentRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    
    // Usar click en lugar de mousedown para que onClick de las opciones funcione primero
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  // Cerrar con ESC
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Actualizar posición en resize/scroll
  useEffect(() => {
    if (!isOpen) return;
    
    const handleUpdate = () => {
      const pos = calculatePosition();
      if (pos) setDropdownPosition(pos);
    };
    
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isOpen, calculatePosition]);

  const selectedOption = options.find(o => o.value === value);

  const dropdownContent = dropdownPosition && (
    <div 
      ref={dropdownContentRef} 
      className="fixed backdrop-blur-xl bg-zinc-800 border border-violet-500/40 rounded-xl lg:rounded-lg shadow-2xl overflow-hidden"
      style={{ 
        zIndex: 99999, 
        top: dropdownPosition.top, 
        left: dropdownPosition.left,
        minWidth: dropdownPosition.width,
        maxWidth: 280,
        animation: 'dropdownFadeIn 0.15s ease-out'
      }}
    >
      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => {
            onChange(option.value);
            setIsOpen(false);
          }}
          className={`w-full px-4 lg:px-3 py-3 lg:py-2 text-left text-sm lg:text-xs font-medium transition-all flex items-center gap-2 hover:bg-violet-600/20 ${
            option.value === value
              ? 'bg-violet-600 text-white'
              : 'text-zinc-200'
          }`}
        >
          {option.value === value && (
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className={option.value === value ? '' : 'ml-6'}>{option.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex items-center justify-between py-4 lg:py-3 border-b border-white/[0.05] last:border-b-0">
      <div className="flex-1 pr-4 lg:pr-3">
        <p className="text-sm lg:text-xs font-medium text-white">{label}</p>
        {description && (
          <p className="text-xs lg:text-[11px] text-zinc-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleToggle}
          disabled={disabled}
          className={`flex items-center gap-2 px-4 lg:px-3 py-2 lg:py-1.5 rounded-xl lg:rounded-lg backdrop-blur-xl bg-violet-600/20 border border-violet-500/40 text-sm lg:text-xs font-medium text-white hover:bg-violet-600/30 hover:border-violet-500/60 transition-all min-w-[120px] lg:min-w-[100px] justify-between ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${isOpen ? 'ring-2 ring-violet-500/50 border-violet-500' : ''}`}
        >
          <span className="truncate">{selectedOption?.label || 'Seleccionar'}</span>
          <svg className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isOpen && dropdownContent && createPortal(dropdownContent, document.body)}
      </div>
    </div>
  );
};

export default SettingDropdown;
