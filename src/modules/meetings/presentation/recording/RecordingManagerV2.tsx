/**
 * @module components/meetings/recording/RecordingManagerV2
 * @description Composition root del flujo de grabación con análisis conductual
 * avanzado (RRHH, Deals, Equipo).
 *
 * Refactor 2026-05-09 (ITEM 15 batch 1): god-component 720L → 100L. Toda la
 * lógica de orchestration (state machine, MediaRecorder, persistencia,
 * coordinación con useTranscription/useCombinedAnalysis) extraída a
 * `useRecordingV2`. Sub-componentes UI extraídos a `v2/RecordingManagerOverlays`
 * (modales fullscreen) y `v2/RecordingManagerWidgets` (HUD).
 *
 * Persistencia delegada al `recordingRepository` singleton (ITEM 6 batch 7,
 * commit 216d86f) — 0 supabase.from() / supabase.functions.invoke() en este
 * archivo.
 *
 * Características:
 * - Selector de tipo: RRHH, Deals, Equipo
 * - Disclaimer condicional (solo RRHH)
 * - Análisis facial avanzado con microexpresiones
 * - Análisis de lenguaje corporal
 * - Predicciones de comportamiento
 * - Dashboard específico por tipo
 */

import React from 'react';
import { useRecordingV2 } from '@/hooks/meetings/useRecordingV2';
import { RecordingTypeSelectorV2 } from './RecordingTypeSelectorV2';
import { AnalysisDashboard } from './AnalysisDashboard';
import {
  RecordingProcessingModal,
  RecordingErrorToast,
} from './v2/RecordingManagerOverlays';
import {
  RecordingMetricsBadge,
  RecordingFloatingButton,
  RecordingActiveIndicator,
} from './v2/RecordingManagerWidgets';
import type { CargoLaboral, ResultadoAnalisis } from './types/analysis';

interface RecordingManagerV2Props {
  espacioId: string;
  userId: string;
  userName: string;
  reunionTitulo?: string;
  stream: MediaStream | null;
  /** Cargo del usuario para permisos en el selector */
  cargoUsuario?: CargoLaboral;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onProcessingComplete?: (resultado: ResultadoAnalisis | null) => void;
}

export const RecordingManagerV2: React.FC<RecordingManagerV2Props> = ({
  espacioId,
  userId,
  userName,
  reunionTitulo,
  stream,
  cargoUsuario = 'colaborador',
  onRecordingStateChange,
  onProcessingComplete,
}) => {
  const {
    processingState,
    showTypeSelector,
    setShowTypeSelector,
    showDashboard,
    resultado,
    resumenTiempoReal,
    isRecording,
    config,
    handleTypeSelect,
    stopRecording,
    closeDashboard,
    closeError,
    exportResult,
    formatDuration,
  } = useRecordingV2({
    espacioId,
    userId,
    userName,
    reunionTitulo,
    stream,
    onRecordingStateChange,
    onProcessingComplete,
  });

  return (
    <>
      <RecordingTypeSelectorV2
        isOpen={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        onSelect={handleTypeSelect}
        cargoUsuario={cargoUsuario}
      />

      {showDashboard && resultado && (
        <AnalysisDashboard
          resultado={resultado}
          onClose={closeDashboard}
          onExport={exportResult}
        />
      )}

      <RecordingProcessingModal
        step={processingState.step}
        progress={processingState.progress}
        message={processingState.message}
      />

      <RecordingErrorToast
        step={processingState.step}
        message={processingState.message}
        onClose={closeError}
      />

      <RecordingMetricsBadge
        isRecording={isRecording}
        resumenTiempoReal={resumenTiempoReal}
        config={config}
      />

      <RecordingFloatingButton
        visible={processingState.step === 'idle' && !isRecording}
        hasStream={!!stream}
        onClick={() => setShowTypeSelector(true)}
      />

      <RecordingActiveIndicator
        visible={isRecording}
        duration={processingState.duration}
        formatDuration={formatDuration}
        onStop={stopRecording}
      />
    </>
  );
};

export default RecordingManagerV2;
