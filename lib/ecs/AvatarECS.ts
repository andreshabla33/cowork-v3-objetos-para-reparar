/**
 * PR-6: AvatarECS — Entity Component System para Avatares Remotos
 *
 * Reemplaza la arquitectura de "1 componente React por avatar" con un
 * store plano de datos + sistemas imperativos.
 *
 * Diseñado para 500+ avatares simultáneos:
 * - Datos en arrays planos (cache-friendly)
 * - 1 solo loop de actualización (no 500 useFrame)
 * - Sin React re-renders por movimiento
 * - Interpolación en un solo paso
 *
 * Clean Architecture:
 * - Domain: tipos puros, sin dependencia de Three.js ni React
 * - Infrastructure: Este archivo (gestión de datos brutos)
 * - Presentation: InstancedAvatarRenderer.tsx (renderizado)
 */

import type { AnimationState } from '@/components/avatar3d/shared';
import type { AvatarConfig } from '@/types';
import type { Avatar3DConfig } from '@/components/avatar3d/shared';
import type { AvatarDisposeCallback, IAvatarResourceDisposer } from '@/src/core/domain/ports/IAvatarResourceDisposer';
import { isPresencePositionSentinel } from '@/modules/realtime-room';

// ─── Tipos del ECS ──────────────────────────────────────────────────────────

export interface AvatarEntity {
  /** ID del usuario (clave primaria) */
  userId: string;

  // ── Position Component ─────────────────────────────────────────────────
  /** Posición actual interpolada (lo que se renderiza) */
  currentX: number;
  currentZ: number;
  /** Posición destino (del servidor/broadcast) */
  targetX: number;
  targetZ: number;

  // ── Animation Component ────────────────────────────────────────────────
  direction: string;
  isMoving: boolean;
  animState: AnimationState;
  /** Timestamp de la última actualización de animación (para throttling) */
  lastAnimUpdate: number;

  // ── LOD Component ──────────────────────────────────────────────────────
  /** Distancia al jugador local (calculada por CullingSystem) */
  distanceToCamera: number;
  /** Si está dentro del frustum */
  isVisible: boolean;
  /** LOD nivel actual */
  lodLevel: 'high' | 'mid' | 'low';
  /** Si debe renderizar sombras */
  castShadow: boolean;
  /** FPS de animación según distancia */
  animFPS: number;

  // ── Metadata Component ─────────────────────────────────────────────────
  name: string;
  status: string;
  empresaId: string | null;
  esFantasma: boolean;
  isCameraOn: boolean;
  avatarConfig: AvatarConfig | null;
  avatar3DConfig: Avatar3DConfig | null;
  profilePhoto: string | null;
  /** Timestamp de la última actualización recibida del servidor */
  lastServerUpdate: number;
  /** Si este avatar necesita teleport visual */
  teleportPhase: 'none' | 'out' | 'in';
  teleportOrigin: [number, number, number] | null;
  teleportDest: [number, number, number] | null;

  /**
   * True tras recibir el primer broadcast REAL de posición para esta entidad.
   * Permite saltar la entidad instantáneamente a su primera posición sin
   * animar el lerp desde el spawn default (500, 500) — evita "teleport"
   * visible del avatar al aparecer en escena.
   *
   * Patrón oficial net-code: "you need ≥2 snapshots to interpolate"
   * (Valve — Source Multiplayer Networking; Glenn Fiedler — Snapshot
   * Interpolation; Colyseus — Linear Interpolation tutorial).
   * Bug 2026-04-23.
   */
  hasReceivedFirstRealTarget: boolean;
}

// ─── Store ──────────────────────────────────────────────────────────────────

/**
 * Store singleton para todos los avatares remotos.
 * Accesible desde cualquier sistema sin pasar por React.
 */
class AvatarStore implements IAvatarResourceDisposer {
  private entities = new Map<string, AvatarEntity>();
  private _dirty = false;
  /** Incrementa con cada cambio para que React sepa cuándo re-leer */
  private _version = 0;

