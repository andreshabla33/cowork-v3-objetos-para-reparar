/**
 * @module core/infrastructure/textureRegistry
 * Registro de materiales PBR para tipos de suelo.
 *
 * Clean Architecture — Infrastructure Layer:
 * Esta capa adapta los conceptos de dominio (FloorType) a recursos concretos
 * de Three.js. Genera texturas proceduralmente usando CanvasTexture para no
 * depender de archivos de imagen externos.
 *
 * En producción, podrías reemplazar `generateProceduralTexture` por
 * `THREE.TextureLoader.load('/textures/wood_oak_albedo.jpg')`.
 */

import * as THREE from 'three';
import { FloorType } from '../domain/entities';

// ─── Tipos de la infraestructura ────────────────────────────────────────────

export interface PBRMaterialConfig {
  roughness: number;
  metalness: number;
  /** Escala de repetición de textura en unidades de mundo por tile (metros/unidades) */
  tileSize: number;
  /** Opacidad del material (1 = sólido) */
  opacity: number;
  /** Whether to use transparency */
  transparent: boolean;
  /** Función generadora de la textura de albedo (color base) */
  generateAlbedo: () => THREE.CanvasTexture;
  /** Función generadora del mapa de roughness (opcional) */
  generateRoughness?: () => THREE.CanvasTexture;
  /** Color de fallback si fallan los canvas */
  fallbackColor: string;
  /** Whether this floor type emits a slight glow (metal grid, etc) */
  emissiveColor?: string;
  emissiveIntensity?: number;
}

// ─── Utilidades de generación de texturas procedurales ──────────────────────

/** Crea un CanvasTexture con la función de dibujo proporcionada */
function makeCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Añade ruido de pixel a un canvas (simula grain/roughness visual) */
function addGrain(
  ctx: CanvasRenderingContext2D,
  size: number,
  amount: number = 0.08,
  alpha: number = 0.15
): void {
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 255 * amount;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    data[i + 3] = Math.min(255, Math.max(0, data[i + 3] * (1 - alpha) + 255 * alpha));
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─── Generadores de texturas específicos ────────────────────────────────────

function generateWoodOak(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    // Fondo base cálido
    const bg = ctx.createLinearGradient(0, 0, size, size * 0.3);
    bg.addColorStop(0, '#c8a96e');
    bg.addColorStop(0.5, '#b8944f');
    bg.addColorStop(1, '#d4b077');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Vetas de madera (líneas curvas longitudinales)
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const x = (size / 18) * i + Math.random() * 12 - 6;
      ctx.moveTo(x, 0);
      for (let y = 0; y < size; y += 4) {
        ctx.lineTo(x + Math.sin(y * 0.02 + i) * 6 + Math.random() * 3, y);
      }
      ctx.strokeStyle = `rgba(${100 + Math.random() * 40}, ${65 + Math.random() * 30}, ${10 + Math.random() * 20}, ${0.25 + Math.random() * 0.35})`;
      ctx.lineWidth = 0.8 + Math.random() * 2;
      ctx.stroke();
    }

    // Nodos de madera
    for (let i = 0; i < 3; i++) {
      const nx = Math.random() * size;
      const ny = Math.random() * size;
      const nr = 8 + Math.random() * 20;
      for (let r = nr; r > 0; r -= 2) {
        ctx.beginPath();
        ctx.ellipse(nx, ny, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(90, 55, 10, ${0.05 + (nr - r) / nr * 0.15})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    addGrain(ctx, size, 0.04, 0.92);
  });
}

function generateWoodDark(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    const bg = ctx.createLinearGradient(0, 0, size * 0.5, size);
    bg.addColorStop(0, '#3d2b1a');
    bg.addColorStop(0.5, '#2e1e0f');
    bg.addColorStop(1, '#4a3322');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      const x = (size / 20) * i + Math.random() * 8 - 4;
      ctx.moveTo(x, 0);
      for (let y = 0; y < size; y += 4) {
        ctx.lineTo(x + Math.sin(y * 0.025 + i * 0.7) * 6 + Math.random() * 2, y);
      }
      ctx.strokeStyle = `rgba(${80 + Math.random() * 30}, ${50 + Math.random() * 20}, ${10 + Math.random() * 15}, ${0.2 + Math.random() * 0.3})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.8;
      ctx.stroke();
    }

    addGrain(ctx, size, 0.05, 0.9);
  });
}

function generateCarpetOffice(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(0, 0, size, size);

    // Patrón de pelo corto de alfombra (loop pile)
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const shade = 60 + Math.random() * 40;
        const blue = 90 + Math.random() * 30;
        ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${blue})`;
        ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
      }
    }

    // Patrón geométrico sutil (líneas diagonales alternadas)
    ctx.globalAlpha = 0.06;
    for (let i = -size; i < size * 2; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.strokeStyle = '#8899bb';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    addGrain(ctx, size, 0.12, 0.85);
  });
}

