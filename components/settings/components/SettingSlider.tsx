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
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="py-4 lg:py-3 border-b border-[#E3EAF2] last:border-b-0">
      <div className="flex items-center justify-between mb-3 lg:mb-2">
        <div>
          <p className="text-sm lg:text-xs font-medium text-slate-800">{label}</p>
          {description && (
            <p className="text-xs lg:text-[11px] text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
        <span className="px-3 lg:px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sm lg:text-xs font-bold text-sky-700">
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
          className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          style={{
            background: `linear-gradient(to right, #0ea5e9 0%, #38bdf8 ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`
          }}
        />
      </div>
    </div>
  );
};

export default SettingSlider;
