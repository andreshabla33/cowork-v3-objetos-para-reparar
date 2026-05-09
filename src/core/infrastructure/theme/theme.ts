/**
 * @module lib/theme
 * @description Infrastructure layer for UI theming system.
 * Centralizes glassmorphism design system and theme variants (dark, light, space, arcade).
 * Exports theme styles, glass constants, and theme utilities for workspace layout composition.
 * Designed for Clean Architecture: infrastructure layer providing theme abstraction.
 */

import type { ThemeType } from '@/types';

/**
 * Typed theme style properties for a single theme variant.
 * Each property is a Tailwind CSS class string for consistent styling.
 */
export interface ThemeStyleSet {
  /** Background color classes */
  bg: string;
  /** Primary text color classes */
  text: string;
  /** Global navigation bar styling */
  globalNav: string;
  /** Sidebar styling */
  sidebar: string;
  /** Border color classes */
  border: string;
  /** Header styling */
  header: string;
  /** Accent color classes */
  accent: string;
  /** Primary button styling */
  btn: string;
  /** Secondary button styling */
  btnSecondary: string;
}

/**
 * Glassmorphism base constant.
 * Provides backdrop blur effect for glass effect.
 */
export const GLASS_BASE = 'backdrop-blur-xl';

/**
 * Glassmorphism panel constant.
 * Semi-transparent white background with subtle border for glass panels.
 */
export const GLASS_PANEL = 'bg-white/[0.03] border-white/[0.08]';

/**
 * Glassmorphism hover state constant.
 * Enhanced transparency and violet border on hover interaction.
 */
export const GLASS_HOVER = 'hover:bg-white/[0.06] hover:border-violet-500/30';

/**
 * Primary gradient constant.
 * Violet, fuchsia, cyan gradient for button and accent elements.
 */
export const GRADIENT_PRIMARY = 'from-violet-600 via-fuchsia-600 to-cyan-500';

/**
 * Gradient text constant.
 * Creates transparent text with gradient background clip effect.
 */
export const GRADIENT_TEXT = 'text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-white';

/**
 * Violet glow shadow constant.
 * 20px violet shadow for glowing effect on buttons and elements.
 */
export const GLOW_VIOLET = 'shadow-[0_0_20px_rgba(139,92,246,0.3)]';

/**
 * Cyan glow shadow constant.
 * 20px cyan shadow for glowing effect on space theme elements.
 */
export const GLOW_CYAN = 'shadow-[0_0_20px_rgba(34,211,238,0.3)]';

/**
 * Complete theme styles mapping.
 * Contains all theme variants with complete styling for all UI components.
 * Variants: aurora (default · Aurora GLASS), dark, light, space, arcade.
 *
 * NOTA: el sistema canónico Aurora GLASS vive en `styles/aurora-glass.css`
 * (utilities `.ag-*`). Este mapa Tailwind se mantiene por compatibilidad con
 * `WorkspaceLayout`, `WorkspaceSidebar`, etc. La variante `aurora` mapea las
 * clases Tailwind a la paleta Aurora (azules + glass blanco).
 */
