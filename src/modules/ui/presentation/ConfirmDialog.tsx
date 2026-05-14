/**
 * ConfirmDialog — Aurora GLASS Design System.
 *
 * Reemplazo canónico de `window.confirm()` para acciones de UI (eliminar,
 * cancelar, etc.). Envuelve `Modal` + `Button` del propio design system y
 * usa `createPortal` para escapar cualquier parent tree no-DOM (típicamente
 * el `<Canvas>` de R3F, donde un mesh no puede contener `<div>`).
 *
 * Uso:
 *   <ConfirmDialog
 *     isOpen={pendingPisoId !== null}
 *     onConfirm={() => { void eliminar(pendingPisoId); setPendingPisoId(null); }}
 *     onCancel={() => setPendingPisoId(null)}
 *     title="Eliminar piso decorativo"
 *     message="¿Querés eliminar este parche? Esta acción no se puede deshacer."
 *     confirmLabel="Eliminar"
 *     confirmVariant="danger"
 *   />
 *
 * Refs:
 *  - https://react.dev/reference/react-dom/createPortal (React 19.2)
 *  - Modal canónico: src/modules/ui/presentation/Modal.tsx
 *  - Button canónico: src/modules/ui/presentation/Button.tsx
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { Modal, type ModalSize } from './Modal';
import { Button } from './Button';

export type ConfirmVariant = 'primary' | 'danger';

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (default) = botón rojo. `primary` = botón índigo. */
  confirmVariant?: ConfirmVariant;
  size?: ModalSize;
  /** Mientras true, deshabilita los botones y muestra el spinner del confirm. */
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  size = 'sm',
  loading = false,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onCancel}
      title={title}
      size={size}
      showCloseButton={false}
      closeOnOverlayClick={!loading}
    >
      <div className="px-6 py-5 space-y-5">
        <div className="text-sm" style={{ color: 'var(--cw-ink-700)' }}>
          {message}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
};

export default ConfirmDialog;
