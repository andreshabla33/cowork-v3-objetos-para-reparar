/**
 * @module components/layout/WorkspaceHeader
 * @description Infrastructure UI component for the workspace header bar.
 * Renders active tab title, status selector, theme picker, games button, and AI assistant button.
 *
 * Clean Architecture: Presentation layer — zero business logic.
 * Ref: react.dev "Thinking in React" — single-responsibility component.
 */

import React from 'react';
import { StatusSelector } from '../StatusSelector';
import { THEME_LIST, type ThemeStyleSet } from '@/lib/theme';
import type { ThemeType } from '@/types';
import type { SubTabType } from '@/types/workspace';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

export interface WorkspaceHeaderProps {
  theme: ThemeType;
  styles: ThemeStyleSet;
  activeSubTab: SubTabType;
  currentLang: Language;
  onThemeChange: (theme: ThemeType) => void;
  onOpenGameHub: () => void;
  onToggleViben: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = React.memo(({
  theme, styles: s, activeSubTab, currentLang,
  onThemeChange, onOpenGameHub, onToggleViben,
}) => (
  <header className={`h-16 border-b ${s.border} hidden md:flex items-center px-8 justify-between shrink-0 ${s.header} z-50`}>
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${theme === 'arcade' ? 'bg-[#00ff41] animate-pulse' : 'bg-gradient-to-r from-violet-500 to-cyan-500'}`} />
        <h2 className={`text-xs font-black uppercase tracking-[0.2em] ${
          theme === 'arcade'
            ? 'text-[#00ff41] animate-pulse'
            : theme === 'light'
              ? 'text-zinc-700'
              : 'text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white'
        }`}>
          {activeSubTab === 'space' ? 'Spatial World' : activeSubTab.toUpperCase()}
        </h2>
      </div>
    </div>

    <div className="flex items-center gap-4">
      <StatusSelector />

      {/* Theme Picker */}
      <div data-tour-step="theme-selector" className={`flex items-center gap-1.5 p-1.5 rounded-2xl border backdrop-blur-xl ${
        theme === 'arcade'
          ? 'border-[#00ff41]/40 bg-black/60'
          : theme === 'light'
            ? 'border-zinc-200 bg-white/60'
            : 'border-white/[0.08] bg-white/[0.03]'
      }`}>
        <span className={`text-[8px] font-black uppercase tracking-widest px-2 hidden lg:block ${
          theme === 'light' ? 'text-zinc-400' : 'opacity-40'
        }`}>{t('theme.style', currentLang)}</span>
        {THEME_LIST.map(themeOpt => (
          <button
            key={themeOpt.id}
            onClick={() => onThemeChange(themeOpt.id)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all transform active:scale-90 ${
              theme === themeOpt.id
                ? theme === 'arcade'
                  ? 'bg-[#00ff41] shadow-[0_0_15px_#00ff41] scale-105'
                  : 'bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 shadow-lg scale-105 border border-violet-500/30'
                : 'opacity-30 hover:opacity-100 hover:bg-white/[0.05]'
            }`}
            title={t(themeOpt.labelKey, currentLang)}
          >
            {themeOpt.icon}
          </button>
        ))}
      </div>

      {/* Games Button */}
      <button
        data-tour-step="games-btn"
        onClick={onOpenGameHub}
        className={`relative overflow-hidden flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all font-bold text-[10px] tracking-wider group ${
          theme === 'arcade'
            ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/50 hover:bg-[#00ff41]/30'
            : 'bg-white/[0.05] border border-white/[0.1] text-white/80 hover:bg-white/[0.1] hover:border-amber-500/50 hover:text-amber-400'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
        <span>{t('button.games', currentLang)}</span>
      </button>

      {/* AI Assistant Button */}
      <button
        data-tour-step="viben-btn"
        onClick={onToggleViben}
        className={`relative overflow-hidden flex items-center gap-2.5 px-5 py-2.5 rounded-2xl transition-all font-black uppercase text-[10px] tracking-wider group ${
          theme === 'arcade'
            ? 'bg-[#00ff41] text-black shadow-[0_0_25px_#00ff41] hover:shadow-[0_0_35px_#00ff41]'
            : 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]'
        }`}
      >
        <span className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
          theme === 'arcade' ? 'bg-white/20' : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400'
        }`} />
        <span className="relative flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${theme === 'arcade' ? 'bg-black' : 'bg-white'}`} />
          Mónica AI
        </span>
      </button>
    </div>
  </header>
));

WorkspaceHeader.displayName = 'WorkspaceHeader';