  /**
   * Registered disposal callbacks.
   * Infrastructure layer (renderers) registers callbacks to free GPU resources
   * when an avatar is removed from the ECS.
   *
   * Ref: Three.js docs — geometry.dispose(), material.dispose(), texture.dispose()
   *   must be called explicitly; JS GC does NOT free GPU buffers.
   */
  private _disposeCallbacks = new Set<AvatarDisposeCallback>();

  // ── Resource Disposal (IAvatarResourceDisposer) ────────────────────────

  /**
   * Register a callback to be invoked when any avatar is removed.
   * Returns an unsubscribe function for cleanup.
   *
   * @example
   * // In InstancedAvatarRenderer:
   * useEffect(() => {
   *   const unsub = avatarStore.onRemove((userId) => {
   *     disposeAvatarGPUResources(userId);
   *   });
   *   return unsub;
   * }, []);
   */
  onRemove(callback: AvatarDisposeCallback): () => void {
    this._disposeCallbacks.add(callback);
    return () => { this._disposeCallbacks.delete(callback); };
  }

  /** Fire all registered callbacks for a removed avatar */
  notifyRemoval(userId: string): void {
    for (const cb of this._disposeCallbacks) {
      try {
        cb(userId);
      } catch {
        // Never let a dispose callback crash the ECS
      }
    }
  }

