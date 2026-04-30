import React from 'react';

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

export const SettingSection: React.FC<SettingSectionProps> = ({ title, children }) => {
  return (
    <div className="mb-6">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#6B83A0] mb-3">
        {title}
      </h4>
      <div className="backdrop-blur-xl bg-[rgba(46,150,245,0.06)] border border-[rgba(46,150,245,0.14)] rounded-2xl lg:rounded-xl px-5 lg:px-4 overflow-visible">
        {children}
      </div>
    </div>
  );
};

export default SettingSection;
