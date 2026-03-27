'use client';

import React, { useMemo } from 'react';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { GeometriaProceduralObjeto3D } from './GeometriaProceduralObjeto3D';
import { obtenerDimensionesObjetoRuntime } from '../space3d/objetosRuntime';

interface CerramientoZona3DProps {
  objeto: EspacioObjeto;
}

export const CerramientoZona3D: React.FC<CerramientoZona3DProps> = ({ objeto }) => {
  const dimensiones = useMemo(() => {
    const perfil = obtenerDimensionesObjetoRuntime(objeto);
    return [perfil.ancho, perfil.alto, perfil.profundidad] as [number, number, number];
  }, [objeto]);

  const opacidad = Number(objeto.configuracion_geometria?.opacidad ?? 1) || 1;

  return (
    <group
      position={[objeto.posicion_x, objeto.posicion_y, objeto.posicion_z]}
      rotation={[objeto.rotacion_x || 0, objeto.rotacion_y || 0, objeto.rotacion_z || 0]}
    >
      <GeometriaProceduralObjeto3D
        objeto={objeto}
        dimensiones={dimensiones}
        opacidad={opacidad}
        transparente={opacidad < 1}
        resaltar={false}
      />
    </group>
  );
};
