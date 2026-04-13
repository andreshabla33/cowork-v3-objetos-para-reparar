/**
 * @module components/layout/WorkspaceContentRouter
 * @description Infrastructure UI component that routes the active subtab to its
 * corresponding lazy-loaded panel. Also handles the mobile back-header.
 *
 * Clean Architecture: Presentation layer — maps SubTabType → lazy component.
 * Ref: react.dev "Thinking in React" — single-responsibility routing component.
 */

import React, { lazy, Suspense } from 'react';
import type { ThemeStyleSet } from '@/lib/theme';
import type { ThemeType } from '@/types';
import type { SubTabType } from '@/types/workspace';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

const TaskBoard = lazy(() => import('../TaskBoard').then(module => ({ default: module.TaskBoard })));
const MiembrosView = lazy(() => import('../MiembrosView').then(module => ({ default: module.MiembrosView })));
const AvatarCustomizer3D = lazy(() => import('../AvatarCustomizer3D'));
const ChatPanel = lazy(() => import('../ChatPanel').then(module => ({ default: module.ChatPanel })));
const CalendarPanel = lazy(() => import('../meetings/CalendarPanel'));
const GrabacionesHistorial = lazy(() => import('../meetings/recording/GrabacionesHistorial'));
const MetricasEmpresaPanel = lazy(() => import('../MetricasEmpresaPanel'));

const FallbackPanel = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex flex-col items-center gap-4 text-zinc-500">
      <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando módulo</p>
    </div>
  </div>
);

/** Mapping of subtab IDs to display labels for the mobile header */
const SUB_TAB_LABELS: Partial<Record<SubTabType, string>> = {
  chat: 'Chat',
  tasks: 'Tareas',
  calendar: 'Calendario',
  grabaciones: 'Grabaciones',
  miembros: 'Miembros',
  avatar: 'Avatar',
  metricas: 'Métricas',
};

export interface WorkspaceContentRouterProps {
  activeSubTab: SubTabType;
  theme: ThemeType;
  styles: ThemeStyleSet;
  currentLang: Language;
  isMobile: boolean;
  /** Workspace name and ID for inline settings panel */
  workspaceName: string;
  workspaceId: string;
  isAdmin: boolean;
  isLoggingOut: boolean;
  onNavigateToSpace: () => void;
  onLogout: () => void;
}

export const WorkspaceContentRouter: React.FC<WorkspaceContentRouterProps> = React.memo(({
  activeSubTab, theme, styles: s, currentLang, isMobile,
  workspaceName, workspaceId, isAdmin, isLoggingOut,
  onNavigateToSpace, onLogout,
}) => (
  <div className="h-full w-full flex flex-col overflow-hidden animate-in fade-in duration-500">
    {/* Mobile: header with back button */}
    {isMobile && (
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${s.border} shrink-0 ${s.header} backdrop-blur-xl`}>
        <button
          onClick={onNavigateToSpace}
          className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-xs font-black uppercase tracking-wider opacity-70">
          {SUB_TAB_LABELS[activeSubTab] ?? activeSubTab}
        </span>
      </div>
    )}

    <div className={`flex-1 overflow-y-auto ${isMobile ? 'pb-16' : ''}`}>
      <Suspense fallback={<FallbackPanel />}>
        {activeSubTab === 'tasks' && <TaskBoard />}
        {activeSubTab === 'miembros' && <MiembrosView />}
        {activeSubTab === 'avatar' && <AvatarCustomizer3D />}
        {activeSubTab === 'chat' && <ChatPanel chatOnly={true} />}
        {activeSubTab === 'calendar' && <CalendarPanel />}
        {activeSubTab === 'grabaciones' && <GrabacionesHistorial />}
        {activeSubTab === 'metricas' && <MetricasEmpresaPanel />}
      </Suspense>

      {activeSubTab === 'settings' && (
        <div className="p-6 md:p-16 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-5xl font-black uppercase italic tracking-tighter mb-6 md:mb-10">{t('settings.title', currentLang)}</h2>
          <div className={`p-4 md:p-12 rounded-2xl md:rounded-[50px] border-2 ${s.border} bg-black/10 backdrop-blur-3xl shadow-2xl`}>
            <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 md:pb-10 border-b-2 ${s.border}`}>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-30">{t('workspace.inUse', currentLang)}</p>
                <p className="text-xl md:text-4xl font-bold mt-2">{workspaceName}</p>
              </div>
              <button className={`px-6 md:px-10 py-3 md:py-4 rounded-2xl md:rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all ${s.btn}`}>{t('button.customize', currentLang)}</button>
            </div>
            <div className="pt-6 md:pt-10">
              <button
                onClick={onLogout}
                disabled={isLoggingOut}
                className="text-red-500 text-[11px] font-black uppercase tracking-[0.2em] hover:text-red-400 flex items-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingOut ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                )}
                {isLoggingOut ? 'Cerrando sesión...' : t('button.logout', currentLang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
));

WorkspaceContentRouter.displayName = 'WorkspaceContentRouter';