function generateCarpetSoftGray(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const v = 150 + Math.random() * 50;
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    addGrain(ctx, size, 0.15, 0.8);
  });
}

function generateMarbleWhite(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#f0eee8';
    ctx.fillRect(0, 0, size, size);

    // Venas de mármol (líneas orgánicas irregulares)
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let vx = Math.random() * size;
      let vy = 0;
      ctx.moveTo(vx, vy);

      for (let step = 0; step < 40; step++) {
        vx += (Math.random() - 0.48) * 28;
        vy += size / 40 + (Math.random() - 0.5) * 8;
        vx = Math.max(0, Math.min(size, vx));
        ctx.lineTo(vx, vy);
      }

      const alpha = 0.08 + Math.random() * 0.18;
      const gray = 100 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${gray}, ${gray}, ${gray + 10}, ${alpha})`;
      ctx.lineWidth = 0.5 + Math.random() * 2.5;
      ctx.stroke();

      // Sub-vena delgada
      ctx.stroke();
    }

    addGrain(ctx, size, 0.02, 0.96);
  });
}

function generateMarbleBlack(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      let vx = Math.random() * size;
      let vy = 0;
      ctx.moveTo(vx, vy);

      for (let step = 0; step < 45; step++) {
        vx += (Math.random() - 0.48) * 24;
        vy += size / 45 + (Math.random() - 0.5) * 6;
        vx = Math.max(0, Math.min(size, vx));
        ctx.lineTo(vx, vy);
      }

      const alpha = 0.12 + Math.random() * 0.20;
      const v = 180 + Math.random() * 60;
      // Venas doradas/plateadas
      ctx.strokeStyle = i % 3 === 0
        ? `rgba(${v}, ${Math.round(v * 0.85)}, ${Math.round(v * 0.4)}, ${alpha})`
        : `rgba(${v}, ${v}, ${v}, ${alpha})`;
      ctx.lineWidth = 0.4 + Math.random() * 1.8;
      ctx.stroke();
    }

    addGrain(ctx, size, 0.03, 0.94);
  });
}

function generateConcreteSmooth(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(0, 0, size, size);

    // Manchas sutiles de humedad/variación
    for (let i = 0; i < 12; i++) {
      const gx = Math.random() * size;
      const gy = Math.random() * size;
      const gr = 30 + Math.random() * 60;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const dark = Math.random() > 0.5;
      g.addColorStop(0, dark ? 'rgba(70,74,80,0.15)' : 'rgba(160,165,170,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }

    // Líneas de encofrado
    ctx.globalAlpha = 0.05;
    for (let y = 0; y < size; y += size / 4) {
      ctx.fillStyle = 'rgba(40,40,45,0.8)';
      ctx.fillRect(0, y, size, 1);
    }
    ctx.globalAlpha = 1;

    addGrain(ctx, size, 0.08, 0.88);
  });
}

function generateConcreteRough(): THREE.CanvasTexture {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(0, 0, size, size);

    // Textura rugosa
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x += 3) {
        const v = 85 + Math.random() * 55;
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
      }
    }

    // Grietas
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      for (let s = 0; s < 8; s++) {
        ctx.lineTo(Math.random() * size, Math.random() * size);
      }
      ctx.strokeStyle = `rgba(40, 40, 40, ${0.1 + Math.random() * 0.15})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    addGrain(ctx, size, 0.15, 0.82);
  });
}

