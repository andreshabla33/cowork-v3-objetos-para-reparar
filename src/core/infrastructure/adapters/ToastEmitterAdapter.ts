/**
 * @module infrastructure/adapters/ToastEmitterAdapter
 *
 * Adapter que implementa `INotificationBus` delegando en el event-emitter
 * global `toastEmitter` definido en `components/3d/PlacementHUD.tsx`.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Infrastructure
 * ════════════════════════════════════════════════════════════════
 *
 * Envuelve la implementación concreta actual sin obligar a migrar al
 * suscriptor (`ToastContainer`) — el adapter traduce el contrato neutral
 * del port a la forma específica del emitter (`{ message, variant, ... }`).
 *
 * Si en el futuro se reemplaza `toastEmitter` por un sistema distinto
 * (React Context + reducer, sistema nativo del SO, Sentry toast, etc.),
 * solo se cambia esta clase sin tocar a los consumidores de Presentation.
 *
 * Nota: importamos `toastEmitter` desde el barrel de PlacementHUD. Esto
 * mantiene la ubicación actual del emitter y su suscriptor (ToastContainer)
 * en el mismo módulo, evitando una migración masiva. Los nuevos
 * consumidores deben usar este adapter vía el container.
 */

import { toastEmitter } from '@/components/3d/PlacementHUD';
import type {
  INotificationBus,
  NotificacionEmitida,
  NotificacionVariante,
} from '../../domain/ports/INotificationBus';

// ─── Mapa Domain → Infra ──────────────────────────────────────────────────────

// Variantes que acepta el emitter actual.
type ToastEmitterVariant = 'default' | 'success' | 'error' | 'info' | 'warning';

const VARIANTE_DOMAIN_TO_EMITTER: Record<NotificacionVariante, ToastEmitterVariant> = {
  default: 'default',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class ToastEmitterAdapter implements INotificationBus {
  emit(notificacion: NotificacionEmitida): void {
    const variante = notificacion.variante ?? 'default';
    toastEmitter.emit({
      message: notificacion.mensaje,
      variant: VARIANTE_DOMAIN_TO_EMITTER[variante],
      ...(notificacion.duracionMs !== undefined ? { durationMs: notificacion.duracionMs } : {}),
    });
  }
}
