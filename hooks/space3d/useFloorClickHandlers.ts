/**
 * @module hooks/space3d/useFloorClickHandlers
 *
 * Handlers de click sobre el suelo del espacio 3D:
 *   - onTapFloor (mobile, single tap)
 *   - onDoubleClickFloor (desktop, double-click)
 *
 * Ambos aplican la misma heurística: medir la distancia del avatar al punto
 * tocado y decidir si `teleport` (distancia larga) o `caminar` (distancia
 * corta). La lógica estaba duplicada inline en `VirtualSpace3D.tsx` dentro
 * del `<Scene>` — extraerla elimina ~35 líneas de JSX y permite reutilizar
 * el heurístico desde otros consumidores (p. ej. minimap, joystick).
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (hooks)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin lógica de negocio pesada: solo un cálculo de distancia + dispatch a
 * los setters de movimiento. Los setters vienen por props (inyección).
 */

import { useCallback } from 'react';
import type * as THREE from 'three';
import { hapticFeedback } from '@/lib/mobileDetect';

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface UseFloorClickHandlersParams {
  /**
   * Referencia al estado ECS del jugador actual. Se lee al evaluar el
   * click — si pasara como deps cambiaría la identidad del callback en
   * cada movimiento del avatar (60fps). Se acepta una función getter
   * para aislar la lectura.
   */
  getPlayerPosition: () => { x: number; z: number };

  /** Umbral de distancia a partir del cual se prefiere teleport. */
  teleportThreshold: number;

  /** Setter del target de movimiento caminado (mantener caminando). */
  setMoveTarget: (target: { x: number; z: number } | null) => void;

  /** Setter del target de teleport (teletransportar al instante). */
  setTeleportTarget: (target: { x: number; z: number } | null) => void;

  /**
   * Si el dispositivo es móvil. Controla si el hook expone
   * `onTapFloor` (solo mobile; desktop recibe `undefined`).
   */
  isMobile: boolean;
}

export interface UseFloorClickHandlersReturn {
  /**
   * Handler para single tap en mobile. `undefined` en desktop para que
   * `<Scene>` no lo registre (desktop solo usa double-click).
   */
  onTapFloor: ((point: THREE.Vector3) => void) | undefined;
  /** Handler para double-click en desktop (también activo en mobile). */
  onDoubleClickFloor: (point: THREE.Vector3) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFloorClickHandlers(
  params: UseFloorClickHandlersParams,
): UseFloorClickHandlersReturn {
  const {
    getPlayerPosition,
    teleportThreshold,
    setMoveTarget,
    setTeleportTarget,
    isMobile,
  } = params;

  const decidir = useCallback(
    (point: THREE.Vector3): 'caminar' | 'teleport' | 'ninguna' => {
      const player = getPlayerPosition();
      const dx = point.x - player.x;
      const dz = point.z - player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > teleportThreshold) return 'teleport';
      if (dist > 0.5) return 'caminar';
      return 'ninguna';
    },
    [getPlayerPosition, teleportThreshold],
  );

  const onDoubleClickFloor = useCallback(
    (point: THREE.Vector3) => {
      const accion = decidir(point);
      if (accion === 'teleport') {
        setMoveTarget(null);
        setTeleportTarget({ x: point.x, z: point.z });
      } else if (accion === 'caminar') {
        setTeleportTarget(null);
        setMoveTarget({ x: point.x, z: point.z });
      }
    },
    [decidir, setMoveTarget, setTeleportTarget],
  );

  const onTapFloor = useCallback(
    (point: THREE.Vector3) => {
      const accion = decidir(point);
      if (accion === 'teleport') {
        setMoveTarget(null);
        setTeleportTarget({ x: point.x, z: point.z });
      } else if (accion === 'caminar') {
        setTeleportTarget(null);
        setMoveTarget({ x: point.x, z: point.z });
      }
      // Mobile: haptic feedback tras decisión (ignora 'ninguna').
      if (accion !== 'ninguna') hapticFeedback('light');
    },
    [decidir, setMoveTarget, setTeleportTarget],
  );

  return {
    onTapFloor: isMobile ? onTapFloor : undefined,
    onDoubleClickFloor,
  };
}
