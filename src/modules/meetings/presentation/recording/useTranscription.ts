/**
 * Hook para transcripción en tiempo real
 * Usa Web Speech API (nativo del navegador) - funciona en Chrome, Edge, Safari
 * Procesa audio localmente - sin enviar datos a servidores externos
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { TranscriptionSegment, TranscriptionState } from './types';

// Tipos para Web Speech API
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

interface UseTranscriptionOptions {
  grabacionId: string;
  idioma?: string;
  onSegmentUpdate?: (segment: TranscriptionSegment) => void;
  onFullTranscriptUpdate?: (fullText: string) => void;
}

export function useTranscription(options: UseTranscriptionOptions) {
  const { grabacionId, idioma = 'es-ES', onSegmentUpdate, onFullTranscriptUpdate } = options;

  const [state, setState] = useState<TranscriptionState>({
    isLoading: false,
    isTranscribing: false,
    error: null,
    segments: [],
    fullTranscript: '',
    currentSegment: '',
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const segmentIdRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const isRestartingRef = useRef(false);
  const shouldContinueRef = useRef(false);

  const startTranscription = useCallback(async (_audioStream?: MediaStream) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Verificar soporte de Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Web Speech API no soportada en este navegador');
      }

      startTimeRef.current = Date.now();
      shouldContinueRef.current = true;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = idioma;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Actualizar segmento actual (interim)
        if (interimTranscript) {
          setState(prev => ({
            ...prev,
            currentSegment: interimTranscript,
          }));
        }

        // Guardar segmento final
        if (finalTranscript.trim()) {
          const segmentId = `seg_${grabacionId}_${segmentIdRef.current++}`;
          const currentTime = (Date.now() - startTimeRef.current) / 1000;
          
          const segment: TranscriptionSegment = {
            id: segmentId,
            grabacion_id: grabacionId,
            texto: finalTranscript.trim(),
            inicio_segundos: Math.max(0, currentTime - 3),
            fin_segundos: currentTime,
            idioma: idioma,
            confianza: event.results[event.resultIndex][0].confidence || 0.9,
          };

          console.log('📝 Transcripción recibida:', finalTranscript.trim());

          setState(prev => {
            const newSegments = [...prev.segments, segment];
            const newFullTranscript = newSegments.map(s => s.texto).join(' ');
            
            onSegmentUpdate?.(segment);
            onFullTranscriptUpdate?.(newFullTranscript);

            return {
              ...prev,
              segments: newSegments,
              fullTranscript: newFullTranscript,
              currentSegment: '',
            };
          });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('⚠️ Error de reconocimiento:', event.error);
        // No detener por errores temporales
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        setState(prev => ({
          ...prev,
          error: `Error: ${event.error}`,
        }));
      };

      recognition.onend = () => {
        // Reiniciar automáticamente si debe continuar
        if (shouldContinueRef.current && !isRestartingRef.current) {
          isRestartingRef.current = true;
          console.log('🔄 Reiniciando reconocimiento...');
          setTimeout(() => {
            if (shouldContinueRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.warn('No se pudo reiniciar:', e);
              }
            }
            isRestartingRef.current = false;
          }, 100);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      setState(prev => ({ ...prev, isLoading: false, isTranscribing: true }));
      console.log('🎤 Transcripción iniciada (Web Speech API)');

    } catch (err: any) {
      console.error('Error iniciando transcripción:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Error al iniciar transcripción',
      }));
    }
  }, [grabacionId, idioma, onSegmentUpdate, onFullTranscriptUpdate]);

  const stopTranscription = useCallback(async (): Promise<string> => {
    shouldContinueRef.current = false;
    
    // Esperar un momento para que lleguen los últimos resultados
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (err) {
        console.error('Error deteniendo transcripción:', err);
      }
    }
    
    // Esperar otro momento para procesar resultados finales
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Obtener transcripción actual del estado
    let currentTranscript = '';
    setState(prev => {
      currentTranscript = prev.fullTranscript;
      console.log('🛑 Transcripción detenida. Texto acumulado:', currentTranscript.length, 'caracteres');
      return { ...prev, isTranscribing: false };
    });
    
    return currentTranscript;
  }, []);

  const transcribeAudioBlob = useCallback(async (_audioBlob: Blob): Promise<string> => {
    // Web Speech API no soporta transcribir blobs directamente
    // Retornar la transcripción acumulada
    return state.fullTranscript;
  }, [state.fullTranscript]);

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      recognitionRef.current?.stop?.();
    };
  }, []);

  return {
    state,
    startTranscription,
    stopTranscription,
    transcribeAudioBlob,
    isTranscribing: state.isTranscribing,
    isLoading: state.isLoading,
    segments: state.segments,
    fullTranscript: state.fullTranscript,
    currentSegment: state.currentSegment,
    error: state.error,
  };
}

export default useTranscription;
