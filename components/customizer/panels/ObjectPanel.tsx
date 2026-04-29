/**
 * @module customizer/panels/ObjectPanel
 * @description Tab panel for browsing and placing 3D objects.
 * Shows category pills, selected object detail card, and object grid.
 *
 * Clean Architecture: Presentation layer — UI only, catalog state via props.
 * Ref: React 19 — single responsibility, event handlers passed as callbacks.
 */

import React from 'react';
import { ObjectCard } from '../../ObjectCard';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '../shared/customizerConstants';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import type { UseAvatarCatalogReturn } from '@/hooks/customizer/useAvatarCatalog';

export interface ObjectPanelProps {
  catalog: Pick<
    UseAvatarCatalogReturn,
    | 'selectedObjectId'
    | 'selectedCategory'
    | 'loadingObjects'
    | 'selectObject'
    | 'selectCategory'
  >;
  objectCategories: string[];
  filteredObjects: CatalogoObjeto3D[];
  selectedObject: CatalogoObjeto3D | null;
  onPrepararObjeto?: () => void;
  onDragStart: (e: React.DragEvent, data: CatalogoObjeto3D) => void;
  modoColocacionActivo: boolean;
  canPlace: boolean;
}

export const ObjectPanel: React.FC<ObjectPanelProps> = ({
  catalog,
  objectCategories,
  filteredObjects,
  selectedObject,
  onPrepararObjeto,
  onDragStart,
  modoColocacionActivo,
  canPlace,
}) => (
  <div className="space-y-2 animate-in fade-in duration-200">
    {/* Category pills horizontal */}
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-shrink-0">
      {objectCategories.map((category) => (
        <button
          key={category}
          onClick={() => catalog.selectCategory(category)}
          className={`
            flex-shrink-0 rounded px-2 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all duration-200
            ${catalog.selectedCategory === category
              ? 'bg-[#0397ab] text-white shadow-[0_0_10px_rgba(3,151,171,0.4)] border border-[#04c8e0]'
              : 'bg-[#0a0a0c] text-[#a09b8c] hover:bg-[#1e2328] hover:text-[#f0e6d2] border border-[#1e2328]'
            }
          `}
        >
          {CATEGORY_ICONS[category] || '📦'} {CATEGORY_LABELS[category] || category}
        </button>
      ))}
    </div>

    {/* Selected object detail + action */}
    {selectedObject && (
      <div className="bg-[#0a0a0c] border border-[#1e2328] rounded-md p-2.5 relative">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#0397ab] opacity-50" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#0397ab] opacity-50" />
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[10px] font-black text-[#f0e6d2] uppercase tracking-wide truncate">{selectedObject.nombre}</h3>
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#0397ab]">
              {CATEGORY_LABELS[selectedObject.categoria] || selectedObject.categoria}
            </p>
          </div>
          <button
            onClick={onPrepararObjeto}
            disabled={!canPlace}
            className={`flex-shrink-0 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider transition-all duration-200 rounded ${
              !canPlace
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                : modoColocacionActivo
                  ? 'bg-emerald-600 text-white border border-emerald-400'
                  : 'bg-[#0397ab] text-white border border-[#04c8e0] hover:bg-[#04c8e0]'
            }`}
          >
            {modoColocacionActivo ? '✓ Activo' : '🎯 Colocar'}
          </button>
        </div>
      </div>
    )}

    {/* Objects grid */}
    {catalog.loadingObjects ? (
      <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Cargando objetos...
      </div>
    ) : (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar pb-4">
        {filteredObjects.map((object) => (
          <ObjectCard
            key={object.id}
            nombre={object.nombre}
            categoria={CATEGORY_LABELS[object.categoria] || object.categoria}
            thumbnailUrl={object.thumbnail_url}
            interactuable={object.es_interactuable}
            sentable={object.es_sentable}
            seleccionado={catalog.selectedObjectId === object.id}
            isPremium={object.premium || false}
            onClick={() => catalog.selectObject(object.id)}
            builtInColor={object.built_in_color}
            builtInGeometry={object.built_in_geometry}
            catalogData={object}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    )}
  </div>
);