function generateMetalGrid(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    // Fondo metálico oscuro
    ctx.fillStyle = '#1e2128';
    ctx.fillRect(0, 0, size, size);

    const cellSize = 32;
    const lineW = 2;
    const halfLine = lineW / 2;

    // Celdas de rejilla
    for (let y = 0; y < size; y += cellSize) {
      for (let x = 0; x < size; x += cellSize) {
        // Interior de celda con gradiente
        const g = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
        g.addColorStop(0, '#2a2e38');
        g.addColorStop(1, '#1a1d25');
        ctx.fillStyle = g;
        ctx.fillRect(x + halfLine, y + halfLine, cellSize - lineW, cellSize - lineW);

        // Puntos de intersección brillantes
        ctx.fillStyle = 'rgba(100, 140, 180, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Líneas de la rejilla (metálico brillante)
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = lineW;
    for (let i = 0; i <= size; i += cellSize) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    // Highlight diagonal
    ctx.globalAlpha = 0.08;
    const diag = ctx.createLinearGradient(0, 0, size, size);
    diag.addColorStop(0, '#ffffff');
    diag.addColorStop(0.5, 'transparent');
    diag.addColorStop(1, '#ffffff');
    ctx.fillStyle = diag;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
  });
}

function generateTileWhite(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    const tileSize = 64;
    const groutW = 4;
    const groutColor = '#c8ccd0';
    const tileColor = '#f4f4f0';

    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        const g = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
        g.addColorStop(0, '#f8f8f5');
        g.addColorStop(0.5, tileColor);
        g.addColorStop(1, '#e8e8e4');
        ctx.fillStyle = g;
        ctx.fillRect(x + groutW / 2, y + groutW / 2, tileSize - groutW, tileSize - groutW);
      }
    }

    addGrain(ctx, size, 0.02, 0.97);
  });
}

function generateTileHex(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, 0, size, size);

    const r = 22;
    const h = r * Math.sqrt(3);
    const w = r * 2;

    const drawHex = (cx: number, cy: number, fillColor: string) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + (r - 1.5) * Math.cos(angle);
        const py = cy + (r - 1.5) * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    };

    let row = 0;
    for (let y = r; y < size + r; y += h, row++) {
      for (let x = row % 2 === 0 ? r : r + w * 0.75; x < size + r; x += w * 1.5) {
        const v = 220 + Math.round(Math.random() * 20);
        drawHex(x, y, `rgb(${v}, ${v}, ${v - 5})`);
      }
    }
  });
}

function generateVinylTech(): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    // Base azul grafito con patrón de tablero
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, size, size);

    const dotSize = 16;
    for (let y = 0; y < size; y += dotSize) {
      for (let x = 0; x < size; x += dotSize) {
        const isActive = (Math.floor(y / dotSize) + Math.floor(x / dotSize)) % 2 === 0;
        ctx.fillStyle = isActive ? '#3d4a5c' : '#252d3a';
        ctx.fillRect(x, y, dotSize, dotSize);

        // Punto central
        ctx.fillStyle = 'rgba(100, 150, 200, 0.15)';
        ctx.beginPath();
        ctx.arc(x + dotSize / 2, y + dotSize / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Líneas de dirección
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < size; y += dotSize * 4) {
      ctx.fillStyle = '#64b5f6';
      ctx.fillRect(0, y, size, 1);
    }
    ctx.globalAlpha = 1;

    addGrain(ctx, size, 0.06, 0.92);
  });
}

// ─── Registro principal de configuraciones PBR ──────────────────────────────

