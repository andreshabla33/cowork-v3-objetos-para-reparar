/**
 * AnalysisDashboard - Dashboard de métricas post-reunión
 * Muestra resultados específicos según el tipo de grabación (RRHH, Deals, Equipo)
 */

import React, { useMemo } from 'react';
import {
  TipoGrabacion,
  CONFIGURACIONES_GRABACION,
  getConfiguracionConMetricasCustom,
  ResultadoAnalisis,
  AnalisisRRHH,
  AnalisisDeals,
  AnalisisEquipo,
  EmotionType,
} from './types/analysis';

interface AnalysisDashboardProps {
  resultado: ResultadoAnalisis;
  onClose: () => void;
  onExport?: () => void;
}

const EMOTION_ICONS: Record<EmotionType, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😲',
  fearful: '😨',
  disgusted: '🤢',
  contempt: '😏',
  neutral: '😐',
};

const EMOTION_COLORS: Record<EmotionType, string> = {
  happy: 'bg-green-500',
  sad: 'bg-blue-500',
  angry: 'bg-red-500',
  surprised: 'bg-yellow-500',
  fearful: 'bg-purple-500',
  disgusted: 'bg-orange-500',
  contempt: 'bg-pink-500',
  neutral: 'bg-gray-500',
};

// Config por defecto si no se encuentra el tipo
const CONFIG_DEFAULT: typeof CONFIGURACIONES_GRABACION['equipo'] = {
  tipo: 'equipo',
  tipoBase: 'equipo',
  titulo: 'Reunión',
  descripcion: 'Análisis de reunión',
  icono: '📊',
  color: 'from-indigo-600 to-purple-600',
  colorAccent: '#6366f1',
  requiereDisclaimer: false,
  metricas: [],
  cargosPermitidos: [],
};

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({
  resultado,
  onClose,
  onExport,
}) => {
  const configBase = CONFIGURACIONES_GRABACION[resultado.tipo_grabacion] || CONFIG_DEFAULT;
  // Usar métricas custom del espacio (desde cache Supabase) con fallback a defaults
  const tipoDetallado = resultado.tipo_grabacion === 'rrhh' ? 'rrhh_entrevista' : resultado.tipo_grabacion;
  const configCustom = getConfiguracionConMetricasCustom(tipoDetallado as any);
  const config = { ...configBase, metricas: configCustom.metricas };
  const metricasActivas = new Set(config.metricas);
  
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

  // Estadísticas generales
  const stats = useMemo(() => {
    const frames = resultado.frames_faciales;
    if (frames.length === 0) return null;

    const avgEngagement = frames.reduce((sum, f) => sum + f.engagement_score, 0) / frames.length;
    
    const emotionCounts: Record<string, number> = {};
    frames.forEach(f => {
      emotionCounts[f.emocion_dominante] = (emotionCounts[f.emocion_dominante] || 0) + 1;
    });
    const dominantEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      avgEngagement,
      dominantEmotion: dominantEmotion ? dominantEmotion[0] as EmotionType : 'neutral',
      dominantEmotionPct: dominantEmotion ? (dominantEmotion[1] / frames.length) * 100 : 0,
      microexpresiones: resultado.microexpresiones.length,
      framesAnalizados: frames.length,
    };
  }, [resultado]);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[500] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-zinc-900 rounded-2xl max-w-3xl w-full border border-white/10 shadow-2xl max-h-[95vh] flex flex-col">
        {/* Header - Compacto */}
        <div className={`p-4 bg-gradient-to-r ${config.color} rounded-t-2xl flex-shrink-0`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{config.icono}</span>
              <div>
                <h2 className="text-white font-bold text-lg">Análisis de {config.titulo}</h2>
                <p className="text-white/80 text-xs">
                  Duración: {formatDuration(resultado.duracion_segundos)} | Confianza: {formatPercent(resultado.confianza_general)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 text-white text-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Estadísticas generales - Compactas */}
          {stats && (
            <div className="p-4 border-b border-white/10">
              <div className="grid grid-cols-4 gap-2">
                <StatCardCompact
                  icon="📊"
                  label="Engagement"
                  value={formatPercent(stats.avgEngagement)}
                  color={stats.avgEngagement > 0.6 ? 'green' : stats.avgEngagement > 0.4 ? 'yellow' : 'red'}
                />
                <StatCardCompact
                  icon={EMOTION_ICONS[stats.dominantEmotion]}
                  label="Emoción"
                  value={stats.dominantEmotion}
                  subvalue={`${Math.round(stats.dominantEmotionPct)}%`}
                />
                <StatCardCompact
                  icon="⚡"
                  label="Micro"
                  value={String(stats.microexpresiones)}
                />
                <StatCardCompact
                  icon="🎯"
                  label="Frames"
                  value={String(stats.framesAnalizados)}
                />
              </div>
            </div>
          )}

          {/* Métricas evaluadas - Badge informativo */}
          {config.metricas.length > 0 && (
            <div className="px-4 pt-3">
              <div className="flex flex-wrap gap-1">
                {config.metricas.slice(0, 8).map(m => (
                  <span key={m} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] text-zinc-400">
                    {m.replace(/_/g, ' ')}
                  </span>
                ))}
                {config.metricas.length > 8 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/5 text-[9px] text-zinc-500">
                    +{config.metricas.length - 8} más
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Cohesión y Participación - visible si engagement_grupal o dinamica_grupal activas */}
          {stats && (metricasActivas.has('engagement_grupal') || metricasActivas.has('dinamica_grupal') || metricasActivas.has('engagement_por_tema') || metricasActivas.has('engagement_por_pregunta')) && (
            <div className="p-4 border-b border-white/10">
              <div className="bg-gradient-to-r from-purple-600/20 to-violet-600/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-xs mb-1">Cohesión del Equipo</p>
                    <p className="text-2xl font-bold text-white">
                      {Math.round(stats.avgEngagement * 100)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 text-xs mb-1">Participación</p>
                    <p className={`text-lg font-semibold ${stats.avgEngagement > 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {stats.avgEngagement > 0.5 ? 'Equilibrada' : 'Variable'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Predicciones - visible si alguna métrica de predicción está activa */}
          {stats && (metricasActivas.has('prediccion_adopcion_ideas') || metricasActivas.has('prediccion_fit_cultural') || metricasActivas.has('prediccion_probabilidad_cierre')) && (
            <div className="p-4 border-b border-white/10">
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
                <span>🎯</span> Predicciones
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {metricasActivas.has('prediccion_adopcion_ideas') && (
                  <PredictionCardCompact
                    title="Adopción de Ideas"
                    probability={stats.avgEngagement}
                    confidence={resultado.confianza_general}
                    factor={stats.avgEngagement > 0.6 ? 'Equipo receptivo' : 'Requiere seguimiento'}
                  />
                )}
                {(metricasActivas.has('momentos_desconexion') || metricasActivas.has('momentos_incomodidad') || metricasActivas.has('momentos_preocupacion')) && (
                  <PredictionCardCompact
                    title="Necesidad de Seguimiento"
                    probability={1 - stats.avgEngagement}
                    confidence={resultado.confianza_general * 0.9}
                    factor={stats.avgEngagement < 0.5 ? 'Atención dispersa' : 'Reunión fluida'}
                  />
                )}
                {(metricasActivas.has('dinamica_grupal') || metricasActivas.has('señales_objecion')) && (
                  <PredictionCardCompact
                    title="Riesgo de Conflicto"
                    probability={stats.dominantEmotion === 'angry' ? 0.7 : stats.dominantEmotion === 'neutral' ? 0.3 : 0.4}
                    confidence={resultado.confianza_general * 0.8}
                    factor={stats.dominantEmotion === 'angry' ? 'Tensión detectada' : 'Ambiente estable'}
                    inverted
                  />
                )}
              </div>
            </div>
          )}

          {/* Participación por usuario - visible si participacion_por_persona activa */}
          {metricasActivas.has('participacion_por_persona') && resultado.analisis && (resultado.analisis as AnalisisEquipo).participacion?.length > 0 && (
            <div className="p-4 border-b border-white/10">
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
                <span>👥</span> Participación
              </h4>
              <div className="space-y-2">
                {(resultado.analisis as AnalisisEquipo).participacion.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg p-2">
                    <span className="text-white text-xs font-medium w-24 truncate">{p.usuario_nombre}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${p.engagement_promedio * 100}%` }}
                      />
                    </div>
                    <span className="text-white/60 text-xs w-10 text-right">
                      {Math.round(p.engagement_promedio * 100)}%
                    </span>
                    <div className="flex gap-1 text-[10px]">
                      <span className="text-green-400">+{p.reacciones_positivas_recibidas}</span>
                      <span className="text-red-400">-{p.reacciones_negativas_recibidas}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline de emociones - Compacto */}
          <div className="p-4">
            <h4 className="text-white font-semibold mb-2 flex items-center gap-2 text-sm">
              <span>📈</span> Timeline Emocional
            </h4>
            <EmotionTimeline frames={resultado.frames_faciales} duration={resultado.duracion_segundos} />
          </div>
        </div>

        {/* Footer - Compacto */}
        <div className="p-3 border-t border-white/10 flex justify-between items-center flex-shrink-0">
          <p className="text-white/40 text-[10px]">
            {new Date(resultado.procesado_en).toLocaleString()} | v{resultado.modelo_version}
          </p>
          <div className="flex gap-2">
            {onExport && (
              <button
                onClick={onExport}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors flex items-center gap-1"
              >
                <span>📥</span> Exportar
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== COMPONENTES AUXILIARES ====================

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  subvalue?: string;
  color?: 'green' | 'yellow' | 'red';
}> = ({ icon, label, value, subvalue, color }) => {
  const colorClasses = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-white/60 text-sm">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color ? colorClasses[color] : 'text-white'}`}>
        {value}
      </p>
      {subvalue && <p className="text-white/50 text-xs mt-1">{subvalue}</p>}
    </div>
  );
};

const StatCardCompact: React.FC<{
  icon: string;
  label: string;
  value: string;
  subvalue?: string;
  color?: 'green' | 'yellow' | 'red';
}> = ({ icon, label, value, subvalue, color }) => {
  const colorClasses = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className="bg-white/5 rounded-lg p-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-white/50 text-[10px]">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color ? colorClasses[color] : 'text-white'}`}>
        {value}
      </p>
      {subvalue && <p className="text-white/40 text-[10px]">{subvalue}</p>}
    </div>
  );
};

const PredictionCardCompact: React.FC<{
  title: string;
  probability: number;
  confidence: number;
  factor: string;
  inverted?: boolean;
}> = ({ title, probability, confidence, factor, inverted }) => {
  const color = inverted
    ? probability < 0.3 ? 'green' : probability < 0.6 ? 'yellow' : 'red'
    : probability > 0.6 ? 'green' : probability > 0.4 ? 'yellow' : 'red';
  
  const colorClasses = {
    green: 'from-green-500/20 to-green-600/20 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/20 border-red-500/30',
  };

  const textColors = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-lg p-2`}>
      <p className="text-white/60 text-[10px] mb-0.5 truncate">{title}</p>
      <p className={`text-xl font-bold ${textColors[color]}`}>
        {Math.round(probability * 100)}%
      </p>
      <p className="text-white/40 text-[9px]">Confianza: {Math.round(confidence * 100)}%</p>
      <p className="text-white/50 text-[9px] mt-1 truncate">• {factor}</p>
    </div>
  );
};

