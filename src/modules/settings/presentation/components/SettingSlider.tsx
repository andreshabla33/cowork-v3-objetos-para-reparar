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
    <div className="py-4 lg:py-3 border-b border-[rgba(46,150,245,0.14)] last:border-b-0">
      <div className="flex items-center justify-between mb-3 lg:mb-2">
        <div>
          <p className="text-sm lg:text-xs font-medium text-[#0B2240]">{label}</p>
          {description && (
            <p className="text-xs lg:text-[11px] text-[#4A6485] mt-0.5">{description}</p>
          )}
        </div>
        <span className="px-3 lg:px-2 py-1 rounded-lg bg-[rgba(46,150,245,0.12)] border border-[rgba(46,150,245,0.3)] text-sm lg:text-xs font-bold text-[#1E86E5]">
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
            background: `linear-gradient(to right, #2E96F5 0%, #4FB0FF ${((value - min) / (max - min)) * 100}%, #E0F0FF ${((value - min) / (max - min)) * 100}%, #E0F0FF 100%)`
          }}
        />
      </div>
    </div>
  );
};

export default SettingSlider;
