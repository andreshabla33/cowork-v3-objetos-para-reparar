/**
 * GrabacionesHistorial - Vista de historial de grabaciones con análisis
 * Diseño UI 2026 con micro-interacciones y diseño adaptativo
 *
 * Refactored 2026-03-27:
 * - Removed all direct Supabase access, using useGrabacionesHistorial hook
 * - Eliminated all `any` types with proper TypeScript interfaces
 * - Replaced all console.log/error/warn with logger
 * - Clean Architecture: Component layer depends on hook → hook depends on use case → use case depends on repository
 */

import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../../store/useStore';
import { logger } from '@/lib/logger';
import { useGrabacionesHistorial } from '../../../hooks/meetings/useGrabacionesHistorial';
import { getThemeStyles, type ThemeStyleSet } from '@/lib/theme';
import type {
  GrabacionConDatos,
  TranscripcionRecord,
  AnalisisComportamientoRecord,
} from '@/src/core/domain/ports/IRecordingRepository';
import { AnalysisDashboard } from './AnalysisDashboard';
import {
  ResultadoAnalisis,
  TipoGrabacion,
  CargoLaboral,
  getTiposGrabacionDisponibles,
  EmotionFrame,
  AnalisisRRHH,
  AnalisisDeals,
  AnalisisEquipo,
  EmotionType,
  MicroexpresionData,
} from './types/analysis';

const log = logger.child('grabaciones-historial');

const ESTADO_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  grabando:       { color: 'bg-red-500',     icon: '🔴', label: 'Grabando' },
  procesando:     { color: 'bg-amber-500',   icon: '⏳', label: 'Procesando' },
  transcribiendo: { color: 'bg-sky-500',     icon: '📝', label: 'Transcribiendo' },
  analizando:     { color: 'bg-blue-500',  icon: '🧠', label: 'Analizando' },
  completado:     { color: 'bg-emerald-500', icon: '✅', label: 'Completado' },
  error:          { color: 'bg-red-600',     icon: '❌', label: 'Error' },
};

const TIPO_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  rrhh:             { color: 'from-blue-500 to-blue-600',   icon: '👥', label: 'RRHH' },
  rrhh_entrevista:  { color: 'from-blue-500 to-blue-600',   icon: '🎯', label: 'Entrevista' },
  rrhh_one_to_one:  { color: 'from-blue-500 to-blue-600',   icon: '🤝', label: 'One-to-One' },
  deals:            { color: 'from-emerald-500 to-emerald-600', icon: '💼', label: 'Negociación' },
  equipo:           { color: 'from-sky-500 to-sky-600',         icon: '🚀', label: 'Equipo' },
  reunion:          { color: 'from-slate-400 to-slate-500',     icon: '📹', label: 'Reunión' },
};

