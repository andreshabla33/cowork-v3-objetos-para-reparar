/**
 * @module components/meetings/videocall/lobby/LobbyStatusHints
 *
 * Mensajes de estado discretos en el panel de ingreso:
 *   - Advertencias de compatibilidad de navegador
 *   - Errores de formulario o de sala
 *   - Feedback de preflight (permisos / dispositivos)
 *   - Aviso de sala de espera
 *   - Notas de fallback parcial/sin media
 *
 * Presentation layer — no contiene lógica de dominio.
 */

'use client';

import React from 'react';
import type { BrowserInfo, PreflightFeedback } from '@/modules/realtime-room';
import type { JoinMediaSummary } from '@/src/core/domain/entities/lobby';

interface LobbyStatusHintsProps {
  browserInfo: BrowserInfo;
  error: string | null;
  preflightFeedback: PreflightFeedback | null;
  salaEspera: boolean | undefined;
  joinMediaSummary: JoinMediaSummary;
}

// ── Componente de hint individual ─────────────────────────────────────────────

const Hint: React.FC<{
  variant: 'error' | 'warning' | 'info';
  children: React.ReactNode;
}> = ({ variant, children }) => {
  const styles = {
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-[rgba(46,150,245,0.14)] bg-[rgba(46,150,245,0.06)] text-[#4A6485]',
  } as const;

  const icons = {
    error: (
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    warning: (
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    info: (
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${styles[variant]}`}
    >
      {icons[variant]}
      <span>{children}</span>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────

export const LobbyStatusHints: React.FC<LobbyStatusHintsProps> = ({
  browserInfo,
  error,
  preflightFeedback,
  salaEspera,
  joinMediaSummary,
}) => {
  const hints: React.ReactNode[] = [];

  // 1. Browser warnings
  if (browserInfo.warnings.length > 0) {
    const variant = browserInfo.isSupported ? 'warning' : 'error';
    hints.push(
      <Hint key="browser" variant={variant}>
        {browserInfo.warnings.join(' ')}
      </Hint>,
    );
  }

  // 2. Form / room error
  if (error) {
    hints.push(
      <Hint key="error" variant="error">
        {error}
      </Hint>,
    );
  }

  // 3. Preflight feedback (device / permission issues)
  if (!error && preflightFeedback) {
    hints.push(
      <Hint key="preflight" variant={preflightFeedback.variant === 'error' ? 'error' : 'warning'}>
        <span>
          <strong>{preflightFeedback.title}.</strong>{' '}
          {preflightFeedback.message}
          {preflightFeedback.steps.length > 0 && (
            <> {preflightFeedback.steps[0]}</>
          )}
        </span>
      </Hint>,
    );
  }

  // 4. Sala de espera
  if (salaEspera) {
    hints.push(
      <Hint key="waiting" variant="info">
        Esperarás a que el anfitrión te admita
      </Hint>,
    );
  }

  // 5. Fallback notes — solo si no hay preflightFeedback que ya los cubra.
  // useLobbyState ya sobreescribe preflightFeedback con el mensaje de fallback
  // parcial, así que evitamos duplicar cuando preflightFeedback está presente.
  if (!preflightFeedback) {
    if (joinMediaSummary.hasPartialFallback && joinMediaSummary.availableLabel) {
      hints.push(
        <Hint key="partial" variant="warning">
          Entrarás solo con {joinMediaSummary.availableLabel}. Puedes activar el otro dispositivo desde la sala.
        </Hint>,
      );
    } else if (joinMediaSummary.hasNoMediaFallback) {
      hints.push(
        <Hint key="nomedia" variant="warning">
          Entrarás sin cámara ni micrófono. Puedes activarlos una vez dentro.
        </Hint>,
      );
    }
  }

  if (hints.length === 0) return null;

  return <div className="flex flex-col gap-2">{hints}</div>;
};
