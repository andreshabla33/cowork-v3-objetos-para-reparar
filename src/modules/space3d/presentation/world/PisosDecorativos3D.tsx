/**
 * @module space3d/world/PisosDecorativos3D
 *
 * Capa de pisos decorativos del espacio. Suscribe via realtime y renderiza
 * un `<PisoDecorativo3D>` por cada fila. Vive como sibling de `<SueloPrincipal3D>`
 * + `<ZonaEmpresa3D>` en el árbol de Scene3D.
 *
 * Clean Architecture: Presentation. Toda la I/O via `usePisosDecorativos`
 * (hook DI que orquesta repo + use cases). El `<ConfirmDialog>` para borrar
 * usa `createPortal` internamente — funciona aunque este componente esté
 * dentro del `<Canvas>` de R3F (donde un mesh no puede contener `<div>`).
 */

import React, { useState } from 'react';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { ConfirmDialog } from '@/modules/ui/presentation';
import { PisoDecorativo3D } from './PisoDecorativo3D';

interface PisosDecorativos3DProps {
  espacioId: string | null;
}

export const PisosDecorativos3D: React.FC<PisosDecorativos3DProps> = ({ espacioId }) => {
  const { pisos, eliminar } = usePisosDecorativos(espacioId);
  const isEditMode = useStore((s) => s.isEditMode);

  const [pendingPisoId, setPendingPisoId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  const handleClick = (pisoId: string) => {
    if (!isEditMode) return;
    setPendingPisoId(pisoId);
  };

  const confirmar = async () => {
    if (!pendingPisoId) return;
    setBorrando(true);
    await eliminar(pendingPisoId);
    setBorrando(false);
    setPendingPisoId(null);
  };

  if (pisos.length === 0 && pendingPisoId === null) return null;

  return (
    <>
      {pisos.map((piso) => (
        <PisoDecorativo3D
          key={piso.id}
          piso={piso}
          onClick={isEditMode ? handleClick : undefined}
        />
      ))}

      <ConfirmDialog
        isOpen={pendingPisoId !== null}
        onConfirm={() => { void confirmar(); }}
        onCancel={() => setPendingPisoId(null)}
        title="Eliminar piso decorativo"
        message="¿Querés eliminar este parche del piso? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={borrando}
      />
    </>
  );
};