  /** Remove all registered callbacks (scene unmount) */
  clearAll(): void {
    this._disposeCallbacks.clear();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  upsert(userId: string, partial: Partial<Omit<AvatarEntity, 'userId'>>): AvatarEntity {
    let entity = this.entities.get(userId);
    if (!entity) {
      entity = this.createDefault(userId);
      this.entities.set(userId, entity);
    }
    Object.assign(entity, partial);
    this._dirty = true;
    this._version++;
    return entity;
  }

  /**
   * Remove an avatar entity and notify all dispose callbacks.
   * This triggers GPU resource cleanup in the rendering layer.
   */
  remove(userId: string): boolean {
    const deleted = this.entities.delete(userId);
    if (deleted) {
      this.notifyRemoval(userId);
      this._dirty = true;
      this._version++;
    }
    return deleted;
  }

  get(userId: string): AvatarEntity | undefined {
    return this.entities.get(userId);
  }

  getAll(): AvatarEntity[] {
    return Array.from(this.entities.values());
  }

  getAllVisible(): AvatarEntity[] {
    return this.getAll().filter(e => e.isVisible);
  }

  get size(): number {
    return this.entities.size;
  }

  get version(): number {
    return this._version;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  clearDirty(): void {
    this._dirty = false;
  }

  clear(): void {
    // Notify disposal for every entity before clearing
    for (const userId of this.entities.keys()) {
      this.notifyRemoval(userId);
    }
    this.entities.clear();
    this._dirty = true;
    this._version++;
  }

  // ── Sync con lista de usuarios online ──────────────────────────────────

  /**
   * Sincroniza el store con la lista de usuarios online actual.
   * Remueve avatares que ya no están online.
   * Añade nuevos avatares que aparecieron.
   */
  syncWithOnlineUsers(
    onlineUsers: Array<{ id: string; name: string; x: number; y: number; direction?: string; status: string; empresa_id?: string | null; esFantasma?: boolean; isCameraOn?: boolean; avatarConfig?: AvatarConfig | null; avatar3DConfig?: Avatar3DConfig | null; profilePhoto?: string | null }>,
    currentUserId: string,
    scaleFactor: number = 16
  ): void {
    const onlineIds = new Set<string>();

    for (const user of onlineUsers) {
      if (user.id === currentUserId) continue;
      onlineIds.add(user.id);

      // FIX 2026-05-08: enforce the (0,0) sentinel contract on the
      // rendering bootstrap path. The presence layer (`usePresenceChannels`)
      // already preserves the sentinel verbatim via `extractPresencePosition`
      // (commit f763a23), but until now this hook materialized the sentinel
      // into an entity with `currentX = currentZ = 0` — the avatar rendered
      // at world origin until the first DataPacket arrived, at which point
      // `movementSystem.setTarget`'s `hasReceivedFirstRealTarget` snap
      // teleported it to the real position. That instantaneous swap is the
      // visible "remote avatar jumps from wrong position" regression.
      //
      // Sentinel sources reaching this hook:
      //   - `currentUser.x === 0 && y === 0` (auth-slice default,
      //     `store/slices/authSlice.ts:55-56`).
      //   - Privacy-off broadcaster (`usePresenceChannels.ts:439-440`
      //     blanks coords to 0).
      //   - Pre-hydration window between Supabase presence:join and the
      //     remote's first `forceRetrackAll`.
      //
      // Treatment:
      //   - **No entity yet → skip create.** The avatar appears only when
      //     the remote broadcasts non-sentinel coords (presence catch-up
      //     ~200ms-2s later, or ECS overlay after first DataPacket).
      //   - **Entity already exists → preserve `targetX/Z`.** A delayed
      //     presence sync that lands AFTER a DataPacket already populated
      //     the real target must NOT snap the entity back to origin.
      //
      // Refs:
      //   - `src/modules/realtime-room/domain/PresencePositionPolicy.ts`
      //     (single source of truth for the sentinel predicate).
      //   - `lib/ecs/AvatarSystems.ts:100-107` (`hasReceivedFirstRealTarget`
      //     snap that this fix complements).
      const presencePosition = { x: user.x, y: user.y };
      const isSentinel = isPresencePositionSentinel(presencePosition);

      if (!this.entities.has(user.id)) {
        if (isSentinel) {
          // Defer creation. The next sync that carries non-sentinel
          // coords will create the entity directly at the real spot.
          continue;
        }
        // Nuevo usuario: crear entidad
        this.upsert(user.id, {
          currentX: user.x / scaleFactor,
          currentZ: user.y / scaleFactor,
          targetX: user.x / scaleFactor,
          targetZ: user.y / scaleFactor,
          direction: user.direction || 'south',
          name: user.name,
          status: user.status,
          empresaId: user.empresa_id || null,
          esFantasma: !!user.esFantasma,
          isCameraOn: !!user.isCameraOn,
          avatarConfig: user.avatarConfig,
          avatar3DConfig: user.avatar3DConfig,
          profilePhoto: user.profilePhoto || null,
        });
      } else {
        // Usuario existente: actualizar metadata siempre. La posición
        // sólo se reescribe si la presence trae un valor REAL — el
        // sentinel (0,0) significa "no info disponible" y no debe
        // sobrescribir un targetX/Z ya hidratado por DataPacket.
        const positionUpdate = isSentinel
          ? {}
          : { targetX: user.x / scaleFactor, targetZ: user.y / scaleFactor };
        this.upsert(user.id, {
          ...positionUpdate,
          direction: user.direction || 'south',
          name: user.name,
          status: user.status,
          empresaId: user.empresa_id || null,
          esFantasma: !!user.esFantasma,
          isCameraOn: !!user.isCameraOn,
          avatarConfig: user.avatarConfig,
          avatar3DConfig: user.avatar3DConfig,
          profilePhoto: user.profilePhoto || null,
        });
      }
    }

    // Remover avatares que ya no están online
    for (const userId of this.entities.keys()) {
      if (!onlineIds.has(userId)) {
        this.remove(userId);
      }
    }
  }

  // ── Factory ─────────────────────────────────────────────────────────────

  private createDefault(userId: string): AvatarEntity {
    return {
      userId,
      currentX: 0, currentZ: 0,
      targetX: 0, targetZ: 0,
      direction: 'south',
      isMoving: false,
      animState: 'idle' as AnimationState,
      lastAnimUpdate: 0,
      distanceToCamera: Infinity,
      isVisible: true,
      lodLevel: 'high',
      castShadow: true,
      animFPS: 60,
      name: '',
      status: 'available',
      empresaId: null,
      esFantasma: false,
      isCameraOn: false,
      avatarConfig: null,
      avatar3DConfig: null,
      profilePhoto: null,
      lastServerUpdate: Date.now(),
      teleportPhase: 'none',
      teleportOrigin: null,
      teleportDest: null,
      hasReceivedFirstRealTarget: false,
    };
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────
export const avatarStore = new AvatarStore();
