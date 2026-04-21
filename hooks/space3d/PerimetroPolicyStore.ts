/**
 * @module hooks/space3d/PerimetroPolicyStore
 *
 * External store que encapsula la suscripción a Supabase Realtime de la
 * policy del perímetro. Diseñado para ser consumido vía `useSyncExternalStore`
 * (React 18+) en el hook `useConfiguracionPerimetro`.
 *
 * Why useSyncExternalStore en vez de useState+useEffect:
 *   - Evita *tearing* bajo concurrent rendering: dos componentes que lean
 *     el mismo store en la misma transición ven SIEMPRE el mismo snapshot.
 *   - El snapshot es síncrono: React decide cuándo leerlo, sin race
 *     contra effects que aún no corrieron.
 *   - Permite a varios componentes compartir UNA suscripción Realtime
 *     (cuenta de listeners → conecta/desconecta automáticamente).
 *
 * Ref oficial: https://react.dev/reference/react/useSyncExternalStore
 *   "The store should hold the data and the getSnapshot function should
 *    return that data. Returning a new object on every call will cause
 *    infinite re-renders."  → por eso mantenemos `state` por referencia.
 */

import {
  DEFAULT_PERIMETER_POLICY,
  type PerimeterPolicy,
  type PerimeterPolicyError,
  type Result,
} from '@/src/core/domain/entities/espacio3d/PerimeterPolicy';
import type {
  ObtenerConfiguracionPerimetroUseCase,
  ActualizarConfiguracionPerimetroUseCase,
  SuscribirConfiguracionPerimetroUseCase,
} from '@/src/core/application/usecases/ConfiguracionPerimetroUseCases';
import { logger } from '@/lib/logger';

const log = logger.child('PerimetroPolicyStore');

// ─── Snapshot inmutable ──────────────────────────────────────────────────────
// Una sola entidad observable. La regla de useSyncExternalStore exige que
// `getSnapshot` retorne la misma referencia si nada cambió.

export interface PerimetroPolicySnapshot {
  readonly policy: PerimeterPolicy;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL_SNAPSHOT: PerimetroPolicySnapshot = Object.freeze({
  policy: DEFAULT_PERIMETER_POLICY,
  loading: true,
  error: null,
});

const FALLBACK_SNAPSHOT: PerimetroPolicySnapshot = Object.freeze({
  policy: DEFAULT_PERIMETER_POLICY,
  loading: false,
  error: null,
});

// ─── Store ───────────────────────────────────────────────────────────────────

export class PerimetroPolicyStore {
  private snapshot: PerimetroPolicySnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private unsubscribeRealtime: (() => void) | null = null;
  private connected = false;

  constructor(
    private readonly espacioId: string,
    private readonly obtenerUC: ObtenerConfiguracionPerimetroUseCase,
    private readonly actualizarUC: ActualizarConfiguracionPerimetroUseCase,
    private readonly suscribirUC: SuscribirConfiguracionPerimetroUseCase,
  ) {}

  /**
   * Bound — debe mantener identidad de referencia para que React no
   * re-suscriba en cada render.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  };

  /**
   * Bound — useSyncExternalStore lo invoca en cada render y compara con
   * Object.is. SIEMPRE debemos devolver la misma referencia hasta que el
   * estado cambie efectivamente.
   */
  getSnapshot = (): PerimetroPolicySnapshot => this.snapshot;

  /** SSR: retornamos un snapshot estable libre de I/O. */
  getServerSnapshot = (): PerimetroPolicySnapshot => FALLBACK_SNAPSHOT;

  /**
   * Persiste la policy. La validación vive en el use case (Domain factory).
   * El snapshot se actualiza optimistamente; el eco realtime confirmará.
   */
  async actualizar(
    nueva: PerimeterPolicy,
  ): Promise<Result<PerimeterPolicy, PerimeterPolicyError>> {
    try {
      const result = await this.actualizarUC.ejecutar(this.espacioId, nueva);
      if (result.ok) {
        this.setSnapshot({ policy: result.value, loading: false, error: null });
      } else {
        this.setSnapshot({
          ...this.snapshot,
          error: `Validación falló: ${result.error.code}`,
        });
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Update failed', { espacioId: this.espacioId, error: msg });
      this.setSnapshot({ ...this.snapshot, error: msg });
      return { ok: false, error: { code: 'INVALID_STYLE', received: msg } };
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private connect(): void {
    if (this.connected) return;
    this.connected = true;

    this.obtenerUC
      .ejecutar(this.espacioId)
      .then((policy) => {
        if (!this.connected) return;
        this.setSnapshot({ policy, loading: false, error: null });
      })
      .catch((err) => {
        if (!this.connected) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Initial load failed', { espacioId: this.espacioId, error: msg });
        this.setSnapshot({ ...this.snapshot, loading: false, error: msg });
      });

    this.unsubscribeRealtime = this.suscribirUC.ejecutar(this.espacioId, (policy) => {
      this.setSnapshot({ policy, loading: false, error: null });
    });
  }

  private disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
      this.unsubscribeRealtime = null;
    }
    // Reseteamos a INITIAL para que un re-mount muestre loading y refetch.
    this.snapshot = INITIAL_SNAPSHOT;
  }

  private setSnapshot(next: PerimetroPolicySnapshot): void {
    // Object.is gate evita emisiones espurias si el use case devuelve la
    // misma policy (ej. realtime echo idéntico al optimistic update).
    if (
      next.policy === this.snapshot.policy &&
      next.loading === this.snapshot.loading &&
      next.error === this.snapshot.error
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }
}
