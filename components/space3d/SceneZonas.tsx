/**
 * @module components/space3d/SceneZonas
 *
 * Sub-componente extraído de Scene3D.tsx (CLEAN-ARCH-F4).
 * Responsabilidad única: renderiza las zonas de empresa y sus cerramientos.
 *
 * Extraído del render de Scene3D (líneas 784–831).
 * Scene3D delegará a <SceneZonas /> para mantener <200 líneas.
 */

import React, { useMemo } from 'react';
import type { ZonaEmpresa } from '@/types';
import { ZonaEmpresa as ZonaEmpresa3D } from '../3d/ZonaEmpresa';
import { CerramientoZona3D } from '../3d/CerramientoZona3D';
import {
  calcularNivelAnidamientoRectangulo,
  zonaDbAMundo,
  type RectanguloZona,
  resolverTipoSubsueloZona,
} from '@/src/core/domain/entities';
import { crearParedesCerramientosZonas } from './cerramientosZonaRuntime';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const obtenerElevacionVisualZona = (nivelAnidamiento: number): number =>
  0.01 + nivelAnidamiento * 0.02;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SceneZonasProps {
  zonasEmpresa: ZonaEmpresa[];
  currentUserEmpresaId?: string | null;
  objetoEnColocacion?: EspacioObjeto | null;
  plantillaZonaEnColocacion?: { zonaId?: string } | null;
  isDrawingZone?: boolean;
  onClickZona?: (zona: ZonaEmpresa) => void;
  onFloorClick?: (e: unknown) => void;
  onPlantillaPointerDown?: (e: unknown) => void;
  onPlantillaPointerUp?: (e: unknown) => void;
  onZoneDrawStart?: (e: unknown) => void;
  onZoneDrawEnd?: (e: unknown) => void;
  onPointerMove?: (e: unknown) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Renderiza todas las zonas de empresa activas y sus cerramientos.
 *
 * Optimización:
 *  - zonasActivas memoizado para evitar filter en cada frame
 *  - cerramientos memoizado: solo se recalcula cuando zonasEmpresa cambia
 *  - zonasExistentesMundo memoizado para el cálculo de solapamiento
 */
export const SceneZonas: React.FC<SceneZonasProps> = ({
  zonasEmpresa,
  currentUserEmpresaId,
  objetoEnColocacion,
  plantillaZonaEnColocacion,
  isDrawingZone,
  onClickZona,
  onFloorClick,
  onPlantillaPointerDown,
  onPlantillaPointerUp,
  onZoneDrawStart,
  onZoneDrawEnd,
  onPointerMove,
}) => {
  const zonasActivas = useMemo(
    () => zonasEmpresa.filter((z) => z.estado === 'activa'),
    [zonasEmpresa],
  );

  const cerramientos = useMemo(
    () => crearParedesCerramientosZonas(zonasEmpresa),
    [zonasEmpresa],
  );

  const zonasExistentesMundo = useMemo<RectanguloZona[]>(
    () => zonasActivas.map(zonaDbAMundo),
    [zonasActivas],
  );

  return (
    <>
      {/* Zonas de empresa activas */}
      {zonasActivas.map((zona) => {
        const anchoZona = Math.max(1, Number(zona.ancho) / 16);
        const altoZona = Math.max(1, Number(zona.alto) / 16);
        const posicionX = Number(zona.posicion_x) / 16;
        const posicionZ = Number(zona.posicion_y) / 16;
        const colorZona = zona.color || '#64748b';
        const esZonaComun = !!zona.es_comun;
        const esZonaPropia = !!currentUserEmpresaId && zona.empresa_id === currentUserEmpresaId;
        const variante = esZonaComun ? 'comun' : esZonaPropia ? 'propia' : 'ajena';
        const nombreZona = zona.nombre_zona || (esZonaComun ? 'Zona común' : zona.empresa?.nombre) || undefined;
        const opacidad = variante === 'propia' ? 0.45 : variante === 'comun' ? 0.2 : 0.28;
        const rectZona: RectanguloZona = { x: posicionX, z: posicionZ, ancho: anchoZona, alto: altoZona };
        const nivelAnidamiento = calcularNivelAnidamientoRectangulo(rectZona, zonasExistentesMundo);
        const tipoSubsuelo = resolverTipoSubsueloZona(
          zona.configuracion,
          nivelAnidamiento >= 2 ? 'decorativo' : 'organizacional',
        );
        const elevacionZona = obtenerElevacionVisualZona(nivelAnidamiento);

        return (
          <ZonaEmpresa3D
            key={zona.id}
            posicion={[posicionX, elevacionZona, posicionZ]}
            ancho={anchoZona}
            alto={altoZona}
            color={colorZona}
            nombre={nombreZona}
            logoUrl={zona.empresa?.logo_url ?? null}
            esZonaComun={esZonaComun}
            variante={variante}
            mostrarEtiqueta={tipoSubsuelo !== 'decorativo'}
            opacidad={opacidad}
            tipoSuelo={zona.tipo_suelo}
            onClick={(e) => {
              if (objetoEnColocacion || plantillaZonaEnColocacion || isDrawingZone) {
                onFloorClick?.(e);
              } else {
                onClickZona?.(zona);
              }
            }}
            onPointerDown={plantillaZonaEnColocacion ? onPlantillaPointerDown : onZoneDrawStart}
            onPointerUp={plantillaZonaEnColocacion ? onPlantillaPointerUp : onZoneDrawEnd}
            onPointerMove={onPointerMove}
          />
        );
      })}

      {/* Cerramientos (paredes de zona) */}
      {cerramientos.map((objeto) => (
        <CerramientoZona3D key={objeto.id} objeto={objeto} />
      ))}
    </>
  );
};

SceneZonas.displayName = 'SceneZonas';
