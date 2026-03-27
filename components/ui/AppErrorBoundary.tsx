/**
 * ErrorBoundary — Global React error boundary with structured logging.
 *
 * Catches render-phase errors, logs them to the structured logger ring buffer,
 * and shows a recovery UI. Also installs global handlers for unhandled
 * promise rejections and uncaught JS errors.
 */
import React from 'react';
import { logger } from '@/lib/logger';

const log = logger.child('error-boundary');

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('React render error', {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    log.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 500),
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    log.error('Unhandled promise rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack?.slice(0, 500) : undefined,
    });
  };

  private handleRecover = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center gap-6 p-6">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Algo salió mal</h2>
          <p className="text-white/50 text-sm text-center max-w-md">
            {this.state.error?.message || 'Se produjo un error inesperado.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleRecover}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white text-sm font-medium transition-colors"
            >
              Reintentar
            </button>
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-sm font-medium transition-colors"
            >
              Recargar página
            </button>
          </div>
          <p className="text-zinc-700 text-xs mt-4">
            Los logs de diagnóstico se han guardado internamente.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