interface DropdownOption {
  value: string;
  label: string;
  icon: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  s: ThemeStyleSet;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ options, value, onChange, placeholder, s }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all min-w-[160px] justify-between border ${s.surface} ${s.border} ${s.text} hover:border-sky-300`}
      >
        <span className="flex items-center gap-2">
          <span>{selectedOption?.icon || '📋'}</span>
          <span>{selectedOption?.label || placeholder}</span>
        </span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute top-full left-0 mt-2 w-full rounded-xl overflow-hidden shadow-xl z-50 border ${s.surface} ${s.border}`}>
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => { onChange(option.value); setIsOpen(false); }}
              className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2 transition-all ${
                value === option.value ? `${s.accentSurface} ${s.accent}` : `${s.text} ${s.surfaceHover}`
              }`}
            >
              <span>{option.icon}</span>
              <span>{option.label}</span>
              {value === option.value && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const GrabacionesHistorial: React.FC = () => {
  const { t } = useTranslation();
  const { activeWorkspace, session, theme, userRoleInActiveWorkspace } = useStore();
  const s = getThemeStyles(theme);

  const { grabaciones, isLoading, error, cargoUsuario, rolSistema, cargarGrabaciones } =
    useGrabacionesHistorial(activeWorkspace?.id, session?.user?.id);

  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [grabacionSeleccionada, setGrabacionSeleccionada] = useState<GrabacionConDatos | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showTranscripcion, setShowTranscripcion] = useState(false);
  const [resultadoAnalisis, setResultadoAnalisis] = useState<ResultadoAnalisis | null>(null);

  const estadoOptions: DropdownOption[] = [
    { value: 'todos',      label: 'Todos los estados', icon: '📊' },
    { value: 'completado', label: 'Completados',       icon: '✅' },
    { value: 'procesando', label: 'Procesando',        icon: '⏳' },
    { value: 'error',      label: 'Con error',         icon: '❌' },
  ];

  const tipoOptions: DropdownOption[] = useMemo(() => {
    const baseOptions: DropdownOption[] = [{ value: 'todos', label: 'Todos los tipos', icon: '🎬' }];
    const esMember = rolSistema === 'member' || rolSistema === 'miembro';
    const esColaboradorBasico = !cargoUsuario || cargoUsuario === 'colaborador' || cargoUsuario === 'otro';

    if (esMember && esColaboradorBasico) return baseOptions;

    if (cargoUsuario) {
      const tiposDisponibles = getTiposGrabacionDisponibles(cargoUsuario as CargoLaboral);
      tiposDisponibles.forEach((tipo) => {
        const config = TIPO_CONFIG[tipo];
        if (config) baseOptions.push({ value: tipo, label: config.label, icon: config.icon });
      });
    } else if (!esMember) {
      Object.entries(TIPO_CONFIG).forEach(([key, config]) => {
        if (key !== 'reunion' && key !== 'rrhh') {
          baseOptions.push({ value: key, label: config.label, icon: config.icon });
        }
      });
    }
    return baseOptions;
  }, [cargoUsuario, rolSistema]);

  const grabacionesFiltradas = useMemo(() => {
    return grabaciones.filter((g) => {
      if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false;
      if (filtroTipo !== 'todos' && g.tipo !== filtroTipo) return false;
      if (busqueda) {
        const searchLower = busqueda.toLowerCase();
        const nombreUsuario = `${g.usuario?.nombre || ''} ${g.usuario?.apellido || ''}`.toLowerCase();
        const tieneTexto = g.transcripciones?.some((t) => t.texto.toLowerCase().includes(searchLower));
        if (!nombreUsuario.includes(searchLower) && !tieneTexto) return false;
      }
      return true;
    });
  }, [grabaciones, filtroEstado, filtroTipo, busqueda]);

  const formatDuracion = (segundos: number | null): string => {
    if (!segundos) return '--:--';
    const mins = Math.floor(segundos / 60);
    const secs = Math.floor(segundos % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatFecha = (fecha: string): string => {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ── Domain logic preserved verbatim ─────────────────────────────────────
  const verAnalisis = (grabacion: GrabacionConDatos): void => {
    if (!grabacion.analisis_comportamiento?.length) {
      alert('Esta grabación no tiene análisis disponible');
      return;
    }

    const tipoGrab = (grabacion.tipo as TipoGrabacion) || 'equipo';
    const frames: EmotionFrame[] = grabacion.analisis_comportamiento.map((a) => ({
      timestamp_segundos: a.timestamp_segundos,
      emociones_scores: (a.emociones_detalle || {}) as Record<EmotionType, number>,
      emocion_dominante: (a.emocion_dominante || 'neutral') as EmotionType,
      confianza_deteccion: 0.8,
      action_units: {},
      engagement_score: a.engagement_score || 0.5,
      mirando_camara: true,
      cambio_abrupto: false,
      delta_vs_baseline: 0,
    }));

    const analisisEspecifico = generateAnalisisFromFrames(tipoGrab, frames, grabacion.duracion_segundos || 0);

    const microexpresionesDetectadas: MicroexpresionData[] = [];
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1];
      const curr = frames[i];
      if (prev.emocion_dominante !== curr.emocion_dominante &&
          prev.emocion_dominante !== 'neutral' &&
          curr.emocion_dominante !== 'neutral') {
        microexpresionesDetectadas.push({
          timestamp_ms: Math.round(curr.timestamp_segundos * 1000),
          emocion: curr.emocion_dominante,
          intensidad: 0.7,
          duracion_ms: 300,
          es_microexpresion: true,
          action_units: curr.action_units ?? {},
        });
      }
    }

    const resultado: ResultadoAnalisis = {
      grabacion_id: grabacion.id,
      tipo_grabacion: tipoGrab,
      duracion_segundos: grabacion.duracion_segundos || 0,
      participantes: grabacion.usuario
        ? [{ id: grabacion.creado_por, nombre: `${grabacion.usuario.nombre} ${grabacion.usuario.apellido}` }]
        : [],
      frames_faciales: frames,
      frames_corporales: [],
      microexpresiones: microexpresionesDetectadas,
      baseline: null,
      analisis: analisisEspecifico,
      modelo_version: '1.0.0',
      procesado_en: grabacion.creado_en,
      confianza_general: 0.85,
    };

    setResultadoAnalisis(resultado);
    setGrabacionSeleccionada(grabacion);
    setShowDashboard(true);

    log.info('Analysis dashboard opened', { grabacion_id: grabacion.id, tipo: tipoGrab });
  };

  const generateAnalisisFromFrames = (
    tipo: TipoGrabacion,
    frames: EmotionFrame[],
    duracion: number
  ): AnalisisRRHH | AnalisisDeals | AnalisisEquipo => {
    const avgEngagement = frames.length > 0
      ? frames.reduce((sum, f) => sum + f.engagement_score, 0) / frames.length
      : 0.5;

    const emotionCounts: Record<string, number> = {};
    frames.forEach((f) => { emotionCounts[f.emocion_dominante] = (emotionCounts[f.emocion_dominante] || 0) + 1; });

    const momentosPositivos = frames.filter((f) => f.engagement_score > 0.7);
    const momentosNegativos = frames.filter(
      (f) => f.emocion_dominante === 'angry' || f.emocion_dominante === 'sad' || f.emocion_dominante === 'disgusted'
    );

    if (tipo === 'deals') {
      const probabilidadCierre = Math.min(1, avgEngagement * 0.5 + (momentosPositivos.length / Math.max(frames.length, 1)) * 0.3);
      return {
        tipo: 'deals',
        momentos_interes: momentosPositivos.slice(0, 10).map((f) => ({ timestamp: f.timestamp_segundos, score: f.engagement_score, indicadores: [f.emocion_dominante] })),
        señales_objecion: momentosNegativos.slice(0, 5).map((f) => ({ timestamp: f.timestamp_segundos, tipo: 'desconocido' as const, intensidad: 0.6, indicadores: [f.emocion_dominante] })),
        engagement_por_tema: [],
        señales_cierre: [],
        puntos_dolor: [],
        predicciones: {
          probabilidad_cierre: { tipo: 'probabilidad_cierre', probabilidad: probabilidadCierre, confianza: 0.7, factores: probabilidadCierre > 0.6 ? ['Alto engagement detectado'] : ['Engagement moderado'], timestamp: Date.now() },
          siguiente_paso_recomendado: { tipo: 'siguiente_paso', probabilidad: probabilidadCierre > 0.5 ? 0.8 : 0.4, confianza: 0.6, factores: probabilidadCierre > 0.5 ? ['Proponer siguiente reunión'] : ['Abordar objeciones'], timestamp: Date.now() },
          objecion_principal: { tipo: 'objecion_principal', probabilidad: momentosNegativos.length > 0 ? 0.6 : 0.2, confianza: 0.5, factores: momentosNegativos.length > 0 ? ['Objeciones detectadas'] : ['Sin objeciones claras'], timestamp: Date.now() },
        },
        resumen: {
          momentos_clave: momentosPositivos.slice(0, 3).map((m) => `${Math.round(m.timestamp_segundos)}s: Alto interés`),
          objeciones_detectadas: momentosNegativos.slice(0, 3).map((s) => `${Math.round(s.timestamp_segundos)}s: Señal negativa`),
          recomendaciones_seguimiento: probabilidadCierre > 0.6
            ? ['Cliente muestra interés - considerar propuesta de cierre']
            : ['Reforzar propuesta de valor', 'Abordar posibles objeciones'],
          probabilidad_cierre_estimada: probabilidadCierre,
        },
      } as AnalisisDeals;
    }

    if (tipo === 'rrhh') {
      const congruenciaScore = avgEngagement * 0.8;
      return {
        tipo: 'rrhh',
        congruencia_verbal_no_verbal: congruenciaScore,
        nerviosismo_timeline: frames.map((f) => ({ timestamp: f.timestamp_segundos, score: 1 - f.engagement_score })),
        nerviosismo_promedio: 1 - avgEngagement,
        confianza_percibida: avgEngagement,
        momentos_alta_confianza: momentosPositivos.map((f) => ({ timestamp: f.timestamp_segundos, duracion: 1 })),
        momentos_baja_confianza: momentosNegativos.map((f) => ({ timestamp: f.timestamp_segundos, duracion: 1 })),
        momentos_incomodidad: momentosNegativos.map((f) => ({ timestamp: f.timestamp_segundos, duracion: 1, indicadores: [f.emocion_dominante] })),
        engagement_timeline: frames.map((f) => ({ timestamp: f.timestamp_segundos, score: f.engagement_score })),
        predicciones: {
          fit_cultural: { tipo: 'fit_cultural', probabilidad: avgEngagement, confianza: 0.6, factores: ['Basado en engagement'], timestamp: Date.now() },
          nivel_interes_puesto: { tipo: 'nivel_interes', probabilidad: avgEngagement, confianza: 0.7, factores: ['Engagement promedio'], timestamp: Date.now() },
          autenticidad_respuestas: { tipo: 'autenticidad', probabilidad: congruenciaScore, confianza: 0.65, factores: ['Expresiones consistentes'], timestamp: Date.now() },
        },
        resumen: {
          fortalezas_observadas: avgEngagement > 0.6 ? ['Alto nivel de engagement', 'Muestra interés genuino'] : ['Participación activa'],
          areas_atencion: momentosNegativos.length > 3 ? ['Momentos de incomodidad detectados'] : [],
          recomendacion_seguimiento: avgEngagement > 0.6 ? 'Candidato muestra señales positivas' : 'Realizar preguntas de seguimiento',
        },
      } as AnalisisRRHH;
    }

    return {
      tipo: 'equipo',
      participacion: [],
      engagement_grupal: frames.map((f) => ({ timestamp: f.timestamp_segundos, score_promedio: f.engagement_score, participantes_engaged: f.engagement_score > 0.5 ? 1 : 0, participantes_total: 1 })),
      reacciones_ideas: [],
      momentos_desconexion: frames.filter((f) => f.engagement_score < 0.3).map((f) => ({ timestamp: f.timestamp_segundos, duracion: 1, participantes_desconectados: [], posible_causa: 'Bajo engagement' })),
      dinamica_grupal: { cohesion_score: avgEngagement, participacion_equilibrada: true, lideres_naturales: [], participantes_pasivos: [] },
      predicciones: {
        adopcion_ideas: { tipo: 'adopcion', probabilidad: avgEngagement, confianza: 0.7, factores: ['Engagement grupal'], timestamp: Date.now() },
        necesidad_seguimiento: { tipo: 'seguimiento', probabilidad: avgEngagement < 0.5 ? 0.8 : 0.3, confianza: 0.6, factores: [], timestamp: Date.now() },
        riesgo_conflicto: { tipo: 'conflicto', probabilidad: momentosNegativos.length > 5 ? 0.5 : 0.2, confianza: 0.5, factores: [], timestamp: Date.now() },
      },
      resumen: {
        ideas_mejor_recibidas: [],
        participantes_destacados: [],
        areas_mejora_equipo: avgEngagement < 0.5 ? ['Mejorar dinamismo de reuniones'] : [],
        recomendaciones: avgEngagement > 0.6 ? ['Excelente dinámica de equipo'] : ['Considerar dinámicas para aumentar participación'],
      },
    } as AnalisisEquipo;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`h-full w-full overflow-y-auto p-6 ${s.bg}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md ${s.accentBg}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${s.text}`}>Grabaciones</h1>
              <p className={`text-xs ${s.textMuted}`}>Transcripciones y análisis conductual</p>
            </div>
          </div>
          <button
            onClick={cargarGrabaciones}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${s.surface} ${s.border} ${s.text} hover:border-sky-300`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div className={`p-4 rounded-2xl mb-6 border ${s.surface} ${s.border}`}>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔍 Buscar en transcripciones..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl text-sm transition-all ${s.input}`}
              />
            </div>
            <CustomDropdown options={estadoOptions} value={filtroEstado} onChange={setFiltroEstado} s={s} />
            <CustomDropdown options={tipoOptions}  value={filtroTipo}   onChange={setFiltroTipo}   s={s} />
          </div>

          {(cargoUsuario || rolSistema) && (
            <div className={`mt-3 pt-3 border-t ${s.borderSubtle}`}>
              <p className={`text-xs ${s.textSubtle}`}>
                👤 Rol: <span className={`font-semibold ${s.textMuted}`}>{rolSistema || 'No definido'}</span>
                {cargoUsuario && (
                  <> | Cargo: <span className={`font-semibold ${s.textMuted}`}>{cargoUsuario.replace(/_/g, ' ')}</span></>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className={`w-12 h-12 border-4 rounded-full animate-spin border-sky-500/20 border-t-sky-500`} />
            <p className={`mt-4 text-sm ${s.textMuted}`}>Cargando grabaciones...</p>
          </div>
        ) : null}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600">{error}</p>
            <button onClick={cargarGrabaciones} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              Reintentar
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && grabacionesFiltradas.length === 0 && (
          <div className={`text-center py-20 rounded-2xl border-2 border-dashed ${s.border} ${s.surfaceMuted}`}>
            <span className="text-6xl mb-4 block">📭</span>
            <h3 className={`text-xl font-bold mb-2 ${s.text}`}>No hay transcripciones</h3>
            <p className={`text-sm ${s.textMuted}`}>
              {grabaciones.length === 0
                ? 'Inicia una reunión para generar transcripciones y análisis'
                : 'No hay transcripciones que coincidan con los filtros'}
            </p>
          </div>
        )}

        {/* List */}
        {!isLoading && !error && grabacionesFiltradas.length > 0 && (
          <div className="grid gap-4">
            {grabacionesFiltradas.map((grabacion) => {
              const tipoConfig = TIPO_CONFIG[grabacion.tipo] || TIPO_CONFIG.reunion;
              const tieneAnalisis = grabacion.analisis_comportamiento && grabacion.analisis_comportamiento.length > 0;
              const tieneTranscripcion = grabacion.transcripciones && grabacion.transcripciones.length > 0;

              return (
                <div
                  key={grabacion.id}
                  className={`group p-5 rounded-2xl border transition-all duration-300 hover:shadow-md ${s.surface} ${s.border} hover:border-sky-300`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tipoConfig.color} flex items-center justify-center text-xl shadow-md text-white`}>
                      {tipoConfig.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold ${s.text}`}>
                          Reunión {new Date(grabacion.creado_en).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${s.surfaceMuted} ${s.textMuted}`}>
                          {tipoConfig.label}
                        </span>
                        {grabacion.estado === 'completado' && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Completado" />
                        )}
                      </div>

                      <div className={`flex items-center gap-4 text-sm flex-wrap ${s.textMuted}`}>
                        <span>📅 {formatFecha(grabacion.creado_en)}</span>
                        <span>⏱️ {formatDuracion(grabacion.duracion_segundos ?? null)}</span>
                        {grabacion.usuario && (
                          <span>👤 {grabacion.usuario.nombre} {grabacion.usuario.apellido}</span>
                        )}
                      </div>

                      {tieneTranscripcion && (
                        <p className={`mt-2 text-sm line-clamp-2 ${s.textSubtle}`}>
                          "{grabacion.transcripciones![0].texto.substring(0, 150)}..."
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 mt-2">
                        {grabacion.esCreador && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-blue-600 border border-sky-200">
                            Creador
                          </span>
                        )}
                        {tieneTranscripcion && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${s.surfaceMuted} ${s.textMuted}`}>
                            {grabacion.transcripciones!.length} segmento{grabacion.transcripciones!.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {tieneAnalisis && grabacion.esCreador && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${s.accentSurface} ${s.accent}`}>
                            Análisis
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {tieneAnalisis && grabacion.esCreador && (
                        <button
                          onClick={() => verAnalisis(grabacion)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${s.btn}`}
                        >
                          Ver Análisis
                        </button>
                      )}
                      {tieneTranscripcion && (
                        <button
                          onClick={() => { setGrabacionSeleccionada(grabacion); setShowTranscripcion(true); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${s.btnSecondary}`}
                        >
                          Transcripción
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        {!isLoading && grabaciones.length > 0 && (
          <div className={`mt-8 p-6 rounded-2xl border ${s.surface} ${s.border}`}>
            <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 ${s.textMuted}`}>📊 Resumen</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { val: grabaciones.length, lbl: 'Total grabaciones' },
                { val: grabaciones.filter((g) => g.estado === 'completado').length, lbl: 'Completadas' },
                { val: grabaciones.filter((g) => g.analisis_comportamiento && g.analisis_comportamiento.length > 0).length, lbl: 'Con análisis' },
                { val: formatDuracion(grabaciones.reduce((sum, g) => sum + (g.duracion_segundos || 0), 0)), lbl: 'Tiempo total' },
              ].map((stat, i) => (
                <div key={i} className={`p-4 rounded-xl ${s.surfaceMuted}`}>
                  <div className={`text-3xl font-black ${s.text}`}>{stat.val}</div>
                  <div className={`text-xs ${s.textSubtle}`}>{stat.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showDashboard && resultadoAnalisis && (
        <AnalysisDashboard
          resultado={resultadoAnalisis}
          onClose={() => { setShowDashboard(false); setResultadoAnalisis(null); setGrabacionSeleccionada(null); }}
          onExport={() => {
            const json = JSON.stringify(resultadoAnalisis, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analisis_${grabacionSeleccionada?.tipo}_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}

      {/* Transcripcion modal */}
      {showTranscripcion && grabacionSeleccionada && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-4 overflow-y-auto">
          <div className={`max-w-3xl w-full rounded-2xl border shadow-2xl my-8 ${s.surface} ${s.border}`}>
            <div className={`p-5 rounded-t-2xl border-b ${s.borderSubtle} ${s.surfaceMuted}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📝</span>
                  <div>
                    <h2 className={`font-bold text-xl ${s.text}`}>Transcripción</h2>
                    <p className={`text-sm ${s.textMuted}`}>
                      {grabacionSeleccionada.archivo_nombre || 'Reunión'} • {formatFecha(grabacionSeleccionada.creado_en)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowTranscripcion(false); setGrabacionSeleccionada(null); }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${s.btnGhost}`}
                >✕</button>
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {grabacionSeleccionada.transcripciones && grabacionSeleccionada.transcripciones.length > 0 ? (
                <div className="space-y-4">
                  {grabacionSeleccionada.transcripciones.map((t, idx) => (
                    <div key={t.id || idx} className={`p-4 rounded-xl border ${s.surfaceMuted} ${s.borderSubtle}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-mono ${s.textSubtle}`}>
                          ⏱️ {formatDuracion(t.inicio_segundos)} - {formatDuracion(t.fin_segundos)}
                        </span>
                        {t.speaker_nombre && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${s.accentSurface} ${s.accent}`}>
                            👤 {t.speaker_nombre}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm leading-relaxed ${s.text}`}>{t.texto}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <span className="text-4xl mb-4 block">📭</span>
                  <p className={s.textMuted}>No hay transcripción disponible</p>
                </div>
              )}
            </div>

            <div className={`p-4 rounded-b-2xl border-t ${s.borderSubtle}`}>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    const texto = grabacionSeleccionada.transcripciones
                      ?.map((t) => `[${formatDuracion(t.inicio_segundos)}] ${t.speaker_nombre || 'Speaker'}: ${t.texto}`)
                      .join('\n\n') || '';
                    navigator.clipboard.writeText(texto);
                    log.info('Transcript copied to clipboard');
                  }}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${s.btnSecondary}`}
                >📋 Copiar</button>
                <button
                  onClick={() => { setShowTranscripcion(false); setGrabacionSeleccionada(null); }}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${s.btn}`}
                >Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrabacionesHistorial;
