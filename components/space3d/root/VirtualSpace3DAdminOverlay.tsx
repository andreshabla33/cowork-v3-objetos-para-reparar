'use client';

/**
 * @module components/space3d/root/VirtualSpace3DAdminOverlay
 *
 * Subcomponente del root `VirtualSpace3D` que agrupa los overlays del
 * **modo edición / construcción**:
 *   - `PlacementHUD`  → cursor de colocación del objeto preview
 *   - `EditModeHUD`   → controles de modo (mover/rotar/escalar/add) + undo/redo
 *   - `BuildModePanel` → catálogo lateral para agregar objetos (modo 'add')
 *   - `InspectorEdicionObjeto` → panel de propiedades del objeto seleccionado
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (descomposición F4)
 * ════════════════════════════════════════════════════════════════
 *
 * Sin lógica de negocio propia: solo render condicional y prop-drilling
 * al subárbol del admin overlay. Gating por `isEditMode` + `modoEdicionObjeto`
 * vive aquí para no saturar el root.
 */

import React from 'react';
import { EditModeHUD, InspectorEdicionObjeto, PlacementHUD } from '@/components/3d/PlacementHUD';
import { BuildModePanel } from '@/components/3d/BuildModePanel';
import type { CatalogoObjeto3D, ObjetoPreview3D } from '@/types/objetos3d';
import type { EspacioObjeto, TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
import type { ModoEdicionObjeto } from '@/store/slices/editorSlice';

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface VirtualSpace3DAdminOverlayProps {
  // Estado general de edición
  isEditMode: boolean;
  setIsEditMode: (active: boolean) => void;
  modoEdicionObjeto: ModoEdicionObjeto;
  setModoEdicionObjeto: (modo: ModoEdicionObjeto) => void;

  // Colocación de objeto nuevo
  objetoEnColocacion: ObjetoPreview3D | null;
  onCancelarColocacion: () => void;

  // Catálogo para 'add'
  onPrepararObjeto: (catalogo: CatalogoObjeto3D) => void;

  // Inspector — firma alineada con InspectorEdicionObjetoProps.onTransformar
  objetoSeleccionado: EspacioObjeto | null;
  onTransformarObjeto: (id: string, cambios: TransformacionObjetoInput) => Promise<boolean>;

  // Historial
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const VirtualSpace3DAdminOverlay: React.FC<VirtualSpace3DAdminOverlayProps> = ({
  isEditMode,
  setIsEditMode,
  modoEdicionObjeto,
  setModoEdicionObjeto,
  objetoEnColocacion,
  onCancelarColocacion,
  onPrepararObjeto,
  objetoSeleccionado,
  onTransformarObjeto,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  return (
    <>
      {objetoEnColocacion && (
        <PlacementHUD
          objectName={objetoEnColocacion.nombre}
          objectCategory={objetoEnColocacion.categoria}
          onCancel={onCancelarColocacion}
        />
      )}

      {isEditMode && (
        <EditModeHUD
          onCancel={() => setIsEditMode(false)}
          onUndo={() => { void onUndo(); }}
          onRedo={() => { void onRedo(); }}
          canUndo={canUndo}
          canRedo={canRedo}
          modoActual={modoEdicionObjeto}
          onCambiarModo={setModoEdicionObjeto}
        />
      )}

      {/* Panel lateral de construcción: solo en modo 'add' sin objeto en placement */}
      {isEditMode && modoEdicionObjeto === 'add' && !objetoEnColocacion && (
        <BuildModePanel
          onClose={() => setIsEditMode(false)}
          onPrepararObjeto={onPrepararObjeto}
        />
      )}

      {/* Inspector: visible en modos distintos a 'add' (mover/rotar/escalar) */}
      {isEditMode && modoEdicionObjeto !== 'add' && (
        <InspectorEdicionObjeto
          objeto={objetoSeleccionado}
          modoActual={modoEdicionObjeto}
          onTransformar={onTransformarObjeto}
        />
      )}
    </>
  );
};
