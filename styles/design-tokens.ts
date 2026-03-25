/**
 * Design System Tokens - Cowork Virtual Workspace
 * Sistema de diseño unificado con estilo Glassmorphism 2026
 * 
 * Breakpoints: Desktop-first (xl → lg → md → sm)
 */

// ============================================
// BREAKPOINTS (Desktop-first)
// ============================================
export const breakpoints = {
  xl: '1440px',  // Desktop grande
  lg: '1280px',  // Desktop / Laptop grande
  md: '1024px',  // Laptop / Tablet landscape
  sm: '768px',   // Tablet portrait
  xs: '640px',   // Mobile grande
} as const;

// Clases Tailwind para responsive (desktop-first usa max-width)
export const responsive = {
  desktop: '',           // Base (sin prefijo)
  laptop: 'lg:',         // ≤1280px
  tablet: 'md:',         // ≤1024px
  mobile: 'sm:',         // ≤768px
} as const;

// ============================================
// COLORES
// ============================================
export const colors = {
  // Fondos
  bg: {
    primary: 'bg-[#050508]',
    secondary: 'bg-zinc-950',
    tertiary: 'bg-[#181825]',
    card: 'bg-zinc-900',
    overlay: 'bg-black/70',
    glass: 'bg-white/[0.03]',
    glassHover: 'bg-white/[0.06]',
  },
  
  // Gradientes principales
  gradient: {
    primary: 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500',
    primaryHover: 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400',
    secondary: 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500',
    secondaryHover: 'bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400',
    subtle: 'bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20',
    neonGlow: 'bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-500/20',
  },
  
  // Bordes
  border: {
    subtle: 'border-white/[0.08]',
    light: 'border-white/5',
    focus: 'border-violet-500/50',
    error: 'border-red-500/30',
    success: 'border-green-500/30',
  },
  
  // Texto
  text: {
    primary: 'text-white',
    secondary: 'text-zinc-400',
    muted: 'text-zinc-500',
    disabled: 'text-zinc-600',
    accent: 'text-violet-400',
    error: 'text-red-400',
    success: 'text-green-400',
  },
  
  // Sombras
  shadow: {
    glow: 'shadow-2xl shadow-violet-600/30',
    glowEmerald: 'shadow-2xl shadow-emerald-600/30',
    soft: 'shadow-2xl',
  },
} as const;

// ============================================
// ESPACIADO
// ============================================
export const spacing = {
  // Padding para modales/cards
  modal: {
    xl: 'p-8',      // Desktop grande
    lg: 'p-6',      // Desktop/Laptop
    md: 'p-5',      // Tablet
    sm: 'p-4',      // Mobile
  },
  
  // Gap entre elementos
  gap: {
    xl: 'gap-6',
    lg: 'gap-4',
    md: 'gap-3',
    sm: 'gap-2',
  },
  
  // Espaciado vertical entre secciones
  section: {
    xl: 'space-y-8',
    lg: 'space-y-6',
    md: 'space-y-4',
    sm: 'space-y-3',
  },
} as const;

// ============================================
// TAMAÑOS DE MODAL
// ============================================
export const modalSizes = {
  xs: 'max-w-xs',           // 320px - Tooltips, mini modales
  sm: 'max-w-sm',           // 384px - Modales simples (crear canal)
  md: 'max-w-md',           // 448px - Login, formularios
  lg: 'max-w-lg',           // 512px - Onboarding pasos
  xl: 'max-w-xl',           // 576px - Formularios grandes
  '2xl': 'max-w-2xl',       // 672px - Modales medianos
  '3xl': 'max-w-3xl',       // 768px - Modales grandes
  '4xl': 'max-w-4xl',       // 896px - GameHub compacto
  '5xl': 'max-w-5xl',       // 1024px - GameHub expandido
  full: 'max-w-[90vw]',     // Casi pantalla completa
} as const;

// Alturas de modal
export const modalHeights = {
  auto: 'h-auto',
  sm: 'max-h-[50vh]',
  md: 'max-h-[65vh]',
  lg: 'max-h-[75vh]',
  xl: 'max-h-[85vh]',
} as const;

// ============================================
// BORDER RADIUS
// ============================================
export const radius = {
  none: 'rounded-none',
  sm: 'rounded-lg',         // 8px
  md: 'rounded-xl',         // 12px
  lg: 'rounded-2xl',        // 16px
  xl: 'rounded-3xl',        // 24px
  '2xl': 'rounded-[32px]',  // 32px
  '3xl': 'rounded-[40px]',  // 40px
  full: 'rounded-full',
  
  // Para cards/modales
  card: 'rounded-2xl',
  modal: 'rounded-3xl',
  modalLarge: 'rounded-[40px]',
  button: 'rounded-xl',
  input: 'rounded-xl',
} as const;

// ============================================
// TIPOGRAFÍA
// ============================================
export const typography = {
  // Títulos
  heading: {
    xl: 'text-4xl font-black',     // Títulos principales desktop
    lg: 'text-3xl font-black',     // Títulos principales laptop
    md: 'text-2xl font-bold',      // Subtítulos
    sm: 'text-xl font-bold',       // Títulos de sección
    xs: 'text-lg font-semibold',   // Mini títulos
  },
  
  // Labels/etiquetas
  label: {
    lg: 'text-sm font-medium',
    md: 'text-xs font-bold uppercase tracking-wider',
    sm: 'text-[10px] font-black uppercase tracking-widest',
    xs: 'text-[9px] font-black uppercase tracking-widest',
  },
  
  // Texto de cuerpo
  body: {
    lg: 'text-base',
    md: 'text-sm',
    sm: 'text-xs',
  },
} as const;

