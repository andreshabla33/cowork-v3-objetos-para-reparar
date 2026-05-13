/**
 * @module infrastructure/r3f/rendering/floor/floorShaderLib
 *
 * Biblioteca GLSL de patrones procedurales para suelos.
 *
 * Cada función `pattern*` recibe coordenadas en metros de mundo y devuelve
 * un `vec3` RGB en espacio lineal. La selección de patrón se hace en
 * compile-time vía `#define PATTERN_*` (sin branching dinámico en GPU).
 *
 * Uniforms esperados por el shader:
 *   uniform vec3  uPalette[4];   // 4 tonos base del FloorType
 *   uniform vec2  uTileSize;     // metros por ciclo de patrón
 *   uniform float uVariant;      // sub-variante (0,1,2…) según pattern
 *
 * El vertex shader provee:
 *   varying vec3 vWorldPosition;
 *
 * Inyectado en MeshStandardMaterial vía onBeforeCompile en:
 *   src/core/infrastructure/r3f/rendering/floor/FloorMaterialAdapter.ts
 *
 * @see https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
 */

/* eslint-disable no-irregular-whitespace */

export const FLOOR_SHADER_LIB = /* glsl */`
// ─── Helpers ────────────────────────────────────────────────────────────────
float fhash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 fhash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(fhash(i + vec2(0.0, 0.0)), fhash(i + vec2(1.0, 0.0)), u.x),
    mix(fhash(i + vec2(0.0, 1.0)), fhash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.04;
    a *= 0.5;
  }
  return v;
}

float worley(vec2 p, out vec3 cellInfo) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  vec2 nearestCell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = fhash2(i + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < minDist) {
        minDist = d;
        nearestCell = i + g;
      }
    }
  }
  cellInfo = vec3(nearestCell, sqrt(minDist));
  return sqrt(minDist);
}

// ─── Two-pass Voronoi (Inigo Quilez) ────────────────────────────────────────
// Devuelve distancia REAL al borde (línea bisectriz entre celdas vecinas) +
// id de la celda más cercana. Produce grout afilado y celdas poligonales
// — no blobs circulares como el smoothstep sobre worley simple.
// Ref: https://iquilezles.org/articles/voronoilines/
struct VoronoiResult {
  float dBorder;
  vec2 cellId;
};

VoronoiResult voronoiCells(vec2 x) {
  vec2 ip = floor(x);
  vec2 f = fract(x);

  // Pass 1: find closest point
  vec2 mr = vec2(0.0);
  vec2 mb = vec2(0.0);
  float minD2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(float(i), float(j));
      vec2 o = fhash2(ip + b);
      vec2 r = b + o - f;
      float d2 = dot(r, r);
      if (d2 < minD2) {
        minD2 = d2;
        mr = r;
        mb = b;
      }
    }
  }

  // Pass 2: distance to bisector borders around closest cell
  float minBorderD = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 b = mb + vec2(float(i), float(j));
      if (abs(i) + abs(j) == 0) continue;
      vec2 o = fhash2(ip + b);
      vec2 r = b + o - f;
      vec2 diff = r - mr;
      float lenDiff = length(diff);
      if (lenDiff < 0.0001) continue;
      float d = dot(0.5 * (mr + r), diff / lenDiff);
      minBorderD = min(minBorderD, d);
    }
  }

  VoronoiResult res;
  res.dBorder = minBorderD;
  res.cellId = ip + mb;
  return res;
}

vec3 pickPalette(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  int idx = int(t);
  if (idx >= 3) return uPalette[3];
  if (idx <= 0) return uPalette[0];
  return mix(uPalette[idx], uPalette[idx + 1], fract(t));
}

// ─── Pattern: PLANKS (brick offset) ─────────────────────────────────────────
// Usado por: WOOD_OAK, WOOD_DARK, WOOD_PLANKS_GREEN/TEAL/MUSTARD,
//            TILE_WHITE (variant=1 cuadrado), VINYL_TECH (variant=2 checker)
vec3 patternPlanks(vec2 uv) {
  vec2 cellSize = vec2(1.0, 0.25);   // 4 tablones por unidad de tileSize
  if (uVariant > 0.5 && uVariant < 1.5) cellSize = vec2(1.0, 1.0);  // square tile
  if (uVariant > 1.5) cellSize = vec2(0.5, 0.5);                    // small checker

  float row = floor(uv.y / cellSize.y);
  float offsetX = mod(row, 2.0) * cellSize.x * 0.5;
  vec2 cell = vec2(floor((uv.x + offsetX) / cellSize.x), row);
  vec2 local = vec2(fract((uv.x + offsetX) / cellSize.x), fract(uv.y / cellSize.y));

  // Color base aleatorio entre uPalette[0] y uPalette[1] por tablón
  float h = fhash(cell);
  vec3 base = mix(uPalette[0], uPalette[1], h * 0.85);

  // Vetas longitudinales (madera): seno de alta frecuencia por tablón
  float veta = sin(local.x * 60.0 + h * 31.4) * 0.5 + 0.5;
  veta = pow(veta, 4.0) * 0.08;
  base = mix(base, uPalette[3], veta);

  // Grout / separación entre tablones (oscuro)
  float groutX = smoothstep(0.0, 0.025, local.x) * smoothstep(1.0, 0.975, local.x);
  float groutY = smoothstep(0.0, 0.08, local.y) * smoothstep(1.0, 0.92, local.y);
  float grout = groutX * groutY;
  vec3 groutColor = uPalette[3] * 0.35;

  // Highlight gradient interno (arriba claro, abajo oscuro)
  float shade = mix(1.08, 0.88, local.y);

  // Sutil nodo cada N tablones (madera real)
  float nodo = 0.0;
  if (uVariant < 0.5) {
    float nodoMask = step(0.85, fhash(cell + 7.31));
    vec2 nLocal = local - vec2(0.5, 0.5);
    float nDist = length(nLocal * vec2(1.0, 2.0));
    nodo = nodoMask * smoothstep(0.18, 0.06, nDist) * 0.25;
    base = mix(base, uPalette[3] * 0.6, nodo);
  }

  vec3 finalColor = mix(groutColor, base * shade, grout);
  return finalColor;
}

// ─── Pattern: CHEVRON (V-shape blocks) ──────────────────────────────────────
// Usado por: WOOD_CHEVRON_BURGUNDY
//
// Cada celda 1.0 x 1.0 en uv (post-tileSize) es un bloque V con punta hacia
// arriba. Color random por bloque entre 4 tonos de paleta. Highlight en
// borde superior (V invertida), shadow en borde inferior (V) → look de tablón
// en herringbone/parquet francés.
vec3 patternChevron(vec2 uv) {
  vec2 cell = floor(uv);
  vec2 local = fract(uv);

  // Color por bloque: mezcla de paleta con micro-variación entre vecinos
  float h = fhash(cell);
  float h2 = fhash(cell + 11.7);
  vec3 base = mix(uPalette[0], uPalette[1], h * 0.85);
  // Algunos bloques tintados hacia palette[2] (highlight rosa/claro) o palette[3] (oscuro)
  base = mix(base, uPalette[2], step(0.82, h2) * 0.35);
  base = mix(base, uPalette[3], step(h2, 0.10) * 0.30);

  // Forma V: la "punta" sube en el centro (x=0.5). vHeight es 0 en bordes, 0.45 en centro.
  float xMid = abs(local.x * 2.0 - 1.0); // 0 en centro, 1 en bordes
  float vHeight = (1.0 - xMid) * 0.45;

  // Borde superior (línea V invertida): highlight fino
  float dTop = abs(local.y - vHeight);
  float highlight = smoothstep(0.04, 0.0, dTop) * 0.22;

  // Borde inferior (línea V que apunta abajo): shadow
  float dBot = abs(local.y - (1.0 - vHeight));
  float shadow = smoothstep(0.06, 0.0, dBot) * 0.22;

  // Sombreado vertical interno: centro más claro, bordes más oscuros
  float vCenter = 1.0 - abs(local.y - 0.5) * 0.6;
  vec3 col = base * (0.90 + vCenter * 0.16);
  col += vec3(highlight);
  col -= vec3(shadow);

  // Vetas finas longitudinales (madera): seno alto-frec
  float veta = sin(local.y * 80.0 + h * 31.4) * 0.5 + 0.5;
  col = mix(col, base * 0.85, pow(veta, 6.0) * 0.10);

  return col;
}

// ─── Pattern: MARBLE (fbm + domain warp + veins) ────────────────────────────
// Usado por: MARBLE_WHITE, MARBLE_BLACK
vec3 patternMarble(vec2 uv) {
  // Domain warp para que las venas no se vean repetitivas
  vec2 q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2)), fbm(uv + 4.0 * q + vec2(8.3, 2.8)));
  float n = fbm(uv + 4.0 * r);

  // Veins: derivada agudizada
  float veins = pow(1.0 - abs(n - 0.5) * 2.0, 8.0);

  // Mezcla base (uPalette[0]) con vena (uPalette[1])
  vec3 col = mix(uPalette[0], uPalette[1], n * 0.5);
  col = mix(col, uPalette[2], veins * 0.7);

  // Variant 1 → marble black con venas doradas adicionales
  if (uVariant > 0.5) {
    float goldVein = pow(1.0 - abs(fbm(uv * 1.3 + r) - 0.5) * 2.0, 12.0);
    col = mix(col, uPalette[3], goldVein * 0.6);
  }

  return col;
}

// ─── Pattern: CONCRETE (Worley + radial blobs) ──────────────────────────────
// Usado por: CONCRETE_SMOOTH (variant=0), CONCRETE_ROUGH (variant=1)
vec3 patternConcrete(vec2 uv) {
  vec3 cellInfo;
  float w = worley(uv * 1.3, cellInfo);
  float n = fbm(uv * 2.0);

  vec3 col = mix(uPalette[0], uPalette[1], n);

  // Manchas oscuras donde worley es bajo (centros de celda)
  col = mix(col, uPalette[2] * 0.85, smoothstep(0.0, 0.15, w) * 0.0 + (1.0 - smoothstep(0.0, 0.4, w)) * 0.18);

  if (uVariant > 0.5) {
    // ROUGH: añadir grietas usando worley borde
    float crackEdge = smoothstep(0.05, 0.0, abs(w - 0.5));
    col = mix(col, uPalette[3] * 0.4, crackEdge * 0.35);
    // grain extra
    float grain = vnoise(uv * 80.0) * 0.06;
    col += vec3(grain - 0.03);
  } else {
    // SMOOTH: líneas de encofrado horizontales sutiles
    float seam = smoothstep(0.02, 0.0, abs(fract(uv.y * 0.5) - 0.5));
    col = mix(col, uPalette[3] * 0.55, seam * 0.08);
  }

  return col;
}

// ─── Pattern: CARPET (fbm pile) ─────────────────────────────────────────────
// Usado por: CARPET_OFFICE, CARPET_SOFT_GRAY
vec3 patternCarpet(vec2 uv) {
  float pile = fbm(uv * 25.0);
  float weave = sin(uv.x * 90.0) * sin(uv.y * 90.0) * 0.5 + 0.5;
  vec3 col = mix(uPalette[0], uPalette[1], pile);
  col = mix(col, uPalette[2], weave * 0.12);

  // Líneas diagonales muy sutiles (patrón decorativo)
  if (uVariant < 0.5) {
    float diag = smoothstep(0.98, 1.0, sin((uv.x + uv.y) * 8.0) * 0.5 + 0.5);
    col = mix(col, uPalette[3] * 0.7, diag * 0.06);
  }

  return col;
}

// ─── Pattern: HEX (hexagonal SDF + bevel) ───────────────────────────────────
// Usado por: TILE_HEX (variant=0), HEX_STYLIZED (variant=1), METAL_GRID (variant=2)
vec3 patternHex(vec2 uv) {
  // Transform a coordenadas de grid hexagonal
  vec2 h = vec2(1.7320508, 1.0);
  vec2 a = mod(uv, h) - h * 0.5;
  vec2 b = mod(uv + h * 0.5, h) - h * 0.5;
  vec2 hex = dot(a, a) < dot(b, b) ? a : b;
  vec2 cellCenter = uv - hex;

  // Distancia al borde del hexágono (SDF)
  vec3 absHex = abs(vec3(hex.x, hex.y, hex.x * 0.5 + hex.y * 0.866));
  float dEdge = max(absHex.x * 0.866 + absHex.y * 0.5, absHex.y);
  dEdge = max(dEdge, absHex.z);
  float fromEdge = 0.5 - dEdge;

  // Color random por hexágono entre paleta[0] y paleta[1]
  float h2 = fhash(cellCenter);
  vec3 base = mix(uPalette[0], uPalette[1], step(0.5, h2));

  // Variant 1 (stylized): bevel highlight arriba + sombra abajo
  vec3 col = base;
  if (uVariant > 0.5 && uVariant < 1.5) {
    float bevelTop = smoothstep(0.0, 0.08, fromEdge) * step(0.0, hex.y) * 0.18;
    float bevelBot = smoothstep(0.0, 0.08, fromEdge) * step(hex.y, 0.0) * 0.15;
    col += vec3(bevelTop) - vec3(bevelBot);
    // Borde oscuro fino
    float border = smoothstep(0.0, 0.025, fromEdge);
    col = mix(uPalette[3] * 0.3, col, border);
  } else if (uVariant > 1.5) {
    // METAL_GRID: hexágono oscuro con highlight metálico al centro
    float center = smoothstep(0.0, 0.35, fromEdge);
    col = mix(uPalette[0], uPalette[1], center);
    float metalHi = pow(center, 4.0) * 0.55;
    col += uPalette[2] * metalHi;
    // borde luminoso emisivo
    float wire = smoothstep(0.02, 0.0, fromEdge);
    col = mix(col, uPalette[2], wire * 0.6);
  } else {
    // TILE_HEX: liso, solo borde gris
    float border = smoothstep(0.0, 0.02, fromEdge);
    col = mix(uPalette[3] * 0.6, col, border);
  }

  return col;
}

// ─── Pattern: COBBLE (Two-pass Voronoi — Inigo Quilez) ──────────────────────
// Usado por: STONE_COBBLE_WARM (variant=0), STONE_PATH_GARDEN (variant=1)
//
// Distancia REAL al bisector (no a centro) → grout afilado uniforme + stones
// poligonales. Color random por cellId. Sombreado interno via dBorder hace
// que cada piedra tenga sutil bevel.
vec3 patternCobble(vec2 uv) {
  VoronoiResult v = voronoiCells(uv);
  float h = fhash(v.cellId);
  vec3 stone = pickPalette(h);

  // Sutil bevel: piedra más clara cerca del centro, más oscura cerca del borde
  float bevel = smoothstep(0.0, 0.12, v.dBorder);
  stone *= 0.92 + bevel * 0.10;

  if (uVariant > 0.5) {
    // STONE_PATH_GARDEN: grout verde con grass tufts solo en uniones triples
    vec3 grass = uPalette[3];              // verde medio
    float grout = 1.0 - smoothstep(0.02, 0.08, v.dBorder);
    vec3 col = mix(stone, grass, grout);

    // Tufts: solo MUY cerca del borde (uniones triples) + hash random por celda
    float tuftSeed = fhash(v.cellId * 7.31 + 13.0);
    float nearEdge = 1.0 - smoothstep(0.0, 0.04, v.dBorder);
    float tuftMask = nearEdge * step(0.78, tuftSeed);
    // micro-variación de tamaño con noise para que no sean todos circulitos iguales
    float tuftJitter = vnoise(v.cellId * 5.0) * 0.4 + 0.6;
    col = mix(col, uPalette[2], tuftMask * tuftJitter * 0.7);  // paleta[2] = verde oscuro
    return col;
  }

  // STONE_COBBLE_WARM: grout oscuro afilado
  float grout = 1.0 - smoothstep(0.015, 0.055, v.dBorder);
  vec3 groutColor = uPalette[3] * 0.4;
  vec3 col = mix(stone, groutColor, grout);
  return col;
}

// ─── Entry point ────────────────────────────────────────────────────────────
vec3 evaluateFloorPattern(vec2 worldXZ) {
  vec2 uv = worldXZ / uTileSize;

  #if defined(FLOOR_PATTERN_PLANKS)
    return patternPlanks(uv);
  #elif defined(FLOOR_PATTERN_CHEVRON)
    return patternChevron(uv);
  #elif defined(FLOOR_PATTERN_MARBLE)
    return patternMarble(uv);
  #elif defined(FLOOR_PATTERN_CONCRETE)
    return patternConcrete(uv);
  #elif defined(FLOOR_PATTERN_CARPET)
    return patternCarpet(uv);
  #elif defined(FLOOR_PATTERN_HEX)
    return patternHex(uv);
  #elif defined(FLOOR_PATTERN_COBBLE)
    return patternCobble(uv);
  #else
    return uPalette[0];
  #endif
}
`;
