/**
 * Botón de grabación estilo Gather con animación de pulso
 */

import React from 'react';
import { RecordingStatus } from './types';

interface RecordingButtonProps {
  status: RecordingStatus;
  duration: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const formatDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

export const RecordingButton: React.FC<RecordingButtonProps> = ({
  status,
  duration,
  onStart,
  onPause,
  onResume,
  onStop,
  disabled = false,
  size = 'md',
}) => {
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle';
  const isProcessing = ['uploading', 'processing', 'transcribing', 'analyzing'].includes(status);

  const handleClick = () => {
    if (disabled) return;
    
    if (isIdle) {
      onStart();
    } else if (isRecording) {
      onPause();
    } else if (isPaused) {
      onResume();
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStop();
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={handleClick}
          disabled={disabled || isProcessing}
          className={`
            ${sizeClasses[size]}
            relative rounded-full flex items-center justify-center
            transition-all duration-300 ease-out
            ${isRecording 
              ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50' 
              : isPaused
                ? 'bg-yellow-500 hover:bg-yellow-600 shadow-lg shadow-yellow-500/50'
                : isProcessing
                  ? 'bg-indigo-500 animate-pulse cursor-wait'
                  : 'bg-zinc-700 hover:bg-zinc-600'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={
            isIdle ? 'Iniciar grabación' :
            isRecording ? 'Pausar grabación' :
            isPaused ? 'Reanudar grabación' :
            isProcessing ? 'Procesando...' : ''
          }
        >
          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50" />
          )}
          
          {isIdle && (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" />
            </svg>
          )}
          
          {isRecording && (
            <svg className="w-4 h-4 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="4" height="12" rx="1" />
              <rect x="14" y="6" width="4" height="12" rx="1" />
            </svg>
          )}
          
          {isPaused && (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          
          {isProcessing && (
            <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </button>

        {(isRecording || isPaused) && (
          <button
            onClick={handleStop}
            className="absolute -right-1 -bottom-1 w-5 h-5 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center border-2 border-zinc-900 transition-colors"
            title="Detener grabación"
          >
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}
      </div>

      {(isRecording || isPaused) && (
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`} />
          <span className="text-xs font-mono text-white/80">
            {formatDuration(duration)}
          </span>
        </div>
      )}

      {isProcessing && (
        <span className="text-xs text-indigo-400 animate-pulse">
          {status === 'uploading' && 'Subiendo...'}
          {status === 'processing' && 'Procesando...'}
          {status === 'transcribing' && 'Transcribiendo...'}
          {status === 'analyzing' && 'Analizando...'}
        </span>
      )}
    </div>
  );
};

export default RecordingButton;
