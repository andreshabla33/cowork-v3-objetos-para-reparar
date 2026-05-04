/**
 * @module components/layout/WorkspaceHeader
 * @description Top bar del workspace — Aurora GLASS.
 *
 * Calm Design: 1 acción primaria (Mónica AI), pesos secundarios (theme picker,
 * games), status del usuario. Toda la paleta vive en aurora-glass.css.
 *
 * Clean Architecture: capa de presentación pura. Sin lógica de negocio.
 */

import React from 'react';
import { StatusSelector } from '../StatusSelector';
import { THEME_LIST, type ThemeStyleSet } from '@/lib/theme';
import type { ThemeType } from '@/types';
import type { SubTabType } from '@/types/workspace';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

export interface WorkspaceHeaderProps {
  theme: ThemeType;
  styles: ThemeStyleSet;
  activeSubTab: SubTabType;
  currentLang: Language;
  onThemeChange: (theme: ThemeType) => void;
  onOpenGameHub: () => void;
  onToggleViben: () => void;
}

const SUBTAB_LABEL: Partial<Record<SubTabType, string>> = {
  space:        'Spatial World',
  chat:         'Mensajes',
  tasks:        'Tareas',
  miembros:     'Miembros',
  settings:     'Ajustes',
  builder:      'Builder',
  avatar:       'Avatar',
  calendar:     'Calendario',
  grabaciones:  'Grabaciones',
  metricas:     'Métricas',
};

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = React.memo(({
  theme, activeSubTab, currentLang,
  onThemeChange, onOpenGameHub, onToggleViben,
}) => (
  <header className="ag-header h-16 hidden md:flex items-center justify-between px-8 z-50 shrink-0">
    {/* Título de sección con dot calm */}
    <div className="flex items-center gap-3 min-w-0">
      <span
        className="ag-pill__dot"
        aria-hidden="true"
        style={{ background: 'var(--cw-blue-500)', boxShadow: '0 0 8px rgba(46, 150, 245, 0.5)' }}
      />
      <h2
        className="ag-h2 truncate"
        style={{ fontSize: 16, color: 'var(--cw-ink-900)' }}
      >
        {SUBTAB_LABEL[activeSubTab] ?? activeSubTab}
      </h2>
    </div>

    <div className="flex items-center gap-3">
      <StatusSelector />

      {/* Theme picker calm — paleta entera disponible */}
      <div
        data-tour-step="theme-selector"
        className="hidden lg:flex items-center gap-1 p-1 rounded-2xl border"
        style={{
          background: 'var(--cw-glass-bg)',
          borderColor: 'var(--cw-glass-border)',
          backdropFilter: 'blur(20px) saturate(160%)',
        }}
      >
        <span
          className="px-2 hidden xl:inline-block"
          style={{
            fontFamily: 'var(--cw-font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--cw-ink-400)',
          }}
        >
          {t('theme.style', currentLang)}
        </span>
        {THEME_LIST.map(themeOpt => {
          const active = theme === themeOpt.id;
          return (
            <button
              key={themeOpt.id}
              type="button"
              onClick={() => onThemeChange(themeOpt.id)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all"
              style={{
                background: active ? 'rgba(46, 150, 245, 0.18)' : 'transparent',
                border: active ? '1px solid rgba(46, 150, 245, 0.4)' : '1px solid transparent',
                color: active ? 'var(--cw-blue-600)' : 'var(--cw-ink-400)',
                boxShadow: active ? '0 4px 14px -6px rgba(46, 150, 245, 0.5)' : 'none',
              }}
              title={t(themeOpt.labelKey, currentLang)}
            >
              {themeOpt.icon}
            </button>
          );
        })}
      </div>

      {/* Games (acción secundaria) */}
      <button
        type="button"
        data-tour-step="games-btn"
        onClick={onOpenGameHub}
        className="ag-btn ag-btn--secondary ag-btn--sm hidden lg:inline-flex"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
        <span>{t('button.games', currentLang)}</span>
      </button>

      {/* Mónica AI — acción primaria, una sola por pantalla */}
      <button
        type="button"
        data-tour-step="viben-btn"
        onClick={onToggleViben}
        className="ag-btn ag-btn--primary"
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 0 6px rgba(255,255,255,0.6)' }}
          aria-hidden="true"
        />
        Mónica AI
      </button>
    </div>
  </header>
));

WorkspaceHeader.displayName = 'WorkspaceHeader';
