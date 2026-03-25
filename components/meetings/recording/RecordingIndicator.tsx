/**
 * Indicador visual de grabación activa
 */

import React from 'react';

interface RecordingIndicatorProps {
  isRecording: boolean;
  duration: number;
  recordedBy?: string;
  participantCount?: number;
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

export const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({
  isRecording,
  duration,
  recordedBy,
  participantCount,
}) => {
  if (!isRecording) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 bg-black/80 backdrop-blur-xl px-4 py-2.5 rounded-full border border-red-500/30 shadow-2xl shadow-red-500/20">
        <div className="relative">
          <span className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75" />
          <span className="relative w-3 h-3 bg-red-500 rounded-full block" />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-xs font-bold uppercase tracking-wider">
            REC
          </span>
          <span className="text-white/60 text-xs">•</span>
          <span className="text-white font-mono text-sm">
            {formatDuration(duration)}
          </span>
        </div>

        {recordedBy && (
          <>
            <span className="text-white/30 text-xs">|</span>
            <span className="text-white/60 text-xs">
              por <span className="text-white/80">{recordedBy}</span>
            </span>
          </>
        )}

        {participantCount && participantCount > 0 && (
          <>
            <span className="text-white/30 text-xs">|</span>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-white/60 text-xs">{participantCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RecordingIndicator;
