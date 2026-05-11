/**
 * useCombinedAnalysis - Hook que combina análisis facial y corporal
 * Genera métricas específicas por tipo de grabación (RRHH, Deals, Equipo)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAdvancedEmotionAnalysis } from './useAdvancedEmotionAnalysis';
import { useBodyLanguageAnalysis } from './useBodyLanguageAnalysis';
import {
  TipoGrabacion,
  EmotionFrame,
  BodyLanguageFrame,
  MicroexpresionData,
  BaselineEmocional,
  PrediccionComportamiento,
  AnalisisRRHH,
  AnalisisDeals,
  AnalisisEquipo,
  AnalisisCompleto,
  ResultadoAnalisis,
  EmotionType,
} from './types/analysis';

interface UseCombinedAnalysisOptions {
  tipoGrabacion: TipoGrabacion;
  grabacionId: string;
  participantes: { id: string; nombre: string }[];
  onAnalisisUpdate?: (resumen: AnalisisResumenTiempoReal) => void;
}

export interface AnalisisResumenTiempoReal {
  engagementActual: number;
  stressActual: number;
  confianzaActual: number;
  emocionActual: EmotionType;
  posturaActual: string;
  microexpresionesCount: number;
  prediccionActual: PrediccionComportamiento | null;
  alertas: string[];
}

export const useCombinedAnalysis = (options: UseCombinedAnalysisOptions) => {
  const { tipoGrabacion, grabacionId, participantes, onAnalisisUpdate } = options;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resumenTiempoReal, setResumenTiempoReal] = useState<AnalisisResumenTiempoReal>({
    engagementActual: 0.5,
    stressActual: 0,
    confianzaActual: 0.5,
    emocionActual: 'neutral',
    posturaActual: 'neutral',
    microexpresionesCount: 0,
    prediccionActual: null,
    alertas: [],
  });

  const startTimeRef = useRef<number>(0);
  const emotionFramesRef = useRef<EmotionFrame[]>([]);
  const bodyFramesRef = useRef<BodyLanguageFrame[]>([]);
  const microexpresionesRef = useRef<MicroexpresionData[]>([]);
  const baselineRef = useRef<BaselineEmocional | null>(null);
  const prediccionesRef = useRef<PrediccionComportamiento[]>([]);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  // Stable ref for updateResumenTiempoReal to avoid circular dependencies
  const updateResumenRef = useRef<() => void>(() => {});
  const checkAlertsRef = useRef<(micro: MicroexpresionData) => void>(() => {});

  // Stable callbacks for child hooks — prevents cascade re-renders
  const handleEmotionFrameUpdate = useCallback((frame: EmotionFrame) => {
    emotionFramesRef.current.push(frame);
    updateResumenRef.current();
  }, []);

  const handleMicroexpresion = useCallback((micro: MicroexpresionData) => {
    microexpresionesRef.current.push(micro);
    checkAlertsRef.current(micro);
  }, []);

  const handleBaselineComplete = useCallback((baseline: BaselineEmocional) => {
    baselineRef.current = baseline;
  }, []);

  const handlePrediccion = useCallback((prediccion: PrediccionComportamiento) => {
    prediccionesRef.current.push(prediccion);
    setResumenTiempoReal(prev => ({
      ...prev,
      prediccionActual: prediccion,
    }));
  }, []);

  const handleBodyFrameUpdate = useCallback((frame: BodyLanguageFrame) => {
    bodyFramesRef.current.push(frame);
  }, []);

  const handlePosturaChange = useCallback((postura: string) => {
    setResumenTiempoReal(prev => ({
      ...prev,
      posturaActual: postura,
    }));
  }, []);

  // Hook de análisis facial avanzado
  const emotionAnalysis = useAdvancedEmotionAnalysis({
    tipoGrabacion,
    onFrameUpdate: handleEmotionFrameUpdate,
    onMicroexpresion: handleMicroexpresion,
    onBaselineComplete: handleBaselineComplete,
    onPrediccion: handlePrediccion,
  });

  // Hook de análisis corporal
  const bodyAnalysis = useBodyLanguageAnalysis({
    onFrameUpdate: handleBodyFrameUpdate,
    onPosturaChange: handlePosturaChange,
  });

  // Actualizar resumen en tiempo real
  const updateResumenTiempoReal = useCallback(() => {
    const alertas: string[] = [];

    // Detectar alertas según tipo de grabación
    if (emotionAnalysis.stressScore > 0.7) {
      alertas.push('⚠️ Alto nivel de estrés detectado');
    }
    if (emotionAnalysis.engagementScore < 0.3) {
      alertas.push('📉 Engagement bajo');
    }
    if (bodyAnalysis.currentPostura === 'cerrada') {
      alertas.push('🔒 Postura defensiva detectada');
    }
    if (bodyAnalysis.gestosActivos === 'auto_toque') {
      alertas.push('👆 Auto-toque detectado (posible nerviosismo)');
    }

    const nuevoResumen: AnalisisResumenTiempoReal = {
      engagementActual: emotionAnalysis.engagementScore,
      stressActual: emotionAnalysis.stressScore,
      confianzaActual: emotionAnalysis.confidenceScore,
      emocionActual: emotionAnalysis.currentEmotion,
      posturaActual: bodyAnalysis.currentPostura,
      microexpresionesCount: emotionAnalysis.microexpresionesDetectadas,
      prediccionActual: resumenTiempoReal.prediccionActual,
      alertas,
    };

    setResumenTiempoReal(nuevoResumen);
    onAnalisisUpdate?.(nuevoResumen);
  }, [
    emotionAnalysis.stressScore,
    emotionAnalysis.engagementScore,
    emotionAnalysis.confidenceScore,
    emotionAnalysis.currentEmotion,
    emotionAnalysis.microexpresionesDetectadas,
    bodyAnalysis.currentPostura,
    bodyAnalysis.gestosActivos,
    resumenTiempoReal.prediccionActual,
    onAnalisisUpdate,
  ]);

  // Verificar alertas por microexpresiones
  const checkAlerts = useCallback((micro: MicroexpresionData) => {
    // Alertas específicas por tipo de grabación
    if (tipoGrabacion === 'deals' && micro.emocion === 'surprised') {
      console.log('💡 [Deals] Momento de sorpresa detectado - posible interés en propuesta');
    }
    if (tipoGrabacion === 'rrhh' && micro.emocion === 'fearful') {
      console.log('⚠️ [RRHH] Microexpresión de miedo - considerar pregunta de seguimiento');
    }
  }, [tipoGrabacion]);

  // Sync refs to latest implementations (decoupled from child hook lifecycle)
  useEffect(() => { updateResumenRef.current = updateResumenTiempoReal; }, [updateResumenTiempoReal]);
  useEffect(() => { checkAlertsRef.current = checkAlerts; }, [checkAlerts]);

  // Iniciar análisis combinado
  const startAnalysis = useCallback(async (videoElement: HTMLVideoElement) => {
    videoElementRef.current = videoElement;
    startTimeRef.current = Date.now();
    emotionFramesRef.current = [];
    bodyFramesRef.current = [];
    microexpresionesRef.current = [];
    prediccionesRef.current = [];
    baselineRef.current = null;

    setIsAnalyzing(true);

    // Iniciar ambos análisis en paralelo
    await Promise.all([
      emotionAnalysis.startAnalysis(videoElement),
      bodyAnalysis.startAnalysis(videoElement),
    ]);

    console.log(`🎯 [Combined] Análisis combinado iniciado para: ${tipoGrabacion.toUpperCase()}`);
  }, [emotionAnalysis, bodyAnalysis, tipoGrabacion]);

  // Detener análisis
  const stopAnalysis = useCallback(() => {
    emotionAnalysis.stopAnalysis();
    bodyAnalysis.stopAnalysis();
    setIsAnalyzing(false);

    console.log(`🛑 [Combined] Análisis detenido. Facial: ${emotionFramesRef.current.length}, Corporal: ${bodyFramesRef.current.length}`);
  }, [emotionAnalysis, bodyAnalysis]);

  // Generar análisis específico por tipo
  const generateAnalisisEspecifico = useCallback((): AnalisisCompleto => {
    const emotionFrames = emotionFramesRef.current;
    const bodyFrames = bodyFramesRef.current;
    const microexpresiones = microexpresionesRef.current;
    const predicciones = prediccionesRef.current; // Usar predicciones del sistema experto

    switch (tipoGrabacion) {
      case 'rrhh':
        return generateAnalisisRRHH(emotionFrames, bodyFrames, microexpresiones, predicciones);
      case 'deals':
        return generateAnalisisDeals(emotionFrames, bodyFrames, microexpresiones, predicciones);
      case 'equipo':
        return generateAnalisisEquipo(emotionFrames, bodyFrames, microexpresiones, participantes, predicciones);
      default:
        return generateAnalisisEquipo(emotionFrames, bodyFrames, microexpresiones, participantes, predicciones);
    }
  }, [tipoGrabacion, participantes]);

  // Calcular confianza general del análisis
  const calculateConfianzaGeneral = useCallback((): number => {
    const frames = emotionFramesRef.current;
    if (frames.length === 0) return 0;

    const avgConfidence = frames.reduce((sum, f) => sum + f.confianza_deteccion, 0) / frames.length;
    const hasBaseline = baselineRef.current ? 0.1 : 0;
    const hasEnoughFrames = frames.length > 100 ? 0.1 : 0;

    return Math.min(1, avgConfidence + hasBaseline + hasEnoughFrames);
  }, []);

  // Obtener resultado completo
  const getResultadoCompleto = useCallback((): ResultadoAnalisis => {
    const duracion = (Date.now() - startTimeRef.current) / 1000;

    return {
      grabacion_id: grabacionId,
      tipo_grabacion: tipoGrabacion,
      duracion_segundos: duracion,
      participantes,
      frames_faciales: emotionFramesRef.current,
      frames_corporales: bodyFramesRef.current,
      microexpresiones: microexpresionesRef.current,
      baseline: baselineRef.current,
      analisis: generateAnalisisEspecifico(),
      modelo_version: '2.0.0-advanced',
      procesado_en: new Date().toISOString(),
      confianza_general: calculateConfianzaGeneral(),
    };
  }, [grabacionId, tipoGrabacion, participantes, generateAnalisisEspecifico, calculateConfianzaGeneral]);

  return {
    isAnalyzing,
    resumenTiempoReal,
    emotionAnalysis,
    bodyAnalysis,
    startAnalysis,
    stopAnalysis,
    getResultadoCompleto,
    generateAnalisisEspecifico,
  };
};

// Helper para encontrar la predicción más reciente de un tipo
function findLatestPrediction(predictions: PrediccionComportamiento[], type: string): PrediccionComportamiento | undefined {
  return predictions
    .filter(p => p.tipo === type)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

// ==================== GENERADORES DE ANÁLISIS POR TIPO ====================

function generateAnalisisRRHH(
  emotionFrames: EmotionFrame[],
  bodyFrames: BodyLanguageFrame[],
  microexpresiones: MicroexpresionData[],
  predicciones: PrediccionComportamiento[]
): AnalisisRRHH {
  const avgEngagement = emotionFrames.length > 0
    ? emotionFrames.reduce((sum, f) => sum + f.engagement_score, 0) / emotionFrames.length
    : 0.5;

  const nerviosismoTimeline = emotionFrames.map(f => ({
    timestamp: f.timestamp_segundos,
    score: (f.emociones_scores.fearful || 0) * 0.5 + 
           (bodyFrames.find(b => Math.abs(b.timestamp_segundos - f.timestamp_segundos) < 1)?.hombros_tension || 0) * 0.5,
  }));

  const momentosIncomodidad = microexpresiones
    .filter(m => m.emocion === 'fearful' || m.emocion === 'disgusted')
    .map(m => ({
      timestamp: m.timestamp_ms / 1000,
      duracion: m.duracion_ms / 1000,
      indicadores: [m.emocion, 'microexpresión detectada'],
    }));

  const congruenciaScore = calculateCongruencia(emotionFrames, bodyFrames);

  // Usar predicciones del sistema experto si existen, sino fallback
  const predFit = findLatestPrediction(predicciones, 'fit_cultural') || {
    tipo: 'fit_cultural',
    probabilidad: avgEngagement * 0.7 + congruenciaScore * 0.3,
    confianza: 0.6,
    factores: avgEngagement > 0.6 ? ['Alto engagement'] : ['Engagement moderado'],
    timestamp: Date.now(),
  };

  const predInteres = findLatestPrediction(predicciones, 'nivel_interes_puesto') || {
    tipo: 'nivel_interes_puesto',
    probabilidad: avgEngagement,
    confianza: 0.7,
    factores: ['Basado en engagement promedio'],
    timestamp: Date.now(),
  };

  const predAutenticidad = findLatestPrediction(predicciones, 'autenticidad_respuestas') || {
    tipo: 'autenticidad_respuestas',
    probabilidad: congruenciaScore,
    confianza: 0.65,
    factores: microexpresiones.length > 5 ? ['Múltiples microexpresiones detectadas'] : ['Expresiones estables'],
    timestamp: Date.now(),
  };

  return {
    tipo: 'rrhh',
    congruencia_verbal_no_verbal: congruenciaScore,
    nerviosismo_timeline: nerviosismoTimeline,
    nerviosismo_promedio: nerviosismoTimeline.reduce((sum, n) => sum + n.score, 0) / (nerviosismoTimeline.length || 1),
    confianza_percibida: avgEngagement * 0.6 + congruenciaScore * 0.4,
    momentos_alta_confianza: findMomentosAltos(emotionFrames, 'engagement_score', 0.7),
    momentos_baja_confianza: findMomentosBajos(emotionFrames, 'engagement_score', 0.3),
    momentos_incomodidad: momentosIncomodidad,
    engagement_timeline: emotionFrames.map(f => ({
      timestamp: f.timestamp_segundos,
      score: f.engagement_score,
    })),
    predicciones: {
      fit_cultural: predFit,
      nivel_interes_puesto: predInteres,
      autenticidad_respuestas: predAutenticidad,
    },
    resumen: {
      fortalezas_observadas: generateFortalezasRRHH(avgEngagement, congruenciaScore),
      areas_atencion: generateAreasAtencionRRHH(nerviosismoTimeline, momentosIncomodidad),
      recomendacion_seguimiento: avgEngagement > 0.6 && congruenciaScore > 0.6
        ? 'Candidato muestra señales positivas. Considerar siguiente fase.'
        : 'Realizar preguntas de seguimiento en áreas de incomodidad detectadas.',
    },
  };
}

function generateAnalisisDeals(
  emotionFrames: EmotionFrame[],
  bodyFrames: BodyLanguageFrame[],
  microexpresiones: MicroexpresionData[],
  predicciones: PrediccionComportamiento[]
): AnalisisDeals {
  const momentosInteres = emotionFrames
    .filter(f => f.engagement_score > 0.7 || f.emocion_dominante === 'surprised')
    .map(f => ({
      timestamp: f.timestamp_segundos,
      score: f.engagement_score,
      indicadores: [f.emocion_dominante, `engagement: ${Math.round(f.engagement_score * 100)}%`],
    }));

  const señalesObjecion = emotionFrames
    .filter(f => f.emocion_dominante === 'angry' || f.emocion_dominante === 'disgusted' || f.emocion_dominante === 'sad')
    .map(f => ({
      timestamp: f.timestamp_segundos,
      tipo: 'desconocido' as const,
      intensidad: f.emociones_scores[f.emocion_dominante] || 0.5,
      indicadores: [f.emocion_dominante],
    }));

  const señalesCierre = bodyFrames
    .filter(f => f.postura === 'inclinado_adelante')
    .map(f => ({
      timestamp: f.timestamp_segundos,
      tipo: 'positiva' as const,
      indicadores: ['Inclinación hacia adelante', 'Interés corporal'],
    }));

  const avgEngagement = emotionFrames.length > 0
    ? emotionFrames.reduce((sum, f) => sum + f.engagement_score, 0) / emotionFrames.length
    : 0.5;

  const probabilidadCierreCalc = Math.min(1, avgEngagement * 0.5 + (momentosInteres.length / 10) * 0.3 - (señalesObjecion.length / 10) * 0.2);

  // Usar predicciones del sistema experto
  const predCierre = findLatestPrediction(predicciones, 'probabilidad_cierre') || {
    tipo: 'probabilidad_cierre',
    probabilidad: probabilidadCierreCalc,
    confianza: 0.7,
    factores: probabilidadCierreCalc > 0.6 
      ? ['Alto engagement', 'Señales de interés positivas']
      : ['Engagement moderado', 'Considerar objeciones'],
    timestamp: Date.now(),
  };

  const predSiguientePaso = findLatestPrediction(predicciones, 'siguiente_paso_recomendado') || {
    tipo: 'siguiente_paso',
    probabilidad: predCierre.probabilidad > 0.5 ? 0.8 : 0.4,
    confianza: 0.6,
    factores: predCierre.probabilidad > 0.5
      ? ['Proponer cierre o siguiente reunión']
      : ['Abordar objeciones detectadas'],
    timestamp: Date.now(),
  };

  const predObjecion = findLatestPrediction(predicciones, 'objecion_principal') || {
    tipo: 'objecion_principal',
    probabilidad: señalesObjecion.length > 0 ? 0.7 : 0.3,
    confianza: 0.5,
    factores: señalesObjecion.length > 0
      ? ['Objeciones detectadas - revisar momentos específicos']
      : ['Sin objeciones claras detectadas'],
    timestamp: Date.now(),
  };

  return {
    tipo: 'deals',
    momentos_interes: momentosInteres,
    señales_objecion: señalesObjecion,
    engagement_por_tema: [],
    señales_cierre: señalesCierre,
    puntos_dolor: microexpresiones
      .filter(m => m.emocion === 'sad' || m.emocion === 'fearful')
      .map(m => ({
        timestamp: m.timestamp_ms / 1000,
        descripcion: 'Reacción negativa detectada',
        reaccion_emocional: m.emocion,
        intensidad: m.intensidad,
      })),
    predicciones: {
      probabilidad_cierre: predCierre,
      siguiente_paso_recomendado: predSiguientePaso,
      objecion_principal: predObjecion,
    },
    resumen: {
      momentos_clave: momentosInteres.slice(0, 5).map(m => `${Math.round(m.timestamp)}s: Alto interés`),
      objeciones_detectadas: señalesObjecion.slice(0, 3).map(s => `${Math.round(s.timestamp)}s: Señal de objeción`),
      recomendaciones_seguimiento: generateRecomendacionesDeals(predCierre.probabilidad, señalesObjecion.length),
      probabilidad_cierre_estimada: predCierre.probabilidad,
    },
  };
}

function generateAnalisisEquipo(
  emotionFrames: EmotionFrame[],
  bodyFrames: BodyLanguageFrame[],
  microexpresiones: MicroexpresionData[],
  participantes: { id: string; nombre: string }[],
  predicciones: PrediccionComportamiento[]
): AnalisisEquipo {
  const avgEngagement = emotionFrames.length > 0
    ? emotionFrames.reduce((sum, f) => sum + f.engagement_score, 0) / emotionFrames.length
    : 0.5;

  const engagementGrupal = emotionFrames.map(f => ({
    timestamp: f.timestamp_segundos,
    score_promedio: f.engagement_score,
    participantes_engaged: f.engagement_score > 0.5 ? 1 : 0,
    participantes_total: 1,
  }));

  const momentosDesconexion = emotionFrames
    .filter(f => f.engagement_score < 0.3)
    .map(f => ({
      timestamp: f.timestamp_segundos,
      duracion: 1,
      participantes_desconectados: participantes.map(p => p.nombre),
      posible_causa: 'Bajo engagement detectado',
    }));

  const predAdopcion = findLatestPrediction(predicciones, 'adopcion_ideas') || {
    tipo: 'adopcion_ideas',
    probabilidad: avgEngagement,
    confianza: 0.7,
    factores: avgEngagement > 0.6 ? ['Equipo receptivo'] : ['Considerar más discusión'],
    timestamp: Date.now(),
  };

  const predSeguimiento = findLatestPrediction(predicciones, 'necesidad_seguimiento') || {
    tipo: 'necesidad_seguimiento',
    probabilidad: momentosDesconexion.length > 5 ? 0.8 : 0.3,
    confianza: 0.6,
    factores: momentosDesconexion.length > 5
      ? ['Múltiples momentos de desconexión']
      : ['Reunión fluida'],
    timestamp: Date.now(),
  };

  const predConflicto = findLatestPrediction(predicciones, 'riesgo_conflicto') || {
    tipo: 'riesgo_conflicto',
    probabilidad: microexpresiones.filter(m => m.emocion === 'angry').length > 3 ? 0.6 : 0.2,
    confianza: 0.5,
    factores: [],
    timestamp: Date.now(),
  };

  return {
    tipo: 'equipo',
    participacion: participantes.map(p => ({
      usuario_id: p.id,
      usuario_nombre: p.nombre,
      tiempo_hablando_segundos: 0,
      tiempo_hablando_pct: 0,
      engagement_promedio: avgEngagement,
      intervenciones: 0,
      reacciones_positivas_recibidas: microexpresiones.filter(m => m.emocion === 'happy').length,
      reacciones_negativas_recibidas: microexpresiones.filter(m => m.emocion === 'angry' || m.emocion === 'disgusted').length,
    })),
    engagement_grupal: engagementGrupal,
    reacciones_ideas: [],
    momentos_desconexion: momentosDesconexion.slice(0, 10),
    dinamica_grupal: {
      cohesion_score: avgEngagement,
      participacion_equilibrada: true,
      lideres_naturales: [],
      participantes_pasivos: [],
    },
    predicciones: {
      adopcion_ideas: predAdopcion,
      necesidad_seguimiento: predSeguimiento,
      riesgo_conflicto: predConflicto,
    },
    resumen: {
      ideas_mejor_recibidas: [],
      participantes_destacados: [],
      areas_mejora_equipo: avgEngagement < 0.5 ? ['Mejorar dinamismo de reuniones'] : [],
      recomendaciones: generateRecomendacionesEquipo(avgEngagement, momentosDesconexion.length),
    },
  };
}

// ==================== HELPERS ====================

function calculateCongruencia(emotionFrames: EmotionFrame[], bodyFrames: BodyLanguageFrame[]): number {
  if (emotionFrames.length === 0 || bodyFrames.length === 0) return 0.5;

  let congruenciaSum = 0;
  let count = 0;

  emotionFrames.forEach(ef => {
    const bf = bodyFrames.find(b => Math.abs(b.timestamp_segundos - ef.timestamp_segundos) < 1);
    if (!bf) return;

    // Congruencia: emoción positiva + postura abierta = congruente
    const emoPosiva = ef.emocion_dominante === 'happy' || ef.emocion_dominante === 'surprised';
    const posturaPositiva = bf.postura === 'abierta' || bf.postura === 'inclinado_adelante';

    if ((emoPosiva && posturaPositiva) || (!emoPosiva && !posturaPositiva)) {
      congruenciaSum += 1;
    } else {
      congruenciaSum += 0.3;
    }
    count++;
  });

  return count > 0 ? congruenciaSum / count : 0.5;
}

function findMomentosAltos(frames: EmotionFrame[], key: keyof EmotionFrame, threshold: number) {
  const momentos: { timestamp: number; duracion: number }[] = [];
  let inicio: number | null = null;

  frames.forEach((f, i) => {
    const value = f[key] as number;
    if (value > threshold) {
      if (inicio === null) inicio = f.timestamp_segundos;
    } else {
      if (inicio !== null) {
        momentos.push({ timestamp: inicio, duracion: f.timestamp_segundos - inicio });
        inicio = null;
      }
    }
  });

  return momentos;
}

function findMomentosBajos(frames: EmotionFrame[], key: keyof EmotionFrame, threshold: number) {
  const momentos: { timestamp: number; duracion: number }[] = [];
  let inicio: number | null = null;

  frames.forEach((f, i) => {
    const value = f[key] as number;
    if (value < threshold) {
      if (inicio === null) inicio = f.timestamp_segundos;
    } else {
      if (inicio !== null) {
        momentos.push({ timestamp: inicio, duracion: f.timestamp_segundos - inicio });
        inicio = null;
      }
    }
  });

  return momentos;
}

function generateFortalezasRRHH(engagement: number, congruencia: number): string[] {
  const fortalezas: string[] = [];
  if (engagement > 0.7) fortalezas.push('Alto nivel de engagement durante la entrevista');
  if (congruencia > 0.7) fortalezas.push('Alta congruencia entre expresiones verbales y no verbales');
  if (engagement > 0.5) fortalezas.push('Muestra interés en la conversación');
  return fortalezas.length > 0 ? fortalezas : ['Entrevista completada'];
}

function generateAreasAtencionRRHH(nerviosismo: { score: number }[], incomodidad: any[]): string[] {
  const areas: string[] = [];
  const avgNerviosismo = nerviosismo.reduce((sum, n) => sum + n.score, 0) / (nerviosismo.length || 1);
  if (avgNerviosismo > 0.5) areas.push('Nivel de nerviosismo elevado');
  if (incomodidad.length > 3) areas.push(`${incomodidad.length} momentos de incomodidad detectados`);
  return areas;
}

function generateRecomendacionesDeals(probabilidad: number, objeciones: number): string[] {
  const recs: string[] = [];
  if (probabilidad > 0.7) {
    recs.push('Cliente muestra alto interés - considerar propuesta de cierre');
  } else if (probabilidad > 0.4) {
    recs.push('Interés moderado - reforzar propuesta de valor');
  } else {
    recs.push('Bajo interés detectado - revisar necesidades del cliente');
  }
  if (objeciones > 2) {
    recs.push('Abordar objeciones detectadas en seguimiento');
  }
  return recs;
}

function generateRecomendacionesEquipo(engagement: number, desconexiones: number): string[] {
  const recs: string[] = [];
  if (engagement > 0.7) {
    recs.push('Excelente dinámica de equipo');
  } else if (engagement > 0.4) {
    recs.push('Considerar dinámicas para aumentar participación');
  } else {
    recs.push('Evaluar formato de reunión - bajo engagement general');
  }
  if (desconexiones > 5) {
    recs.push('Reducir duración de reuniones o añadir breaks');
  }
  return recs;
}

export default useCombinedAnalysis;
