import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.css';
import App from './App';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { initSentry, captureError } from './lib/monitoring/sentryInit';
import { registerSentryForwarder } from './lib/logger';

// ─── Inicialización de Sentry (Roadmap REMEDIATION-008) ──────────────────────
// initSentry es no-op si VITE_SENTRY_DSN no está definido (desarrollo local).
// El forwarder conecta logger.error() con Sentry.captureException() sin acoplamiento duro.
void initSentry().then(() => {
  registerSentryForwarder((err, ctx) => {
    void captureError(err, ctx);
  });
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
