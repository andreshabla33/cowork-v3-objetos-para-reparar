/**
 * @module lib/routing/appRouter
 * @description Declarative route resolver for the App component.
 * Replaces imperative if/else chains with a priority-ordered route table.
 *
 * Design: No external router dependency — lightweight pattern matching.
 * Each route defines a predicate (match condition) and a key.
 * The first matching route wins.
 *
 * Ref: React 19 — keeps App.tsx as a pure composition layer.
 */

export type AppRouteKey =
  | 'reset_password'
  | 'recovery_redirect'
  | 'recovery_error'
  | 'explorar'
  | 'thank_you'
  | 'meeting_lobby'
  | 'meeting_room'
  | 'direct_sala_auth'
  | 'direct_sala_loading'
  | 'direct_sala_login'
  | 'login'
  | 'app_loading'
  | 'dashboard'
  | 'workspace'
  | 'invitation'
  | 'onboarding'
  | 'onboarding_creador';

export interface AppRouteContext {
  // Auth
  session: unknown | null;
  initialized: boolean;
  view: string;
  // URL state (memoized)
  pathname: string;
  tipoRecuperacion: string | null;
  tokenHashRecuperacion: string | null;
  confirmationUrl: string | null;
  isRecoveryError: boolean;
  // Meeting state
  showThankYou: boolean;
  meetingToken: string | null;
  inMeeting: boolean;
  directSalaId: string | null;
}

interface RouteDefinition {
  key: AppRouteKey;
  match: (ctx: AppRouteContext) => boolean;
}

/**
 * Priority-ordered route table.
 * First match wins — order matters.
 */
const ROUTE_TABLE: RouteDefinition[] = [
  { key: 'reset_password', match: (ctx) => ctx.view === 'reset_password' },
  {
    key: 'recovery_redirect',
    match: (ctx) =>
      ctx.tipoRecuperacion === 'recovery' &&
      (!!ctx.tokenHashRecuperacion || !!ctx.confirmationUrl),
  },
  { key: 'recovery_error', match: (ctx) => ctx.isRecoveryError },
  { key: 'explorar', match: (ctx) => ctx.pathname === '/explorar' },
  { key: 'thank_you', match: (ctx) => ctx.showThankYou },
  {
    key: 'meeting_lobby',
    match: (ctx) => !!ctx.meetingToken && !ctx.inMeeting,
  },
  {
    key: 'meeting_room',
    match: (ctx) => !!ctx.meetingToken && ctx.inMeeting,
  },
  {
    key: 'direct_sala_auth',
    match: (ctx) => !!ctx.directSalaId && !!ctx.session,
  },
  {
    key: 'direct_sala_loading',
    match: (ctx) => !!ctx.directSalaId && !ctx.initialized,
  },
  {
    key: 'direct_sala_login',
    match: (ctx) => !!ctx.directSalaId && !ctx.session,
  },
  { key: 'login', match: (ctx) => !ctx.session },
  {
    key: 'app_loading',
    match: (ctx) => !ctx.initialized || ctx.view === 'loading',
  },
  { key: 'invitation', match: (ctx) => ctx.view === 'invitation' },
  { key: 'onboarding', match: (ctx) => ctx.view === 'onboarding' },
  { key: 'onboarding_creador', match: (ctx) => ctx.view === 'onboarding_creador' },
  { key: 'workspace', match: (ctx) => ctx.view === 'workspace' },
  { key: 'dashboard', match: () => true }, // fallback
];

/**
 * Resolve the current route based on application context.
 * Returns the key of the first matching route.
 */
export function resolverRutaApp(ctx: AppRouteContext): AppRouteKey {
  for (const route of ROUTE_TABLE) {
    if (route.match(ctx)) return route.key;
  }
  return 'dashboard';
}