const EmotionTimeline: React.FC<{
  frames: { timestamp_segundos: number; emocion_dominante: EmotionType; engagement_score: number }[];
  duration: number;
}> = ({ frames, duration }) => {
  if (frames.length === 0) return <p className="text-white/50 text-sm">Sin datos de timeline</p>;

  // Usar segmentos más pequeños: 1-2 segundos dependiendo de la duración
  const numSegments = Math.min(30, Math.max(10, Math.ceil(duration)));
  const segmentDuration = duration / numSegments;
  const segments: { emotion: EmotionType; engagement: number; hasData: boolean }[] = [];

  for (let i = 0; i < numSegments; i++) {
    const t = i * segmentDuration;
    const segmentFrames = frames.filter(
      f => f.timestamp_segundos >= t && f.timestamp_segundos < t + segmentDuration
    );
    if (segmentFrames.length > 0) {
      const counts: Record<string, number> = {};
      let engSum = 0;
      segmentFrames.forEach(f => {
        counts[f.emocion_dominante] = (counts[f.emocion_dominante] || 0) + 1;
        engSum += f.engagement_score;
      });
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as EmotionType;
      segments.push({
        emotion: dominant,
        engagement: engSum / segmentFrames.length,
        hasData: true,
      });
    } else {
      // Interpolar con el segmento anterior si no hay datos
      const lastSeg = segments[segments.length - 1];
      segments.push({
        emotion: lastSeg?.emotion || 'neutral',
        engagement: lastSeg?.engagement || 0.5,
        hasData: false,
      });
    }
  }

  return (
    <div className="flex gap-0.5 h-14 bg-white/5 rounded-lg p-1">
      {segments.map((seg, i) => (
        <div
          key={i}
          className={`flex-1 rounded ${EMOTION_COLORS[seg.emotion]} transition-all hover:scale-y-110 cursor-pointer`}
          style={{ opacity: seg.hasData ? (0.4 + seg.engagement * 0.6) : 0.2 }}
          title={`${Math.round(i * segmentDuration)}s - ${seg.emotion} (${Math.round(seg.engagement * 100)}%)`}
        >
          <div className="h-full flex items-end justify-center pb-0.5">
            {seg.hasData && <span className="text-[10px]">{EMOTION_ICONS[seg.emotion]}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== CONTENIDO POR TIPO ====================

const RRHHAnalysisContent: React.FC<{ analisis: AnalisisRRHH }> = ({ analisis }) => (
  <div className="space-y-6">
    {/* Predicciones */}
    <Section title="🎯 Predicciones">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PredictionCard
          title="Fit Cultural"
          probability={analisis.predicciones.fit_cultural.probabilidad}
          confidence={analisis.predicciones.fit_cultural.confianza}
          factors={analisis.predicciones.fit_cultural.factores}
        />
        <PredictionCard
          title="Interés en el Puesto"
          probability={analisis.predicciones.nivel_interes_puesto.probabilidad}
          confidence={analisis.predicciones.nivel_interes_puesto.confianza}
          factors={analisis.predicciones.nivel_interes_puesto.factores}
        />
        <PredictionCard
          title="Autenticidad"
          probability={analisis.predicciones.autenticidad_respuestas.probabilidad}
          confidence={analisis.predicciones.autenticidad_respuestas.confianza}
          factors={analisis.predicciones.autenticidad_respuestas.factores}
        />
      </div>
    </Section>

    {/* Métricas clave */}
    <Section title="📊 Métricas Clave">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBar label="Congruencia" value={analisis.congruencia_verbal_no_verbal} />
        <MetricBar label="Nerviosismo" value={analisis.nerviosismo_promedio} inverted />
        <MetricBar label="Confianza Percibida" value={analisis.confianza_percibida} />
        <MetricBar label="Incomodidad" value={analisis.momentos_incomodidad.length / 10} inverted />
      </div>
    </Section>

    {/* Resumen */}
    <Section title="📝 Resumen Ejecutivo">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <h5 className="text-green-400 font-semibold mb-2">✅ Fortalezas Observadas</h5>
          <ul className="space-y-1">
            {analisis.resumen.fortalezas_observadas.map((f, i) => (
              <li key={i} className="text-white/80 text-sm flex items-start gap-2">
                <span className="text-green-400">•</span> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <h5 className="text-amber-400 font-semibold mb-2">⚠️ Áreas de Atención</h5>
          <ul className="space-y-1">
            {analisis.resumen.areas_atencion.length > 0 ? (
              analisis.resumen.areas_atencion.map((a, i) => (
                <li key={i} className="text-white/80 text-sm flex items-start gap-2">
                  <span className="text-amber-400">•</span> {a}
                </li>
              ))
            ) : (
              <li className="text-white/60 text-sm">Sin áreas de atención destacadas</li>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <h5 className="text-blue-400 font-semibold mb-2">💡 Recomendación</h5>
        <p className="text-white/80 text-sm">{analisis.resumen.recomendacion_seguimiento}</p>
      </div>
    </Section>
  </div>
);

const DealsAnalysisContent: React.FC<{ analisis: AnalisisDeals }> = ({ analisis }) => (
  <div className="space-y-6">
    {/* Probabilidad de cierre destacada */}
    <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl p-6 text-center">
      <p className="text-white/60 text-sm mb-2">Probabilidad Estimada de Cierre</p>
      <p className={`text-5xl font-bold ${
        analisis.resumen.probabilidad_cierre_estimada > 0.6 ? 'text-green-400' :
        analisis.resumen.probabilidad_cierre_estimada > 0.4 ? 'text-yellow-400' : 'text-red-400'
      }`}>
        {Math.round(analisis.resumen.probabilidad_cierre_estimada * 100)}%
      </p>
    </div>

    {/* Predicciones */}
    <Section title="🎯 Predicciones">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PredictionCard
          title="Probabilidad de Cierre"
          probability={analisis.predicciones.probabilidad_cierre.probabilidad}
          confidence={analisis.predicciones.probabilidad_cierre.confianza}
          factors={analisis.predicciones.probabilidad_cierre.factores}
        />
        <PredictionCard
          title="Siguiente Paso"
          probability={analisis.predicciones.siguiente_paso_recomendado.probabilidad}
          confidence={analisis.predicciones.siguiente_paso_recomendado.confianza}
          factors={analisis.predicciones.siguiente_paso_recomendado.factores}
        />
        <PredictionCard
          title="Objeción Principal"
          probability={analisis.predicciones.objecion_principal.probabilidad}
          confidence={analisis.predicciones.objecion_principal.confianza}
          factors={analisis.predicciones.objecion_principal.factores}
        />
      </div>
    </Section>

    {/* Momentos clave */}
    <Section title="⭐ Momentos Clave">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <h5 className="text-green-400 font-semibold mb-2">📈 Momentos de Interés ({analisis.momentos_interes.length})</h5>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {analisis.momentos_interes.slice(0, 5).map((m, i) => (
              <li key={i} className="text-white/80 text-sm flex items-center gap-2">
                <span className="text-green-400 font-mono text-xs">{Math.floor(m.timestamp / 60)}:{String(Math.floor(m.timestamp % 60)).padStart(2, '0')}</span>
                <span>Engagement: {Math.round(m.score * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <h5 className="text-red-400 font-semibold mb-2">⚠️ Señales de Objeción ({analisis.señales_objecion.length})</h5>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {analisis.señales_objecion.slice(0, 5).map((s, i) => (
              <li key={i} className="text-white/80 text-sm flex items-center gap-2">
                <span className="text-red-400 font-mono text-xs">{Math.floor(s.timestamp / 60)}:{String(Math.floor(s.timestamp % 60)).padStart(2, '0')}</span>
                <span>{s.indicadores.join(', ')}</span>
              </li>
            ))}
            {analisis.señales_objecion.length === 0 && (
              <li className="text-white/60 text-sm">Sin objeciones claras detectadas</li>
            )}
          </ul>
        </div>
      </div>
    </Section>

    {/* Recomendaciones */}
    <Section title="💡 Recomendaciones de Seguimiento">
      <ul className="space-y-2">
        {analisis.resumen.recomendaciones_seguimiento.map((r, i) => (
          <li key={i} className="text-white/80 text-sm flex items-start gap-2 bg-white/5 rounded-lg p-3">
            <span className="text-indigo-400">→</span> {r}
          </li>
        ))}
      </ul>
    </Section>
  </div>
);

const EquipoAnalysisContent: React.FC<{ analisis: AnalisisEquipo }> = ({ analisis }) => (
  <div className="space-y-6">
    {/* Dinámica grupal */}
    <div className="bg-gradient-to-r from-purple-600/20 to-violet-600/20 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/60 text-sm mb-1">Cohesión del Equipo</p>
          <p className="text-3xl font-bold text-white">
            {Math.round(analisis.dinamica_grupal.cohesion_score * 100)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-white/60 text-sm mb-1">Participación</p>
          <p className={`text-xl font-semibold ${analisis.dinamica_grupal.participacion_equilibrada ? 'text-green-400' : 'text-yellow-400'}`}>
            {analisis.dinamica_grupal.participacion_equilibrada ? 'Equilibrada' : 'Desbalanceada'}
          </p>
        </div>
      </div>
    </div>

    {/* Predicciones */}
    <Section title="🎯 Predicciones">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PredictionCard
          title="Adopción de Ideas"
          probability={analisis.predicciones.adopcion_ideas.probabilidad}
          confidence={analisis.predicciones.adopcion_ideas.confianza}
          factors={analisis.predicciones.adopcion_ideas.factores}
        />
        <PredictionCard
          title="Necesidad de Seguimiento"
          probability={analisis.predicciones.necesidad_seguimiento.probabilidad}
          confidence={analisis.predicciones.necesidad_seguimiento.confianza}
          factors={analisis.predicciones.necesidad_seguimiento.factores}
        />
        <PredictionCard
          title="Riesgo de Conflicto"
          probability={analisis.predicciones.riesgo_conflicto.probabilidad}
          confidence={analisis.predicciones.riesgo_conflicto.confianza}
          factors={analisis.predicciones.riesgo_conflicto.factores}
          inverted
        />
      </div>
    </Section>

    {/* Participación */}
    {analisis.participacion.length > 0 && (
      <Section title="👥 Participación">
        <div className="space-y-2">
          {analisis.participacion.map((p, i) => (
            <div key={i} className="flex items-center gap-4 bg-white/5 rounded-lg p-3">
              <span className="text-white font-medium w-32 truncate">{p.usuario_nombre}</span>
              <div className="flex-1">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${p.engagement_promedio * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-white/60 text-sm w-16 text-right">
                {Math.round(p.engagement_promedio * 100)}%
              </span>
              <div className="flex gap-1">
                <span className="text-green-400 text-xs">+{p.reacciones_positivas_recibidas}</span>
                <span className="text-red-400 text-xs">-{p.reacciones_negativas_recibidas}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    )}

    {/* Momentos de desconexión */}
    {analisis.momentos_desconexion.length > 0 && (
      <Section title="😴 Momentos de Desconexión ({analisis.momentos_desconexion.length})">
        <ul className="space-y-2">
          {analisis.momentos_desconexion.slice(0, 5).map((m, i) => (
            <li key={i} className="text-white/80 text-sm flex items-center gap-2 bg-white/5 rounded-lg p-2">
              <span className="text-white/50 font-mono text-xs">
                {Math.floor(m.timestamp / 60)}:{String(Math.floor(m.timestamp % 60)).padStart(2, '0')}
              </span>
              <span>{m.posible_causa}</span>
            </li>
          ))}
        </ul>
      </Section>
    )}

    {/* Recomendaciones */}
    <Section title="💡 Recomendaciones">
      <ul className="space-y-2">
        {analisis.resumen.recomendaciones.map((r, i) => (
          <li key={i} className="text-white/80 text-sm flex items-start gap-2 bg-white/5 rounded-lg p-3">
            <span className="text-purple-400">→</span> {r}
          </li>
        ))}
      </ul>
    </Section>
  </div>
);

// ==================== COMPONENTES COMUNES ====================

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">{title}</h4>
    {children}
  </div>
);

const PredictionCard: React.FC<{
  title: string;
  probability: number;
  confidence: number;
  factors: string[];
  inverted?: boolean;
}> = ({ title, probability, confidence, factors, inverted }) => {
  const color = inverted
    ? probability < 0.3 ? 'green' : probability < 0.6 ? 'yellow' : 'red'
    : probability > 0.6 ? 'green' : probability > 0.4 ? 'yellow' : 'red';
  
  const colorClasses = {
    green: 'from-green-500/20 to-green-600/20 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/20 border-red-500/30',
  };

  const textColors = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
      <p className="text-white/60 text-xs mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textColors[color]}`}>
        {Math.round(probability * 100)}%
      </p>
      <p className="text-white/40 text-xs mb-2">Confianza: {Math.round(confidence * 100)}%</p>
      <div className="border-t border-white/10 pt-2 mt-2">
        {factors.slice(0, 2).map((f, i) => (
          <p key={i} className="text-white/60 text-xs">• {f}</p>
        ))}
      </div>
    </div>
  );
};

const MetricBar: React.FC<{
  label: string;
  value: number;
  inverted?: boolean;
}> = ({ label, value, inverted }) => {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const color = inverted
    ? normalizedValue < 0.3 ? 'bg-green-500' : normalizedValue < 0.6 ? 'bg-yellow-500' : 'bg-red-500'
    : normalizedValue > 0.6 ? 'bg-green-500' : normalizedValue > 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white font-medium">{Math.round(normalizedValue * 100)}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${normalizedValue * 100}%` }}
        />
      </div>
    </div>
  );
};

export default AnalysisDashboard;
