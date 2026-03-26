import React from 'react';

interface SettingSliderProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const SettingSlider: React.FC<SettingSliderProps> = ({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false
}) => {
  return (
    <div className="py-4 lg:py-3 border-b border-white/[0.05] last:border-b-0">
      <div className="flex items-center justify-between mb-3 lg:mb-2">
        <div>
          <p className="text-sm lg:text-xs font-medium text-white">{label}</p>
          {description && (
            <p className="text-xs lg:text-[11px] text-zinc-400 mt-0.5">{description}</p>
          )}
        </div>
        <span className="px-3 lg:px-2 py-1 rounded-lg bg-violet-600/20 border border-violet-500/40 text-sm lg:text-xs font-bold text-violet-300">
          {value}{unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className={`w-full h-3 rounded-full appearance-none cursor-pointer ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          style={{
            background: `linear-gradient(to right, #8b5cf6 0%, #d946ef ${((value - min) / (max - min)) * 100}%, #3f3f46 ${((value - min) / (max - min)) * 100}%, #3f3f46 100%)`
          }}
        />
      </div>
    </div>
  );
};

export default SettingSlider;
