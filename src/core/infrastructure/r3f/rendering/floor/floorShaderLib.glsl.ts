/**
 * @module infrastructure/r3f/rendering/floor/floorShaderLib
 *
 * Biblioteca GLSL de patrones procedurales para suelos.
 *
 * ## Anti-aliasing & auto-fit (industria-grade)
 *
 * **A. fwidth-based AA (Inigo Quilez "Filtering procedural textures")**
 * Cada pattern usa `fwidth(uv)` para estimar el footprint del pixel en
 * pattern-space y atenúa detalle sub-pixel (vetas, weave, per-cell color
 * randomness, grain). Elimina moiré/shimmer al caminar sin perder detalle
 * de cerca. Ref: https://iquilezles.org/articles/filtering/
 *
 * **B. Mesh-local auto-fit (Sims/Roblox pattern)**
 * Si `vPisoSize.x > 0`, el shader entra en modo mesh-local: calcula
 * `cellCount = round(pisoSize / idealTile)` y usa `actualTile = pisoSize /
 * cellCount` para garantizar tiles enteros que encajan exactamente en el
 * piso. Bordes limpios, sin tiles partidos. Para el suelo principal (sin
 * `aPisoSize` attribute → defaults a 0) se mantiene el modo world-space.
 *
 * Uniforms del shader:
 *   uniform vec3  uPalette[4];   // 4 tonos base del FloorType
 *   uniform vec2  uTileSize;     // metros por ciclo de patrón (ideal)
 *   uniform float uVariant;      // sub-variante (0,1,2…) según pattern
 *
 * Varyings del vertex shader (inyectados por FloorMaterialAdapter):
 *   varying vec3 vFloorWorldPos; // posición de mundo del fragment
 *   varying vec2 vPisoCenter;    // centro del piso en world XZ (0 → world-mode)
 *   varying vec2 vPisoSize;      // dimensiones del piso en metros (0 → world-mode)
 *
 * @see https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
 * @see https://iquilezles.org/articles/filtering/
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
//
// Nota: ANGLE/D3D11 (Windows Intel) lanza warning X4000 si la struct se
// declara sin constructor explícito. Usamos VoronoiResult(0.0, vec2(0.0))
// al inicio para evitar potencial NaN/garbage en drivers estrictos.
struct VoronoiResult {
  float dBorder;
  vec2 cellId;
};

VoronoiResult voronoiCells(vec2 x) {
  // Init explícito de la struct — evita warning X4000 ANGLE/D3D11 Intel
  VoronoiResult res = VoronoiResult(8.0, vec2(0.0));

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

// ─── AA Helpers ─────────────────────────────────────────────────────────────
// Footprint del pixel en pattern-space (en unidades de tile). Si el footprint
// es mayor que la frecuencia de un detalle, ese detalle alias → lo desvanecemos.
float pixelFootprint(vec2 uv) {
  vec2 fw = fwidth(uv);
  return max(fw.x, fw.y);
}

// Factor de fade [0,1] para componentes de alta frecuencia. Empieza a aplicar
// cuando el pixel cubre 'start' unidades del patrón, full-fade en 'end'.
// start/end son fracciones del tile-space (típicamente ~0.05 → ~0.5).
float detailFadeFactor(float footprint, float start, float end) {
  return smoothstep(start, end, footprint);
}

// Promedio de la paleta — color al que converger al desvanecer detalle.
vec3 paletteAverage() {
  return (uPalette[0] + uPalette[1] + uPalette[2] + uPalette[3]) * 0.25;
}

// ─── Pattern: PLANKS (brick offset) ─────────────────────────────────────────
// Usado por: WOOD_OAK, WOOD_DARK, WOOD_PLANKS_GREEN/TEAL/MUSTARD,
//            TILE_WHITE (variant=1 cuadrado), VINYL_TECH (variant=2 checker)
//
// AA: per-plank random color → fade a mean(p0,p1) cuando pixel > 30% del plank.
// Veta sin(60·local.x) (período ~0.10 local) → kill cuando pixel > 0.05.
// Grout edges → smoothstep adaptivo con fwidth.
vec3 patternPlanks(vec2 uv) {
  vec2 cellSize = vec2(1.0, 0.25);   // 4 tablones por unidad de tileSize
  if (uVariant > 0.5 && uVariant < 1.5) cellSize = vec2(1.0, 1.0);  // square tile
  if (uVariant > 1.5) cellSize = vec2(0.5, 0.5);                    // small checker

  float fp = pixelFootprint(uv);
  // Fade detalle sub-celda EARLIER (15% en vez de 25% de la altura del
  // plank). Más agresivo → kill sparkle perceptible al caminar.
  float plankFade = detailFadeFactor(fp, cellSize.y * 0.15, cellSize.y * 0.7);

  float row = floor(uv.y / cellSize.y);
  float offsetX = mod(row, 2.0) * cellSize.x * 0.5;
  vec2 cell = vec2(floor((uv.x + offsetX) / cellSize.x), row);
  vec2 local = vec2(fract((uv.x + offsetX) / cellSize.x), fract(uv.y / cellSize.y));

  // Color base aleatorio entre uPalette[0] y uPalette[1] por tablón.
  // Variance reducida 0.85→0.55: cada plank tiene menor contraste vs sus
  // vecinos → reduce el ruido visual perceptible al caminar (cada pixel
  // oscila entre tonos menos extremos). AA: fade a mean a distancia.
  float h = fhash(cell);
  vec3 baseRandom = mix(uPalette[0], uPalette[1], h * 0.55);
  vec3 baseMean = mix(uPalette[0], uPalette[1], 0.275);
  vec3 base = mix(baseRandom, baseMean, plankFade);

  // Vetas longitudinales (madera): seno de alta frecuencia por tablón.
  // Período en local.x ≈ 0.105 → fade rápido cuando pixel > 4% del plank.
  float vetaFade = detailFadeFactor(fp, 0.04, 0.16);
  float veta = sin(local.x * 60.0 + h * 31.4) * 0.5 + 0.5;
  veta = pow(veta, 4.0) * 0.06 * (1.0 - vetaFade);  // 0.08 → 0.06
  base = mix(base, uPalette[3], veta);

  // Grout / separación entre tablones. Refinado vs versión anterior:
  //
  //  1. Color del grout = 'base * 0.6' (misma hue que la madera, 40% más
  //     oscuro). El grout 'uPalette[3] * 0.35' (near-black) anterior creaba
  //     ALTO contraste wood/near-black → moiré perceptible aún con fwidth-AA
  //     porque cada pixel oscila entre claro/oscuro fuerte. Same-hue shadow
  //     line es lo que hacen real-world wood floors (hairline gaps).
  //     Ref: https://substance3d.adobe.com/community-assets (Wood Planks)
  //
  //  2. Grout más fino: thickX 0.025→0.012 (de 1.7cm a 8mm para plank de
  //     70cm), thickY 0.08→0.05 (de 1.4cm a 9mm para plank de 17cm). Más
  //     cercano a un piso real con tablones largos.
  //
  //  3. AA con fwidth REALMENTE aplicado (en la versión previa estaba como
  //     dead code). 'bodyX/Y' usan smoothstep(edge - aaW, edge + aaW, x)
  //     correctamente — edge0 < edge1 — para gradient suave en el borde
  //     del plank que se adapta al footprint del pixel.
  float fpForGrout = pixelFootprint(uv);  // re-read fp en scope local
  float aaW = max(fpForGrout * 0.5, 0.001);
  const float groutThickX = 0.012;
  const float groutThickY = 0.05;
  // bodyX = 1 dentro del plank, 0 en grout. Smoothstep AA-adaptive.
  // 'local' es fract → [0,1] dentro de la celda. groutThick es la distancia
  // del borde a considerar como "grout". Body = [groutThick, 1-groutThick].
  float bodyX = smoothstep(groutThickX - aaW, groutThickX + aaW, local.x)
              * smoothstep(groutThickX - aaW, groutThickX + aaW, 1.0 - local.x);
  float bodyY = smoothstep(groutThickY - aaW, groutThickY + aaW, local.y)
              * smoothstep(groutThickY - aaW, groutThickY + aaW, 1.0 - local.y);
  float body = bodyX * bodyY;

  // Highlight gradient interno (arriba claro, abajo oscuro). Rango
  // reducido 1.08/0.88 → 1.04/0.94: mismo cue visual de profundidad por
  // tablón pero sin crear contraste vertical que amplifica moiré.
  float shade = mix(1.04, 0.94, local.y);

  // Sutil nodo cada N tablones (madera real). AA: kill cuando lejos.
  float nodo = 0.0;
  if (uVariant < 0.5) {
    float nodoMask = step(0.85, fhash(cell + 7.31));
    vec2 nLocal = local - vec2(0.5, 0.5);
    float nDist = length(nLocal * vec2(1.0, 2.0));
    nodo = nodoMask * smoothstep(0.18, 0.06, nDist) * 0.25 * (1.0 - plankFade);
    base = mix(base, uPalette[3] * 0.6, nodo);
  }

  // Grout color = hue de la madera del plank actual (per-plank), 40% más
  // oscuro. Calculado DESPUÉS de aplicar veta+nodo para que la sombra del
  // gap herede esas variaciones — más natural.
  vec3 groutColor = base * 0.6;

  vec3 finalColor = mix(groutColor, base * shade, body);
  return finalColor;
}

// ─── Pattern: CHEVRON (V-shape blocks) ──────────────────────────────────────
// Usado por: WOOD_CHEVRON_BURGUNDY
//
// AA: per-block random color fade a mean(p0,p1) cuando pixel > 25% del bloque.
// V-edge highlight/shadow smoothstep widths adaptados con fwidth.
// Veta sin(80·local.y) → kill cuando pixel > 0.04 (período del seno ≈ 0.08).
vec3 patternChevron(vec2 uv) {
  vec2 cell = floor(uv);
  vec2 local = fract(uv);

  float fp = pixelFootprint(uv);
  // Fade MÁS AGRESIVO para CHEVRON: tileSize 0.22m es el más chico del
  // catálogo, así que fwidth-AA debe empezar más temprano. 0.25→0.12.
  float cellFade = detailFadeFactor(fp, 0.12, 0.6);
  // Veta de alta frecuencia: período en local.y ~0.08 → fade muy temprano.
  float vetaFade = detailFadeFactor(fp, 0.025, 0.14);

  // Color por bloque: paleta con variance REDUCIDA y transitions SUAVES.
  // Cambios vs versión anterior:
  //   - 'h * 0.85' → 'h * 0.55': menor contraste entre planks vecinos.
  //   - step() → smoothstep(): el spike de palette[2]/palette[3] ya no es
  //     binario (algunas celdas pink puro, otras burgundy puro) sino una
  //     transition suave de palette[1] → palette[2] solo en ~6% del rango
  //     de h2. Elimina salt-and-pepper sparkle al caminar.
  //   - Magnitudes 0.35 → 0.22 (pink) y 0.30 → 0.18 (very dark): menos
  //     intensidad cuando aparece el accent → contraste percibido reducido.
  //
  // Ref smoothstep aplicado a per-cell color jitter:
  //   https://iquilezles.org/articles/smoothsteps/
  float h = fhash(cell);
  float h2 = fhash(cell + 11.7);
  vec3 baseRandom = mix(uPalette[0], uPalette[1], h * 0.55);
  baseRandom = mix(baseRandom, uPalette[2], smoothstep(0.88, 0.94, h2) * 0.22);
  baseRandom = mix(baseRandom, uPalette[3], smoothstep(0.10, 0.04, h2) * 0.18);
  // Color promedio para fade a distancia (kill salt-and-pepper sparkle)
  vec3 baseMean = mix(uPalette[0], uPalette[1], 0.275);
  vec3 base = mix(baseRandom, baseMean, cellFade);

  // Forma V. AA con fwidth para edges limpios sin stairstepping.
  float xMid = abs(local.x * 2.0 - 1.0);
  float vHeight = (1.0 - xMid) * 0.45;
  float aaW = max(fp * 0.5, 0.001);

  // Borde superior + inferior: highlight/shadow intensidad reducida
  // 0.22 → 0.12 — eran demasiado contrastosos contra burgundy oscuro y
  // creaban líneas brillantes/oscuras finas que aliasan.
  float dTop = abs(local.y - vHeight);
  float highlight = smoothstep(0.04 + aaW, aaW, dTop) * 0.12 * (1.0 - cellFade);

  float dBot = abs(local.y - (1.0 - vHeight));
  float shadow = smoothstep(0.06 + aaW, aaW, dBot) * 0.12 * (1.0 - cellFade);

  // Sombreado vertical interno: rango reducido 0.6 → 0.4 para menor
  // contraste vertical (eran 16% peak-to-peak, ahora ~10%).
  float vCenter = 1.0 - abs(local.y - 0.5) * 0.4;
  vec3 col = base * (0.94 + vCenter * 0.10);
  col += vec3(highlight);
  col -= vec3(shadow);

  // Vetas finas longitudinales — fade rápido cuando pixel > período de la veta.
  float veta = sin(local.y * 80.0 + h * 31.4) * 0.5 + 0.5;
  col = mix(col, base * 0.85, pow(veta, 6.0) * 0.10 * (1.0 - vetaFade));

  return col;
}

// ─── Pattern: MARBLE (fbm + domain warp + veins) ────────────────────────────
// Usado por: MARBLE_WHITE, MARBLE_BLACK
//
// fbm es naturalmente low-freq (multi-octave) → menos aliasing-prone.
// Pero las venas (pow agudizado) sí alias → fade cuando pixel > 0.08.
vec3 patternMarble(vec2 uv) {
  float fp = pixelFootprint(uv);
  float veinFade = detailFadeFactor(fp, 0.08, 0.4);

  // Domain warp para que las venas no se vean repetitivas
  vec2 q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(uv + 4.0 * q + vec2(1.7, 9.2)), fbm(uv + 4.0 * q + vec2(8.3, 2.8)));
  float n = fbm(uv + 4.0 * r);

  // Veins: derivada agudizada
  float veins = pow(1.0 - abs(n - 0.5) * 2.0, 8.0) * (1.0 - veinFade);

  // Mezcla base (uPalette[0]) con vena (uPalette[1])
  vec3 col = mix(uPalette[0], uPalette[1], n * 0.5);
  col = mix(col, uPalette[2], veins * 0.7);

  // Variant 1 → marble black con venas doradas adicionales
  if (uVariant > 0.5) {
    float goldVein = pow(1.0 - abs(fbm(uv * 1.3 + r) - 0.5) * 2.0, 12.0) * (1.0 - veinFade);
    col = mix(col, uPalette[3], goldVein * 0.6);
  }

  return col;
}

// ─── Pattern: CONCRETE (Worley + radial blobs) ──────────────────────────────
// Usado por: CONCRETE_SMOOTH (variant=0), CONCRETE_ROUGH (variant=1)
//
// AA: ROUGH grain 'vnoise(uv*80)' → período 0.0125 → fade cuando pixel > 0.01.
// Worley/fbm naturalmente low-freq.
vec3 patternConcrete(vec2 uv) {
  float fp = pixelFootprint(uv);
  float grainFade = detailFadeFactor(fp, 0.015, 0.08);
  float crackFade = detailFadeFactor(fp, 0.04, 0.2);

  vec3 cellInfo;
  float w = worley(uv * 1.3, cellInfo);
  float n = fbm(uv * 2.0);

  vec3 col = mix(uPalette[0], uPalette[1], n);

  // Manchas oscuras donde worley es bajo (centros de celda)
  col = mix(col, uPalette[2] * 0.85, smoothstep(0.0, 0.15, w) * 0.0 + (1.0 - smoothstep(0.0, 0.4, w)) * 0.18);

  if (uVariant > 0.5) {
    // ROUGH: añadir grietas usando worley borde — fade a distancia
    float crackEdge = smoothstep(0.05, 0.0, abs(w - 0.5)) * (1.0 - crackFade);
    col = mix(col, uPalette[3] * 0.4, crackEdge * 0.35);
    // Grain extra — fade rápido, es el principal culpable de moiré en CONCRETE.
    float grain = vnoise(uv * 80.0) * 0.06 * (1.0 - grainFade);
    col += vec3(grain - 0.03 * (1.0 - grainFade));
  } else {
    // SMOOTH: líneas de encofrado horizontales sutiles — fade a distancia
    float seam = smoothstep(0.02, 0.0, abs(fract(uv.y * 0.5) - 0.5)) * (1.0 - crackFade);
    col = mix(col, uPalette[3] * 0.55, seam * 0.08);
  }

  return col;
}

// ─── Pattern: CARPET (fbm pile) ─────────────────────────────────────────────
// Usado por: CARPET_OFFICE, CARPET_SOFT_GRAY
//
// El weave era el principal culpable de moiré: sin(x*90)·sin(y*90) tiene
// período ~0.07 y al caminar entra/sale del cycle cada 2-3 pixels.
// Fade weave cuando pixel > 0.04; fade pile (período 0.04) cuando > 0.025.
vec3 patternCarpet(vec2 uv) {
  float fp = pixelFootprint(uv);
  float weaveFade = detailFadeFactor(fp, 0.025, 0.12);
  float pileFade = detailFadeFactor(fp, 0.04, 0.25);
  float diagFade = detailFadeFactor(fp, 0.08, 0.4);

  float pile = fbm(uv * 25.0);
  // Pile fade: al desvanecer, n → 0.5 (mean) → color base medio.
  float pileBlend = mix(pile, 0.5, pileFade);

  float weave = (sin(uv.x * 90.0) * sin(uv.y * 90.0) * 0.5 + 0.5) * (1.0 - weaveFade);
  vec3 col = mix(uPalette[0], uPalette[1], pileBlend);
  col = mix(col, uPalette[2], weave * 0.12);

  // Líneas diagonales muy sutiles (patrón decorativo)
  if (uVariant < 0.5) {
    float diag = smoothstep(0.98, 1.0, sin((uv.x + uv.y) * 8.0) * 0.5 + 0.5) * (1.0 - diagFade);
    col = mix(col, uPalette[3] * 0.7, diag * 0.06);
  }

  return col;
}

// ─── Pattern: HEX (hexagonal SDF + bevel) ───────────────────────────────────
// Usado por: TILE_HEX (variant=0), HEX_STYLIZED (variant=1), METAL_GRID (variant=2)
//
// HEX ya tenía AA en bordes con fwidth(fromEdge). Reforzado: per-cell random
// color ('step(0.5, h2)') también fade a mean cuando pixel cubre la celda
// entera (elimina sparkle a distancia).
vec3 patternHex(vec2 uv) {
  float fp = pixelFootprint(uv);
  float cellFade = detailFadeFactor(fp, 0.3, 1.2);

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

  // Pixel footprint para AA adaptativo de los bordes hex (ya existía)
  float aaW = max(fwidth(fromEdge), 0.001);

  // Color random por hexágono entre paleta[0] y paleta[1]
  // AA: fade a 50/50 mean cuando pixel > celda
  float h2 = fhash(cellCenter);
  float blend = mix(step(0.5, h2), 0.5, cellFade);
  vec3 base = mix(uPalette[0], uPalette[1], blend);

  // Variant 1 (stylized): bevel highlight arriba + sombra abajo
  vec3 col = base;
  if (uVariant > 0.5 && uVariant < 1.5) {
    float bevelTop = smoothstep(0.0, 0.08, fromEdge) * step(0.0, hex.y) * 0.18 * (1.0 - cellFade);
    float bevelBot = smoothstep(0.0, 0.08, fromEdge) * step(hex.y, 0.0) * 0.15 * (1.0 - cellFade);
    col += vec3(bevelTop) - vec3(bevelBot);
    // Borde oscuro fino AA
    float border = smoothstep(0.0125 - aaW, 0.0125 + aaW, fromEdge);
    col = mix(uPalette[3] * 0.3, col, border);
  } else if (uVariant > 1.5) {
    // METAL_GRID: hexágono oscuro con highlight metálico al centro
    float center = smoothstep(0.0, 0.35, fromEdge);
    col = mix(uPalette[0], uPalette[1], center);
    float metalHi = pow(center, 4.0) * 0.55 * (1.0 - cellFade);
    col += uPalette[2] * metalHi;
    // Borde luminoso emisivo AA
    float wire = 1.0 - smoothstep(0.01 - aaW, 0.01 + aaW, fromEdge);
    col = mix(col, uPalette[2], wire * 0.6);
  } else {
    // TILE_HEX: liso, solo borde gris AA
    float border = smoothstep(0.01 - aaW, 0.01 + aaW, fromEdge);
    col = mix(uPalette[3] * 0.6, col, border);
  }

  return col;
}

// ─── Pattern: COBBLE (Two-pass Voronoi — Inigo Quilez) ──────────────────────
// Usado por: STONE_COBBLE_WARM (variant=0), STONE_PATH_GARDEN (variant=1)
//
// COBBLE ya tenía AA en bordes. Reforzado: per-cell random color también
// fade a paleta[1] (mean stone) cuando pixel > celda.
vec3 patternCobble(vec2 uv) {
  float fp = pixelFootprint(uv);
  float cellFade = detailFadeFactor(fp, 0.3, 1.2);

  VoronoiResult v = voronoiCells(uv);
  float h = fhash(v.cellId);
  vec3 stoneRandom = pickPalette(h);
  // AA: cuando pixel cubre celda entera, converger al stone medio
  vec3 stoneMean = mix(uPalette[0], uPalette[1], 0.5);
  vec3 stone = mix(stoneRandom, stoneMean, cellFade);

  // Pixel footprint en pattern-space → ancho del smoothstep adaptativo
  float aaW = max(fwidth(v.dBorder), 0.001);

  // Bevel sutil: piedra más clara cerca del centro, más oscura cerca del borde
  float bevel = smoothstep(0.0, 0.12, v.dBorder);
  stone *= 0.92 + bevel * 0.10;

  if (uVariant > 0.5) {
    // STONE_PATH_GARDEN: grout verde + tufts en uniones triples
    vec3 grass = uPalette[3];
    float grout = 1.0 - smoothstep(0.04 - aaW, 0.04 + aaW, v.dBorder);
    vec3 col = mix(stone, grass, grout);

    // Tufts: solo MUY cerca del borde + hash random por celda. Fade a distancia.
    float tuftSeed = fhash(v.cellId * 7.31 + 13.0);
    float nearEdge = 1.0 - smoothstep(0.0, 0.04, v.dBorder);
    float tuftMask = nearEdge * step(0.78, tuftSeed);
    float tuftJitter = vnoise(v.cellId * 5.0) * 0.4 + 0.6;
    col = mix(col, uPalette[2], tuftMask * tuftJitter * 0.7 * (1.0 - cellFade));
    return col;
  }

  // STONE_COBBLE_WARM: grout oscuro AA
  float grout = 1.0 - smoothstep(0.035 - aaW, 0.035 + aaW, v.dBorder);
  vec3 groutColor = uPalette[3] * 0.4;
  vec3 col = mix(stone, groutColor, grout);
  return col;
}

// ─── Pattern: STYLIZED (cartoon "puffy" tile — Pixar/Genshin/Royal Match) ───
// Usado por: STONE_STYLIZED_WARM.
//
// Estilo AAA stylized stone — tile cuadrado con esquinas redondeadas, fake
// hemisphere shading (top brillante, bottom oscuro), edge rim highlight en
// bordes superiores y shadow rim en inferiores. Sin texturas, sin maps —
// 100% procedural via SDF + Y-bias.
//
// Capas de shading (de adentro hacia afuera):
//  1. Per-tile base color (jitter low-variance entre uPalette[0] y [1])
//  2. Y-gradient soft → fake hemisphere (top lit, bottom shadowed)
//  3. Edge-proximity rim → highlight (uPalette[2]) en bordes top, shadow
//     (uPalette[3]) en bordes bottom
//  4. Low-freq wear noise → micro-variación sin aliasing
//
// AA: SDF body con fwidth-AA + per-cell color con bajo contraste → cero moiré.
//
// Refs:
//  - https://iquilezles.org/articles/distfunctions2d/  (SDF rounded box)
//  - https://substance3d.adobe.com/tutorials/courses/foundations-stylized-shading
vec3 patternStylized(vec2 uv) {
  vec2 cellId = floor(uv);
  vec2 local = fract(uv) - 0.5;  // [-0.5, 0.5] centered
  float fp = pixelFootprint(uv);

  // ─── SDF rounded square (Inigo Quilez) ─────────────────────────────────
  // tileHalf=0.42 → tile cubre 84% de la celda, 16% de grout total.
  // cornerR=0.06 → esquinas suavemente redondeadas (look "puffy").
  const float tileHalf = 0.42;
  const float cornerR = 0.06;
  vec2 q = abs(local) - vec2(tileHalf - cornerR);
  float sdf = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - cornerR;
  // sdf < 0 = dentro del tile, > 0 = en grout

  // ─── Per-tile random color (variance baja — matched-set look) ──────────
  float h = fhash(cellId);
  // h*0.4 → cada tile varía solo ±20% entre uPalette[0] y uPalette[1].
  // Tight palette = no salt-and-pepper sparkle entre tiles vecinos.
  vec3 tileBase = mix(uPalette[0], uPalette[1], h * 0.4);

  // ─── Y-gradient soft (fake hemisphere shading) ─────────────────────────
  // ySoft: 0 en bottom del tile, 1 en top, suavizado para look puffy.
  // Aplica AÚN DENTRO del centro → el tile entero tiene gradient sutil.
  float yNorm = clamp(local.y / tileHalf, -1.0, 1.0);
  float ySoft = clamp(yNorm * 0.55 + 0.5, 0.0, 1.0);

  // ─── Edge-proximity rim (highlight top, shadow bottom) ─────────────────
  // edgeProx: 0 deep inside, 1 right at edge. -0.10 = banda de 10% del cell.
  float edgeProx = 1.0 - smoothstep(0.0, -0.10, sdf);

  // Colors auxiliares (mezclas de paleta para no introducir hues nuevos)
  vec3 highlightCol = mix(uPalette[1], uPalette[2], 0.7);  // cream warm
  vec3 shadowCol = mix(uPalette[0], uPalette[3], 0.45);    // dark warm

  // Center color: base + soft Y-gradient (top-light, bottom-dark)
  vec3 centerCol = mix(shadowCol, highlightCol, ySoft);
  centerCol = mix(centerCol, tileBase, 0.55);  // pull back hacia identity

  // Rim highlight: solo en bordes superiores (ySoft > 0.5)
  float topRim = edgeProx * smoothstep(0.45, 1.0, ySoft);
  float botRim = edgeProx * (1.0 - smoothstep(0.0, 0.55, ySoft));
  vec3 tileColor = centerCol;
  tileColor = mix(tileColor, highlightCol, topRim * 0.55);
  tileColor = mix(tileColor, shadowCol, botRim * 0.40);

  // ─── Low-freq wear noise (micro-variación, NO sub-pixel) ───────────────
  // fbm a frecuencia baja (uv*2.5) → wave-length ~40cm para tileSize 0.7m.
  // Sin aliasing porque la frecuencia es siempre > footprint del pixel.
  float wear = fbm(uv * 2.5);
  tileColor *= 0.92 + wear * 0.16;  // ±8% modulación, da carácter sin ruido

  // ─── Grout: same-hue darker (uPalette[3] base oscuro) ──────────────────
  vec3 groutColor = uPalette[3] * 0.75;

  // ─── Body mask con fwidth-AA ────────────────────────────────────────────
  float aaW = max(fp * 0.5, 0.001);
  float body = 1.0 - smoothstep(-aaW, aaW, sdf);

  return mix(groutColor, tileColor, body);
}

// ─── Entry point ────────────────────────────────────────────────────────────
// UV calc en 2 modos:
//   - vPisoSize > 0  → MESH-LOCAL AUTO-FIT: tiles enteros encajan en el piso,
//     bordes limpios sin tiles partidos. Usado por pisos decorativos.
//   - vPisoSize == 0 → WORLD-SPACE: patrón infinito, tile fijo en metros.
//     Usado por SueloPrincipal3D y cualquier mesh sin aPisoSize attribute.
//
// Refs:
//   - https://iquilezles.org/articles/filtering/
//   - https://docs.unrealengine.com/5.5/en-US/world-aligned-textures-in-unreal-engine/
vec3 evaluateFloorPattern(vec2 worldXZ) {
  // Defensive: max(vec2(0.0001), ...) silencia X4008 del compilador HLSL
  // (D3D11 via ANGLE). uTileSize siempre es > 0 por floorMaterialSpecs
  // (rangos [0.22, 1.5]), pero el compilador no puede garantizarlo
  // estáticamente. Ref three.js issue 32692.
  vec2 idealTile = max(vec2(0.0001), uTileSize);
  vec2 uv;

  // Mesh-local auto-fit: cellCount = round(pisoSize / idealTile), clamped a >=1.
  // actualTile = pisoSize / cellCount → garantiza tiles enteros en bordes.
  // Distorsión visible solo si piso << idealTile (e.g. piso 0.3m con
  // idealTile 0.7m → tile estirado a 0.3m. Aceptable en pisos chicos donde
  // el detalle igual no se percibe).
  if (vPisoSize.x > 0.01 && vPisoSize.y > 0.01) {
    vec2 cellCount = max(vec2(1.0), floor(vPisoSize / idealTile + 0.5));
    vec2 actualTile = vPisoSize / cellCount;
    uv = (worldXZ - vPisoCenter) / actualTile;
  } else {
    uv = worldXZ / idealTile;
  }

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
  #elif defined(FLOOR_PATTERN_STYLIZED)
    return patternStylized(uv);
  #else
    return uPalette[0];
  #endif
}
`;
