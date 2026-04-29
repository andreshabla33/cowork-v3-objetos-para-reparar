import React from 'react';

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

export const SettingSection: React.FC<SettingSectionProps> = ({ title, children }) => {
  return (
    <div className="mb-6">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
        {title}
      </h4>
      <div className="bg-slate-50/60 border border-[#E3EAF2] rounded-2xl lg:rounded-xl px-5 lg:px-4 overflow-visible">
        {children}
      </div>
    </div>
  );
};

export default SettingSection;
