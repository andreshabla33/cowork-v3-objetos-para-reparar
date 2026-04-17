// ─── SENTRY: MUST BE THE FIRST IMPORT ──────────────────────────────────────
// Docs oficiales: "Import your Sentry configuration as the first import
// in your application entry point, then render your app."
// @see https://docs.sentry.io/platforms/javascript/guides/react/
import './instrument';

// ─── Rapier wasm-bindgen deprecation suppressor ────────────────────────────
// Debe instalarse ANTES de que cualquier código importe @react-three/rapier
// (lo hacemos aquí, antes de App y DIProvider). Ver el JSDoc del módulo
// para el análisis upstream del warning.
import { installSuppressRapierDeprecationWarning } from './lib/rendering/suppressRapierDeprecationWarning';

installSuppressRapierDeprecationWarning();

import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.css';
import App from './App';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { DIProvider } from './src/core/infrastructure/di/DIProvider';
import { captureError } from './lib/monitoring/sentryInit';
import { registerSentryForwarder } from './lib/logger';

// ─── Conectar logger.error() → Sentry.captureException() ──────────────────
// El forwarder conecta el sistema de logging estructurado con Sentry
// sin acoplamiento duro entre ambos módulos.
registerSentryForwarder((err, ctx) => {
  void captureError(err, ctx);
});

// ─── PAGE EXIT: Untrack presence immediately on page close ────────────────
// Registered at the TOP LEVEL (not in React) so it ALWAYS fires, even if
// React unmount races with browser close. WorkspaceLayout wires its
// untrackAll() via window.__setUntrackFn when it mounts.
if (typeof window !== 'undefined') {
  let untrackFn: (() => void) | null = null;
  (window as any).__setUntrackFn = (fn: () => void) => {
    untrackFn = fn;
  };

  const handlePageExit = () => {
    try { untrackFn?.(); } catch { /* noop */ }
  };

  window.addEventListener('pagehide', handlePageExit);
  window.addEventListener('beforeunload', handlePageExit);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DIProvider>
        <App />
      </DIProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
