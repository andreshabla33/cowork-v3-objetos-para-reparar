/**
 * @module space3d/hooks/usePlantillaZonaDrag
 *
 * Encapsula el drag de una "plantilla de zona" (pre-fab que el admin
 * arrastra desde el panel hasta colocarla dentro de su zona-empresa).
 * Restringe el centro de la plantilla al bbox de la zona objetivo y
 * confirma al soltar. Snap a la grilla de 0.5m.
 *
 * Extraído de `Scene3D.tsx` (ITEM 15 P1-07).
 *
 * Clean Architecture — Presentation. Recibe callbacks (`onActualizar...`,
 * `onConfirmar...`) inyectados por el componente padre que conoce los
 * use cases / store mutations. No accede a Supabase directamente.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { ZonaEmpresa } from '@/types';
import type { PlantillaZonaEnColocacion } from '@/modules/_state/slices';
import { ajustarAGrilla, obtenerPuntoSueloMundo } from '@/modules/space3d/presentation/scene/sceneHelpers';

export interface UsePlantillaZonaDragParams {
  /** Plantilla activa en colocación (null si no hay ninguna). */
  plantillaZonaEnColocacion: PlantillaZonaEnColocacion | null;
  /** Lista de zonas-empresa donde se puede colocar. */
  zonasEmpresa: ZonaEmpresa[];
  /** Callback de update incremental durante drag (admin mueve el dedo). */
  onActualizarPlantillaZonaEnColocacion?: (x: number, z: number) => void;
  /** Callback de confirmación al soltar (admin acepta posición). */
  onConfirmarPlantillaZonaEnColocacion?: () => void;
}

export interface UsePlantillaZonaDragReturn {
  /** `true` mientras el puntero está down sobre la plantilla. */
  isDraggingPlantillaZona: boolean;
  /** Zona-empresa destino resuelta a partir del `zonaId` de la plantilla. */
  zonaPlantillaObjetivo: ZonaEmpresa | null;
  /**
   * Aplica el clamp al bbox de la zona destino + snap a grilla y dispara
   * `onActualizar...`. Útil para que el handler externo `handlePointerMove`
   * llame a este durante el drag.
   */
  actualizarPlantillaZonaRestringida: (point: THREE.Vector3 | null) => void;
  /** Handler para `<mesh onPointerDown>` del catch-plane de drawing. */
  handlePlantillaPointerDown: (e: any) => void;
  /** Handler para `<mesh onPointerUp>` — confirma colocación al soltar. */
  handlePlantillaPointerUp: (e: any) => void;
}

