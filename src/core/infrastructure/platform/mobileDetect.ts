/**
 * Utilidades de detección mobile y touch para adaptar la UI
 * entre experiencia desktop (teclado+mouse) y mobile (touch+joystick).
 */

/** Detecta si el dispositivo soporta touch events */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

/** Detecta si es pantalla pequeña (mobile/tablet portrait) */
export const isSmallScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

/** Detecta si es mobile (touch + pantalla pequeña) */
export const isMobileDevice = (): boolean => {
  return isTouchDevice() && isSmallScreen();
};

/** Detecta si es tablet (touch + pantalla mediana) */
export const isTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return isTouchDevice() && window.innerWidth >= 768 && window.innerWidth < 1024;
};

/** Haptic feedback sutil — respetar preferencias del usuario */
export const hapticFeedback = (pattern: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  switch (pattern) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(25); break;
    case 'heavy': navigator.vibrate([15, 10, 15]); break;
  }
};

/** Hook-friendly: retorna true si el usuario está en mobile */
export const useMobileDetect = () => {
  // Evaluación directa (no reactivo a resize, es suficiente para layout inicial)
  return {
    isMobile: isMobileDevice(),
    isTablet: isTabletDevice(),
    isTouch: isTouchDevice(),
    isSmall: isSmallScreen(),
  };
};
