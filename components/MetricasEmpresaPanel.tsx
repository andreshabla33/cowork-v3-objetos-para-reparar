'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { getThemeStyles, type ThemeStyleSet } from '@/lib/theme';

// ============== TIPOS ==============
interface MetricaDiaria {
  id: string;
  espacio_id: string;
  empresa_id: string;
  fecha: string;
  conexiones: number;
  desconexiones: number;
  usuarios_activos: number;
  reuniones_creadas: number;
  reuniones_asistidas: number;
  minutos_reunion: number;
  mensajes_chat: number;
  emotes_enviados: number;
  saludos_wave: number;
  teleports: number;
  xp_ganado: number;
  nivel_promedio: number;
  racha_promedio: number;
}

interface Empresa {
  id: string;
  nombre: string;
}

interface MetricasAgregadas {
  conexiones: number;
  usuarios_activos: number;
  reuniones_asistidas: number;
  mensajes_chat: number;
  emotes_enviados: number;
  saludos_wave: number;
  teleports: number;
  xp_ganado: number;
  nivel_promedio: number;
  racha_promedio: number;
}

type Periodo = '7d' | '30d' | '90d';

// ============== MINI SPARKLINE ==============
const Sparkline: React.FC<{ datos: number[]; color: string; height?: number }> = ({ datos, color, height = 32 }) => {
  if (datos.length === 0) return null;
  const max = Math.max(...datos, 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {datos.map((val, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-300"
          style={{
            height: `${Math.max((val / max) * 100, 4)}%`,
            backgroundColor: color,
            opacity: i === datos.length - 1 ? 1 : 0.5 + (i / datos.length) * 0.5,
          }}
          title={`${val}`}
        />
      ))}
    </div>
  );
};

