/**
 * @module application/ApplicationServicesContainer
 *
 * Contenedor de inyección de dependencias (DI) para los Use Cases de la
 * capa Application. Instancia lazy-singleton — los use cases y sus adapters
 * se crean la primera vez que se piden y se reutilizan para toda la vida
 * del proceso (una sola instancia por window).
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Composition root
 * ════════════════════════════════════════════════════════════════
 *
 * Este contenedor es el **único** lugar donde se conectan capas:
 * Presentation (hooks, componentes) pide use cases a través del container
 * y **nunca** importa un adapter de Infrastructure. Si mañana reemplazas
 * `RepositorioPlantillaZonaSupabaseAdapter` por una versión IndexedDB o
 * un fake para tests, cambias solo el container.
 *
 * Patrón documentado en React docs sobre DI:
 *   https://react.dev/learn/passing-data-deeply-with-context (avoid context
 *   for singletons that don't change; use module-level state instead).
 */

import { InteraccionObjetoUseCase } from './usecases/InteraccionObjetoUseCase';
import { ToastEmitterAdapter } from '../infrastructure/adapters/ToastEmitterAdapter';
import { WebAudioSoundAdapter } from '../infrastructure/adapters/WebAudioSoundAdapter';
import type { INotificationBus } from '../domain/ports/INotificationBus';
import type { ISoundBus } from '../domain/ports/ISoundBus';
import type { INavigationService } from '../domain/ports/INavigationService';

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface ApplicationServices {
  readonly interaccionObjeto: InteraccionObjetoUseCase;
  /** Port para emitir notificaciones (toasts) sin conocer la implementación. */
  readonly notifications: INotificationBus;
  /** Port para reproducir efectos de sonido del espacio 3D. */
  readonly sounds: ISoundBus;
  /**
   * Resolver lazy del navigation service (pathfinding/obstacle avoidance).
   *
   * Retorna Promise para que el bundler extraiga el adapter (recast WASM
   * ~750 KB raw) a un chunk separado que se carga **solo** al entrar al
   * espacio 3D. Si se exportara como instancia sync, vite incluiría
   * recast en el chunk del container → impacto en initial load.
   *
   * Consumir vía `useNavigation` hook — nunca importar el adapter
   * concreto directamente desde Module/Presentation.
   */
  resolveNavigationService(): Promise<INavigationService>;
}

// ─── Container ────────────────────────────────────────────────────────────────

class ApplicationServicesContainerImpl implements ApplicationServices {
  // Getters con caché interna. La primera lectura construye la cadena de
  // dependencias; las subsecuentes devuelven la misma instancia.
  private _interaccionObjeto: InteraccionObjetoUseCase | null = null;

  // Adapters compartidos (singleton a nivel de container para evitar
  // duplicar conexiones a Supabase / estado de caché):
  private _notifications: INotificationBus | null = null;
  private _sounds: ISoundBus | null = null;
  private _navigation: INavigationService | null = null;

  get interaccionObjeto(): InteraccionObjetoUseCase {
    if (!this._interaccionObjeto) {
      this._interaccionObjeto = new InteraccionObjetoUseCase();
    }
    return this._interaccionObjeto;
  }

  get notifications(): INotificationBus {
    if (!this._notifications) {
      this._notifications = new ToastEmitterAdapter();
    }
    return this._notifications;
  }

  get sounds(): ISoundBus {
    if (!this._sounds) {
      this._sounds = new WebAudioSoundAdapter();
    }
    return this._sounds;
  }

  async resolveNavigationService(): Promise<INavigationService> {
    if (!this._navigation) {
      // Dynamic import: vite extrae el adapter (recast WASM) a un chunk
      // separado que solo descarga al entrar al espacio 3D. El initial
      // load del workspace queda sin el peso del WASM.
      const { RecastNavigationAdapter } = await import(
        '../infrastructure/r3f/navigation/RecastNavigationAdapter'
      );
      this._navigation = new RecastNavigationAdapter();
    }
    return this._navigation;
  }

}

// ─── Singleton global ─────────────────────────────────────────────────────────

let instance: ApplicationServicesContainerImpl | null = null;

/**
 * Retorna la instancia singleton del contenedor de aplicación.
 * Cualquier parte del código (React o no) puede llamar a esta función;
 * la instancia se crea lazy al primer acceso.
 */
export function getApplicationServices(): ApplicationServices {
  if (!instance) {
    instance = new ApplicationServicesContainerImpl();
  }
  return instance;
}

/**
 * Limpia la instancia singleton. Útil en tests que quieren aislar
 * la construcción del grafo de dependencias.
 */
export function resetApplicationServices(): void {
  instance = null;
}
