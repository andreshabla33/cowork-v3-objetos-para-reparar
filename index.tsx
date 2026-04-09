// ─── SENTRY: MUST BE THE FIRST IMPORT ──────────────────────────────────────
// Docs oficiales: "Import your Sentry configuration as the first import
// in your application entry point, then render your app."
// @see https://docs.sentry.io/platforms/javascript/guides/react/
import './instrument';

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