export const THEME_STYLES: Record<ThemeType, ThemeStyleSet> = {
  aurora: {
    bg: 'bg-[#ECF4FF]',
    text: 'text-[#1B3A5C]',
    globalNav: 'bg-white/70 backdrop-blur-xl border-r border-[rgba(46,150,245,0.14)]',
    sidebar: 'bg-white/55 backdrop-blur-xl border-[rgba(46,150,245,0.14)]',
    border: 'border-[rgba(46,150,245,0.14)]',
    header: 'bg-white/75 backdrop-blur-xl',
    accent: 'bg-[#2E96F5]',
    btn: 'bg-gradient-to-r from-[#4FB0FF] via-[#2E96F5] to-[#1E86E5] hover:opacity-95 text-white font-semibold shadow-[0_8px_24px_-8px_rgba(46,150,245,0.6)]',
    btnSecondary: 'bg-white/75 backdrop-blur-xl border border-white/70 hover:border-[rgba(46,150,245,0.35)] text-[#1B3A5C]'
  },
  dark: {
    bg: 'bg-[#0a0a0f]',
    text: 'text-zinc-100',
    globalNav: `${GLASS_BASE} bg-black/60 border-r border-white/[0.05]`,
    sidebar: `${GLASS_BASE} bg-black/40 border-white/[0.05]`,
    border: 'border-white/[0.08]',
    header: `${GLASS_BASE} bg-black/40`,
    accent: 'bg-violet-600',
    btn: `bg-gradient-to-r ${GRADIENT_PRIMARY} hover:opacity-90 text-white font-bold ${GLOW_VIOLET}`,
    btnSecondary: `${GLASS_BASE} bg-white/[0.05] border border-white/[0.1] hover:border-violet-500/50 text-white`
  },
  light: {
    bg: 'bg-slate-50',
    text: 'text-zinc-900',
    globalNav: 'bg-white/80 backdrop-blur-xl border-r border-zinc-200',
    sidebar: 'bg-white/60 backdrop-blur-xl border-zinc-200',
    border: 'border-zinc-200',
    header: 'bg-white/80 backdrop-blur-xl',
    accent: 'bg-violet-600',
    btn: `bg-gradient-to-r ${GRADIENT_PRIMARY} hover:opacity-90 text-white font-bold shadow-lg`,
    btnSecondary: 'bg-white border border-zinc-200 hover:border-violet-500/50 text-zinc-700'
  },
  space: {
    bg: 'bg-[#020617]',
    text: 'text-indigo-100',
    globalNav: `${GLASS_BASE} bg-indigo-950/60 border-r border-indigo-500/20`,
    sidebar: `${GLASS_BASE} bg-indigo-950/40 border-indigo-500/20`,
    border: 'border-indigo-500/20',
    header: `${GLASS_BASE} bg-indigo-950/40`,
    accent: 'bg-cyan-500',
    btn: `bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:opacity-90 text-white font-bold ${GLOW_CYAN}`,
    btnSecondary: `${GLASS_BASE} bg-indigo-500/10 border border-indigo-500/30 hover:border-cyan-500/50 text-indigo-100`
  },
  arcade: {
    bg: 'bg-black',
    text: 'text-[#00ff41]',
    globalNav: 'bg-black border-r border-[#00ff41]/40',
    sidebar: 'bg-black/90 border-[#00ff41]/30',
    border: 'border-[#00ff41]/40',
    header: 'bg-black/90',
    accent: 'bg-[#00ff41]',
    btn: 'bg-[#00ff41] hover:bg-[#00ff41]/80 text-black font-black uppercase tracking-tighter shadow-[0_0_20px_#00ff41]',
    btnSecondary: 'bg-black border-2 border-[#00ff41]/60 hover:border-[#00ff41] text-[#00ff41]'
  }
};

/**
 * Theme metadata for selection UI.
 * Used to populate theme picker with i18n labels and icons.
 */
export interface ThemeOption {
  /** Unique theme identifier */
  id: ThemeType;
  /** i18n key for theme label (e.g., 'theme.dark') */
  labelKey: string;
  /** Unicode emoji icon for visual identification */
  icon: string;
}

/**
 * Available theme options with i18n keys and icons.
 * Labels should be resolved at runtime using i18n translation function.
 */
export const THEME_LIST: ThemeOption[] = [
  { id: 'aurora', labelKey: 'theme.aurora', icon: '🌊' },
  { id: 'dark', labelKey: 'theme.dark', icon: '🌑' },
  { id: 'light', labelKey: 'theme.light', icon: '☀️' },
  { id: 'space', labelKey: 'theme.space', icon: '🚀' },
  { id: 'arcade', labelKey: 'theme.arcade', icon: '🎮' }
];

/**
 * Retrieves theme styles for a given theme type.
 * Defaults to Aurora GLASS theme if the provided theme is not found.
 *
 * @param theme - ThemeType identifier (aurora, dark, light, space, arcade)
 * @returns ThemeStyleSet containing all CSS classes for the theme
 */
export function getThemeStyles(theme: ThemeType): ThemeStyleSet {
  return THEME_STYLES[theme] ?? THEME_STYLES.aurora;
}
