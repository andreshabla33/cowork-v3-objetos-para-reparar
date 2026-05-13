/**
 * Editor Slice — Clean Architecture Domain Store
 *
 * Maneja: modo edición 3D, selección de objetos, copiar/pegar,
 * arrastre, zona de dibujo, pintura de suelo, plantillas.
 */
import type { StateCreator } from 'zustand';
import { FloorType } from '@/core/domain/entities';
import type { PlantillaZonaId } from '@/core/domain/entities/plantillasEspacio';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';

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
  /**
   * Modo "Designar Desk" — admin arrastra un rectángulo sobre el piso para
   * crear una nueva AreaEscritorio. Mientras está true, los clicks en el
   * floor catch-plane se interceptan para el drag-to-create del desk.
   */
  isDesignandoDesk: boolean;
  /** State machine del drag-to-create de desks (compartido Scene3D ↔ HUD admin). */
  designerEstado: 'idle' | 'dragging' | 'naming';
  /** Punto inicial del drag (world coords). */
  designerInicio: { x: number; z: number } | null;
  /** Punto actual del drag (durante dragging) o final (en naming). */
  designerFin: { x: number; z: number } | null;
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
  setIsDesignandoDesk: (val: boolean) => void;
  designerComenzarDrag: (p: { x: number; z: number }) => void;
  designerActualizarDrag: (p: { x: number; z: number }) => void;
  designerFinalizarDrag: () => void;
  designerCancelar: () => void;
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
  isDesignandoDesk: false,
  designerEstado: 'idle',
  designerInicio: null,
  designerFin: null,
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
  setIsDesignandoDesk: (val) => set({
    isDesignandoDesk: val,
    // Si se sale del modo, resetea el state machine.
    ...(val ? {} : { designerEstado: 'idle', designerInicio: null, designerFin: null }),
  }),
  designerComenzarDrag: (p) => set({
    designerEstado: 'dragging',
    designerInicio: { ...p },
    designerFin: { ...p },
  }),
  designerActualizarDrag: (p) => set((state) => ({
    designerFin: state.designerEstado === 'dragging' ? { ...p } : state.designerFin,
  })),
  designerFinalizarDrag: () => set((state) => {
    if (state.designerEstado !== 'dragging' || !state.designerInicio || !state.designerFin) {
      return { designerEstado: 'idle' as const };
    }
    // Gate de tamaño mínimo (anti-click accidental). El componente UI
    // decide los thresholds visualmente; aquí solo evitamos abrir el modal
    // con un rect prácticamente cero.
    const ancho = Math.abs(state.designerFin.x - state.designerInicio.x);
    const alto = Math.abs(state.designerFin.z - state.designerInicio.z);
    if (ancho < 1 || alto < 1) {
      return { designerEstado: 'idle' as const, designerInicio: null, designerFin: null };
    }
    return { designerEstado: 'naming' as const };
  }),
  designerCancelar: () => set({
    designerEstado: 'idle',
    designerInicio: null,
    designerFin: null,
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
