/**
 * @module space3d/world/PisosDecorativos3D
 *
 * Capa de pisos decorativos del espacio. Suscribe via realtime y renderiza
 * un `<PisoDecorativo3D>` por cada fila. Vive como sibling de `<SueloPrincipal3D>`
 * + `<ZonaEmpresa3D>` en el árbol de Scene3D.
 *
 * Clean Architecture: Presentation. Toda la I/O via `usePisosDecorativos`
 * (hook DI que orquesta repo + use cases).
 */

import React from 'react';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { PisoDecorativo3D } from './PisoDecorativo3D';

interface PisosDecorativos3DProps {
  espacioId: string | null;
}

export const PisosDecorativos3D: React.FC<PisosDecorativos3DProps> = ({ espacioId }) => {
  const { pisos, eliminar } = usePisosDecorativos(espacioId);
  const isEditMode = useStore((s) => s.isEditMode);

  if (pisos.length === 0) return null;

  const handleClick = (pisoId: string) => {
    if (!isEditMode) return;
    if (!confirm('¿Eliminar este piso decorativo?')) return;
    void eliminar(pisoId);
  };

  return (
    <>
      {pisos.map((piso) => (
        <PisoDecorativo3D
          key={piso.id}
          piso={piso}
          onClick={isEditMode ? handleClick : undefined}
        />
      ))}
    </>
  );
};
