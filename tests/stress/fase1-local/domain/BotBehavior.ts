/**
 * @module tests/stress/fase1-local/domain/BotBehavior
 *
 * Value objects puros que describen comportamiento de un bot de stress test.
 * Sin dependencias externas — Domain layer.
 *
 * Los bots se inyectan al ECS del espacio 3D para medir el costo del
 * renderer con N avatares móviles, sin involucrar red (LiveKit ni Supabase).
 */

/** Patrón de movimiento del bot. Define cómo se actualiza su target cada tick. */
export type BotMovementPattern =
  | { readonly kind: 'random_walk'; readonly stepRangeWorld: number }
  | { readonly kind: 'circle_orbit'; readonly radiusWorld: number; readonly angularVelocity: number }
  | { readonly kind: 'stationary' };

/** Configuración completa de un bot. */
export interface BotSpec {
  /** Identidad sintética — debe prefijarse con `__stress_bot_` para no colisionar. */
  readonly userId: string;
  /** Nombre visible (p. ej. "Bot 01"). */
  readonly name: string;
  /** Posición inicial en world coords (mismo sistema que AvatarEntity.currentX/Z). */
  readonly initialPosition: { readonly x: number; readonly z: number };
  /** Patrón de movimiento a aplicar cada tick. */
  readonly movement: BotMovementPattern;
  /**
   * URL del GLB de avatar a usar. Si se provee, el bot renderiza como avatar
   * real. Si es null, usa el fallback del sistema (no renderiza mesh).
   */
  readonly avatarModelUrl: string | null;
  /**
   * Si true, el bot expone una burbuja con VideoTexture (mp4 en loop) que
   * simula el costo GPU de un stream WebRTC entrante. Clave para reproducir
   * el escenario real con 50 cámaras activas.
   */
  readonly withFakeVideoBubble: boolean;
}

/** Bounds del mundo para clampear movimiento aleatorio. */
export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Factory puro para generar N bots con distribución espacial inicial razonable.
 * La Application layer consumir esto + el ECS adapter para materializarlos.
 */
export function generateBotSpecs(params: {
  count: number;
  bounds: WorldBounds;
  avatarModelUrls: readonly string[];
  withFakeVideoBubbleRatio: number; // 0..1 — porcentaje de bots con cámara simulada
  /** Offset inicial del índice (para continuar numeración en ramp-ups). Default 0. */
  indexOffset?: number;
}): readonly BotSpec[] {
  const { count, bounds, avatarModelUrls, withFakeVideoBubbleRatio, indexOffset = 0 } = params;
  const specs: BotSpec[] = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  for (let localI = 0; localI < count; localI++) {
    const i = localI + indexOffset;
    const modelUrl = avatarModelUrls.length > 0
      ? avatarModelUrls[i % avatarModelUrls.length]
      : null;
    specs.push({
      userId: `__stress_bot_${String(i).padStart(3, '0')}`,
      name: `Bot ${String(i + 1).padStart(2, '0')}`,
      initialPosition: {
        x: bounds.minX + (spanX * ((i * 37) % 100)) / 100, // pseudo-random determinístico
        z: bounds.minZ + (spanZ * ((i * 53) % 100)) / 100,
      },
      movement: {
        kind: 'random_walk',
        stepRangeWorld: 4, // ~64 pixels world / tick
      },
      avatarModelUrl: modelUrl,
      withFakeVideoBubble: ((localI) / Math.max(1, count)) < withFakeVideoBubbleRatio,
    });
  }
  return specs;
}
