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

import { AplicarPlantillaZonaUseCase } from './usecases/AplicarPlantillaZonaUseCase';
import { EliminarPlantillaZonaUseCase } from './usecases/EliminarPlantillaZonaUseCase';
import { InteraccionObjetoUseCase } from './usecases/InteraccionObjetoUseCase';
import { InyectorPlantillaZona } from '../infrastructure/adapters/InyectorPlantillaZonaAdapter';
import { RepositorioPlantillaZonaSupabase } from '../infrastructure/adapters/RepositorioPlantillaZonaSupabaseAdapter';
import { ToastEmitterAdapter } from '../infrastructure/adapters/ToastEmitterAdapter';
import { WebAudioSoundAdapter } from '../infrastructure/adapters/WebAudioSoundAdapter';
import type { INotificationBus } from '../domain/ports/INotificationBus';
import type { ISoundBus } from '../domain/ports/ISoundBus';

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface ApplicationServices {
  readonly aplicarPlantillaZona: AplicarPlantillaZonaUseCase;
  readonly eliminarPlantillaZona: EliminarPlantillaZonaUseCase;
  readonly interaccionObjeto: InteraccionObjetoUseCase;
  /** Port para emitir notificaciones (toasts) sin conocer la implementación. */
  readonly notifications: INotificationBus;
  /** Port para reproducir efectos de sonido del espacio 3D. */
  readonly sounds: ISoundBus;
}

// ─── Container ────────────────────────────────────────────────────────────────

class ApplicationServicesContainerImpl implements ApplicationServices {
  // Getters con caché interna. La primera lectura construye la cadena de
  // dependencias; las subsecuentes devuelven la misma instancia.
  private _aplicarPlantillaZona: AplicarPlantillaZonaUseCase | null = null;
  private _eliminarPlantillaZona: EliminarPlantillaZonaUseCase | null = null;
  private _interaccionObjeto: InteraccionObjetoUseCase | null = null;

  // Adapters compartidos (singleton a nivel de container para evitar
  // duplicar conexiones a Supabase / estado de caché):
  private _repositorioPlantilla: RepositorioPlantillaZonaSupabase | null = null;
  private _inyectorPlantilla: InyectorPlantillaZona | null = null;
  private _notifications: INotificationBus | null = null;
  private _sounds: ISoundBus | null = null;

  get aplicarPlantillaZona(): AplicarPlantillaZonaUseCase {
    if (!this._aplicarPlantillaZona) {
      this._aplicarPlantillaZona = new AplicarPlantillaZonaUseCase(
        this.repositorioPlantilla,
        this.inyectorPlantilla,
      );
    }
    return this._aplicarPlantillaZona;
  }

  get eliminarPlantillaZona(): EliminarPlantillaZonaUseCase {
    if (!this._eliminarPlantillaZona) {
      this._eliminarPlantillaZona = new EliminarPlantillaZonaUseCase(
        this.repositorioPlantilla,
      );
    }
    return this._eliminarPlantillaZona;
  }

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

  private get repositorioPlantilla(): RepositorioPlantillaZonaSupabase {
    if (!this._repositorioPlantilla) {
      this._repositorioPlantilla = new RepositorioPlantillaZonaSupabase();
    }
    return this._repositorioPlantilla;
  }

  private get inyectorPlantilla(): InyectorPlantillaZona {
    if (!this._inyectorPlantilla) {
      this._inyectorPlantilla = new InyectorPlantillaZona();
    }
    return this._inyectorPlantilla;
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
