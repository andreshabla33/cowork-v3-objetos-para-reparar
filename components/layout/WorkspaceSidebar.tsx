/**
 * @module components/layout/WorkspaceSidebar
 * @description Icon rail (raíl vertical) — Aurora GLASS.
 *
 * Render del navegador global vertical (desktop): logo, nav icónico, settings,
 * avatar de usuario y logout. Diseño calm + spatial UI: superficie translúcida
 * blanca, indicador azul a la izquierda del item activo, sombras z-depth.
 *
 * Clean Architecture: capa de presentación pura. Recibe props, no toca store.
 * Estética 100% tokenizada vía clases `.ag-rail*` en `styles/aurora-glass.css`.
 */

import React from 'react';
import { UserAvatar } from '../UserAvatar';
import type { ThemeStyleSet } from '@/lib/theme';
import type { ThemeType, PresenceStatus } from '@/types';
import type { SubTabType } from '@/types/workspace';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

interface NavItem {
  id: SubTabType;
  iconPath: string;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'space',        iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',                                                                                                       labelKey: 'nav.space' },
  { id: 'chat',         iconPath: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',                                                                                                                                          labelKey: 'nav.messages' },
  { id: 'tasks',        iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',                                                                                                                    labelKey: 'nav.tasks' },
  { id: 'grabaciones',  iconPath: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',                                                                                                                  labelKey: 'nav.recordings' },
  { id: 'metricas',     iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',                                               labelKey: 'nav.metrics' },
];

export interface WorkspaceSidebarProps {
  theme: ThemeType;
  styles: ThemeStyleSet;
  activeSubTab: SubTabType;
  currentLang: Language;
  userName: string;
  userProfilePhoto: string | undefined;
  userStatus: PresenceStatus;
  unreadChatCount: number;
  isLoggingOut: boolean;
  onNavigate: (tab: SubTabType) => void;
  onClearUnreadChat: () => void;
  onOpenSettings: () => void;
  onNavigateToDashboard: () => void;
  onNavigateToAvatar: () => void;
  onLogout: () => void;
}

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = React.memo(({
  activeSubTab, currentLang,
  userName, userProfilePhoto, userStatus,
  unreadChatCount, isLoggingOut,
  onNavigate, onClearUnreadChat, onOpenSettings,
  onNavigateToDashboard, onNavigateToAvatar, onLogout,
}) => (
  <aside className="ag-rail hidden md:flex">
    {/* Brand — vuelve al menú principal */}
    <button
      type="button"
      onClick={onNavigateToDashboard}
      className="ag-rail__brand"
      title="Inicio · Cowork"
      aria-label="Volver al menú principal"
    >
      <Icon
        size={18}
        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
      />
    </button>

    {/* Nav principal */}
    <nav className="ag-rail__nav" data-tour-step="sidebar-nav" aria-label="Navegación principal">
      {NAV_ITEMS.map(item => {
        const active = activeSubTab === item.id;
        const showBadge = item.id === 'chat' && unreadChatCount > 0 && !active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onNavigate(item.id);
              if (item.id === 'chat') onClearUnreadChat();
            }}
            className={`ag-rail__btn${active ? ' is-active' : ''}`}
            aria-pressed={active}
            title={t(item.labelKey, currentLang)}
          >
            <Icon d={item.iconPath} size={22} />
            {showBadge && (
              <span className="ag-rail__badge" aria-label={`${unreadChatCount} mensajes sin leer`}>
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>

    {/* Bottom: settings + avatar + logout */}
    <div className="ag-rail__bottom">
      <button
        type="button"
        data-tour-step="settings-btn"
        onClick={onOpenSettings}
        className="ag-rail__btn"
        title={t('nav.settings', currentLang)}
        aria-label={t('nav.settings', currentLang)}
      >
        <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </button>

      <UserAvatar
        name={userName}
        profilePhoto={userProfilePhoto}
        size="sm"
        showStatus
        status={userStatus}
        onClick={onNavigateToAvatar}
      />

      <button
        id="sidebar-logout-btn"
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="ag-rail__btn ag-rail__btn--danger"
      >
        {isLoggingOut ? (
          <svg width={18} height={18} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} fill="none" opacity={0.25} />
            <path fill="currentColor" opacity={0.75} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        )}
      </button>
    </div>
  </aside>
));

WorkspaceSidebar.displayName = 'WorkspaceSidebar';
