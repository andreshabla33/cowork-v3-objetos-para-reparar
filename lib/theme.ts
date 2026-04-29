/**
 * @module lib/theme
 * @description Centralized design system / semantic tokens for the app.
 *
 * Single source of truth for all UI colors, surfaces, borders and components.
 * Components MUST consume tokens from this module — never hardcode colors.
 *
 * Two primary themes:
 *   • light — default. Soft blue/slate palette (#F1F5FA bg, #E3EAF2 borders, sky accents)
 *   • arcade — neon green / black. Special opt-in.
 *
 * Legacy themes (dark, space) preserved for backwards compatibility but the
 * default experience uses `light`.
 */

import type { ThemeType } from '@/types';

// ─── Brand constants ─────────────────────────────────────────────────────────

/** Page background — soft blue-slate */
export const COLOR_PAGE_BG    = '#F1F5FA';
/** Default border color — pale slate */
export const COLOR_BORDER     = '#E3EAF2';

/** Glassmorphism backdrop blur utility */
export const GLASS_BASE       = 'backdrop-blur-xl';
/** Light glass panel (white tint) */
export const GLASS_PANEL_LIGHT = 'bg-white/70 backdrop-blur-xl border-white/60';
/** Dark glass panel (preserved for arcade/dark) */
export const GLASS_PANEL      = 'bg-white/[0.03] border-white/[0.08]';
export const GLASS_HOVER      = 'hover:bg-white/[0.06] hover:border-blue-500/30';

/** Primary brand gradient — azules (principal → medio → cyan) */
export const GRADIENT_PRIMARY = 'from-blue-600 via-sky-500 to-cyan-500';
export const GRADIENT_TEXT    = 'text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-200 to-white';

export const GLOW_BRAND = 'shadow-[0_0_20px_rgba(37,99,235,0.3)]';
export const GLOW_CYAN   = 'shadow-[0_0_20px_rgba(34,211,238,0.3)]';

// ─── Semantic token contract ─────────────────────────────────────────────────

/**
 * Semantic design tokens for a theme variant.
 *
 * Tokens are organized by purpose, not by literal color. Components reference
 * `surface`, `border`, `textMuted` etc. — never raw hex/Tailwind classes.
 *
 * Adding a new token? Add it to **all 4 themes** below to keep parity.
 */
export interface ThemeStyleSet {
  // ── Page-level ──────────────────────────────────────────────────────────
  /** App-wide page background */
  bg: string;
  /** Primary text color (highest emphasis) */
  text: string;

  // ── Surfaces (cards, panels, inputs) ────────────────────────────────────
  /** Elevated card / panel surface */
  surface: string;
  /** Inset / sub-card surface (e.g. drop-zones, badges) */
  surfaceMuted: string;
  /** Hover overlay on surfaces */
  surfaceHover: string;

  // ── Borders ─────────────────────────────────────────────────────────────
  /** Default border for cards / inputs */
  border: string;
  /** Subtle / divider border */
  borderSubtle: string;

  // ── Text variants ───────────────────────────────────────────────────────
  /** Secondary text (descriptions, captions) */
  textMuted: string;
  /** Tertiary text (placeholders, disabled hints) */
  textSubtle: string;
  /** Text used on top of accent backgrounds */
  textInverse: string;

  // ── Accent (primary interactive color) ──────────────────────────────────
  /** Accent text (links, active labels) */
  accent: string;
  /** Light tinted accent surface (e.g. sky-50) */
  accentSurface: string;
  /** Accent border (e.g. sky-200) */
  accentBorder: string;
  /** Filled accent background button */
  accentBg: string;

  // ── Status colors ───────────────────────────────────────────────────────
  success: string;
  warning: string;
  danger: string;

  // ── Layout chrome ───────────────────────────────────────────────────────
  /** Left navigation rail */
  globalNav: string;
  /** Secondary sidebar (chat list etc.) */
  sidebar: string;
  /** Top header bar */
  header: string;

