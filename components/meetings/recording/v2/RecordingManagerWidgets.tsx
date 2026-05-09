/**
 * @module components/meetings/recording/v2/RecordingManagerWidgets
 * @description HUD widgets del RecordingManagerV2: métricas en tiempo real,
 * botón flotante para iniciar grabación, e indicador de grabación activa.
 *
 * Clean Architecture: capa de presentación pura. Recibe props, no toca state
 * global. Aislados del hook useRecordingV2 para reducir el archivo principal.
 */

import React from 'react';
import type { AnalisisResumenTiempoReal } from '@/components/meetings/recording/useCombinedAnalysis';
import type { CONFIGURACIONES_GRABACION_DETALLADO, TipoGrabacionDetallado } from '@/components/meetings/recording/types/analysis';

type ConfigGrabacion = (typeof CONFIGURACIONES_GRABACION_DETALLADO)[TipoGrabacionDetallado];

interface MetricsBadgeProps {
  isRecording: boolean;
  resumenTiempoReal: AnalisisResumenTiempoReal | null;
  config: ConfigGrabacion | null;
}

export const RecordingMetricsBadge: React.FC<MetricsBadgeProps> = ({ isRecording, resumenTiempoReal, config }) => {
  if (!isRecording || !resumenTiempoReal) return null;

  const emocionEmoji =
    resumenTiempoReal.emocionActual === 'happy' ? '😊' :
    resumenTiempoReal.emocionActual === 'sad' ? '😢' :
    resumenTiempoReal.emocionActual === 'angry' ? '😠' :
    resumenTiempoReal.emocionActual === 'surprised' ? '😲' :
    resumenTiempoReal.emocionActual === 'neutral' ? '😐' :
    resumenTiempoReal.emocionActual === 'fearful' ? '😨' :
    resumenTiempoReal.emocionActual === 'disgusted' ? '🤢' : '';

  const engagementColor =
    resumenTiempoReal.engagementActual > 0.6 ? 'bg-green-500' :
    resumenTiempoReal.engagementActual > 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="fixed bottom-24 left-4 z-[200] space-y-2">
      {config && (
        <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${config.color} text-white text-sm font-medium flex items-center gap-2 shadow-lg`}>
          <span>{config.icono}</span>
          <span>{config.titulo}</span>
        </div>
      )}

      <div className="bg-white/75 backdrop-blur rounded-xl p-3 border border-[rgba(46,150,245,0.14)] shadow-lg space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <span className="text-[#4A6485] text-xs">Engagement</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-[rgba(46,150,245,0.08)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${engagementColor}`}
                style={{ width: `${resumenTiempoReal.engagementActual * 100}%` }}
              />
            </div>
            <span className="text-white text-xs font-mono">
              {Math.round(resumenTiempoReal.engagementActual * 100)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#4A6485] text-xs">Emoción</span>
          <span className="text-white text-sm">
            {emocionEmoji} {resumenTiempoReal.emocionActual}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#4A6485] text-xs">Postura</span>
          <span className="text-white text-xs capitalize">
            {resumenTiempoReal.posturaActual.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#4A6485] text-xs">Microexpr.</span>
          <span className="text-[#1E86E5] text-xs font-mono">
            {resumenTiempoReal.microexpresionesCount}
          </span>
        </div>

        {resumenTiempoReal.alertas.length > 0 && (
          <div className="pt-2 border-t border-[rgba(46,150,245,0.14)]">
            {resumenTiempoReal.alertas.slice(0, 2).map((alerta, i) => (
              <p key={i} className="text-amber-400 text-xs">{alerta}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface FloatingButtonProps {
  visible: boolean;
  hasStream: boolean;
  onClick: () => void;
}

export const RecordingFloatingButton: React.FC<FloatingButtonProps> = ({ visible, hasStream, onClick }) => {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200]">
      {hasStream ? (
        <button
          onClick={onClick}
          className="group relative flex items-center gap-3 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] hover:from-[#4FB0FF] hover:to-[#1E86E5] text-white px-5 py-3 rounded-2xl shadow-2xl transition-all hover:scale-105"
        >
          <span className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></span>
          <span className="font-bold text-sm">Grabar con Análisis</span>
          <span className="text-xl">🧠</span>

          <div className="absolute bottom-full mb-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-[#0B2240]/80 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
              Grabación con análisis conductual
            </div>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-3 bg-white text-[#4A6485] px-5 py-3 rounded-2xl shadow-lg cursor-not-allowed">
          <span className="w-4 h-4 bg-[#9CB0CA] rounded-full"></span>
          <span className="font-bold text-sm">Esperando cámara...</span>
          <span className="text-xl animate-spin">⏳</span>
        </div>
      )}
    </div>
  );
};

interface ActiveIndicatorProps {
  visible: boolean;
  duration: number;
  formatDuration: (seconds: number) => string;
  onStop: () => void;
}

export const RecordingActiveIndicator: React.FC<ActiveIndicatorProps> = ({ visible, duration, formatDuration, onStop }) => {
  if (!visible) return null;

  return (
    <div className="fixed top-4 left-4 z-[200]">
      <div className="flex items-center gap-3 bg-red-600 px-4 py-2 rounded-full shadow-lg">
        <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
        <span className="text-white font-mono font-bold">
          {formatDuration(duration)}
        </span>
        <button
          onClick={onStop}
          className="ml-2 bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs font-medium transition-colors"
        >
          Detener
        </button>
      </div>
    </div>
  );
};
