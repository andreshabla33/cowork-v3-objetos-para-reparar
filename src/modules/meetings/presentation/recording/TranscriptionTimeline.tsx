/**
 * Timeline visual de transcripción con emociones
 */

import React, { useRef, useEffect } from 'react';
import { TranscriptionSegment, EmotionAnalysis } from './types';

interface TranscriptionTimelineProps {
  segments: TranscriptionSegment[];
  emotions: EmotionAnalysis[];
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  showEmotions?: boolean;
}

const emotionEmojis: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😲',
  fearful: '😨',
  disgusted: '🤢',
  neutral: '😐',
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const TranscriptionTimeline: React.FC<TranscriptionTimelineProps> = ({
  segments,
  emotions,
  currentTime,
  duration,
  onSeek,
  showEmotions = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments]);

  const getEmotionForSegment = (segment: TranscriptionSegment): string => {
    const matchingEmotion = emotions.find(
      e => e.timestamp_segundos >= segment.inicio_segundos && 
           e.timestamp_segundos <= segment.fin_segundos
    );
    return matchingEmotion?.emocion_dominante || 'neutral';
  };

  const getEngagementForSegment = (segment: TranscriptionSegment): number => {
    const matchingEmotions = emotions.filter(
      e => e.timestamp_segundos >= segment.inicio_segundos && 
           e.timestamp_segundos <= segment.fin_segundos
    );
    if (matchingEmotions.length === 0) return 0.5;
    return matchingEmotions.reduce((sum, e) => sum + e.engagement_score, 0) / matchingEmotions.length;
  };

  return (
    <div className="flex flex-col h-full bg-white/500 rounded-xl border border-[rgba(46,150,245,0.14)]">
      <div className="p-3 border-b border-[rgba(46,150,245,0.14)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#1E86E5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-[#0B2240]">Transcripción</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#4A6485]">
          <span>{segments.length} segmentos</span>
          <span>•</span>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </div>

      <div className="h-1 bg-white">
        <div 
          className="h-full bg-[#2E96F5] transition-all duration-300"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <svg className="w-10 h-10 text-[#6B83A0] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-sm text-[#4A6485]">Esperando transcripción...</p>
            <p className="text-xs text-[#6B83A0] mt-1">Habla para generar texto</p>
          </div>
        ) : (
          segments.map((segment, index) => {
            const emotion = getEmotionForSegment(segment);
            const engagement = getEngagementForSegment(segment);
            const isRecent = index === segments.length - 1;

            return (
              <div
                key={segment.id}
                onClick={() => onSeek?.(segment.inicio_segundos)}
                className={`
                  group p-3 rounded-lg cursor-pointer transition-all
                  ${isRecent 
                    ? 'bg-[#2E96F5]/10 border border-[#2E96F5]/20' 
                    : 'bg-white/50 hover:bg-[rgba(46,150,245,0.08)] border border-transparent'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  {showEmotions && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                      <span className="text-lg">{emotionEmojis[emotion]}</span>
                      <div 
                        className="w-1.5 h-8 rounded-full bg-[rgba(46,150,245,0.14)] overflow-hidden"
                        title={`Engagement: ${Math.round(engagement * 100)}%`}
                      >
                        <div 
                          className={`w-full transition-all duration-300 ${
                            engagement > 0.7 ? 'bg-green-500' :
                            engagement > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ height: `${engagement * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-[#4A6485]">
                        {formatTime(segment.inicio_segundos)}
                      </span>
                      {segment.speaker_nombre && (
                        <span className="text-xs font-medium text-[#1E86E5]">
                          {segment.speaker_nombre}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm leading-relaxed ${isRecent ? 'text-white' : 'text-[#1B3A5C]'}`}>
                      {segment.texto}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranscriptionTimeline;
