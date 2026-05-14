/**
 * Editor Slice — Clean Architecture Domain Store
 *
 * Maneja: modo edición 3D, selección de objetos, copiar/pegar,
 * arrastre, zona de dibujo, pintura de suelo, plantillas.
 */
import type { StateCreator } from 'zustand';
import { FloorType } from '@/core/domain/entities';
import { STENCIL_DEFAULT, type StencilPisoId } from '@/core/domain/entities/espacio3d/StencilsPiso';
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
  /**
   * Modo "Decorar piso" (Gather-style paint). Admin elige FloorType y
   * arrastra un rectángulo sobre el suelo del espacio o dentro de una
   * zona-empresa. Mientras `true`, el catch-plane captura drag para crear
   * un piso decorativo.
   */
  isPaintingDecorativeFloor: boolean;
  /** Si el modo está scopeado a una zona específica, su id; `null` = suelo principal. */
  decorativeFloorZonaId: string | null;
  /**
   * Stencil de tamaño activo en modo decorar piso. `'custom'` = drag-to-draw
   * libre. Los demás = click-to-place con dimensiones predefinidas. Patrón
   * Sims build-mode: el 90% del tiempo el admin usa un preset; custom es
   * escape hatch para casos especiales.
   */
  decorativeFloorStencilId: StencilPisoId;
  /**
   * Id del piso decorativo pendiente de confirmación de borrado.
   * Lo setean los click handlers DENTRO del `<Canvas>` R3F. Lo consume un
   * host HTML rendered como sibling del Canvas (donde sí puede vivir un
   * `<ConfirmDialog>` con `<h2>` etc.). null = sin diálogo abierto.
   * Bridge necesaria porque el reconciler de R3F no soporta react-dom
   * createPortal: el JSX HTML del Modal explota al procesarse adentro.
   */
  pisoDecorativoPendingDeleteId: string | null;

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
  /**
   * Inicia/finaliza el modo "decorar piso". Si `zonaId` es `null` el painting
   * se aplica al suelo principal; si es una zona-empresa, se confina a ella.
   */
  setIsPaintingDecorativeFloor: (val: boolean, zonaId?: string | null) => void;

  /** Cambia el stencil activo (tamaño preset o `custom` para drag libre). */
  setDecorativeFloorStencilId: (id: StencilPisoId) => void;
  /** Pide confirmación de borrado de un piso decorativo (null = cerrar). */
  setPisoDecorativoPendingDeleteId: (id: string | null) => void;
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
  isPaintingDecorativeFloor: false,
  decorativeFloorZonaId: null,
  decorativeFloorStencilId: STENCIL_DEFAULT,
  pisoDecorativoPendingDeleteId: null,

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

  setIsPaintingDecorativeFloor: (val, zonaId = null) =>
    set({
      isPaintingDecorativeFloor: val,
      decorativeFloorZonaId: val ? zonaId : null,
    }),

  setDecorativeFloorStencilId: (id) => set({ decorativeFloorStencilId: id }),

  setPisoDecorativoPendingDeleteId: (id) => set({ pisoDecorativoPendingDeleteId: id }),
});