// ============================================
// EFECTOS GLASSMORPHISM
// ============================================
export const glass = {
  // Card con efecto glass
  card: `
    backdrop-blur-xl 
    bg-white/[0.03] 
    border border-white/[0.08]
  `.trim().replace(/\s+/g, ' '),
  
  // Card con glow exterior
  cardWithGlow: `
    relative
    before:absolute before:-inset-1 
    before:bg-gradient-to-r before:from-violet-600/20 before:via-fuchsia-600/20 before:to-cyan-500/20 
    before:rounded-[52px] before:blur-xl before:opacity-60
  `.trim().replace(/\s+/g, ' '),
  
  // Overlay/backdrop
  overlay: 'bg-black/70 backdrop-blur-sm',
  
  // Inputs
  input: `
    bg-black/40 
    border border-white/5 
    focus:ring-2 focus:ring-violet-500/50 
    focus:border-violet-500/50 
    transition-all
  `.trim().replace(/\s+/g, ' '),
} as const;

// ============================================
// ANIMACIONES
// ============================================
export const animation = {
  // Transiciones
  transition: {
    fast: 'transition-all duration-150',
    normal: 'transition-all duration-300',
    slow: 'transition-all duration-500',
  },
  
  // Hover effects
  hover: {
    scale: 'hover:scale-[1.02] active:scale-[0.98]',
    scaleSubtle: 'hover:scale-[1.01] active:scale-[0.99]',
    glow: 'hover:shadow-violet-600/40',
    brighten: 'hover:brightness-110',
  },
  
  // Pulse para elementos neon
  pulse: 'animate-pulse',
} as const;

// ============================================
// CLASES COMPUESTAS COMUNES
// ============================================
export const composites = {
  // Botón primario con gradiente
  buttonPrimary: `
    relative overflow-hidden
    bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500
    text-white font-black uppercase tracking-wider
    rounded-xl
    shadow-2xl shadow-violet-600/30
    transition-all active:scale-[0.98]
    disabled:opacity-50 disabled:cursor-not-allowed
  `.trim().replace(/\s+/g, ' '),
  
  // Botón secundario
  buttonSecondary: `
    bg-zinc-900 hover:bg-zinc-800
    border border-white/5
    text-white
    font-black uppercase tracking-widest
    rounded-xl
    transition-all active:scale-[0.98]
    disabled:opacity-50
  `.trim().replace(/\s+/g, ' '),
  
  // Botón ghost
  buttonGhost: `
    text-zinc-500 hover:text-white
    transition-colors
    font-medium
  `.trim().replace(/\s+/g, ' '),
  
  // Input estándar
  inputBase: `
    w-full
    bg-black/40 
    border border-white/5 
    rounded-xl
    text-white placeholder-zinc-600
    focus:ring-2 focus:ring-violet-500/50 
    focus:border-violet-500/50 
    outline-none
    transition-all
  `.trim().replace(/\s+/g, ' '),
  
  // Card glass
  cardGlass: `
    backdrop-blur-xl 
    bg-white/[0.03] 
    border border-white/[0.08] 
    rounded-2xl
    shadow-2xl
  `.trim().replace(/\s+/g, ' '),
  
  // Modal container
  modalContainer: `
    fixed inset-0 z-50 
    flex items-center justify-center 
    bg-black/70 backdrop-blur-sm
    p-4
  `.trim().replace(/\s+/g, ' '),
  
  // Fondo animado con gradientes neon
  animatedBackground: `
    absolute inset-0 overflow-hidden pointer-events-none
  `.trim().replace(/\s+/g, ' '),
} as const;

// ============================================
// RESPONSIVE HELPERS
// ============================================
// Clases responsivas para tamaños de modal (desktop-first)
export const responsiveModal = {
  // Para modales de formularios (Login, etc)
  form: 'w-full max-w-md lg:max-w-sm md:max-w-xs',
  
  // Para modales medianos
  medium: 'w-full max-w-lg lg:max-w-md',
  
  // Para modales grandes (GameHub)
  large: 'w-full max-w-5xl lg:max-w-4xl md:max-w-3xl',
  
  // Para pantalla casi completa
  fullish: 'w-[85vw] max-w-5xl lg:w-[90vw] lg:max-w-4xl',
} as const;

// Clases responsivas para padding
export const responsivePadding = {
  modal: 'p-6 lg:p-5 md:p-4',
  card: 'p-5 lg:p-4 md:p-3',
  section: 'p-4 lg:p-3 md:p-2',
} as const;

// Clases responsivas para texto
export const responsiveText = {
  heading: 'text-3xl lg:text-2xl md:text-xl font-black',
  subheading: 'text-xl lg:text-lg md:text-base font-bold',
  body: 'text-sm lg:text-xs',
  label: 'text-xs lg:text-[10px] md:text-[9px] font-black uppercase tracking-wider',
} as const;

export default {
  breakpoints,
  colors,
  spacing,
  modalSizes,
  modalHeights,
  radius,
  typography,
  glass,
  animation,
  composites,
  responsiveModal,
  responsivePadding,
  responsiveText,
};
