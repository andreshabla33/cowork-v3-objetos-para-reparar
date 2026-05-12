/**
 * @module space3d/hooks/useZoneDrawingPreview
 *
 * State + derivados memoizados del rectángulo de preview cuando el admin
 * dibuja una zona arrastrando el cursor (lápiz). Calcula:
 *  - `previewZonaRect`: centro + ancho/alto del bbox.
 *  - `zonasExistentesMundo`: snapshot de zonas activas en world coords
 *    (consumido para overlap + anidamiento).
 *  - `previewOverlap`: bool — la preview solapa con otra zona activa
 *    (Gather-style: cada celda un solo dueño).
 *  - `previewNivelAnidamiento`: índice del nivel de anidamiento de la
 *    preview en la jerarquía existente.
 *
 * Extraído de `Scene3D.tsx` (ITEM 15 P1-07). Los handlers externos
 * (`handleZoneDrawStart/End/PointerMove`) consumen los setters para
 * mantener `previewZonaStart/Current` sincronizados con el cursor.
 *
 * Refs:
 *  - https://react.dev/reference/react/useMemo — recompute solo si deps cambian
 *  - Domain: `detectarSolapamientoSubzona`, `calcularNivelAnidamientoRectangulo`
 */

import { useMemo, useState } from 'react';
import {
  calcularNivelAnidamientoRectangulo,
  detectarSolapamientoSubzona,
  zonaDbAMundo,
  type RectanguloZona,
} from '@/src/core/domain/entities';
import type { ZonaEmpresa } from '@/types';

export interface ZonaPreviewPoint {
  x: number;
  z: number;
}

export interface ZonaPreviewRect {
  ancho: number;
  alto: number;
  centroX: number;
  centroZ: number;
}

export interface UseZoneDrawingPreviewParams {
  zonasEmpresa: ZonaEmpresa[];
}

export interface UseZoneDrawingPreviewReturn {
  previewZonaStart: ZonaPreviewPoint | null;
  previewZonaCurrent: ZonaPreviewPoint | null;
  setPreviewZonaStart: (p: ZonaPreviewPoint | null) => void;
  setPreviewZonaCurrent: (p: ZonaPreviewPoint | null) => void;
  /** Rect derivado del start+current (centro + dimensiones), o null si incompleto. */
  previewZonaRect: ZonaPreviewRect | null;
  /** Snapshot inmutable de zonas activas en world coords. Compartido entre
   * los memos de overlap/anidamiento — se recalcula solo si `zonasEmpresa` cambia. */
  zonasExistentesMundo: RectanguloZona[];
  /** `true` si la preview solapa otra zona activa (mismo nivel jerárquico). */
  previewOverlap: boolean;
  /** Nivel de anidamiento (0 = raíz) que tendría la preview si se confirma. */
  previewNivelAnidamiento: number;
}

export function useZoneDrawingPreview(
  params: UseZoneDrawingPreviewParams,
): UseZoneDrawingPreviewReturn {
  const { zonasEmpresa } = params;
  const [previewZonaStart, setPreviewZonaStart] = useState<ZonaPreviewPoint | null>(null);
  const [previewZonaCurrent, setPreviewZonaCurrent] = useState<ZonaPreviewPoint | null>(null);

  const previewZonaRect = useMemo<ZonaPreviewRect | null>(() => {
    if (!previewZonaStart || !previewZonaCurrent) return null;

    const minX = Math.min(previewZonaStart.x, previewZonaCurrent.x);
    const maxX = Math.max(previewZonaStart.x, previewZonaCurrent.x);
    const minZ = Math.min(previewZonaStart.z, previewZonaCurrent.z);
    const maxZ = Math.max(previewZonaStart.z, previewZonaCurrent.z);
    const ancho = Math.abs(maxX - minX);
    const alto = Math.abs(maxZ - minZ);

    return {
      ancho,
      alto,
      centroX: minX + ancho / 2,
      centroZ: minZ + alto / 2,
    };
  }, [previewZonaStart, previewZonaCurrent]);

  // Detección de solapamiento entre subsuelos (estilo Gather: cada celda un solo dueño)
  const zonasExistentesMundo = useMemo<RectanguloZona[]>(
    () => zonasEmpresa.filter((z) => z.estado === 'activa').map(zonaDbAMundo),
    [zonasEmpresa],
  );

  const previewOverlap = useMemo(() => {
    if (!previewZonaStart || !previewZonaCurrent) return false;
    const minX = Math.min(previewZonaStart.x, previewZonaCurrent.x);
    const maxX = Math.max(previewZonaStart.x, previewZonaCurrent.x);
    const minZ = Math.min(previewZonaStart.z, previewZonaCurrent.z);
    const maxZ = Math.max(previewZonaStart.z, previewZonaCurrent.z);
    const ancho = maxX - minX;
    const alto = maxZ - minZ;
    if (ancho < 0.5 || alto < 0.5) return false;
    const nueva: RectanguloZona = { x: minX + ancho / 2, z: minZ + alto / 2, ancho, alto };
    return detectarSolapamientoSubzona(nueva, zonasExistentesMundo);
  }, [previewZonaStart, previewZonaCurrent, zonasExistentesMundo]);

  const previewNivelAnidamiento = useMemo(() => {
    if (!previewZonaRect) return 0;
    return calcularNivelAnidamientoRectangulo(
      { x: previewZonaRect.centroX, z: previewZonaRect.centroZ, ancho: previewZonaRect.ancho, alto: previewZonaRect.alto },
      zonasExistentesMundo,
    );
  }, [previewZonaRect, zonasExistentesMundo]);

  return {
    previewZonaStart,
    previewZonaCurrent,
    setPreviewZonaStart,
    setPreviewZonaCurrent,
    previewZonaRect,
    zonasExistentesMundo,
    previewOverlap,
    previewNivelAnidamiento,
  };
}