export const TEXTURE_REGISTRY: Record<FloorType, PBRMaterialConfig> = {
  [FloorType.WOOD_OAK]: {
    roughness: 0.65,
    metalness: 0.02,
    tileSize: 2.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateWoodOak,
    fallbackColor: '#c8a96e',
  },
  [FloorType.WOOD_DARK]: {
    roughness: 0.55,
    metalness: 0.05,
    tileSize: 2.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateWoodDark,
    fallbackColor: '#3d2b1a',
  },
  [FloorType.CARPET_OFFICE]: {
    roughness: 0.95,
    metalness: 0.0,
    tileSize: 1.5,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateCarpetOffice,
    fallbackColor: '#4a5568',
  },
  [FloorType.CARPET_SOFT_GRAY]: {
    roughness: 0.98,
    metalness: 0.0,
    tileSize: 1.5,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateCarpetSoftGray,
    fallbackColor: '#9ca3af',
  },
  [FloorType.MARBLE_WHITE]: {
    roughness: 0.15,
    metalness: 0.03,
    tileSize: 3.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateMarbleWhite,
    fallbackColor: '#f0eee8',
  },
  [FloorType.MARBLE_BLACK]: {
    roughness: 0.1,
    metalness: 0.08,
    tileSize: 3.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateMarbleBlack,
    fallbackColor: '#1a1a1f',
  },
  [FloorType.CONCRETE_SMOOTH]: {
    roughness: 0.75,
    metalness: 0.01,
    tileSize: 4.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateConcreteSmooth,
    fallbackColor: '#8a8f96',
  },
  [FloorType.CONCRETE_ROUGH]: {
    roughness: 0.92,
    metalness: 0.01,
    tileSize: 3.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateConcreteRough,
    fallbackColor: '#6b7280',
  },
  [FloorType.METAL_GRID]: {
    roughness: 0.35,
    metalness: 0.85,
    tileSize: 2.0,
    opacity: 0.92,
    transparent: true,
    generateAlbedo: generateMetalGrid,
    fallbackColor: '#1e2128',
    emissiveColor: '#4a7fa8',
    emissiveIntensity: 0.06,
  },
  [FloorType.TILE_WHITE]: {
    roughness: 0.25,
    metalness: 0.02,
    tileSize: 2.0,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateTileWhite,
    fallbackColor: '#f4f4f0',
  },
  [FloorType.TILE_HEX]: {
    roughness: 0.3,
    metalness: 0.02,
    tileSize: 2.5,
    opacity: 1,
    transparent: false,
    generateAlbedo: generateTileHex,
    fallbackColor: '#d1d5db',
  },
  [FloorType.VINYL_TECH]: {
    roughness: 0.7,
    metalness: 0.06,
    tileSize: 2.0,
    opacity: 0.95,
    transparent: true,
    generateAlbedo: generateVinylTech,
    fallbackColor: '#2d3748',
    emissiveColor: '#3b82f6',
    emissiveIntensity: 0.04,
  },
};

// ─── Cache de texturas para evitar regeneración ──────────────────────────────

const _textureCache = new Map<FloorType, THREE.CanvasTexture>();

/**
 * Obtiene (o genera y cachea) la textura de albedo para un FloorType dado.
 * Aplica wrapping correcto según la configuración PBR del tipo.
 */
export function getAlbedoTexture(floorType: FloorType): THREE.CanvasTexture {
  if (_textureCache.has(floorType)) {
    return _textureCache.get(floorType)!;
  }
  const config = TEXTURE_REGISTRY[floorType];
  const texture = config.generateAlbedo();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  _textureCache.set(floorType, texture);
  return texture;
}

export function crearPropsMaterialSueloPbr(
  floorType: FloorType,
  ancho: number,
  alto: number,
  opacidad: number = 1
) {
  const config = TEXTURE_REGISTRY[floorType];
  const texture = getAlbedoTexture(floorType).clone();
  texture.repeat.set(ancho / config.tileSize, alto / config.tileSize);
  texture.needsUpdate = true;

  const opacidadFinal = Math.min(opacidad, config.opacity);

  return {
    map: texture,
    roughness: config.roughness,
    metalness: config.metalness,
    transparent: config.transparent || opacidadFinal < 1,
    opacity: opacidadFinal,
    emissive: config.emissiveColor ? new THREE.Color(config.emissiveColor) : new THREE.Color(0x000000),
    emissiveIntensity: config.emissiveIntensity || 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  };
}

/**
 * Limpia el cache de texturas (llamar al desmontar el workspace).
 */
export function disposeTextureCache(): void {
  _textureCache.forEach((t) => t.dispose());
  _textureCache.clear();
}
