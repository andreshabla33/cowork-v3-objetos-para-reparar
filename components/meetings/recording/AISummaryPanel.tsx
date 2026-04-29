/**
 * Panel de resumen AI con action items y puntos clave
 */

import React, { useState } from 'react';
import { AISummary, ActionItem, BehaviorInsight } from './types';

interface AISummaryPanelProps {
  summary: AISummary | null;
  isLoading: boolean;
  error: string | null;
  onGenerateSummary: () => void;
  transcriptLength: number;
}

type TabType = 'resumen' | 'actions' | 'insights';

const sentimentColors: Record<string, { bg: string; text: string; label: string }> = {
  positivo: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Positivo' },
  neutral: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Neutral' },
  negativo: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Negativo' },
  mixto: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Mixto' },
};

export const AISummaryPanel: React.FC<AISummaryPanelProps> = ({
  summary,
  isLoading,
  error,
  onGenerateSummary,
  transcriptLength,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('resumen');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'resumen',
      label: 'Resumen',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'actions',
      label: 'Tareas',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
  ];

  if (!summary && !isLoading && !error) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Resumen AI</h3>
          <p className="text-sm text-zinc-400 mb-4">
            {transcriptLength < 50 
              ? 'Necesitas más contenido en la transcripción'
              : 'Genera un resumen inteligente de la reunión'
            }
          </p>
          <button
            onClick={onGenerateSummary}
            disabled={transcriptLength < 50}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            Generar Resumen
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-zinc-400">Generando resumen con IA...</p>
          <p className="text-xs text-zinc-500 mt-1">Esto puede tomar unos segundos</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-red-500/20 p-6">
        <div className="flex items-center gap-3 text-red-400 mb-4">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Error al generar resumen</span>
        </div>
        <p className="text-sm text-zinc-400 mb-4">{error}</p>
        <button
          onClick={onGenerateSummary}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const sentiment = sentimentColors[summary.sentimiento_general] || sentimentColors.neutral;

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-white">Resumen AI</span>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${sentiment.bg} ${sentiment.text}`}>
            {sentiment.label}
          </div>
        </div>

        <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'actions' && summary.action_items.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px]">
                  {summary.action_items.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'resumen' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Resumen
              </h4>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {summary.resumen_detallado || summary.resumen_corto}
              </p>
            </div>

            {summary.puntos_clave.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Puntos Clave
                </h4>
                <ul className="space-y-2">
                  {summary.puntos_clave.map((punto, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {punto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => copyToClipboard(summary.resumen_detallado || summary.resumen_corto)}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copiar resumen
            </button>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-3">
            {summary.action_items.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">
                No se detectaron tareas pendientes
              </p>
            ) : (
              summary.action_items.map((item, i) => (
                <div
                  key={item.id || i}
                  className={`p-3 rounded-lg border transition-colors ${
                    checkedItems.has(item.id || String(i))
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-zinc-800/30 border-zinc-700/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleItem(item.id || String(i))}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        checkedItems.has(item.id || String(i))
                          ? 'bg-green-500 border-green-500'
                          : 'border-zinc-600 hover:border-zinc-500'
                      }`}
                    >
                      {checkedItems.has(item.id || String(i)) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm ${checkedItems.has(item.id || String(i)) ? 'text-zinc-500 line-through' : 'text-white'}`}>
                        {item.tarea}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {item.responsable && (
                          <span className="text-xs text-blue-500">@{item.responsable}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          item.prioridad === 'alta' ? 'bg-red-500/20 text-red-400' :
                          item.prioridad === 'media' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-zinc-500/20 text-zinc-400'
                        }`}>
                          {item.prioridad}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-3">
            {summary.metricas_conductuales && (
              <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 mb-4">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Métricas de Engagement
                </h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-white">
                      {Math.round((summary.metricas_conductuales.engagement_promedio || 0) * 100)}%
                    </div>
                    <div className="text-xs text-zinc-500">Engagement promedio</div>
                  </div>
                  <div className="w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-full h-full">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#27272a"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeDasharray={`${(summary.metricas_conductuales.engagement_promedio || 0) * 100}, 100`}
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {summary.momentos_clave.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">
                No se detectaron momentos destacados
              </p>
            ) : (
              summary.momentos_clave.map((insight, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    insight.tipo === 'pico_engagement' ? 'bg-green-500/20' :
                    insight.tipo === 'baja_atencion' ? 'bg-red-500/20' :
                    'bg-blue-600/20'
                  }`}>
                    {insight.tipo === 'pico_engagement' ? '📈' :
                     insight.tipo === 'baja_atencion' ? '📉' :
                     '💡'}
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">
                      Minuto {insight.minuto}
                    </div>
                    <p className="text-sm text-zinc-300">
                      {insight.descripcion}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AISummaryPanel;
