/**
 * @module domain/ports/INotificationBus
 *
 * Puerto (abstracción de Domain) para emitir notificaciones efímeras (toasts)
 * desde cualquier capa sin conocer la implementación concreta (event-emitter
 * global, React context, sistema de notificaciones del SO, etc.).
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Domain
 * ════════════════════════════════════════════════════════════════
 *
 * Uso típico:
 *   services.notifications.emit({ mensaje: 'Objeto copiado', variante: 'info' });
 *
 * Lo implementa la capa de Infrastructure (`ToastEmitterAdapter`), que
 * delega en el event-emitter global actual. Si mañana se reemplaza por un
 * sistema distinto, solo se cambia el adapter.
 */

/**
 * Variante visual/semántica de la notificación. La Presentation elige
 * los estilos concretos (colores, iconos) a partir de esta clasificación.
 */
export type NotificacionVariante =
  | 'default'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export interface NotificacionEmitida {
  /** Texto visible para el usuario. */
  mensaje: string;
  /** Variante visual. Default: 'default'. */
  variante?: NotificacionVariante;
  /** Tiempo en ms antes de auto-descartar. Default: decide el adapter. */
  duracionMs?: number;
}

export interface INotificationBus {
  /**
   * Emite una notificación efímera. No bloquea, no retorna nada: es
   * fire-and-forget. Los suscriptores del adapter la renderizan.
   */
  emit(notificacion: NotificacionEmitida): void;
}
