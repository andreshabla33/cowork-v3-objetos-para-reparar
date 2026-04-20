/**
 * @module application/usecases/GenerarParedesPerimetralesUseCase
 *
 * Clean Architecture — Application layer (función pura, sin React/Three).
 *
 * Genera paredes perimetrales alrededor de un bounding box del terreno.
 * Reutiliza el tipo `ObjetoEspacio3D` del dominio para que las paredes
 * producidas sean consumidas por el mismo pipeline `BuiltinWallBatcher`
 * que las paredes persistentes — CERO duplicación de lógica de rendering.
 *
 * Patrón: "virtual entity" — las paredes NO se persisten en Supabase,
 * existen solo en el render. El usuario NO puede editarlas ni moverlas
 * (responsabilidad de la escena, no del usuario).
 *
 * Ref: docs oficiales (three.js + r3f) recomiendan delimitar el mundo
 * con geometría real para evitar que el jugador vea el "void". Aquí
 * implementamos ese delimitador de forma procedural.
 */

import type { ObjetoEspacio3D } from '@/src/core/domain/entities/espacio3d/ObjetoEspacio3D';
import type { PerimeterPolicy, PerimeterWallStyle } from '@/src/core/domain/entities/espacio3d/ScenePolicy';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Bounding box del terreno. Coordenadas en mundo (no en chunks). */
export interface TerrainBounds {
  sizeX: number;
  sizeZ: number;
  centerX: number;
  centerZ: number;
  /** Altura del tope del terreno (Y donde apoyar las paredes). */
  topY: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/**
 * Mapeo estilo → geometría built-in. Reutiliza los slugs del catálogo
 * `catalogo_objetos_3d` que BuiltinWallBatcher ya sabe renderizar.
 * Cambiar el mapeo aquí NO requiere cambios en Presentation ni Infra.
 */
const STYLE_TO_GEOMETRY: Record<PerimeterWallStyle, string> = {
  glass: 'wall-glass',
  brick: 'wall-brick',
  panel: 'wall-panel',
  'half-wall': 'wall-half',
  basic: 'box',
};

/** Profundidad fija de pared (consistente con catálogo). */
const WALL_DEPTH = 0.15;

/**
 * Prefijo para los IDs sintéticos de las paredes perimetrales. Permite
 * identificarlas en logs / debugging sin confundirlas con filas reales
 * de `espacio_objetos`. Nunca colisiona con UUIDs de Supabase (no son v4).
 */
const PERIMETER_ID_PREFIX = 'perimeter-wall';

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Genera el conjunto de paredes perimetrales para un terreno dado.
 *
 * Las paredes se crean como `ObjetoEspacio3D[]` virtuales (no persisten).
 * El consumidor las concatena a su lista de objetos builtin y las pasa al
 * `BuiltinWallBatcher` que las merge con el resto en el mismo draw call.
 *
 * @param bounds   Bounding box del terreno (world coordinates).
 * @param policy   Política de perímetro: estilo, altura, segment width.
 * @param espacioId ID del espacio — se propaga a las paredes para trazabilidad.
 * @returns        Array de paredes. Vacío si `policy.enabled === false`.
 */
export function generarParedesPerimetrales(
  bounds: TerrainBounds,
  policy: PerimeterPolicy,
  espacioId: string,
): ObjetoEspacio3D[] {
  if (!policy.enabled) return [];
  if (bounds.sizeX <= 0 || bounds.sizeZ <= 0) return [];

  const geometry = STYLE_TO_GEOMETRY[policy.style];
  const halfX = bounds.sizeX / 2 + policy.margin;
  const halfZ = bounds.sizeZ / 2 + policy.margin;

  const paredes: ObjetoEspacio3D[] = [];

  // ── Lado norte (+Z) y sur (-Z): paredes alineadas con eje X ──
  const segmentsAlongX = Math.max(1, Math.ceil(bounds.sizeX / policy.segmentWidth));
  const stepX = bounds.sizeX / segmentsAlongX;
  for (let i = 0; i < segmentsAlongX; i++) {
    const x = bounds.centerX - bounds.sizeX / 2 + stepX * (i + 0.5);
    // Norte (frente +Z): rotación 0 = pared mirando al centro (Y axis).
    paredes.push(
      crearParedVirtual({
        id: `${PERIMETER_ID_PREFIX}-n-${i}`,
        espacioId,
        geometry,
        posicion: { x, y: bounds.topY, z: bounds.centerZ + halfZ },
        rotacionY: Math.PI, // mirar hacia el centro del terreno (-Z)
        ancho: stepX,
        alto: policy.height,
      }),
    );
    // Sur (-Z): rotación π, espejo del norte.
    paredes.push(
      crearParedVirtual({
        id: `${PERIMETER_ID_PREFIX}-s-${i}`,
        espacioId,
        geometry,
        posicion: { x, y: bounds.topY, z: bounds.centerZ - halfZ },
        rotacionY: 0,
        ancho: stepX,
        alto: policy.height,
      }),
    );
  }

  // ── Lado este (+X) y oeste (-X): paredes rotadas 90° sobre eje Y ──
  const segmentsAlongZ = Math.max(1, Math.ceil(bounds.sizeZ / policy.segmentWidth));
  const stepZ = bounds.sizeZ / segmentsAlongZ;
  for (let i = 0; i < segmentsAlongZ; i++) {
    const z = bounds.centerZ - bounds.sizeZ / 2 + stepZ * (i + 0.5);
    // Este (+X): rotación -π/2 = mirar hacia -X (centro).
    paredes.push(
      crearParedVirtual({
        id: `${PERIMETER_ID_PREFIX}-e-${i}`,
        espacioId,
        geometry,
        posicion: { x: bounds.centerX + halfX, y: bounds.topY, z },
        rotacionY: -Math.PI / 2,
        ancho: stepZ,
        alto: policy.height,
      }),
    );
    // Oeste (-X): rotación π/2, espejo del este.
    paredes.push(
      crearParedVirtual({
        id: `${PERIMETER_ID_PREFIX}-w-${i}`,
        espacioId,
        geometry,
        posicion: { x: bounds.centerX - halfX, y: bounds.topY, z },
        rotacionY: Math.PI / 2,
        ancho: stepZ,
        alto: policy.height,
      }),
    );
  }

  return paredes;
}

// ─── Helpers privados ────────────────────────────────────────────────────────

interface ParedVirtualInput {
  id: string;
  espacioId: string;
  geometry: string;
  posicion: { x: number; y: number; z: number };
  rotacionY: number;
  ancho: number;
  alto: number;
}

/**
 * Construye una pared virtual con los campos obligatorios de `ObjetoEspacio3D`.
 * Los campos opcionales (interacción, sit, catálogo) se dejan en null porque
 * una pared perimetral no es interactuable ni sentable.
 */
function crearParedVirtual(input: ParedVirtualInput): ObjetoEspacio3D {
  return {
    id: input.id,
    espacio_id: input.espacioId,
    catalogo_id: null,
    modelo_url: 'builtin:perimeter',
    tipo: 'pared',
    nombre: null,
    posicion_x: input.posicion.x,
    posicion_y: input.posicion.y,
    posicion_z: input.posicion.z,
    rotacion_x: 0,
    rotacion_y: input.rotacionY,
    rotacion_z: 0,
    escala_x: 1,
    escala_y: 1,
    escala_z: 1,
    owner_id: null,
    creado_en: '',
    actualizado_en: '',
    built_in_geometry: input.geometry,
    built_in_color: null,
    ancho: input.ancho,
    alto: input.alto,
    profundidad: WALL_DEPTH,
    es_sentable: false,
    es_interactuable: false,
    es_reclamable: false,
    premium: false,
    catalogo: null,
  };
}

/**
 * Utility para consumidores que necesitan saber si un objeto es una pared
 * perimetral virtual (ej. para excluirlas de delete/edit/collision logic).
 */
export function esParedPerimetralVirtual(objeto: Pick<ObjetoEspacio3D, 'id'>): boolean {
  return typeof objeto.id === 'string' && objeto.id.startsWith(PERIMETER_ID_PREFIX);
}
