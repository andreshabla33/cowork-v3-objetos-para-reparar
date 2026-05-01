import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
 obtenerPerfilGamificacion,
 obtenerMisionesDiarias,
 generarMisionesDiarias,
 obtenerLogrosUsuario,
 obtenerCatalogoLogros,
 obtenerItemsCosmeticos,
 registrarLoginDiario,
 calcularNivel,
 type PerfilGamificacion,
 type Mision,
 type Logro,
 type LogroDesbloqueado,
 type ItemCosmetico,
} from '@/lib/gamificacion';

interface GamificacionPanelProps {
 usuarioId: string;
 espacioId: string;
 visible: boolean;
 onClose: () => void;
}

type Tab = 'perfil' | 'misiones' | 'logros' | 'items';

const LineIcon: React.FC<{ d: string; size?: number; className?: string }> = ({ d, size = 14, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

export const GamificacionPanel: React.FC<GamificacionPanelProps> = ({ usuarioId, espacioId, visible, onClose }) => {
 const [tab, setTab] = useState<Tab>('perfil');
 const [perfil, setPerfil] = useState<PerfilGamificacion | null>(null);
 const [misiones, setMisiones] = useState<Mision[]>([]);
 const [logros, setLogros] = useState<Logro[]>([]);
 const [logrosUsuario, setLogrosUsuario] = useState<LogroDesbloqueado[]>([]);
 const [items, setItems] = useState<ItemCosmetico[]>([]);
 const [cargando, setCargando] = useState(true);

 const nivelInfo = useMemo(() => {
 if (!perfil) return { nivel: 1, xpActual: 0, xpSiguiente: 100, progreso: 0 };
 return calcularNivel(perfil.xp_total);
 }, [perfil]);

 const logrosDesbloqueadosIds = useMemo(
 () => new Set(logrosUsuario.map(l => l.logro_id)),
 [logrosUsuario]
 );

 const cargarDatos = useCallback(async () => {
 if (!usuarioId || !espacioId) return;
 setCargando(true);
 try {
 const [p, m, l, lu, it] = await Promise.all([
 obtenerPerfilGamificacion(usuarioId, espacioId),
 generarMisionesDiarias(usuarioId, espacioId),
 obtenerCatalogoLogros(),
 obtenerLogrosUsuario(usuarioId, espacioId),
 obtenerItemsCosmeticos(),
 ]);
 setPerfil(p);
 setMisiones(m);
 setLogros(l);
 setLogrosUsuario(lu);
 setItems(it);

 // Registrar login diario automáticamente
 if (p) await registrarLoginDiario(usuarioId, espacioId);
 } catch (e) {
 console.error('Error cargando gamificación:', e);
 } finally {
 setCargando(false);
 }
 }, [usuarioId, espacioId]);

 useEffect(() => {
 if (visible) cargarDatos();
 }, [visible, cargarDatos]);

 if (!visible) return null;

 const tabs: { key: Tab; label: string; iconPath: string }[] = [
 { key: 'perfil', label: 'Perfil', iconPath: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 20a8 8 0 0116 0' },
 { key: 'misiones', label: 'Misiones', iconPath: 'M9 5h11M9 12h11M9 19h11M3 5h.01M3 12h.01M3 19h.01' },
 { key: 'logros', label: 'Logros', iconPath: 'M8 21h8M12 17v4M8 4h8v2a4 4 0 01-8 0V4zM7 6H5a2 2 0 000 4h2M17 6h2a2 2 0 010 4h-2' },
 { key: 'items', label: 'Items', iconPath: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4' },
 ];

 return (
 <div className="fixed inset-0 z-[400] flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
 <div className="absolute inset-0 bg-[#0B2240]/35 backdrop-blur-[10px] backdrop-blur-sm" onClick={onClose} />
 <div className="relative w-[95vw] max-w-[480px] max-h-[85vh] bg-white/75 backdrop-blur-xl rounded-3xl border border-[rgba(46,150,245,0.18)] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(46,150,245,0.14)]">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4FB0FF] to-[#2E96F5] flex items-center justify-center text-lg font-black text-white">
 {nivelInfo.nivel}
 </div>
 <div>
 <p className="text-sm font-bold text-[#0B2240]">Nivel {nivelInfo.nivel}</p>
 <p className="text-[10px] text-[#4A6485]">{perfil?.xp_total || 0} XP total</p>
 </div>
 </div>
 <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/60 flex items-center justify-center text-[#3E5A7C] hover:bg-[rgba(46,150,245,0.12)] hover:text-[#0B2240] transition-colors">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
 </button>
 </div>

 {/* XP Bar */}
 <div className="px-5 py-3 border-b border-[rgba(46,150,245,0.14)]">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[10px] text-[#4A6485]">Progreso nivel {nivelInfo.nivel} → {nivelInfo.nivel + 1}</span>
 <span className="text-[10px] text-[#1E86E5] font-mono font-semibold">{nivelInfo.xpActual}/{nivelInfo.xpSiguiente} XP</span>
 </div>
 <div className="h-2 bg-white/50 rounded-full overflow-hidden">
 <div
 className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-700"
 style={{ width: `${Math.min(nivelInfo.progreso * 100, 100)}%` }}
 />
 </div>
 {perfil && perfil.racha_dias > 0 && (
 <div className="flex items-center gap-1.5 mt-2">
 <LineIcon d="M12 3c1 3-1 4.5-1 6.5A3.5 3.5 0 0018 11c0 4-2.6 8-6 8s-6-3-6-7c0-3 2-5 4.5-7 .8-.6 1.2-1.2 1.5-2z" size={12} className="text-orange-500" />
 <span className="text-[10px] text-orange-600 font-bold">{perfil.racha_dias} días seguidos</span>
 {perfil.racha_max > perfil.racha_dias && (
 <span className="text-[10px] text-[#4A6485] ml-1">Máx: {perfil.racha_max}</span>
 )}
 </div>
 )}
 </div>

 {/* Tabs */}
 <div className="flex border-b border-[rgba(46,150,245,0.14)]">
 {tabs.map(t => (
 <button
 key={t.key}
 onClick={() => setTab(t.key)}
 className={`flex-1 py-2.5 text-center text-[11px] font-medium transition-colors ${
 tab === t.key
 ? 'text-[#1E86E5] border-b-2 border-[#2E96F5] bg-[rgba(46,150,245,0.08)]'
 : 'text-[#4A6485] hover:text-[#1B3A5C]'
 }`}
 >
 <span className="mr-1 inline-flex align-middle"><LineIcon d={t.iconPath} size={13} /></span>{t.label}
 </button>
 ))}
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto p-4 space-y-3">
 {cargando ? (
 <div className="flex items-center justify-center py-12">
 <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
 </div>
 ) : tab === 'perfil' ? (
 <PerfilTab perfil={perfil} nivelInfo={nivelInfo} logrosCount={logrosUsuario.length} totalLogros={logros.length} />
 ) : tab === 'misiones' ? (
 <MisionesTab misiones={misiones} />
 ) : tab === 'logros' ? (
 <LogrosTab logros={logros} desbloqueadosIds={logrosDesbloqueadosIds} />
 ) : (
 <ItemsTab items={items} nivelActual={nivelInfo.nivel} itemsDesbloqueados={perfil?.items_desbloqueados || []} />
 )}
 </div>
 </div>
 </div>
 );
};

// ========== SUB-COMPONENTES ==========

const PerfilTab: React.FC<{ perfil: PerfilGamificacion | null; nivelInfo: any; logrosCount: number; totalLogros: number }> = ({ perfil, nivelInfo, logrosCount, totalLogros }) => {
 if (!perfil) return <p className="text-[#4A6485] text-sm text-center py-4">Sin datos</p>;

 const stats = perfil.estadisticas || {};
 const statEntries = [
 { label: 'Mensajes enviados', value: stats.mensaje_chat || 0, iconPath: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
 { label: 'Reuniones asistidas', value: stats.reunion_asistida || 0, iconPath: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z' },
 { label: 'Saludos enviados', value: stats.saludo_wave || 0, iconPath: 'M8 11V6a2 2 0 114 0v5m0-3a2 2 0 114 0v3m-8 0a2 2 0 10-4 0v1a6 6 0 006 6h4a6 6 0 006-6V9a2 2 0 10-4 0' },
 { label: 'Emotes usados', value: stats.emote_enviado || 0, iconPath: 'M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
 { label: 'Teleports realizados', value: stats.teleport || 0, iconPath: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z' },
 ];

 return (
 <div className="space-y-4">
 {/* Título activo */}
 {perfil.titulo_activo && (
 <div className="flex items-center gap-2 px-3 py-2 bg-indigo-600/10 rounded-xl border border-indigo-500/20">
 <LineIcon d="M20.59 13.41L11 3.83A2 2 0 009.59 3H4a1 1 0 00-1 1v5.59a2 2 0 00.59 1.41l9.58 9.59a2 2 0 002.83 0l4.59-4.59a2 2 0 000-2.83zM7.5 7.5h.01" size={12} className="text-[#1E86E5]" />
 <span className="text-xs text-[#1E86E5] font-medium">{perfil.titulo_activo}</span>
 </div>
 )}

 {/* Resumen */}
 <div className="grid grid-cols-3 gap-2">
 <div className="bg-white/50 rounded-xl p-3 text-center">
 <p className="text-lg font-black text-[#0B2240]">{nivelInfo.nivel}</p>
 <p className="text-[9px] text-[#4A6485] uppercase tracking-wider">Nivel</p>
 </div>
 <div className="bg-white/50 rounded-xl p-3 text-center">
 <p className="text-lg font-black text-indigo-400">{perfil.xp_total}</p>
 <p className="text-[9px] text-[#4A6485] uppercase tracking-wider">XP Total</p>
 </div>
 <div className="bg-white/50 rounded-xl p-3 text-center">
 <p className="text-lg font-black text-[#1E86E5]">{logrosCount}/{totalLogros}</p>
 <p className="text-[9px] text-[#4A6485] uppercase tracking-wider">Logros</p>
 </div>
 </div>

 {/* Estadísticas */}
 <div>
 <p className="text-[10px] text-[#4A6485] uppercase tracking-wider mb-2 font-bold">Estadísticas</p>
 <div className="space-y-1.5">
 {statEntries.map(s => (
 <div key={s.label} className="flex items-center justify-between px-3 py-1.5 bg-white/50 rounded-lg">
 <span className="text-[11px] text-[#3E5A7C] inline-flex items-center gap-1.5"><LineIcon d={s.iconPath} size={12} />{s.label}</span>
 <span className="text-[11px] text-[#0B2240] font-mono font-semibold">{s.value}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
};

const MisionesTab: React.FC<{ misiones: Mision[] }> = ({ misiones }) => {
 if (misiones.length === 0) {
 return <p className="text-[#9CB0CA] text-sm text-center py-8">No hay misiones para hoy</p>;
 }

 return (
 <div className="space-y-2">
 {misiones.map(m => {
 const completada = m.estado === 'completada';
 const progreso = m.objetivo_cantidad > 0 ? m.progreso_actual / m.objetivo_cantidad : 0;
 return (
 <div key={m.id} className={`p-3 rounded-xl border ${completada ? 'bg-green-500/5 border-green-500/20' : 'bg-white/50 border-[rgba(46,150,245,0.14)]'}`}>
 <div className="flex items-start justify-between mb-1.5">
 <div className="flex-1">
 <p className={`text-xs font-bold ${completada ? 'text-green-400 line-through' : 'text-[#1B3A5C]'}`}>{m.titulo}</p>
 {m.descripcion && <p className="text-[10px] text-[#9CB0CA] mt-0.5">{m.descripcion}</p>}
 </div>
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${completada ? 'bg-green-500/20 text-green-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
 +{m.xp_recompensa} XP
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="flex-1 h-1.5 bg-white/50 rounded-full overflow-hidden">
 <div
 className={`h-full rounded-full transition-all duration-500 ${completada ? 'bg-green-500' : 'bg-indigo-500'}`}
 style={{ width: `${Math.min(progreso * 100, 100)}%` }}
 />
 </div>
 <span className="text-[10px] text-[#9CB0CA] font-mono">{m.progreso_actual}/{m.objetivo_cantidad}</span>
 </div>
 </div>
 );
 })}
 </div>
 );
};

const LogrosTab: React.FC<{ logros: Logro[]; desbloqueadosIds: Set<string> }> = ({ logros, desbloqueadosIds }) => {
 if (logros.length === 0) return <p className="text-[#9CB0CA] text-sm text-center py-8">No hay logros disponibles</p>;

 return (
 <div className="grid grid-cols-2 gap-2">
 {logros.map(l => {
 const desbloqueado = desbloqueadosIds.has(l.id);
 return (
 <div key={l.id} className={`p-3 rounded-xl border text-center ${desbloqueado ? 'bg-[rgba(46,150,245,0.05)] border-[rgba(46,150,245,0.3)]/20' : 'bg-white/50 border-[rgba(46,150,245,0.14)] opacity-50'}`}>
 <span className="text-2xl block mb-1">{l.icono || '🎯'}</span>
 <p className={`text-[10px] font-bold ${desbloqueado ? 'text-[#1E86E5]' : 'text-[#9CB0CA]'}`}>{l.titulo}</p>
 {l.descripcion && <p className="text-[9px] text-[#9CB0CA] mt-0.5 line-clamp-2">{l.descripcion}</p>}
 <p className="text-[9px] text-indigo-400/60 mt-1">+{l.xp_recompensa} XP</p>
 </div>
 );
 })}
 </div>
 );
};

const ItemsTab: React.FC<{ items: ItemCosmetico[]; nivelActual: number; itemsDesbloqueados: string[] }> = ({ items, nivelActual, itemsDesbloqueados }) => {
 if (items.length === 0) return <p className="text-[#9CB0CA] text-sm text-center py-8">No hay items disponibles</p>;

 const desbloqueadosSet = new Set(itemsDesbloqueados);

 return (
 <div className="space-y-2">
 {items.map(it => {
 const disponible = nivelActual >= it.nivel_requerido;
 const equipado = desbloqueadosSet.has(it.clave);
 return (
 <div key={it.id} className={`flex items-center gap-3 p-3 rounded-xl border ${disponible ? 'bg-white/50 border-[rgba(46,150,245,0.14)]' : 'bg-white/[0.01] border-[rgba(46,150,245,0.14)] opacity-40'}`}>
 <span className="text-xl">{it.icono || '🎁'}</span>
 <div className="flex-1 min-w-0">
 <p className={`text-xs font-bold ${disponible ? 'text-[#1B3A5C]' : 'text-[#9CB0CA]'}`}>{it.nombre}</p>
 <p className="text-[10px] text-[#9CB0CA] truncate">{it.descripcion}</p>
 </div>
 <div className="text-right shrink-0">
 {equipado ? (
 <span className="text-[9px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">Equipado</span>
 ) : disponible ? (
 <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-bold">Disponible</span>
 ) : (
 <span className="text-[9px] text-[#9CB0CA]">Nv. {it.nivel_requerido}</span>
 )}
 </div>
 </div>
 );
 })}
 </div>
 );
};

export default GamificacionPanel;
