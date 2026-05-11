/**
 * useBodyLanguageAnalysis - Hook para análisis de lenguaje corporal
 * ===================================================================
 * Usa MediaPipe Pose para detectar postura, gestos y tensión corporal
 * 
 * OPTIMIZACIÓN 2026-01-29:
 * - Usa Web Worker para no bloquear el hilo principal
 * - Mejora rendimiento de audio en WebRTC
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  PosturaType,
  GestoType,
  BodyLanguageFrame,
  PosturaAnalysis,
} from './types/analysis';
import { useMediaPipeWorker } from './useMediaPipeWorker';

interface UseBodyLanguageAnalysisOptions {
  onFrameUpdate?: (frame: BodyLanguageFrame) => void;
  onPosturaChange?: (postura: PosturaType) => void;
}

interface BodyLanguageState {
  isAnalyzing: boolean;
  currentPostura: PosturaType;
  posturaScore: number;
  gestosActivos: GestoType;
  tensionLevel: number;
  framesAnalyzed: number;
}

const ANALYSIS_INTERVAL_MS = 750; // ~1.3 FPS for posture - Optimized: posture changes are slow, no need for high frequency
const USE_WEB_WORKER = true; // Activado con fallback automático si falla

// Índices de landmarks de MediaPipe Pose
const POSE_LANDMARKS = {
  // Torso
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  
  // Brazos
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  
  // Cabeza
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
};

export const useBodyLanguageAnalysis = (options: UseBodyLanguageAnalysisOptions = {}) => {
  const { onFrameUpdate, onPosturaChange } = options;

  const [state, setState] = useState<BodyLanguageState>({
    isAnalyzing: false,
    currentPostura: 'neutral',
    posturaScore: 0,
    gestosActivos: 'neutral',
    tensionLevel: 0,
    framesAnalyzed: 0,
  });

  const poseLandmarkerRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const framesHistoryRef = useRef<BodyLanguageFrame[]>([]);
  const lastPosturaRef = useRef<PosturaType>('neutral');

  // Hook del Web Worker para MediaPipe Pose
  const { 
    isReady: workerReady, 
    initialize: initializeWorker, 
    analyze: analyzeWithWorker, 
    stop: stopWorker 
  } = useMediaPipeWorker({ 
    enableFace: false, 
    enablePose: true // Solo análisis de pose aquí
  });

  // Cargar MediaPipe Pose exclusivamente vía Worker (sin fallback)
  const loadPoseLandmarker = useCallback(async (): Promise<boolean> => {
    console.log('🏃 [Body] Inicializando MediaPipe Pose via Web Worker...');
    const success = await initializeWorker();
    if (success) {
      console.log('✅ [Body] Worker MediaPipe Pose listo - hilo principal libre');
      return true;
    }
    console.warn('⚠️ [Body] Worker no disponible - análisis corporal deshabilitado');
    return false;
  }, [initializeWorker]);

  // Calcular ángulo entre tres puntos
  const calculateAngle = useCallback((
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  }, []);

  // Calcular distancia entre dos puntos
  const calculateDistance = useCallback((
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }, []);

  // Detectar postura desde landmarks
  const detectPostura = useCallback((landmarks: any[]): { postura: PosturaType; score: number } => {
    if (landmarks.length < 25) return { postura: 'neutral', score: 0 };

    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    const nose = landmarks[POSE_LANDMARKS.NOSE];

    // Centro de hombros y caderas
    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: (leftShoulder.z + rightShoulder.z) / 2,
    };
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2,
    };

    // Inclinación del torso (Z = profundidad, hacia/alejándose de cámara)
    const inclinacionZ = shoulderCenter.z - hipCenter.z;
    
    // Apertura de hombros (distancia entre hombros normalizada)
    const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
    
    // Posición de cabeza respecto a hombros
    const headForward = nose.z - shoulderCenter.z;

    let postura: PosturaType = 'neutral';
    let score = 0;

    // Inclinado hacia adelante (interés)
    if (inclinacionZ < -0.05 || headForward < -0.03) {
      postura = 'inclinado_adelante';
      score = Math.min(1, Math.abs(inclinacionZ) * 5);
    }
    // Inclinado hacia atrás (evaluación/desinterés)
    else if (inclinacionZ > 0.05 || headForward > 0.03) {
      postura = 'inclinado_atras';
      score = Math.min(1, Math.abs(inclinacionZ) * 5);
    }
    // Postura abierta (hombros anchos, pecho abierto)
    else if (shoulderWidth > 0.35) {
      postura = 'abierta';
      score = Math.min(1, (shoulderWidth - 0.3) * 5);
    }
    // Postura cerrada (hombros encogidos)
    else if (shoulderWidth < 0.25) {
      postura = 'cerrada';
      score = Math.min(1, (0.3 - shoulderWidth) * 5);
    }
    else {
      postura = 'neutral';
      score = 0.5;
    }

    return { postura, score };
  }, [calculateDistance]);

  // Detectar gestos de manos
  const detectGestos = useCallback((landmarks: any[]): { gesto: GestoType; actividad: number } => {
    if (landmarks.length < 17) return { gesto: 'neutral', actividad: 0 };

    const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
    const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const nose = landmarks[POSE_LANDMARKS.NOSE];

    // Detectar brazos cruzados
    const wristDistance = calculateDistance(leftWrist, rightWrist);
    const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
    const brazosCruzados = wristDistance < shoulderWidth * 0.5 && 
                          leftWrist.y > leftShoulder.y && 
                          rightWrist.y > rightShoulder.y;

    if (brazosCruzados) {
      return { gesto: 'brazos_cruzados', actividad: 0.8 };
    }

    // Detectar auto-toque (manos cerca de cara)
    const leftHandToFace = calculateDistance(leftWrist, nose);
    const rightHandToFace = calculateDistance(rightWrist, nose);
    const autoToque = leftHandToFace < 0.15 || rightHandToFace < 0.15;

    if (autoToque) {
      return { gesto: 'auto_toque', actividad: 0.7 };
    }

    // Detectar manos juntas
    const manosJuntas = wristDistance < 0.1;
    if (manosJuntas) {
      return { gesto: 'manos_juntas', actividad: 0.3 };
    }

    // Detectar manos activas (gesticulando)
    // Si las manos están elevadas y separadas
    const manosElevadas = leftWrist.y < leftElbow.y || rightWrist.y < rightElbow.y;
    const manosSeparadas = wristDistance > shoulderWidth;
    
    if (manosElevadas && manosSeparadas) {
      return { gesto: 'manos_activas', actividad: 0.9 };
    }

    return { gesto: 'neutral', actividad: 0.2 };
  }, [calculateDistance]);

  // Detectar tensión en hombros
  const detectTension = useCallback((landmarks: any[]): number => {
    if (landmarks.length < 13) return 0;

    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftEar = landmarks[POSE_LANDMARKS.LEFT_EAR];
    const rightEar = landmarks[POSE_LANDMARKS.RIGHT_EAR];

    // Tensión = hombros elevados hacia orejas
    const leftShoulderToEar = Math.abs(leftShoulder.y - leftEar.y);
    const rightShoulderToEar = Math.abs(rightShoulder.y - rightEar.y);
    
    // Normalizar (valores típicos entre 0.1 y 0.2)
    const tension = 1 - Math.min(1, (leftShoulderToEar + rightShoulderToEar) / 0.3);
    
    return Math.max(0, tension);
  }, []);

  // Procesar landmarks (usado tanto por worker como fallback)
  const processLandmarks = useCallback((landmarks: any[]) => {
    const currentTime = (Date.now() - startTimeRef.current) / 1000;

    const { postura, score: posturaScore } = detectPostura(landmarks);
    const { gesto, actividad } = detectGestos(landmarks);
    const tension = detectTension(landmarks);

    const nose = landmarks[POSE_LANDMARKS.NOSE];
    const shoulderCenter = {
      x: (landmarks[POSE_LANDMARKS.LEFT_SHOULDER].x + landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].x) / 2,
      y: (landmarks[POSE_LANDMARKS.LEFT_SHOULDER].y + landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].y) / 2,
    };
    const inclinacionX = (nose.x - shoulderCenter.x) * 90;
    const inclinacionY = (nose.y - shoulderCenter.y) * 90;

    const frame: BodyLanguageFrame = {
      timestamp_segundos: currentTime,
      postura,
      postura_score: posturaScore,
      inclinacion_x: inclinacionX,
      inclinacion_y: inclinacionY,
      gestos_manos: gesto,
      actividad_manos: actividad,
      auto_toque_detectado: gesto === 'auto_toque',
      brazos_cruzados: gesto === 'brazos_cruzados',
      hombros_tension: tension,
    };

    framesHistoryRef.current.push(frame);

    if (postura !== lastPosturaRef.current) {
      onPosturaChange?.(postura);
      lastPosturaRef.current = postura;
    }

    setState(prev => ({
      ...prev,
      currentPostura: postura,
      posturaScore: posturaScore,
      gestosActivos: gesto,
      tensionLevel: tension,
      framesAnalyzed: prev.framesAnalyzed + 1,
    }));

    onFrameUpdate?.(frame);

    if (Math.floor(currentTime) % 10 === 0 && framesHistoryRef.current.length % 20 === 0) {
      console.log(`🏃 [${currentTime.toFixed(1)}s] Postura: ${postura} | Gesto: ${gesto} | Tensión: ${Math.round(tension * 100)}%`);
    }
  }, [detectPostura, detectGestos, detectTension, onFrameUpdate, onPosturaChange]);

  // Analizar frame usando Worker (no bloquea hilo principal)
  const analyzeFrameWithWorker = useCallback(async () => {
    if (!videoElementRef.current || !workerReady) return;
    
    const video = videoElementRef.current;
    if (video.readyState < 2) return;

    try {
      const result = await analyzeWithWorker(video, { analyzeFace: false, analyzePose: true });
      
      if (result?.pose?.hasDetection && result.pose.landmarks) {
        processLandmarks(result.pose.landmarks);
      }
    } catch (err) {
      // Silenciar errores
    }
  }, [workerReady, analyzeWithWorker, processLandmarks]);

  // Analizar frame directo (fallback)
  const analyzeFrameDirect = useCallback(() => {
    if (!poseLandmarkerRef.current || !videoElementRef.current) return;

    const video = videoElementRef.current;
    if (video.readyState < 2) return;

    try {
      const results = poseLandmarkerRef.current.detectForVideo(video, performance.now());

      if (results.landmarks?.length > 0) {
        processLandmarks(results.landmarks[0]);
      }
    } catch (err) {
      // Silenciar errores
    }
  }, [processLandmarks]);

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
    lastPosturaRef.current = 'neutral';

    const loaded = await loadPoseLandmarker();
    if (!loaded) {
      console.warn('⚠️ MediaPipe Pose no disponible');
      return;
    }

    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      framesAnalyzed: 0,
    }));

    // Usamos analyzeFrameRef.current para asegurar que siempre se llame la última versión
    analysisIntervalRef.current = setInterval(() => {
      analyzeFrameRef.current();
    }, ANALYSIS_INTERVAL_MS);
    
    console.log('🏃 [Body] Análisis de lenguaje corporal iniciado');
  }, [loadPoseLandmarker]);

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
    poseLandmarkerRef.current?.close?.();
    poseLandmarkerRef.current = null;
    videoElementRef.current = null;

    setState(prev => ({
      ...prev,
      isAnalyzing: false,
    }));

    console.log(`🛑 [Body] Análisis detenido. Frames: ${framesHistoryRef.current.length}`);
  }, [stopWorker]);

  // Obtener análisis de postura
  const getPosturaAnalysis = useCallback((): PosturaAnalysis => {
    const frames = framesHistoryRef.current;
    if (frames.length === 0) {
      return {
        postura_dominante: 'neutral',
        tiempo_postura_abierta_pct: 0,
        tiempo_postura_cerrada_pct: 0,
        cambios_postura: 0,
        momentos_tension: [],
      };
    }

    const counts: Record<PosturaType, number> = {
      abierta: 0,
      cerrada: 0,
      inclinado_adelante: 0,
      inclinado_atras: 0,
      neutral: 0,
    };

    let cambiosPostura = 0;
    let lastPostura: PosturaType | null = null;
    const momentosTension: { timestamp: number; intensidad: number }[] = [];

    frames.forEach(frame => {
      counts[frame.postura]++;
      
      if (lastPostura && lastPostura !== frame.postura) {
        cambiosPostura++;
      }
      lastPostura = frame.postura;

      if (frame.hombros_tension > 0.6) {
        momentosTension.push({
          timestamp: frame.timestamp_segundos,
          intensidad: frame.hombros_tension,
        });
      }
    });

    const total = frames.length;
    const posturaDominante = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0] as PosturaType;

    return {
      postura_dominante: posturaDominante,
      tiempo_postura_abierta_pct: (counts.abierta / total) * 100,
      tiempo_postura_cerrada_pct: (counts.cerrada / total) * 100,
      cambios_postura: cambiosPostura,
      momentos_tension: momentosTension,
    };
  }, []);

  // Obtener resultados
  const getResults = useCallback(() => {
    return {
      frames: framesHistoryRef.current,
      posturaAnalysis: getPosturaAnalysis(),
    };
  }, [getPosturaAnalysis]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      if (USE_WEB_WORKER) {
        stopWorker();
      }
      poseLandmarkerRef.current?.close?.();
    };
  }, [stopWorker]);

  return {
    ...state,
    startAnalysis,
    stopAnalysis,
    getResults,
    getPosturaAnalysis,
  };
};

export default useBodyLanguageAnalysis;
