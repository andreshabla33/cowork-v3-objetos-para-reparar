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

      if (!this.entities.has(user.id)) {
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
        // Usuario existente: actualizar metadata (no posición, eso viene de broadcast)
        this.upsert(user.id, {
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
    };
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────
export const avatarStore = new AvatarStore();
