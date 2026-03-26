import React from 'react';

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false
}) => {
  return (
    <div className="flex items-center justify-between py-4 lg:py-3 border-b border-white/[0.05] last:border-b-0">
      <div className="flex-1 pr-4 lg:pr-3">
        <p className="text-sm lg:text-xs font-medium text-white">{label}</p>
        {description && (
          <p className="text-xs lg:text-[11px] text-zinc-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-200 border-2 ${
          checked 
            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 border-violet-400 shadow-lg shadow-violet-500/30' 
            : 'bg-zinc-700 border-zinc-600 hover:border-zinc-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
      >
        <span 
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-200 flex items-center justify-center ${
            checked ? 'translate-x-6' : 'translate-x-0'
          }`}
        >
          {checked ? (
            <svg className="w-3 h-3 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </span>
      </button>
    </div>
  );
};

export default SettingToggle;
