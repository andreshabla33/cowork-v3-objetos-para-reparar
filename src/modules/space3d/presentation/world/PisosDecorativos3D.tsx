/**
 * @module space3d/world/PisosDecorativos3D
 *
 * Capa de pisos decorativos del espacio. Suscribe via realtime y renderiza
 * un `<PisoDecorativo3D>` por cada fila. Vive como sibling de `<SueloPrincipal3D>`
 * + `<ZonaEmpresa3D>` en el árbol de Scene3D — DENTRO del `<Canvas>` R3F.
 *
 * Clean Architecture: Presentation. Toda la I/O via `usePisosDecorativos`
 * (hook DI que orquesta repo + use cases).
 *
 * IMPORTANTE: este componente NO puede renderizar HTML (Modal, ConfirmDialog,
 * etc.) porque vive dentro de `<Canvas>` y el reconciler de R3F crashea con
 * elementos HTML (`<h2>`, `<div>`...). Para confirmar borrado, setea el id
 * pendiente en el store global; `<PisoDecorativoDeleteConfirmHost>` (HTML,
 * rendered fuera del Canvas) consume ese state y muestra el `<ConfirmDialog>`.
 */

import React from 'react';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { PisoDecorativo3D } from './PisoDecorativo3D';

interface PisosDecorativos3DProps {
  espacioId: string | null;
}

export const PisosDecorativos3D: React.FC<PisosDecorativos3DProps> = ({ espacioId }) => {
  const { pisos } = usePisosDecorativos(espacioId);
  const isEditMode = useStore((s) => s.isEditMode);
  const setPisoDecorativoPendingDeleteId = useStore((s) => s.setPisoDecorativoPendingDeleteId);

  if (pisos.length === 0) return null;

  const handleClick = (pisoId: string) => {
    if (!isEditMode) return;
    // R3F-safe: solo seteamos state. El host HTML muestra el ConfirmDialog.
    setPisoDecorativoPendingDeleteId(pisoId);
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
