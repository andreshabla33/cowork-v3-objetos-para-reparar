/**
 * Editor Slice — Clean Architecture Domain Store
 *
 * Maneja: modo edición 3D, selección de objetos, copiar/pegar,
 * arrastre, zona de dibujo, pintura de suelo, plantillas.
 */
import type { StateCreator } from 'zustand';
import { FloorType } from '@/core/domain/entities';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';

export type ModoEdicionObjeto = 'mover' | 'rotar' | 'escalar' | 'add';

/**
 * @deprecated Plantilla de zona legacy (Fase M 2026-05-13). El flow Gather
 * de DeskAreas la reemplaza. Tipo preservado como `never`-like stub para
 * que consumers downstream sigan compilando hasta su refactor final.
 */
export interface PlantillaZonaEnColocacion {
  zonaId: string;
  workspaceId: string;
  plantillaId: string;
  nombrePlantilla: string;
  nombreZona: string;
  posicionX: number;
  posicionZ: number;
  anchoMetros: number;
  altoMetros: number;
}

export interface EditorSlice {
  isEditMode: boolean;
  modoEdicionObjeto: ModoEdicionObjeto;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  copiedObjects: EspacioObjeto[];
  isDragging: boolean;
  isDrawingZone: boolean;
  /**
   * Modo "Colocar Desk" (Gather-style click-to-place) — admin elige preset
   * y hace click sobre el piso para colocar. Mientras `true`, el catch-plane
   * captura el click. State machine:
   *   - 'idle'    → admin no está colocando
   *   - 'previewing' → preview siguiendo el cursor; el siguiente click
   *                    abre el modal de asignación.
   *   - 'asigning'   → click confirmado en `posicionPendiente`; modal abierto
   *                    pidiendo nombre + dropdown de miembro + audio.
   */
  deskPlacerEstado: 'idle' | 'previewing' | 'asigning';
  /** Posición confirmada del click (mientras `asigning`). World coords. */
  deskPlacerPosicion: { x: number; z: number } | null;
  paintFloorType: FloorType;
  plantillaZonaEnColocacion: PlantillaZonaEnColocacion | null;

  setIsEditMode: (val: boolean) => void;
  setModoEdicionObjeto: (modo: ModoEdicionObjeto) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedObjectIds: (ids: string[]) => void;
  toggleObjectSelection: (id: string, multi: boolean) => void;
  clearObjectSelection: () => void;
  setCopiedObjects: (objs: EspacioObjeto[]) => void;
  setIsDragging: (val: boolean) => void;
  setIsDrawingZone: (val: boolean) => void;
  /** Entra/sale al modo "colocar desk" (toggle desde HUD admin). */
  setDeskPlacerActivo: (activo: boolean) => void;
  /** Confirma el click sobre el piso: pasa a `asigning` con la posición. */
  deskPlacerConfirmarClick: (posicion: { x: number; z: number }) => void;
  /** Cierra el modal de asignación sin colocar (esc / botón cancelar). */
  deskPlacerCancelar: () => void;
  /** Cierra el modal tras colocación exitosa (vuelve a `idle`). */
  deskPlacerResetTrasCommit: () => void;
  setPaintFloorType: (tipo: FloorType) => void;
  setPlantillaZonaEnColocacion: (plantilla: PlantillaZonaEnColocacion | null) => void;
  actualizarPosicionPlantillaZonaEnColocacion: (x: number, z: number) => void;
  clearPlantillaZonaEnColocacion: () => void;
}

export const createEditorSlice: StateCreator<EditorSlice, [], [], EditorSlice> = (set) => ({
  isEditMode: false,
  modoEdicionObjeto: 'mover',
  selectedObjectId: null,
  selectedObjectIds: [],
  copiedObjects: [],
  isDragging: false,
  isDrawingZone: false,
  deskPlacerEstado: 'idle',
  deskPlacerPosicion: null,
  paintFloorType: FloorType.CONCRETE_SMOOTH,
  plantillaZonaEnColocacion: null,

  setIsEditMode: (val) =>
    set({
      isEditMode: val,
      selectedObjectId: null,
      selectedObjectIds: [],
      isDragging: false,
      modoEdicionObjeto: 'mover',
    }),

  setModoEdicionObjeto: (modo) => set({ modoEdicionObjeto: modo }),

  setSelectedObjectId: (id) =>
    set({ selectedObjectId: id, selectedObjectIds: id ? [id] : [] }),

  setSelectedObjectIds: (ids) =>
    set({
      selectedObjectIds: ids,
      selectedObjectId: ids.length > 0 ? ids[ids.length - 1] : null,
    }),

  toggleObjectSelection: (id, multi) =>
    set((state) => {
      if (multi) {
        if (state.selectedObjectIds.includes(id)) {
          const newIds = state.selectedObjectIds.filter((i) => i !== id);
          return {
            selectedObjectIds: newIds,
            selectedObjectId: newIds.length > 0 ? newIds[newIds.length - 1] : null,
          };
        }
        const newIds = [...state.selectedObjectIds, id];
        return { selectedObjectIds: newIds, selectedObjectId: id };
      }
      return { selectedObjectIds: [id], selectedObjectId: id };
    }),

  clearObjectSelection: () => set({ selectedObjectIds: [], selectedObjectId: null }),
  setCopiedObjects: (objs) => set({ copiedObjects: objs }),
  setIsDragging: (val) => set({ isDragging: val }),
  setIsDrawingZone: (val) => set({ isDrawingZone: val }),
  setDeskPlacerActivo: (activo) => set({
    deskPlacerEstado: activo ? 'previewing' : 'idle',
    ...(activo ? {} : { deskPlacerPosicion: null }),
  }),
  deskPlacerConfirmarClick: (posicion) => set({
    deskPlacerEstado: 'asigning',
    deskPlacerPosicion: { ...posicion },
  }),
  deskPlacerCancelar: () => set({
    deskPlacerEstado: 'idle',
    deskPlacerPosicion: null,
  }),
  deskPlacerResetTrasCommit: () => set({
    deskPlacerEstado: 'idle',
    deskPlacerPosicion: null,
  }),
  setPaintFloorType: (tipo) => set({ paintFloorType: tipo }),

  setPlantillaZonaEnColocacion: (plantilla) => set({ plantillaZonaEnColocacion: plantilla }),

  actualizarPosicionPlantillaZonaEnColocacion: (x, z) =>
    set((state) => ({
      plantillaZonaEnColocacion: state.plantillaZonaEnColocacion
        ? { ...state.plantillaZonaEnColocacion, posicionX: x, posicionZ: z }
        : null,
    })),

  clearPlantillaZonaEnColocacion: () => set({ plantillaZonaEnColocacion: null }),
});
