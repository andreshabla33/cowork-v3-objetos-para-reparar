/**
 * @module space3d/world/PisoDecorativoDeleteConfirmHost
 *
 * Host HTML del diálogo de confirmación para borrar pisos decorativos.
 * Vive como sibling del `<Canvas>` R3F (NO adentro) porque renderiza
 * elementos DOM (`<h2>`, `<button>`, etc.) que el reconciler de R3F
 * no soporta — incluso vía `createPortal` el reconciler procesa el JSX
 * antes del portal y crashea.
 *
 * Bridge: lee `pisoDecorativoPendingDeleteId` del store global (lo setea
 * `<PisosDecorativos3D>` desde dentro del Canvas al hacer click en un
 * piso en modo edición). Cuando hay id pendiente, muestra el modal.
 *
 * Clean Architecture: Presentation HTML. Consume hook DI
 * `usePisosDecorativos` para `eliminar`.
 *
 * Refs:
 *  - R3F reconciler limitation: https://r3f.docs.pmnd.rs/api/objects#using-3rd-party-objects-declaratively
 *  - Patrón canónico: lift HTML state OUT of Canvas via store global.
 */

import React, { useState } from 'react';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { usePisosDecorativos } from '@/modules/space3d/presentation/hooks/usePisosDecorativos';
import { ConfirmDialog } from '@/modules/ui/presentation';

interface PisoDecorativoDeleteConfirmHostProps {
  espacioId: string | null;
}

export const PisoDecorativoDeleteConfirmHost: React.FC<PisoDecorativoDeleteConfirmHostProps> = ({
  espacioId,
}) => {
  const pendingId = useStore((s) => s.pisoDecorativoPendingDeleteId);
  const setPendingId = useStore((s) => s.setPisoDecorativoPendingDeleteId);
  const { eliminar } = usePisosDecorativos(espacioId);

  const [borrando, setBorrando] = useState(false);

  const confirmar = async () => {
    if (!pendingId) return;
    setBorrando(true);
    await eliminar(pendingId);
    setBorrando(false);
    setPendingId(null);
  };

  return (
    <ConfirmDialog
      isOpen={pendingId !== null}
      onConfirm={() => { void confirmar(); }}
      onCancel={() => setPendingId(null)}
      title="Eliminar piso decorativo"
      message="¿Querés eliminar este parche del piso? Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      cancelLabel="Cancelar"
      confirmVariant="danger"
      loading={borrando}
    />
  );
};
