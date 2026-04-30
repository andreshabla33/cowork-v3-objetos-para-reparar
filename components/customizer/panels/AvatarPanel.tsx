/**
 * @module customizer/panels/AvatarPanel
 * @description Tab panel for browsing and equipping 3D avatars.
 * Shows avatar info card, grid of AvatarCards, and save confirmation.
 *
 * Clean Architecture: Presentation layer — UI only, catalog state via props.
 * Ref: React 19 — single responsibility, no derived state duplication.
 */

import React, { useMemo } from 'react';
import { AvatarCard } from '../../AvatarCard';
import type { UseAvatarCatalogReturn } from '@/hooks/customizer/useAvatarCatalog';

/** Subset of catalog state consumed by this panel. */
export interface AvatarPanelProps {
  catalog: Pick<
    UseAvatarCatalogReturn,
    | 'availableAvatars'
    | 'selectedAvatarId'
    | 'equippedAvatarId'
    | 'loadingAvatars'
    | 'avatarSaved'
    | 'changeEquippedAvatar'
  >;
}

export const AvatarPanel: React.FC<AvatarPanelProps> = ({ catalog }) => {
  // Reordenar: el avatar equipado aparece primero en la grilla para que el
  // usuario siempre lo encuentre sin scrollear. UX estandar en selectores de
  // equipo/skin (LoL, Fortnite, Gather.town). El orden base (DB.orden) se
  // preserva para los demas. Memo evita re-ordenar en cada render.
  const sortedAvatars = useMemo(() => {
    if (!catalog.equippedAvatarId) return catalog.availableAvatars;
    const equippedIdx = catalog.availableAvatars.findIndex(
      (a) => a.id === catalog.equippedAvatarId,
    );
    if (equippedIdx <= 0) return catalog.availableAvatars;
    const equipped = catalog.availableAvatars[equippedIdx];
    const rest = [
      ...catalog.availableAvatars.slice(0, equippedIdx),
      ...catalog.availableAvatars.slice(equippedIdx + 1),
    ];
    return [equipped, ...rest];
  }, [catalog.availableAvatars, catalog.equippedAvatarId]);

  return (
  <div className="space-y-2 animate-in fade-in duration-200">
    {/* Info del avatar seleccionado */}
    {catalog.selectedAvatarId && (() => {
      const sel = catalog.availableAvatars.find((a) => a.id === catalog.selectedAvatarId);
      return sel ? (
        <div className="bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-xl p-2.5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[#0B2240] uppercase tracking-wide truncate">{sel.nombre}</h3>
              <p className="text-[9px] text-[#4A6485] mt-0.5">{sel.descripcion || 'Avatar 3D listo para el espacio virtual.'}</p>
            </div>
            {catalog.equippedAvatarId === sel.id && (
              <span className="flex-shrink-0 rounded-lg bg-[#2E96F5] px-2 py-0.5 text-[8px] font-bold uppercase text-white">✓ Equipado</span>
            )}
          </div>
        </div>
      ) : null;
    })()}

    {catalog.loadingAvatars ? (
      <div className="flex items-center justify-center gap-2 text-[#4A6485] text-xs py-8">
        <div className="w-4 h-4 border-2 border-[#2E96F5] border-t-transparent rounded-full animate-spin" />
        Cargando modelos...
      </div>
    ) : (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar pb-4">
        {sortedAvatars.map((avatar) => (
          <AvatarCard
            key={avatar.id}
            onClick={() => void catalog.changeEquippedAvatar(avatar.id)}
            nombre={avatar.nombre}
            descripcion={avatar.descripcion}
            thumbnailUrl={avatar.thumbnail_url}
            seleccionado={catalog.selectedAvatarId === avatar.id}
            equipado={catalog.equippedAvatarId === avatar.id}
            isPremium={avatar.premium || false}
          />
        ))}
      </div>
    )}

    {catalog.avatarSaved && (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600 text-center">
        ✓ Avatar equipado correctamente.
      </div>
    )}
  </div>
  );
};
