/**
 * @module application/usecases/InteraccionObjetoUseCase
 *
 * Traduce una interacción con un objeto 3D del espacio (sit / teleport /
 * display / use / desconocido) en un **plan de acciones** que la capa de
 * presentación ejecuta. El use case es **puro** (sin side-effects): no
 * toca el DOM, ni el store, ni navigator, ni APIs de audio — solo calcula
 * qué debería pasar.
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Application layer
 * ════════════════════════════════════════════════════════════════
 *
 * El patrón "plan de acciones" preserva el principio dependency-inversion:
 * la Application no conoce al framework React ni a los adapters concretos.
 * La Presentation (`VirtualSpace3D`) recibe el plan y ejecuta cada acción
 * contra sus adapters ya inyectados (`setMoveTarget`, `addNotification`,
 * `grantXP`, `playObjectInteractionSound`, `hapticFeedback`).
 *
 * Testabilidad: el use case se puede probar sin montar un `<Canvas>`,
 * sin conectar a LiveKit ni a Supabase.
 *
 * @see src/core/domain/entities/espacio3d/InteraccionObjetoEntity.ts
 */

import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { AsientoRuntime3D } from '@/components/space3d/asientosRuntime';
import {
  normalizarInteraccionConfig,
  resolverDestinoTeleport,
  resolverDisplayObjeto,
  resolverUseObjeto,
  type DisplayNormalizado3D,
  type UseNormalizado3D,
} from '@/src/core/domain/entities/espacio3d';

// ─── Tipos del plan de acciones ───────────────────────────────────────────────

export type HapticIntensidad = 'light' | 'medium';
export type NotificacionNivel = 'info' | 'success' | 'warning' | 'error';

export type InteraccionObjetoAccion =
  /** Caminar hacia un destino en coordenadas mundo (no divididas por 16). */
  | { tipo: 'caminar'; destino: { x: number; z: number } }
  /** Teletransportar a un destino (instant). */
  | { tipo: 'teleport'; destino: { x: number; z: number } }
  /** Activar un destino visual (panel / ruta interna). */
  | { tipo: 'destinoVisual'; config: DisplayNormalizado3D | UseNormalizado3D; fallbackMensaje: string | null }
  /** Otorgar XP por una acción gamificada. */
  | { tipo: 'otorgarXP'; accion: string; cooldownMs: number }
  /** Emitir una notificación en el HUD. */
  | { tipo: 'notificar'; mensaje: string; nivel: NotificacionNivel }
  /** Feedback háptico (solo móvil). */
  | { tipo: 'haptic'; intensidad: HapticIntensidad }
  /** Reproducir un efecto de sonido. */
  | { tipo: 'sonido'; clip: 'object_interaction' };

export interface InteraccionObjetoPlan {
  acciones: InteraccionObjetoAccion[];
  /**
   * Si la interacción aborta antes de ejecutar nada (ej. asiento ocupado),
   * el motivo queda aquí para telemetría; `acciones` contendrá las
   * notificaciones/feedback que la presentación deba aplicar.
   */
  abortado?: { razon: 'asiento_ocupado' | 'tipo_desconocido' };
}

export interface InteraccionObjetoInput {
  /** Objeto 3D con el que se interactuó. */
  objeto: EspacioObjeto;
  /** Asiento runtime (solo relevante para `tipo = 'sit'`). */
  asiento: AsientoRuntime3D | null;
  /**
   * Posición actual del jugador **en coordenadas mundo** (ya dividida
   * por 16 si venía del ECS). El use case la usa para medir la distancia
   * al destino y decidir entre caminar vs. teletransportar.
   */
  posicionJugador: { x: number; z: number };
  /**
   * Distancia a partir de la cual se prefiere teletransportar en vez de
   * caminar. Típicamente la constante `TELEPORT_DISTANCE` del módulo.
   */
  teleportThreshold: number;
  /** ID del usuario actual (para detectar asientos ocupados por sí mismo). */
  usuarioActualId: string | null;
  /**
   * ID del usuario que ocupa el asiento objetivo. `null` si no hay.
   * (La presentación ya resolvió esto antes de invocar el use case.)
   */
  asientoOcupadoPorUsuarioId?: string | null;
  /**
   * Tabla de XP conocidas (`XP_POR_ACCION`). Se usa como guard para no
   * emitir una acción `otorgarXP` con una clave desconocida.
   */
  xpAccionesConocidas: Record<string, unknown>;
}