  // ── Buttons ─────────────────────────────────────────────────────────────
  /** Primary call-to-action (uses brand gradient) */
  btn: string;
  /** Secondary button (outlined) */
  btnSecondary: string;
  /** Ghost / subtle hover-only button */
  btnGhost: string;

  // ── Form fields ─────────────────────────────────────────────────────────
  /** Input/textarea full class string */
  input: string;
}

// ─── Theme definitions ───────────────────────────────────────────────────────

const lightTokens: ThemeStyleSet = {
  bg:            'bg-[#F1F5FA]',
  text:          'text-slate-800',

  surface:       'bg-white',
  surfaceMuted:  'bg-slate-50',
  surfaceHover:  'hover:bg-slate-50',

  border:        'border-[#E3EAF2]',
  borderSubtle:  'border-slate-100',

  textMuted:     'text-slate-500',
  textSubtle:    'text-slate-400',
  textInverse:   'text-white',

  accent:        'text-sky-600',
  accentSurface: 'bg-sky-50',
  accentBorder:  'border-sky-200',
  accentBg:      'bg-sky-500 hover:bg-sky-600 text-white',

  success:       'text-emerald-600',
  warning:       'text-amber-600',
  danger:        'text-red-500',

  globalNav:     'bg-[#F1F5FA] border-r border-[#E3EAF2]',
  sidebar:       'bg-white border-[#E3EAF2]',
  header:        'bg-white border-b border-[#E3EAF2]',

  btn:           `bg-gradient-to-r ${GRADIENT_PRIMARY} hover:opacity-90 text-white font-bold shadow-lg`,
  btnSecondary:  'bg-white border border-[#E3EAF2] hover:border-sky-300 text-slate-700',
  btnGhost:      'bg-transparent hover:bg-slate-100 text-slate-600',

  input:         'bg-white border border-[#E3EAF2] text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none',
};

const arcadeTokens: ThemeStyleSet = {
  bg:            'bg-black',
  text:          'text-[#00ff41]',

  surface:       'bg-black',
  surfaceMuted:  'bg-[#00ff41]/5',
  surfaceHover:  'hover:bg-[#00ff41]/10',

  border:        'border-[#00ff41]/40',
  borderSubtle:  'border-[#00ff41]/20',

  textMuted:     'text-[#00ff41]/60',
  textSubtle:    'text-[#00ff41]/40',
  textInverse:   'text-black',

  accent:        'text-[#00ff41]',
  accentSurface: 'bg-[#00ff41]/10',
  accentBorder:  'border-[#00ff41]/30',
  accentBg:      'bg-[#00ff41] hover:bg-[#00ff41]/80 text-black font-black',

  success:       'text-[#00ff41]',
  warning:       'text-amber-400',
  danger:        'text-red-400',

  globalNav:     'bg-black border-r border-[#00ff41]/40',
  sidebar:       'bg-black border-[#00ff41]/30',
  header:        'bg-black border-b border-[#00ff41]/40',

  btn:           'bg-[#00ff41] hover:bg-[#00ff41]/80 text-black font-black uppercase tracking-tighter shadow-[0_0_20px_#00ff41]',
  btnSecondary:  'bg-black border-2 border-[#00ff41]/60 hover:border-[#00ff41] text-[#00ff41]',
  btnGhost:      'bg-transparent hover:bg-[#00ff41]/10 text-[#00ff41]/70',

  input:         'bg-black/50 border border-[#00ff41]/30 text-[#00ff41] placeholder:text-[#00ff41]/40 focus:border-[#00ff41] focus:ring-2 focus:ring-[#00ff41]/20 outline-none',
};

