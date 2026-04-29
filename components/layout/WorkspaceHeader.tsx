/**
 * @module components/layout/WorkspaceHeader
 * @description **Retired.** The previous top header (theme picker, games button,
 * Mónica AI, status selector) has been removed from all workspace spaces —
 * its functionality moved to the BottomControlBar, WorkspaceSidebar, and
 * SettingsModal.
 *
 * The component is kept as an exported no-op to preserve `components/layout`'s
 * public surface and avoid a wider refactor of WorkspaceLayout. New code should
 * not depend on it.
 */

import React from 'react';
import type { ThemeStyleSet } from '@/lib/theme';
import type { ThemeType } from '@/types';
import type { SubTabType } from '@/types/workspace';
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

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = React.memo(() => null);

WorkspaceHeader.displayName = 'WorkspaceHeader';
