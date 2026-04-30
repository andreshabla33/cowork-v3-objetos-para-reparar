/**
 * @module components/ui/AICopilotSlot
 * @description Slot flotante reservado para el copiloto IA — Aurora GLASS.
 *
 * Filosofía:
 *   - AI-Native readiness (sin implementar IA aún)
 *   - Calm Design: presencia discreta bottom-right, no invade
 *   - Microfísica suave (hover lift)
 *   - Liquid Glass surface
 *
 * Cuando se integre el copiloto, basta envolver `onOpen` con la lógica real
 * (abrir panel lateral, modal, etc.). Hoy emite un evento console + callback.
 *
 * Uso:
 *   <AICopilotSlot
 *     label="Asistente"
 *     hint="Pulsa para sugerencias"
 *     onOpen={() => setPanelOpen(true)}
 *   />
 */

import React from 'react';

interface AICopilotSlotProps {
  /** Etiqueta visible junto al avatar (ej. "Asistente Cowork") */
  label?: string;
  /** Hint en mayúsculas tipo monoespaciada (ej. "PULSA SHIFT + K") */
  hint?: string;
  /** Inicial del avatar (1 carácter recomendado) */
  initial?: string;
  /** Callback al activar el slot. Hoy: log. Mañana: abre el copiloto. */
  onOpen?: () => void;
  /** Permite ocultar el slot temporalmente sin desmontar */
  visible?: boolean;
}

export const AICopilotSlot: React.FC<AICopilotSlotProps> = ({
  label = 'Asistente',
  hint = 'IA · próximamente',
  initial = '✦',
  onOpen,
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      className="ag-copilot-slot ag-anim-up"
      aria-label={`${label} — ${hint}`}
      onClick={() => {
        onOpen?.();
      }}
    >
      <span className="ag-copilot-slot__avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="ag-copilot-slot__label">
        <span className="ag-copilot-slot__title">{label}</span>
        <span className="ag-copilot-slot__hint">{hint}</span>
      </span>
    </button>
  );
};

export default AICopilotSlot;
