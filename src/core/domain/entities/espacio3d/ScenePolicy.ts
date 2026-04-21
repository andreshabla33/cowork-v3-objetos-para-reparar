/**
 * @module domain/entities/espacio3d/ScenePolicy
 *
 * Clean Architecture — Domain layer (puro, sin dependencias de React/Three.js).
 *
 * Política de escena: parámetros que rigen la atmósfera (fog) y el skydome.
 * Antes estos valores vivían hardcoded en Scene3D.tsx:
 *   - fog near/far: 60 / 220 en el JSX.
 *   - skydome radius/segmentos: 500 / 16 / 8 en el JSX.
 *   - topColor: derivado inline con offsetHSL(0, +0.08, +0.14).
 *
 * Al moverlos al dominio:
 *   1. Se pueden sobreescribir por consumidor (tests, minigames, eventos temáticos).
 *   2. No se duplica la regla de negocio cuando se añada un segundo visor 3D.
 *   3. Un theme-pack puede overridear los colores sin tocar el shader.
 *
 * Ref (doc oficial):
 *   - THREE.Fog(color, near, far): https://threejs.org/docs/#api/en/scenes/Fog
 *   - Three.js recomienda ajustar near/far a la escala real de la escena,
 *     no usar valores absolutos. Aquí `far < WORLD_SIZE*2` garantiza que la
 *     niebla se desvanezca antes del horizonte del skydome.
 */

// ─── Tipos de dominio ─────────────────────────────────────────────────────────

/**
 * Par de colores (hex) para el gradiente vertical del skydome.
 * `bottom` se usa cerca del horizonte, `top` en el cenit.
 */
export interface SkyColorPair {
  bottom: string;
  top: string;
}

/**
 * Offsets HSL aplicados sobre `themeColors[theme]` cuando el tema no define
 * un override explícito en `themeSkyColors`. Preserva el comportamiento que
 * tenía Scene3D antes del refactor (hue=0, sat=+0.08, light=+0.14).
 */
export interface SkyColorDerivation {
  hue: number;
  saturation: number;
  lightness: number;
}

/** Configuración de la niebla lineal (THREE.Fog). */
export interface FogPolicy {
  /** Distancia a partir de la cual empieza a aparecer la niebla. */
  near: number;
  /** Distancia a la que la niebla es totalmente opaca. */
  far: number;
}

/** Configuración geométrica del skydome. */
export interface SkyPolicy {
  /** Radio de la esfera. Debe ser mayor que el clipping far de la cámara. */
  radius: number;
  widthSegments: number;
  heightSegments: number;
  /** Derivación usada cuando no hay override en themeSkyColors. */
  derivation: SkyColorDerivation;
}

// Re-export desde la entidad rica (PerimeterPolicy.ts) que encapsula
// invariantes + factory `PerimeterPolicy.create()`. Mantenemos los re-exports
// aquí por backwards-compat con consumidores que ya importaban de ScenePolicy.
// Refactor 2026-04-20: validación movida de Application a Domain (Robert Martin).
import type { PerimeterPolicy as PerimeterPolicyType } from './PerimeterPolicy';
export type { PerimeterWallStyle, PerimeterPolicy } from './PerimeterPolicy';
export { PerimeterPolicy as PerimeterPolicyDomain, DEFAULT_PERIMETER_POLICY } from './PerimeterPolicy';

/** Política completa de escena. */
export interface ScenePolicy {
  fog: FogPolicy;
  sky: SkyPolicy;
  /** Perimetral walls. Opcional para backwards-compat con policies legacy. */
  perimeter?: PerimeterPolicyType;
}

// ─── Política por defecto (preserva comportamiento previo al refactor) ────────

/**
 * Valores idénticos a los que estaban hardcoded en Scene3D.tsx antes del
 * refactor. Cualquier desviación rompería la paridad visual, por eso los
 * mantenemos literales y documentados.
 */
export const DEFAULT_SCENE_POLICY: ScenePolicy = {
  fog: {
    near: 60,
    far: 220,
  },
  sky: {
    radius: 500,
    widthSegments: 16,
    heightSegments: 8,
    derivation: {
      hue: 0,
      saturation: 0.08,
      lightness: 0.14,
    },
  },
  // Default canónico vive en PerimeterPolicy.ts (DEFAULT_PERIMETER_POLICY).
  // Aquí lo referenciamos para mantener una sola fuente de verdad.
  perimeter: {
    enabled: true,
    style: 'glass',
    height: 3,
    segmentWidth: 4,
    margin: 0.5,
  },
};