// ─── Use Case ─────────────────────────────────────────────────────────────────

export class InteraccionObjetoUseCase {
  execute(input: InteraccionObjetoInput): InteraccionObjetoPlan {
    const tipo = (input.objeto.interaccion_tipo || '').trim().toLowerCase();
    const config = normalizarInteraccionConfig(input.objeto.interaccion_config);

    // ── sit ──────────────────────────────────────────────────────────────────
    if (tipo === 'sit' && input.asiento) {
      const asientoId = input.asiento.objetoId;
      if (
        asientoId &&
        input.asientoOcupadoPorUsuarioId &&
        input.asientoOcupadoPorUsuarioId !== input.usuarioActualId
      ) {
        return {
          abortado: { razon: 'asiento_ocupado' },
          acciones: [
            { tipo: 'notificar', mensaje: 'Ese asiento está ocupado actualmente.', nivel: 'info' },
          ],
        };
      }

      const destino = { x: input.asiento.posicion.x, z: input.asiento.posicion.z };
      const distancia = distanciaEntre(destino, input.posicionJugador);
      const movimiento =
        distancia > input.teleportThreshold ? 'teleport' : 'caminar';

      return {
        acciones: [
          { tipo: 'sonido', clip: 'object_interaction' },
          { tipo: movimiento, destino },
          { tipo: 'haptic', intensidad: 'light' },
        ],
      };
    }

    // ── teleport ─────────────────────────────────────────────────────────────
    if (tipo === 'teleport') {
      const destinoResuelto = resolverDestinoTeleport(input.objeto, config);
      const distancia = distanciaEntre(
        { x: destinoResuelto.x, z: destinoResuelto.z },
        input.posicionJugador,
      );

      // El modo explícito del config gana; si no, la distancia decide.
      let movimiento: 'caminar' | 'teleport';
      if (destinoResuelto.modo === 'teleport') movimiento = 'teleport';
      else if (destinoResuelto.modo === 'caminar') movimiento = 'caminar';
      else movimiento = distancia > input.teleportThreshold ? 'teleport' : 'caminar';

      return {
        acciones: [
          { tipo: 'sonido', clip: 'object_interaction' },
          { tipo: movimiento, destino: { x: destinoResuelto.x, z: destinoResuelto.z } },
          { tipo: 'haptic', intensidad: 'medium' },
        ],
      };
    }

    // ── display ──────────────────────────────────────────────────────────────
    if (tipo === 'display') {
      const displayConfig = resolverDisplayObjeto(config);
      const fallbackMensaje =
        input.objeto.interaccion_label ||
        (input.objeto.nombre ? `Mostrando ${input.objeto.nombre}.` : null);

      return {
        acciones: [
          { tipo: 'sonido', clip: 'object_interaction' },
          { tipo: 'destinoVisual', config: displayConfig, fallbackMensaje },
          { tipo: 'haptic', intensidad: 'light' },
        ],
      };
    }

    // ── use ──────────────────────────────────────────────────────────────────
    if (tipo === 'use') {
      const useConfig = resolverUseObjeto(config);
      const fallbackMensaje =
        input.objeto.interaccion_label ||
        (input.objeto.nombre ? `Usaste ${input.objeto.nombre}.` : null);

      const acciones: InteraccionObjetoAccion[] = [
        { tipo: 'sonido', clip: 'object_interaction' },
        { tipo: 'destinoVisual', config: useConfig, fallbackMensaje },
      ];

      if (useConfig.xpAccion && useConfig.xpAccion in input.xpAccionesConocidas) {
        acciones.push({
          tipo: 'otorgarXP',
          accion: useConfig.xpAccion,
          cooldownMs: useConfig.cooldownMs || 10000,
        });
      }

      acciones.push({ tipo: 'haptic', intensidad: 'medium' });

      return { acciones };
    }

    // ── desconocido / ausente ────────────────────────────────────────────────
    if (tipo) {
      return {
        abortado: { razon: 'tipo_desconocido' },
        acciones: [
          {
            tipo: 'notificar',
            mensaje:
              input.objeto.interaccion_label ||
              `Interacción ${tipo} aún no soportada por el dispatcher.`,
            nivel: 'info',
          },
        ],
      };
    }

    // Sin `interaccion_tipo`: no-op.
    return { acciones: [] };
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function distanciaEntre(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
