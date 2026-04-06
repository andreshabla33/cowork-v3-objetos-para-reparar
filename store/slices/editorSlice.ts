/**
 * Editor Slice — Clean Architecture Domain Store
 *
 * Maneja: modo edición 3D, selección de objetos, copiar/pegar,
 * arrastre, zona de dibujo, pintura de suelo, plantillas.
 */
import type { StateCreator } from 'zustand';
import { FloorType } from '../../src/core/domain/entities';
import type { PlantillaZonaId } from '../../src/core/domain/entities/plantillasEspacio';
import type { EspacioObjeto } from '../../hooks/space3d/useEspacioObjetos';

export type ModoEdicionObjeto = 'mover' | 'rotar' | 'escalar' | 'add';

export interface PlantillaZonaEnColocacion {
  zonaId: string;
  workspaceId: string;
  plantillaId: PlantillaZonaId;
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
