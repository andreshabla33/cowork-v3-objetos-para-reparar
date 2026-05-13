/**
 * @module modules/space3d/presentation/hooks/useFloorMaterial
 *
 * Hook que resuelve el `THREE.MeshStandardMaterial` para un FloorType vía
 * el use case `GestionarMaterialesSueloUseCase`. El material es compartido
 * entre todas las zonas con el mismo tipo (cache en el adapter).
 *
 * El usuario llama:
 *   const material = useFloorMaterial(zona.tipo_suelo);
 *   // ...
 *   <mesh><primitive object={material} attach="material" /></mesh>
 *
 * Clean Architecture: la presentación no construye materiales — pide al
 * use case y recibe THREE.Material ya configurado por el adapter.
 */

import { useMemo } from 'react';
import type * as THREE from 'three';
import { useDI } from '@/core/infrastructure/di/DIProvider';
import { GestionarMaterialesSueloUseCase } from '@/core/application/usecases/GestionarMaterialesSueloUseCase';
import { FloorMaterialAdapter } from '@/core/infrastructure/r3f/rendering/floor/FloorMaterialAdapter';
import { normalizarTipoSuelo, type FloorType } from '@/core/domain/entities';

/**
 * Devuelve el material PBR procedural para un FloorType.
 * Cache compartido: dos zonas con mismo tipo reciben la misma instancia.
 */
export function useFloorMaterial(
  tipoSuelo: FloorType | string | null | undefined,
): THREE.MeshStandardMaterial {
  const { floorMaterialFactory } = useDI();
  const tipo = normalizarTipoSuelo(tipoSuelo);

  return useMemo(() => {
    const useCase = new GestionarMaterialesSueloUseCase(floorMaterialFactory);
    const abstracto = useCase.obtenerMaterialSuelo(tipo);
    return FloorMaterialAdapter.resolverMaterial(abstracto);
  }, [floorMaterialFactory, tipo]);
}

/**
 * Color hex representativo del suelo (para swatches del selector UI).
 */
export function useFloorSwatchColor(
  tipoSuelo: FloorType | string | null | undefined,
): string {
  const { floorMaterialFactory } = useDI();
  const tipo = normalizarTipoSuelo(tipoSuelo);
  return floorMaterialFactory.obtenerColorSwatch(tipo);
}
