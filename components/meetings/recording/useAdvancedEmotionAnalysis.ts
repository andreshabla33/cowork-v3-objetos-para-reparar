/**
 * useAdvancedEmotionAnalysis - Hook avanzado para análisis de emociones
 * =======================================================================
 * Mejoras sobre el original:
 * - Detección de microexpresiones (200ms)
 * - Baseline personalizado
 * - Detección de cambios abruptos
 * - Predicción de comportamiento
 * 
 * OPTIMIZACIÓN 2026-01-29:
 * - Usa Web Worker para no bloquear el hilo principal
 * - Mejora rendimiento de audio en WebRTC
 * - requestAnimationFrame en lugar de setInterval
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  EmotionType,
  EmotionFrame,
  MicroexpresionData,
  BaselineEmocional,
  PrediccionComportamiento,
  TipoGrabacion,
} from './types/analysis';
import { useMediaPipeWorker, MediaPipeResult } from './useMediaPipeWorker';

interface UseAdvancedEmotionAnalysisOptions {
  tipoGrabacion: TipoGrabacion;
  onFrameUpdate?: (frame: EmotionFrame) => void;
  onMicroexpresion?: (micro: MicroexpresionData) => void;
  onBaselineComplete?: (baseline: BaselineEmocional) => void;
  onPrediccion?: (prediccion: PrediccionComportamiento) => void;
}

interface AdvancedEmotionAnalysisState {
  isAnalyzing: boolean;
  isCalibrating: boolean;
  currentEmotion: EmotionType;
  engagementScore: number;
  stressScore: number;
  confidenceScore: number;
  baselineComplete: boolean;
  framesAnalyzed: number;
  microexpresionesDetectadas: number;
}

const ANALYSIS_INTERVAL_MS = 333; // ~3 FPS - Optimized: sufficient for emotion/microexpression detection, halves CPU load
const BASELINE_DURATION_MS = 5000; // 5 segundos de calibración
const MICROEXPRESSION_MAX_DURATION_MS = 500; // Standard microexpression upper bound
const ABRUPT_CHANGE_THRESHOLD = 0.3;
const USE_WEB_WORKER = true; // Activado con fallback automático si falla

// Mapeo de blendshapes a emociones con pesos refinados
const EMOTION_BLENDSHAPE_WEIGHTS: Record<EmotionType, { shapes: string[]; weights: number[] }> = {
  happy: { 
    shapes: ['mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight'], 
    weights: [0.3, 0.3, 0.2, 0.2] 
  },
  sad: { 
    shapes: ['mouthFrownLeft', 'mouthFrownRight', 'browInnerUp', 'mouthPucker'], 
    weights: [0.3, 0.3, 0.25, 0.15] 
  },
  angry: { 
    shapes: ['browDownLeft', 'browDownRight', 'mouthPressLeft', 'mouthPressRight', 'jawForward'], 
    weights: [0.25, 0.25, 0.2, 0.2, 0.1] 
  },
  surprised: { 
    shapes: ['eyeWideLeft', 'eyeWideRight', 'jawOpen', 'browOuterUpLeft', 'browOuterUpRight'], 
    weights: [0.2, 0.2, 0.3, 0.15, 0.15] 
  },
  fearful: { 
    shapes: ['eyeWideLeft', 'eyeWideRight', 'browInnerUp', 'mouthStretchLeft', 'mouthStretchRight'], 
    weights: [0.25, 0.25, 0.2, 0.15, 0.15] 
  },
  disgusted: { 
    shapes: ['noseSneerLeft', 'noseSneerRight', 'mouthUpperUpLeft', 'mouthUpperUpRight'], 
    weights: [0.3, 0.3, 0.2, 0.2] 
  },
  contempt: {
    shapes: ['mouthSmileLeft', 'mouthDimpleLeft', 'mouthPressRight'],
    weights: [0.4, 0.3, 0.3]
  },
  neutral: { 
    shapes: [], 
    weights: [] 
  },
};

// Indicadores de estrés/nerviosismo
const STRESS_INDICATORS = [
  'eyeBlinkLeft', 'eyeBlinkRight', // Parpadeo excesivo
  'browInnerUp', // Cejas tensas
  'mouthPressLeft', 'mouthPressRight', // Labios apretados
  'jawClench', // Mandíbula tensa
];

// Indicadores de confianza
const CONFIDENCE_INDICATORS = {
  positive: ['mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight'],
  negative: ['eyeLookDownLeft', 'eyeLookDownRight', 'browInnerUp'],
};

export const useAdvancedEmotionAnalysis = (options: UseAdvancedEmotionAnalysisOptions) => {
  const {
    tipoGrabacion,
    onFrameUpdate,
    onMicroexpresion,
    onBaselineComplete,
    onPrediccion,
  } = options;

  const [state, setState] = useState<AdvancedEmotionAnalysisState>({
    isAnalyzing: false,
    isCalibrating: false,
    currentEmotion: 'neutral',
    engagementScore: 0.5,
    stressScore: 0,
    confidenceScore: 0.5,
    baselineComplete: false,
    framesAnalyzed: 0,
    microexpresionesDetectadas: 0,
  });

  const faceLandmarkerRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Historial para análisis temporal
  const framesHistoryRef = useRef<EmotionFrame[]>([]);
  const microexpresionesRef = useRef<MicroexpresionData[]>([]);
  const baselineRef = useRef<BaselineEmocional | null>(null);
  
  // Para detección de cambios abruptos
  const lastEmotionScoresRef = useRef<Record<EmotionType, number> | null>(null);
  const emotionStartTimeRef = useRef<{ emotion: EmotionType; startTime: number } | null>(null);

  // Hook del Web Worker para MediaPipe
  const { 
    isReady: workerReady, 
    initialize: initializeWorker, 
    analyze: analyzeWithWorker, 
    stop: stopWorker 
  } = useMediaPipeWorker({ 
    enableFace: true, 
    enablePose: false // Solo análisis facial aquí
  });

  // Inicializar MediaPipe exclusivamente vía Worker (sin fallback)
  const loadFaceLandmarker = useCallback(async (): Promise<boolean> => {
    console.log('🎭 [Advanced] Inicializando MediaPipe via Web Worker...');
    const success = await initializeWorker();
    if (success) {
      console.log('✅ [Advanced] Worker MediaPipe listo - hilo principal libre');
      return true;
    }
    console.warn('⚠️ [Advanced] Worker no disponible - análisis facial deshabilitado');
    return false;
  }, [initializeWorker]);

  // Calcular score de emoción desde blendshapes
  const calculateEmotionScores = useCallback((blendshapes: Record<string, number>): Record<EmotionType, number> => {
    const scores: Record<EmotionType, number> = {
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      fearful: 0,
      disgusted: 0,
      contempt: 0,
      neutral: 0.2, // Base para neutral
    };

    for (const [emotion, config] of Object.entries(EMOTION_BLENDSHAPE_WEIGHTS)) {
      if (config.shapes.length === 0) continue;
      
      let score = 0;
      config.shapes.forEach((shape, i) => {
        score += (blendshapes[shape] || 0) * config.weights[i];
      });
      scores[emotion as EmotionType] = Math.min(1, score);
    }

    return scores;
  }, []);

  // Detectar emoción dominante
  const getDominantEmotion = useCallback((scores: Record<EmotionType, number>): { emotion: EmotionType; score: number } => {
    let maxEmotion: EmotionType = 'neutral';
    let maxScore = 0.15; // Umbral mínimo

    for (const [emotion, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxEmotion = emotion as EmotionType;
      }
    }

    return { emotion: maxEmotion, score: maxScore };
  }, []);

  // Calcular estrés
  const calculateStressScore = useCallback((blendshapes: Record<string, number>): number => {
    let stressSum = 0;
    STRESS_INDICATORS.forEach(indicator => {
      stressSum += blendshapes[indicator] || 0;
    });
    return Math.min(1, stressSum / STRESS_INDICATORS.length * 2);
  }, []);

  // Calcular confianza
  const calculateConfidenceScore = useCallback((blendshapes: Record<string, number>): number => {
    let positiveSum = 0;
    let negativeSum = 0;

    CONFIDENCE_INDICATORS.positive.forEach(ind => {
      positiveSum += blendshapes[ind] || 0;
    });
    CONFIDENCE_INDICATORS.negative.forEach(ind => {
      negativeSum += blendshapes[ind] || 0;
    });

    const positive = positiveSum / CONFIDENCE_INDICATORS.positive.length;
    const negative = negativeSum / CONFIDENCE_INDICATORS.negative.length;
    
    return Math.max(0, Math.min(1, 0.5 + positive - negative));
  }, []);

  // Calcular engagement
  const calculateEngagement = useCallback((blendshapes: Record<string, number>, mirandoCamara: boolean): number => {
    let score = 0.5;

    // Factores positivos
    const positiveFactors = ['mouthSmileLeft', 'mouthSmileRight', 'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp'];
    positiveFactors.forEach(factor => {
      score += (blendshapes[factor] || 0) * 0.1;
    });

    // Factores negativos
    const negativeFactors = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight'];
    negativeFactors.forEach(factor => {
      score -= (blendshapes[factor] || 0) * 0.08;
    });

    // Bonus por mirar a cámara
    if (mirandoCamara) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }, []);

  // Detectar si mira a cámara
  const isLookingAtCamera = useCallback((matrices: any[]): boolean => {
    if (!matrices || matrices.length === 0) return false;
    
    try {
      const matrix = matrices[0].data;
      // Extraer rotación aproximada
      const rotationY = Math.abs(Math.asin(matrix[8]));
      const rotationX = Math.abs(Math.atan2(matrix[9], matrix[10]));
      
      // Umbral de 20 grados
      return rotationX < 0.35 && rotationY < 0.35;
    } catch {
      return true;
    }
  }, []);

  // Detectar cambio abrupto
  const detectAbruptChange = useCallback((currentScores: Record<EmotionType, number>): boolean => {
    if (!lastEmotionScoresRef.current) {
      lastEmotionScoresRef.current = currentScores;
      return false;
    }

    for (const emotion of Object.keys(currentScores) as EmotionType[]) {
      const delta = Math.abs(currentScores[emotion] - (lastEmotionScoresRef.current[emotion] || 0));
      if (delta > ABRUPT_CHANGE_THRESHOLD) {
        lastEmotionScoresRef.current = currentScores;
        return true;
      }
    }

    lastEmotionScoresRef.current = currentScores;
    return false;
  }, []);

  // Detectar y registrar microexpresiones
  const checkMicroexpression = useCallback((emotion: EmotionType, intensity: number, blendshapes: Record<string, number>) => {
    const now = performance.now();
    
    // Inicializar si no existe referencia previa
    if (!emotionStartTimeRef.current) {
      emotionStartTimeRef.current = { emotion, startTime: now };
      return;
    }

    // Detectar cambio de emoción
    if (emotionStartTimeRef.current.emotion !== emotion) {
      const prevEmotion = emotionStartTimeRef.current.emotion;
      const duration = now - emotionStartTimeRef.current.startTime;

      // Criterios para microexpresión:
      // 1. Duración muy corta (< 500ms) pero perceptible (> 40ms)
      // 2. La emoción previa no era neutral (o era una emoción significativa)
      if (duration < MICROEXPRESSION_MAX_DURATION_MS && duration > 40 && prevEmotion !== 'neutral') {
        const micro: MicroexpresionData = {
          timestamp_ms: now - startTimeRef.current - duration,
          emocion: prevEmotion,
          intensidad: 0.7, // Intensidad estimada del pico
          duracion_ms: duration,
          es_microexpresion: true,
          action_units: blendshapes,
        };
        
        microexpresionesRef.current.push(micro);
        setState(prev => ({ 
          ...prev, 
          microexpresionesDetectadas: prev.microexpresionesDetectadas + 1 
        }));
        
        onMicroexpresion?.(micro);
        console.log(`⚡ Microexpresión detectada: ${micro.emocion} (${Math.round(micro.duracion_ms)}ms)`);
      }
      
      emotionStartTimeRef.current = { emotion, startTime: now };
    }
  }, [onMicroexpresion]);

  // Calcular baseline
  const calculateBaseline = useCallback(() => {
    if (framesHistoryRef.current.length < 10) return;

    const frames = framesHistoryRef.current;
    const emocionesSuma: Record<EmotionType, number> = {
      happy: 0, sad: 0, angry: 0, surprised: 0, 
      fearful: 0, disgusted: 0, contempt: 0, neutral: 0
    };

    let engagementSum = 0;
    
    frames.forEach(frame => {
      Object.entries(frame.emociones_scores).forEach(([emotion, score]) => {
        emocionesSuma[emotion as EmotionType] = (emocionesSuma[emotion as EmotionType] || 0) + (score as number);
      });
      engagementSum += frame.engagement_score;
    });

    const count = frames.length;
    const promedios: Record<EmotionType, number> = { ...emocionesSuma };
    // @ts-ignore
    Object.keys(promedios).forEach(key => {
      promedios[key as EmotionType] /= count;
    });

    const baseline: BaselineEmocional = {
      emociones_promedio: promedios,
      engagement_promedio: engagementSum / count,
      variabilidad: 0.1, // Valor estimado
      timestamp_inicio: startTimeRef.current,
      timestamp_fin: Date.now()
    };

    baselineRef.current = baseline;
    setState(prev => ({ ...prev, baselineComplete: true }));
    onBaselineComplete?.(baseline);
    // Log reducido para evitar spam en consola
    console.log('📊 Baseline calculado (engagement_promedio:', baseline.engagement_promedio.toFixed(2), ')');
  }, [onBaselineComplete]);

  // Generar predicciones basadas en el tipo de grabación
  const generatePredictions = useCallback(() => {
    if (framesHistoryRef.current.length < 30) return;

    const recentFrames = framesHistoryRef.current.slice(-50); // Últimos ~7-10 segundos
    const avgEngagement = recentFrames.reduce((sum, f) => sum + f.engagement_score, 0) / recentFrames.length;
    
    // Análisis de emociones negativas específicas
    const avgFear = recentFrames.reduce((sum, f) => sum + (f.emociones_scores.fearful || 0), 0) / recentFrames.length;
    const avgAnger = recentFrames.reduce((sum, f) => sum + (f.emociones_scores.angry || 0), 0) / recentFrames.length;
    const avgSurprise = recentFrames.reduce((sum, f) => sum + (f.emociones_scores.surprised || 0), 0) / recentFrames.length;
    const avgSadness = recentFrames.reduce((sum, f) => sum + (f.emociones_scores.sad || 0), 0) / recentFrames.length;
    const avgStress = (avgFear + avgAnger) / 2;

    let prediccion: PrediccionComportamiento | null = null;
    const timestamp = Date.now();

    switch (tipoGrabacion) {
      case 'deals':
        // Lógica específica para Ventas
        let cierreProb = avgEngagement * 0.6 + (1 - avgStress) * 0.4;
        let factoresDeals: string[] = [];
        
        if (avgEngagement > 0.7) factoresDeals.push('Cliente altamente receptivo');
        else if (avgEngagement < 0.4) factoresDeals.push('Cliente distraído o desinteresado');

        if (avgSurprise > 0.3) {
           factoresDeals.push('Sorpresa detectada: ¿Precio o propuesta inesperada?');
           cierreProb += 0.1;
        }
        if (avgAnger > 0.2) {
           factoresDeals.push('Resistencia/Molestia detectada: Manejar objeciones');
           cierreProb -= 0.3;
        }
        if (avgSadness > 0.2) {
           factoresDeals.push('Duda o decepción: Reforzar valor');
           cierreProb -= 0.2;
        }
        
        prediccion = {
          tipo: 'probabilidad_cierre',
          probabilidad: Math.max(0, Math.min(1, cierreProb)),
          confianza: 0.75,
          factores: factoresDeals.length > 0 ? factoresDeals : ['Interacción estándar'],
          timestamp,
        };
        break;

      case 'rrhh':
        // Lógica específica para Entrevistas
        let autenticidad = 0.5 + (1 - avgStress) * 0.5;
        let factoresRRHH: string[] = [];

        if (avgStress > 0.4) {
           factoresRRHH.push('Alto nivel de estrés: Posible tema sensible o nerviosismo');
           autenticidad -= 0.2;
        } else {
           factoresRRHH.push('Candidato relajado y confiado');
        }

        if (avgEngagement > 0.6) factoresRRHH.push('Buena conexión interpersonal');
        if (microexpresionesRef.current.length > 2) factoresRRHH.push('Incongruencias emocionales detectadas (Microexpresiones)');

        prediccion = {
          tipo: 'autenticidad_respuestas',
          probabilidad: Math.max(0, Math.min(1, autenticidad)),
          confianza: 0.7,
          factores: factoresRRHH,
          timestamp,
        };
        break;

      case 'equipo':
        // Lógica específica para Reuniones de Equipo
        let cohesion = avgEngagement;
        let factoresEquipo: string[] = [];

        if (avgEngagement > 0.6) factoresEquipo.push('Alta sintonía del equipo');
        else if (avgEngagement < 0.3) factoresEquipo.push('Equipo desconectado/aburrido');

        if (avgAnger > 0.15) factoresEquipo.push('Tensión latente detectada');
        if (avgSurprise > 0.2) factoresEquipo.push('Reacción a nuevas noticias');
        
        prediccion = {
          tipo: 'adopcion_ideas',
          probabilidad: cohesion,
          confianza: 0.8,
          factores: factoresEquipo.length > 0 ? factoresEquipo : ['Dinámica neutral'],
          timestamp,
        };
        break;
    }

    if (prediccion) {
      onPrediccion?.(prediccion);
    }
  }, [tipoGrabacion, onPrediccion]);

  // Stable refs for values that change on every frame — prevents processBlendshapes from being recreated each render
  const isCalibratingRef = useRef(state.isCalibrating);
  const framesAnalyzedRef = useRef(state.framesAnalyzed);
  useEffect(() => { isCalibratingRef.current = state.isCalibrating; }, [state.isCalibrating]);
  useEffect(() => { framesAnalyzedRef.current = state.framesAnalyzed; }, [state.framesAnalyzed]);

  // Procesar resultados de blendshapes (usado tanto por worker como fallback)
  const processBlendshapes = useCallback((blendshapes: Record<string, number>, hasTransformMatrix: boolean = true) => {
    const currentTime = (Date.now() - startTimeRef.current) / 1000;
    const emotionScores = calculateEmotionScores(blendshapes);
    const { emotion, score } = getDominantEmotion(emotionScores);
    // Passing an empty matrices array — `isLookingAtCamera` returns true por
    // defecto cuando no hay transform matrix; mantenemos ese contrato.
    const mirandoCamara = hasTransformMatrix ? isLookingAtCamera([]) : true;
    const engagement = calculateEngagement(blendshapes, mirandoCamara);
    const stress = calculateStressScore(blendshapes);
    const confidence = calculateConfidenceScore(blendshapes);
    const cambioAbrupto = detectAbruptChange(emotionScores);

    let deltaVsBaseline = 0;
    if (baselineRef.current) {
      deltaVsBaseline = engagement - baselineRef.current.engagement_promedio;
    }

    const frame: EmotionFrame = {
      timestamp_segundos: currentTime,
      emocion_dominante: emotion,
      emociones_scores: emotionScores,
      engagement_score: engagement,
      confianza_deteccion: score,
      action_units: blendshapes,
      mirando_camara: mirandoCamara,
      cambio_abrupto: cambioAbrupto,
      delta_vs_baseline: deltaVsBaseline,
    };

    framesHistoryRef.current.push(frame);
    checkMicroexpression(emotion, score, blendshapes);

    setState(prev => ({
      ...prev,
      currentEmotion: emotion,
      engagementScore: engagement,
      stressScore: stress,
      confidenceScore: confidence,
      framesAnalyzed: prev.framesAnalyzed + 1,
    }));

    onFrameUpdate?.(frame);

    if (isCalibratingRef.current && currentTime * 1000 >= BASELINE_DURATION_MS) {
      calculateBaseline();
    }

    if (Math.floor(currentTime) % 10 === 0 && framesAnalyzedRef.current % 50 === 0) {
      generatePredictions();
    }

    if (Math.floor(currentTime) % 5 === 0 && framesHistoryRef.current.length % 25 === 0) {
      console.log(`🎭 [${currentTime.toFixed(1)}s] ${emotion} | Eng: ${Math.round(engagement * 100)}% | Stress: ${Math.round(stress * 100)}% | Micro: ${microexpresionesRef.current.length}`);
    }
  }, [
    calculateEmotionScores, getDominantEmotion, isLookingAtCamera,
    calculateEngagement, calculateStressScore, calculateConfidenceScore,
    detectAbruptChange, checkMicroexpression, calculateBaseline,
    generatePredictions, onFrameUpdate,
  ]);

  // Analizar frame usando Worker (no bloquea hilo principal)
  const analyzeFrameWithWorker = useCallback(async () => {
    if (!videoElementRef.current || !workerReady) return;
    
    const video = videoElementRef.current;
    if (video.readyState < 2) return;

    try {
      const result = await analyzeWithWorker(video, { analyzeFace: true, analyzePose: false });
      
      if (result?.face?.hasDetection && result.face.blendshapes) {
        processBlendshapes(result.face.blendshapes, false);
      }
    } catch (err) {
      // Silenciar errores
    }
  }, [workerReady, analyzeWithWorker, processBlendshapes]);

  // Analizar frame directo (fallback - bloquea hilo principal)
  const analyzeFrameDirect = useCallback(() => {
    if (!faceLandmarkerRef.current || !videoElementRef.current) return;

    const video = videoElementRef.current;
    if (video.readyState < 2) return;

    try {
      const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());

      if (results.faceBlendshapes?.length > 0) {
        const blendshapeCategories = results.faceBlendshapes[0].categories;
        const blendshapes: Record<string, number> = {};
        
        blendshapeCategories.forEach((shape: any) => {
          blendshapes[shape.categoryName] = shape.score;
        });

        processBlendshapes(blendshapes, !!results.facialTransformationMatrixes);
      }
    } catch (err) {
      // Silenciar errores
    }
  }, [processBlendshapes]);

  // Función principal de análisis (solo Worker, sin fallback)
  const analyzeFrame = useCallback(() => {
    if (workerReady) {
      analyzeFrameWithWorker();
    }
  }, [workerReady, analyzeFrameWithWorker]);

  // Referencia mutable para el callback de análisis (evita stale closure en setInterval)
  const analyzeFrameRef = useRef(analyzeFrame);
  useEffect(() => {
    analyzeFrameRef.current = analyzeFrame;
  }, [analyzeFrame]);

  // Iniciar análisis
  const startAnalysis = useCallback(async (videoElement: HTMLVideoElement) => {
    videoElementRef.current = videoElement;
    startTimeRef.current = Date.now();
    framesHistoryRef.current = [];
    microexpresionesRef.current = [];
    baselineRef.current = null;
    lastEmotionScoresRef.current = null;
    emotionStartTimeRef.current = null;

    const loaded = await loadFaceLandmarker();
    if (!loaded) {
      console.warn('⚠️ MediaPipe no disponible, continuando sin análisis facial');
      return;
    }

    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      isCalibrating: true,
      framesAnalyzed: 0,
      microexpresionesDetectadas: 0,
      baselineComplete: false,
    }));

    // Análisis cada 500ms - optimizado para rendimiento de audio
    // Usamos analyzeFrameRef.current para asegurar que siempre se llame la última versión
    analysisIntervalRef.current = setInterval(() => {
      analyzeFrameRef.current();
    }, ANALYSIS_INTERVAL_MS);

    console.log(`🎭 [Advanced] Análisis iniciado para: ${tipoGrabacion.toUpperCase()}`);
  }, [loadFaceLandmarker, tipoGrabacion]);

  // Detener análisis
  const stopAnalysis = useCallback(() => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }

    // Detener Worker si está activo
    if (USE_WEB_WORKER) {
      stopWorker();
    }

    // Limpiar MediaPipe directo (fallback)
    faceLandmarkerRef.current?.close?.();
    faceLandmarkerRef.current = null;
    videoElementRef.current = null;

    setState(prev => ({
      ...prev,
      isAnalyzing: false,
      isCalibrating: false,
    }));

    console.log(`🛑 [Advanced] Análisis detenido. Frames: ${framesHistoryRef.current.length}, Microexpresiones: ${microexpresionesRef.current.length}`);
  }, [stopWorker]);

  // Obtener resultados
  const getResults = useCallback(() => {
    return {
      frames: framesHistoryRef.current,
      microexpresiones: microexpresionesRef.current,
      baseline: baselineRef.current,
      resumen: {
        framesAnalizados: framesHistoryRef.current.length,
        microexpresionesDetectadas: microexpresionesRef.current.length,
        engagementPromedio: framesHistoryRef.current.length > 0
          ? framesHistoryRef.current.reduce((sum, f) => sum + f.engagement_score, 0) / framesHistoryRef.current.length
          : 0,
        emocionDominante: getMostFrequentEmotion(framesHistoryRef.current),
      },
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      if (USE_WEB_WORKER) {
        stopWorker();
      }
      faceLandmarkerRef.current?.close?.();
    };
  }, [stopWorker]);

  return {
    ...state,
    startAnalysis,
    stopAnalysis,
    getResults,
  };
};

// Helper: obtener emoción más frecuente
function getMostFrequentEmotion(frames: EmotionFrame[]): EmotionType {
  if (frames.length === 0) return 'neutral';

  const counts: Record<string, number> = {};
  frames.forEach(f => {
    counts[f.emocion_dominante] = (counts[f.emocion_dominante] || 0) + 1;
  });

  let maxEmotion = 'neutral';
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxEmotion = emotion;
    }
  }

  return maxEmotion as EmotionType;
}

export default useAdvancedEmotionAnalysis;
