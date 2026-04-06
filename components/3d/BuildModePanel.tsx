'use client';

import React, { useState, useMemo } from 'react';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { ObjectCard } from '../ObjectCard';
import { useBuildMode } from '@/hooks/space3d/useBuildMode';

interface BuildModePanelProps {
  onClose: () => void;
  onPrepararObjeto: (objeto: CatalogoObjeto3D) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  todos: 'Todos',
  mobiliario: 'Mobiliario',
  construccion: 'Construcción',
  accesorios: 'Accesorios',
  plantas: 'Plantas',
  tech: 'Tech',
  tecnologia: 'Tech',
  pared: 'Paredes',
  otro: 'Otros',
};

export const BuildModePanel: React.FC<BuildModePanelProps> = ({ onClose, onPrepararObjeto }) => {
  const { availableObjects, loading } = useBuildMode();
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');

  const objectCategories = useMemo(() => {
    const categories = Array.from(new Set(availableObjects.map((object) => object.categoria).filter(Boolean)));
    return ['todos', ...categories];
  }, [availableObjects]);

  const filteredObjects = useMemo(() => {
    if (selectedCategory === 'todos') return availableObjects;
    return availableObjects.filter((object) => object.categoria === selectedCategory);
  }, [availableObjects, selectedCategory]);

  const handleDragStart = (e: React.DragEvent, data: CatalogoObjeto3D) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="absolute top-20 right-4 bottom-32 w-80 z-[200] bg-black/60 backdrop-blur-xl rounded-2xl flex flex-col overflow-hidden border border-amber-500/30 animate-in slide-in-from-right-8 duration-300 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-amber-500/10">
        <h2 className="text-white font-bold text-sm flex items-center gap-2">
          <span>🏗️</span> Catálogo de Construcción
        </h2>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10">
          ✕
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto p-3 scrollbar-hide flex-shrink-0 border-b border-white/5">
        {objectCategories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`
              flex-shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-200
              ${selectedCategory === category
                ? 'bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
              }
            `}
          >
            {CATEGORY_LABELS[category] || category}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/50 text-xs gap-2">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            Cargando catálogo...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredObjects.map((object) => (
              <ObjectCard
                key={object.id}
                nombre={object.nombre}
                categoria={CATEGORY_LABELS[object.categoria] || object.categoria}
                thumbnailUrl={object.thumbnail_url}
                interactuable={object.es_interactuable}
                sentable={object.es_sentable}
                isPremium={object.premium || false}
                onClick={() => onPrepararObjeto(object)}
                builtInColor={object.built_in_color}
                builtInGeometry={object.built_in_geometry}
                catalogData={object}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-3 text-[10px] text-center text-white/40 border-t border-white/5 bg-black/20">
        Arrastra un objeto al espacio o haz clic para colocarlo.
      </div>
    </div>
  );
};