export function usePlantillaZonaDrag(
  params: UsePlantillaZonaDragParams,
): UsePlantillaZonaDragReturn {
  const {
    plantillaZonaEnColocacion,
    zonasEmpresa,
    onActualizarPlantillaZonaEnColocacion,
    onConfirmarPlantillaZonaEnColocacion,
  } = params;

  const { gl } = useThree();
  const [isDraggingPlantillaZona, setIsDraggingPlantillaZona] = useState(false);
  const plantillaZonaPointerIdRef = useRef<number | null>(null);

  const zonaPlantillaObjetivo = useMemo(() => {
    if (!plantillaZonaEnColocacion) return null;
    return zonasEmpresa.find((zona) => zona.id === plantillaZonaEnColocacion.zonaId) || null;
  }, [plantillaZonaEnColocacion, zonasEmpresa]);

  const actualizarPlantillaZonaRestringida = useCallback((point: THREE.Vector3 | null) => {
    if (!point || !plantillaZonaEnColocacion || !zonaPlantillaObjetivo || !onActualizarPlantillaZonaEnColocacion) {
      return;
    }

    const x = ajustarAGrilla(point.x);
    const z = ajustarAGrilla(point.z);
    const centroZonaX = Number(zonaPlantillaObjetivo.posicion_x) / 16;
    const centroZonaZ = Number(zonaPlantillaObjetivo.posicion_y) / 16;
    const anchoZona = Math.max(Number(zonaPlantillaObjetivo.ancho) / 16, plantillaZonaEnColocacion.anchoMetros);
    const altoZona = Math.max(Number(zonaPlantillaObjetivo.alto) / 16, plantillaZonaEnColocacion.altoMetros);
    const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
    const minX = centroZonaX - Math.max((anchoZona - plantillaZonaEnColocacion.anchoMetros) / 2, 0);
    const maxX = centroZonaX + Math.max((anchoZona - plantillaZonaEnColocacion.anchoMetros) / 2, 0);
    const minZ = centroZonaZ - Math.max((altoZona - plantillaZonaEnColocacion.altoMetros) / 2, 0);
    const maxZ = centroZonaZ + Math.max((altoZona - plantillaZonaEnColocacion.altoMetros) / 2, 0);

    onActualizarPlantillaZonaEnColocacion(clamp(x, minX, maxX), clamp(z, minZ, maxZ));
  }, [onActualizarPlantillaZonaEnColocacion, plantillaZonaEnColocacion, zonaPlantillaObjetivo]);

  const finalizarDragPlantillaZona = useCallback((confirmar: boolean) => {
    if (!plantillaZonaEnColocacion) {
      return;
    }

    setIsDraggingPlantillaZona(false);
    if (plantillaZonaPointerIdRef.current !== null) {
      try { gl.domElement.releasePointerCapture(plantillaZonaPointerIdRef.current); } catch {}
      plantillaZonaPointerIdRef.current = null;
    }

    if (confirmar) {
      onConfirmarPlantillaZonaEnColocacion?.();
    }
  }, [gl, onConfirmarPlantillaZonaEnColocacion, plantillaZonaEnColocacion]);

  const handlePlantillaPointerDown = useCallback((e: any) => {
    if (!plantillaZonaEnColocacion) {
      return;
    }

    e.stopPropagation();
    if (e.nativeEvent?.pointerId !== undefined) {
      plantillaZonaPointerIdRef.current = e.nativeEvent.pointerId;
      try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
    }
    setIsDraggingPlantillaZona(true);
    actualizarPlantillaZonaRestringida(obtenerPuntoSueloMundo(e));
  }, [actualizarPlantillaZonaRestringida, gl, plantillaZonaEnColocacion]);

  const handlePlantillaPointerUp = useCallback((e: any) => {
    if (!isDraggingPlantillaZona || !plantillaZonaEnColocacion) {
      return;
    }

    e.stopPropagation();
    actualizarPlantillaZonaRestringida(obtenerPuntoSueloMundo(e));
    finalizarDragPlantillaZona(true);
  }, [actualizarPlantillaZonaRestringida, finalizarDragPlantillaZona, isDraggingPlantillaZona, plantillaZonaEnColocacion]);

  // Reset auto si la plantilla se canceló externamente mientras el drag estaba
  // activo (admin presionó Esc o cerró el panel).
  useEffect(() => {
    if (!plantillaZonaEnColocacion && isDraggingPlantillaZona) {
      setIsDraggingPlantillaZona(false);
      plantillaZonaPointerIdRef.current = null;
    }
  }, [isDraggingPlantillaZona, plantillaZonaEnColocacion]);

  // Window-level pointerup/cancel listeners — capturan el "soltar fuera del
  // canvas" (el usuario arrastra y suelta sobre HUD/sidebar; el R3F pointerup
  // del mesh nunca dispara, pero el window sí). pointercancel confirma=false
  // (drag interrumpido por gesto del SO / dispositivo).
  useEffect(() => {
    if (!isDraggingPlantillaZona) {
      return;
    }

    const handleWindowPointerUp = () => {
      finalizarDragPlantillaZona(true);
    };

    const handleWindowPointerCancel = () => {
      finalizarDragPlantillaZona(false);
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [finalizarDragPlantillaZona, isDraggingPlantillaZona]);

  return {
    isDraggingPlantillaZona,
    zonaPlantillaObjetivo,
    actualizarPlantillaZonaRestringida,
    handlePlantillaPointerDown,
    handlePlantillaPointerUp,
  };
}