// ============== STAT CARD ==============
const StatCard: React.FC<{
  label: string;
  valor: number | string;
  icono: string;
  color: string;
  sparkData?: number[];
  tendencia?: number;
  s: ThemeStyleSet;
}> = ({ label, valor, icono, color, sparkData, tendencia, s }) => (
  <div className={`p-3 lg:p-2.5 rounded-xl border transition-all hover:shadow-md ${s.surface} ${s.border}`}>
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{icono}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.textSubtle}`}>{label}</span>
      </div>
      {tendencia !== undefined && tendencia !== 0 && (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
          tendencia > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {tendencia > 0 ? '+' : ''}{tendencia}%
        </span>
      )}
    </div>
    <p className={`text-xl lg:text-lg font-black mb-1 ${s.text}`}>
      {typeof valor === 'number' ? valor.toLocaleString('es') : valor}
    </p>
    {sparkData && sparkData.length > 1 && (
      <Sparkline datos={sparkData} color={color} />
    )}
  </div>
);

// ============== BARRA HORIZONTAL ==============
const BarraHorizontal: React.FC<{
  items: { nombre: string; valor: number; color: string }[];
  s: ThemeStyleSet;
}> = ({ items, s }) => {
  const max = Math.max(...items.map(i => i.valor), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-xs font-medium truncate max-w-[60%] ${s.text}`}>{item.nombre}</span>
            <span className={`text-xs font-bold ${s.text}`}>
              {item.valor.toLocaleString('es')}
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${s.surfaceMuted}`}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(item.valor / max) * 100}%`, backgroundColor: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ============== COMPONENTE PRINCIPAL ==============
export const MetricasEmpresaPanel: React.FC = () => {
  const { activeWorkspace, theme } = useStore();
  const s = getThemeStyles(theme);

  const [metricas, setMetricas] = useState<MetricaDiaria[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>('7d');
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<string | 'todas'>('todas');

  const diasPeriodo = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90;

  const cargarDatos = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);

    const fechaDesde = new Date();
    fechaDesde.setDate(fechaDesde.getDate() - diasPeriodo);

    const [metricasRes, empresasRes] = await Promise.all([
      supabase
        .from('metricas_empresa')
        .select('*')
        .eq('espacio_id', activeWorkspace.id)
        .gte('fecha', fechaDesde.toISOString().split('T')[0])
        .order('fecha', { ascending: true }),
      supabase
        .from('empresas')
        .select('id, nombre')
        .in('id',
          (await supabase
            .from('miembros_espacio')
            .select('empresa_id')
            .eq('espacio_id', activeWorkspace.id)
            .not('empresa_id', 'is', null)
          ).data?.map((m: any) => m.empresa_id).filter(Boolean) || []
        ),
    ]);

    if (metricasRes.data) setMetricas(metricasRes.data);
    if (empresasRes.data) setEmpresas(empresasRes.data);
    setLoading(false);
  }, [activeWorkspace?.id, diasPeriodo]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const metricasFiltradas = useMemo(() => {
    if (empresaSeleccionada === 'todas') return metricas;
    return metricas.filter(m => m.empresa_id === empresaSeleccionada);
  }, [metricas, empresaSeleccionada]);

  const totales = useMemo<MetricasAgregadas>(() => {
    const sum = (fn: (m: MetricaDiaria) => number) => metricasFiltradas.reduce((acc, m) => acc + fn(m), 0);
    const avg = (fn: (m: MetricaDiaria) => number) => {
      const vals = metricasFiltradas.map(fn).filter(v => v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    return {
      conexiones: sum(m => m.conexiones),
      usuarios_activos: Math.max(...metricasFiltradas.map(m => m.usuarios_activos), 0),
      reuniones_asistidas: sum(m => m.reuniones_asistidas),
      mensajes_chat: sum(m => m.mensajes_chat),
      emotes_enviados: sum(m => m.emotes_enviados),
      saludos_wave: sum(m => m.saludos_wave),
      teleports: sum(m => m.teleports),
      xp_ganado: sum(m => m.xp_ganado),
      nivel_promedio: Math.round(avg(m => m.nivel_promedio) * 10) / 10,
      racha_promedio: Math.round(avg(m => m.racha_promedio) * 10) / 10,
    };
  }, [metricasFiltradas]);

  const sparkPorFecha = useMemo(() => {
    const fechas = [...new Set(metricasFiltradas.map(m => m.fecha))].sort();
    const agrupar = (fn: (m: MetricaDiaria) => number) =>
      fechas.map(f => metricasFiltradas.filter(m => m.fecha === f).reduce((acc, m) => acc + fn(m), 0));
    return {
      conexiones: agrupar(m => m.conexiones),
      usuarios: agrupar(m => m.usuarios_activos),
      reuniones: agrupar(m => m.reuniones_asistidas),
      chat: agrupar(m => m.mensajes_chat),
      emotes: agrupar(m => m.emotes_enviados),
      xp: agrupar(m => m.xp_ganado),
    };
  }, [metricasFiltradas]);

  const rankingEmpresas = useMemo(() => {
    const porEmpresa = new Map<string, number>();
    metricas.forEach(m => {
      porEmpresa.set(m.empresa_id, (porEmpresa.get(m.empresa_id) || 0) + m.xp_ganado);
    });
    const colores = ['#0ea5e9', '#34d399', '#f59e0b', '#f472b6', '#06b6d4'];
    return [...porEmpresa.entries()]
      .map(([id, xp], i) => ({
        nombre: empresas.find(e => e.id === id)?.nombre || 'Empresa',
        valor: xp,
        color: colores[i % colores.length],
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [metricas, empresas]);

  const rankingEngagement = useMemo(() => {
    const porEmpresa = new Map<string, number>();
    metricas.forEach(m => {
      const engagement = m.mensajes_chat + m.emotes_enviados + m.saludos_wave;
      porEmpresa.set(m.empresa_id, (porEmpresa.get(m.empresa_id) || 0) + engagement);
    });
    const colores = ['#38bdf8', '#2dd4bf', '#fbbf24', '#fb7185', '#22d3ee'];
    return [...porEmpresa.entries()]
      .map(([id, val], i) => ({
        nombre: empresas.find(e => e.id === id)?.nombre || 'Empresa',
        valor: val,
        color: colores[i % colores.length],
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [metricas, empresas]);

  const isArcade = theme === 'arcade';
  const accentColor = isArcade ? '#00ff41' : '#0ea5e9';

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-20 ${s.bg}`}>
        <div className={`w-10 h-10 border-3 border-t-transparent rounded-full animate-spin ${isArcade ? 'border-[#00ff41]' : 'border-sky-500'}`} />
      </div>
    );
  }

  return (
    <div className={`p-5 lg:p-4 h-full overflow-y-auto ${s.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 lg:mb-4">
        <div>
          <h1 className={`text-xl lg:text-lg font-black ${s.text}`}>Métricas por Empresa</h1>
          <p className={`text-[11px] mt-0.5 ${s.textMuted}`}>Telemetría segmentada de actividad y engagement</p>
        </div>
        <button
          onClick={cargarDatos}
          className={`p-2 rounded-lg transition-all ${s.btnGhost}`}
          title="Actualizar métricas"
        >
          <svg className={`w-4 h-4 ${s.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 lg:mb-3 flex-wrap">
        <div className={`flex rounded-lg overflow-hidden border ${s.border}`}>
          {(['7d', '30d', '90d'] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-[10px] font-bold transition-all ${
                periodo === p ? s.accentBg : `${s.surface} ${s.textMuted} hover:${s.textMuted.replace('text-', 'text-')}`
              }`}
            >
              {p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
            </button>
          ))}
        </div>

        <select
          value={empresaSeleccionada}
          onChange={e => setEmpresaSeleccionada(e.target.value)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${s.input}`}
        >
          <option value="todas">Todas las empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </div>

      {/* Grid de Stats */}
      {metricas.length === 0 ? (
        <div className="text-center py-12">
          <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center ${s.accentSurface}`}>
            <span className="text-3xl opacity-60">📊</span>
          </div>
          <p className={`text-sm font-bold mb-1 ${s.text}`}>Sin métricas aún</p>
          <p className={`text-[10px] ${s.textSubtle}`}>Las métricas se generan automáticamente cada hora</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-2 mb-5 lg:mb-4">
            <StatCard label="Conexiones" valor={totales.conexiones} icono="🔗" color={accentColor} sparkData={sparkPorFecha.conexiones} s={s} />
            <StatCard label="Usuarios activos" valor={totales.usuarios_activos} icono="👥" color="#34d399" sparkData={sparkPorFecha.usuarios} s={s} />
            <StatCard label="Reuniones" valor={totales.reuniones_asistidas} icono="🎥" color="#f59e0b" sparkData={sparkPorFecha.reuniones} s={s} />
            <StatCard label="Mensajes chat" valor={totales.mensajes_chat} icono="💬" color="#06b6d4" sparkData={sparkPorFecha.chat} s={s} />
            <StatCard label="Emotes + Saludos" valor={totales.emotes_enviados + totales.saludos_wave} icono="🎭" color="#f472b6" sparkData={sparkPorFecha.emotes} s={s} />
            <StatCard label="XP Total" valor={totales.xp_ganado} icono="⚡" color="#38bdf8" sparkData={sparkPorFecha.xp} s={s} />
          </div>

          {/* Indicadores secundarios */}
          <div className="grid grid-cols-3 gap-2 mb-5 lg:mb-4">
            {[
              { label: 'Nivel Prom.',  val: totales.nivel_promedio },
              { label: 'Racha Prom.',  val: `${totales.racha_promedio}d` },
              { label: 'Teleports',    val: totales.teleports },
            ].map((it, i) => (
              <div key={i} className={`p-2.5 rounded-xl border text-center ${s.surface} ${s.border}`}>
                <p className={`text-[9px] font-bold uppercase mb-0.5 ${s.textSubtle}`}>{it.label}</p>
                <p className={`text-lg font-black ${s.text}`}>{it.val}</p>
              </div>
            ))}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-2">
            {rankingEmpresas.length > 0 && (
              <div className={`p-3 lg:p-2.5 rounded-xl border ${s.surface} ${s.border}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2.5 ${s.textSubtle}`}>⚡ Ranking XP por Empresa</h3>
                <BarraHorizontal items={rankingEmpresas} s={s} />
              </div>
            )}
            {rankingEngagement.length > 0 && (
              <div className={`p-3 lg:p-2.5 rounded-xl border ${s.surface} ${s.border}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-2.5 ${s.textSubtle}`}>🎭 Ranking Engagement</h3>
                <BarraHorizontal items={rankingEngagement} s={s} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MetricasEmpresaPanel;