// Legacy themes — preserved for compatibility. Backed by light/arcade where
// concepts overlap, with their original visual identity for the chrome.
const darkTokens: ThemeStyleSet = {
  bg:            'bg-[#0a0a0f]',
  text:          'text-zinc-100',

  surface:       'bg-zinc-900',
  surfaceMuted:  'bg-white/[0.03]',
  surfaceHover:  'hover:bg-white/[0.05]',

  border:        'border-white/10',
  borderSubtle:  'border-white/5',

  textMuted:     'text-zinc-400',
  textSubtle:    'text-zinc-500',
  textInverse:   'text-white',

  accent:        'text-blue-500',
  accentSurface: 'bg-blue-600/15',
  accentBorder:  'border-blue-600/30',
  accentBg:      'bg-blue-700 hover:bg-blue-600 text-white',

  success:       'text-emerald-400',
  warning:       'text-amber-400',
  danger:        'text-red-400',

  globalNav:     `${GLASS_BASE} bg-black/60 border-r border-white/[0.05]`,
  sidebar:       `${GLASS_BASE} bg-black/40 border-white/[0.05]`,
  header:        `${GLASS_BASE} bg-black/40`,

  btn:           `bg-gradient-to-r ${GRADIENT_PRIMARY} hover:opacity-90 text-white font-bold ${GLOW_BRAND}`,
  btnSecondary:  `${GLASS_BASE} bg-white/[0.05] border border-white/[0.1] hover:border-blue-500/50 text-white`,
  btnGhost:      'bg-transparent hover:bg-white/5 text-zinc-300',

  input:         'bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:border-blue-600/50 outline-none',
};

const spaceTokens: ThemeStyleSet = {
  bg:            'bg-[#020617]',
  text:          'text-sky-400',

  surface:       'bg-blue-950/40',
  surfaceMuted:  'bg-blue-600/10',
  surfaceHover:  'hover:bg-blue-600/15',

  border:        'border-blue-600/20',
  borderSubtle:  'border-blue-600/10',

  textMuted:     'text-sky-600',
  textSubtle:    'text-blue-500/60',
  textInverse:   'text-white',

  accent:        'text-cyan-400',
  accentSurface: 'bg-cyan-500/15',
  accentBorder:  'border-cyan-500/30',
  accentBg:      'bg-cyan-500 hover:bg-cyan-400 text-white',

  success:       'text-emerald-400',
  warning:       'text-amber-400',
  danger:        'text-red-400',

  globalNav:     `${GLASS_BASE} bg-blue-950/60 border-r border-blue-600/20`,
  sidebar:       `${GLASS_BASE} bg-blue-950/40 border-blue-600/20`,
  header:        `${GLASS_BASE} bg-blue-950/40`,

  btn:           `bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-500 hover:opacity-90 text-white font-bold ${GLOW_CYAN}`,
  btnSecondary:  `${GLASS_BASE} bg-blue-600/10 border border-blue-600/30 hover:border-cyan-500/50 text-sky-400`,
  btnGhost:      'bg-transparent hover:bg-blue-600/10 text-sky-500',

  input:         'bg-blue-600/5 border border-blue-600/30 text-sky-400 placeholder:text-blue-500/40 focus:border-cyan-500/50 outline-none',
};

/**
 * Complete theme styles registry.
 * Default experience is `light`; `arcade` is the user-facing alternative.
 */
export const THEME_STYLES: Record<ThemeType, ThemeStyleSet> = {
  light:  lightTokens,
  arcade: arcadeTokens,
  dark:   darkTokens,
  space:  spaceTokens,
};

// ─── Theme picker metadata ───────────────────────────────────────────────────

export interface ThemeOption {
  id: ThemeType;
  labelKey: string;
  icon: string;
}

export const THEME_LIST: ThemeOption[] = [
  { id: 'light',  labelKey: 'theme.light',  icon: '☀️' },
  { id: 'arcade', labelKey: 'theme.arcade', icon: '🎮' },
  { id: 'dark',   labelKey: 'theme.dark',   icon: '🌑' },
  { id: 'space',  labelKey: 'theme.space',  icon: '🚀' },
];

/**
 * Retrieve theme tokens by id. Falls back to `light` (the default UX).
 */
export function getThemeStyles(theme: ThemeType): ThemeStyleSet {
  return THEME_STYLES[theme] ?? THEME_STYLES.light;
}