// ─── Funciones puras de dominio ───────────────────────────────────────────────

/**
 * Resuelve el par de colores del skydome para un tema dado.
 *
 * Prioridad:
 *   1. Si `themeSkyColors[theme]` existe, se usa como override explícito
 *      (arte-dirección fina, ej: un tema "sunset" con rojo→naranja).
 *   2. Si no, se deriva proceduralmente desde `themeColors[theme]` aplicando
 *      `derivation` (comportamiento histórico).
 *
 * Se devuelven strings hex para mantener el dominio libre de THREE.Color
 * (la conversión a Color ocurre en la capa de presentación/infraestructura).
 *
 * @param theme Identificador del tema visual (ej: 'dark', 'sunset', 'arcade').
 * @param themeColors Mapa base de colores por tema.
 * @param themeSkyColors Mapa de overrides explícitos bottom/top por tema.
 * @param derivation Offsets HSL para derivar el topColor cuando no hay override.
 * @param fallbackColor Color usado si el tema no existe en themeColors.
 */
export function resolveSkyColors(
  theme: string,
  themeColors: Record<string, string>,
  themeSkyColors: Record<string, SkyColorPair>,
  derivation: SkyColorDerivation,
  fallbackColor = '#000000',
): { bottom: string; top: string; derived: boolean } {
  const override = themeSkyColors[theme];
  if (override) {
    return { bottom: override.bottom, top: override.top, derived: false };
  }

  const bottom = themeColors[theme] || fallbackColor;
  const top = offsetHslHex(bottom, derivation);
  return { bottom, top, derived: true };
}

// ─── Utilidades HSL puras (sin THREE.Color) ───────────────────────────────────

/**
 * Aplica un offset HSL a un color hex y devuelve el resultado como hex.
 * Equivalente funcional a `new THREE.Color(hex).offsetHSL(h, s, l).getHexString()`
 * pero sin depender de Three.js (el dominio debe permanecer puro).
 *
 * Ref: conversión RGB↔HSL estándar, clampeada en [0,1].
 */
function offsetHslHex(hex: string, offset: SkyColorDerivation): string {
  const { r, g, b } = hexToRgb01(hex);
  const hsl = rgb01ToHsl(r, g, b);
  const h = ((hsl.h + offset.hue) % 1 + 1) % 1;
  const s = clamp01(hsl.s + offset.saturation);
  const l = clamp01(hsl.l + offset.lightness);
  const rgb = hslToRgb01(h, s, l);
  return rgb01ToHex(rgb.r, rgb.g, rgb.b);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.padEnd(6, '0');
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 0xff) / 255,
    g: ((num >> 8) & 0xff) / 255,
    b: (num & 0xff) / 255,
  };
}

function rgb01ToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const n = Math.round(clamp01(v) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgb01ToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

// ─── Sol / DayNight (función pura de dominio) ─────────────────────────────────

/**
 * Computa la posición del sol en coordenadas cartesianas a partir de una hora
 * decimal (0..24). Arco que sale por el Este a las 6am, cenit al mediodía y
 * se pone por el Oeste a las 6pm. Fuera del rango [6..18] devuelve la última
 * posición del sol antes del atardecer (sol "debajo del horizonte") — drei
 * `<Sky>` lo interpreta como noche automáticamente.
 *
 * Distancia = 100 (valor típico para `<Sky>`; no afecta escala, solo dirección
 * del vector que es lo que el shader de Preetham usa internamente).
 *
 * Ref: drei `<Sky>` sunPosition — https://github.com/pmndrs/drei#sky
 * Ref: Preetham et al. "A Practical Analytic Model for Daylight" (1999).
 */
export function computeSunPosition(hourDecimal: number): [number, number, number] {
  // Clamp al rango del día [6..18] para un arco continuo. Antes de 6am o
  // después de 6pm, el sol está debajo del horizonte (y negativo).
  const dayProgress = (hourDecimal - 6) / 12; // 0 = sunrise, 1 = sunset
  const clamped = Math.max(-0.5, Math.min(1.5, dayProgress));
  const angle = clamped * Math.PI; // 0 = este, π = oeste
  const radius = 100;
  const x = -Math.cos(angle) * radius;       // negativo al amanecer, positivo al atardecer
  const y = Math.sin(angle) * radius;         // y > 0 durante el día, y < 0 de noche
  const z = -20;                              // pequeña inclinación hacia el fondo
  return [x, y, z];
}

function hslToRgb01(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: hue2rgb(h + 1 / 3),
    g: hue2rgb(h),
    b: hue2rgb(h - 1 / 3),
  };
}
