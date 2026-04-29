/**
 * @module components/layout/WorkspaceSidebar
 * @description Infrastructure UI component for the global sidebar navigation.
 * Renders the icon-based nav rail (desktop only), user avatar, settings, and logout.
 *
 * Clean Architecture: Presentation layer — receives all state/callbacks via props,
 * contains zero business logic or side effects.
 */

import React from 'react';
import { UserAvatar } from '../UserAvatar';
import type { ThemeStyleSet } from '@/lib/theme';
import type { ThemeType, PresenceStatus } from '@/types';
import type { SubTabType } from '@/types/workspace';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

/** Navigation item definition for the sidebar */
interface NavItem {
  id: SubTabType;
  icon: string;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'space', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', labelKey: 'nav.space' },
  { id: 'chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', labelKey: 'nav.messages' },
  { id: 'tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', labelKey: 'nav.tasks' },
  { id: 'grabaciones', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', labelKey: 'nav.recordings' },
  { id: 'metricas', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', labelKey: 'nav.metrics' },
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

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = React.memo(({
  theme, styles: s, activeSubTab, currentLang,
  userName, userProfilePhoto, userStatus,
  unreadChatCount, isLoggingOut,
  onNavigate, onClearUnreadChat, onOpenSettings,
  onNavigateToDashboard, onNavigateToAvatar, onLogout,
}) => {
  const isArcade = theme === 'arcade';

  return (
    <aside className={`w-[52px] hidden md:flex flex-col items-center py-4 gap-3 shrink-0 z-[100] border-r ${
      isArcade
        ? 'bg-black border-[#00ff41]/40'
        : 'bg-[#F1F5FA] border-[#E3EAF2]'
    }`}>
      {/* Logo */}
      <div
        onClick={onNavigateToDashboard}
        className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer hover:scale-105 transition-all shadow-md overflow-hidden ${
          isArcade ? 'bg-[#00ff41]' : 'bg-gradient-to-br from-sky-400 to-sky-600'
        }`}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5 mt-2" data-tour-step="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              if (item.id === 'chat') onClearUnreadChat();
            }}
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 group ${
              isArcade
                ? activeSubTab === item.id
                  ? 'bg-[#00ff41]/15 text-[#00ff41]'
                  : 'text-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/10'
                : activeSubTab === item.id
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-white'
            }`}
            title={t(item.labelKey, currentLang)}
          >
            {activeSubTab === item.id && !isArcade && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 rounded-r-full bg-sky-500" />
            )}
            {activeSubTab === item.id && isArcade && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]" />
            )}
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={item.icon} />
            </svg>
            {item.id === 'chat' && unreadChatCount > 0 && activeSubTab !== 'chat' && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="mt-auto flex flex-col gap-1 items-center pb-2">
        <button
          data-tour-step="settings-btn"
          onClick={onOpenSettings}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
            isArcade
              ? 'text-[#00ff41]/60 hover:text-[#00ff41] hover:bg-[#00ff41]/10'
              : 'text-slate-400 hover:text-slate-600 hover:bg-white'
          }`}
          title={t('nav.settings', currentLang)}
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
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
          onClick={onLogout}
          disabled={isLoggingOut}
          title="Cerrar sesión"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
            isArcade
              ? 'text-red-400/70 hover:text-red-400 hover:bg-red-400/10'
              : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
          }`}
        >
          {isLoggingOut ? (
            <svg className="w-[18px] h-[18px] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
});

WorkspaceSidebar.displayName = 'WorkspaceSidebar';
