/**
 * @module store/orchestrators/bootstrap/viewResolver
 * @description Determines the initial view based on workspaces, tokens, and settings.
 * Atomic orchestrator — pure routing logic, no Supabase calls.
 */

import type { Workspace } from '../../../types';
import { getSettingsSection } from '../../../lib/userSettings';
import { logger } from '../../../lib/logger';

const log = logger.child('view-resolver');

export type ResolvedView = 'invitation' | 'onboarding_creador' | 'workspace' | 'dashboard';

export interface ViewResolverInput {
  workspaces: Workspace[];
  storageWorkspaceKey: string;
  currentView: string;
}

export interface ViewResolverResult {
  view: ResolvedView;
  workspace: Workspace | null;
}

/**
 * Resolve the initial view after authentication.
 * Pure function — no side effects, no infrastructure calls.
 */
export function resolverVista(input: ViewResolverInput): ViewResolverResult {
  const { workspaces, storageWorkspaceKey, currentView } = input;

  // Preserve reset_password view
  if (currentView === 'reset_password') {
    log.debug('Maintaining reset_password view');
    return { view: 'dashboard', workspace: null };
  }

  // Check for invitation token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const invitationToken = urlParams.get('token');

  if (invitationToken) {
    log.info('Invitation token found, going to invitation view');
    return { view: 'invitation', workspace: null };
  }

  if (workspaces.length === 0) {
    log.info('No workspaces, going to onboarding_creador');
    return { view: 'onboarding_creador', workspace: null };
  }

  const savedId = localStorage.getItem(storageWorkspaceKey);

  if (workspaces.length === 1) {
    log.info('Single workspace, auto-selecting', { name: workspaces[0].name });
    return { view: 'workspace', workspace: workspaces[0] };
  }

  if (savedId) {
    const found = workspaces.find((ws) => ws.id === savedId);
    if (found) {
      log.info('Restoring workspace from localStorage', { name: found.name });
      return { view: 'workspace', workspace: found };
    }
    log.debug('Saved workspace not found, going to dashboard');
  }

  const generalSettings = getSettingsSection('general');
  if (generalSettings.skipWelcomeScreen && workspaces.length > 0) {
    log.debug('Skipping welcome, going to first workspace');
    return { view: 'workspace', workspace: workspaces[0] };
  }

  log.debug('Multiple workspaces, going to dashboard');
  return { view: 'dashboard', workspace: null };
}
