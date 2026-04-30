/**
 * @module components/layout/MobileNavOverlay
 * @description Infrastructure UI component for mobile navigation.
 * Renders the FAB (Floating Action Button) and fullscreen grid menu overlay.
 *
 * Clean Architecture: Presentation layer — zero business logic.
 * Ref: react.dev "Thinking in React" — extracted from monolithic WorkspaceLayout.
 */

import React, { useCallback } from 'react';
import type { ThemeStyleSet } from '@/lib/theme';
import type { ThemeType } from '@/types';
import type { SubTabType } from '@/types/workspace';

/** Mobile nav grid item configuration */
interface MobileNavItem {
  id: string;
  icon: string;
  label: string;
  color: string;
  badge?: number;
}

export interface MobileNavOverlayProps {
  theme: ThemeType;
  styles: ThemeStyleSet;
  isMenuOpen: boolean;
  unreadChatCount: number;
  onToggleMenu: () => void;
  onNavigate: (tab: SubTabType) => void;
  onClearUnreadChat: () => void;
  onOpenGameHub: () => void;
  onOpenSettings: () => void;
  onOpenDrawer: () => void;
}

const MOBILE_NAV_ITEMS: Omit<MobileNavItem, 'badge'>[] = [
  { id: 'space', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Espacio', color: 'from-indigo-500 to-blue-500' },
  { id: 'chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', label: 'Chat', color: 'from-blue-500 to-cyan-500' },
  { id: '_drawer_sidebar', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', label: 'Workspace', color: 'from-violet-500 to-purple-500' },
  { id: '_games', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z', label: 'Juegos', color: 'from-amber-500 to-orange-500' },
  { id: '_settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', label: 'Ajustes', color: 'from-zinc-400 to-zinc-600' },
  { id: 'calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Calendario', color: 'from-emerald-500 to-teal-500' },
];

/** Valid SubTabType values for type-safe navigation */
const VALID_SUBTABS = new Set<string>([
  'space', 'chat', 'tasks', 'grabaciones', 'metricas', 'miembros', 'avatar', 'calendar',
]);

export const MobileNavOverlay: React.FC<MobileNavOverlayProps> = React.memo(({
  theme, styles: s, isMenuOpen, unreadChatCount,
  onToggleMenu, onNavigate, onClearUnreadChat,
  onOpenGameHub, onOpenSettings, onOpenDrawer,
}) => {
  const handleItemClick = useCallback((itemId: string) => {
    onToggleMenu();
    if (itemId === '_games') { onOpenGameHub(); return; }
    if (itemId === '_settings') { onOpenSettings(); return; }
    if (itemId === '_drawer_sidebar') { onOpenDrawer(); return; }
    if (VALID_SUBTABS.has(itemId)) {
      onNavigate(itemId as SubTabType);
      if (itemId === 'chat') onClearUnreadChat();
    }
  }, [onToggleMenu, onOpenGameHub, onOpenSettings, onOpenDrawer, onNavigate, onClearUnreadChat]);

  return (
    <>
      {/* FAB: Floating Action Button */}
      <button
        onClick={onToggleMenu}
        className={`fixed top-3 right-3 z-[210] w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-xl border transition-all duration-300 ${
          isMenuOpen
            ? 'bg-blue-50 border-[var(--cw-blue-300)] rotate-90 scale-110 text-[var(--cw-blue-600)]'
            : 'bg-white/80 border-[var(--cw-glass-border)] text-[var(--cw-ink-500)]'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {isMenuOpen ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">{unreadChatCount > 9 ? '9+' : unreadChatCount}</span>
            )}
          </>
        )}
      </button>

      {/* Fullscreen Overlay Grid */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[205] flex items-center justify-center animate-in fade-in duration-200" onClick={onToggleMenu}>
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xl" />
          <div className="relative grid grid-cols-3 gap-4 p-8 max-w-xs" onClick={(e) => e.stopPropagation()}>
            {MOBILE_NAV_ITEMS.map((item, i) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="flex flex-col items-center gap-2 group"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-active:scale-90 transition-transform relative`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                  {item.id === 'chat' && unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-white">{unreadChatCount > 9 ? '9+' : unreadChatCount}</span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-[var(--cw-ink-700)]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

MobileNavOverlay.displayName = 'MobileNavOverlay';
