/**
 * @module domain/entities/lobby
 *
 * Entidades y tipos de dominio para el lobby de reuniones.
 * Capa Domain — sin dependencias de React, LiveKit ni Supabase.
 */

// ─── Info de sala ─────────────────────────────────────────────────────────────

export interface SalaInfo {
  nombre: string;
  tipo: 'deal' | 'entrevista' | 'general';
  organizador: string;
  configuracion: {
    sala_espera: boolean;
  };
}

// ─── Estado de disponibilidad de media ────────────────────────────────────────

export interface LobbyMediaStatus {
  cameraActive: boolean;
  microphoneActive: boolean;
}

export type JoinReadinessTone = 'error' | 'warning' | 'ready' | 'preparing';

export interface JoinStatusIndicator {
  tone: JoinReadinessTone;
  label: string;
}

export interface JoinMediaSummary {
  availableLabel: string;
  unavailableLabel: string | null;
  hasPartialFallback: boolean;
  hasNoMediaFallback: boolean;
}
