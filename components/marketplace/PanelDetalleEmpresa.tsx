'use client';

import React from 'react';
import { X, Users, Building2, Globe, Briefcase, MapPin, ExternalLink, Sparkles } from 'lucide-react';
import type { ZonaEmpresa } from '@/types';
import type { EmpresaPublica, ObjetoEspacio } from '@/lib/terrenosMarketplace';
import { PreviewInteriorEmpresa3D } from './PreviewInteriorEmpresa3D';

interface PanelDetalleEmpresaProps {
 zona: ZonaEmpresa | null;
 empresa: EmpresaPublica | null;
 objetos: ObjetoEspacio[];
 onCerrar: () => void;
 onVerTerrenos: () => void;
}

const TAMANO_LABELS: Record<string, string> = {
 startup: 'Startup',
 pequena: 'Pequeña empresa',
 mediana: 'Mediana empresa',
 grande: 'Gran empresa',
 enterprise: 'Enterprise',
};

export const PanelDetalleEmpresa: React.FC<PanelDetalleEmpresaProps> = ({
 zona,
 empresa,
 objetos,
 onCerrar,
 onVerTerrenos,
}) => {
 if (!zona) return null;

 const color = zona.color || '#6366f1';
 const nombre = empresa?.nombre || zona.nombre_zona || 'Empresa';
 const esComun = zona.es_comun;

 return (
 <div className="fixed right-0 top-0 bottom-0 w-[420px] max-w-[90vw] bg-white/60/95 backdrop-blur-xl border-l border-[rgba(46,150,245,0.14)] z-50 flex flex-col shadow-2xl shadow-[rgba(46,150,245,0.15)] animate-in slide-in-from-right duration-300">
 {/* Header con color de la empresa */}
 <div
 className="p-6 border-b border-[rgba(46,150,245,0.14)] relative overflow-hidden"
 style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
 >
 {/* Decoración */}
 <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: color, filter: 'blur(40px)' }} />

 <div className="flex items-start justify-between relative z-10 mb-4">
 <div className="flex-1">
 {esComun && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded-full text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-2">
 Zona Común
 </span>
 )}
 <h2 className="text-xl font-bold text-[#0B2240]">{nombre}</h2>
 {empresa?.industria && (
 <div className="flex items-center gap-1.5 mt-1">
 <Briefcase className="w-3.5 h-3.5 text-[#4A6485]" />
 <span className="text-sm text-[#4A6485]">{empresa.industria}</span>
 </div>
 )}
 </div>
 <button
 onClick={onCerrar}
 className="p-2 rounded-xl bg-white/50 hover:bg-[rgba(46,150,245,0.08)] text-[#4A6485] hover:text-[#0B2240] transition"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Logo o icono grande */}
 <div className="flex items-center gap-4">
 <div
 className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-[#0B2240] shadow-lg"
 style={{ backgroundColor: color }}
 >
 {empresa?.logo_url ? (
 <img src={empresa.logo_url} alt={nombre} className="w-full h-full object-cover rounded-2xl" />
 ) : (
 nombre.charAt(0).toUpperCase()
 )}
 </div>
 <div>
 {empresa?.tamano && (
 <p className="text-sm text-[#1B3A5C]">{TAMANO_LABELS[empresa.tamano] || empresa.tamano}</p>
 )}
 {empresa && (
 <p className="text-sm font-bold" style={{ color }}>
 {empresa.miembros_count} {empresa.miembros_count === 1 ? 'miembro' : 'miembros'} activos
 </p>
 )}
 </div>
 </div>
 </div>

 {/* Contenido scrollable */}
 <div className="flex-1 overflow-y-auto p-6 space-y-5">
 {/* Descripción */}
 {empresa?.descripcion && (
 <div>
 <h4 className="text-xs font-bold text-[#4A6485] uppercase tracking-wider mb-2">Acerca de</h4>
 <p className="text-sm text-[#1B3A5C] leading-relaxed">{empresa.descripcion}</p>
 </div>
 )}

 {/* Info de la zona */}
 <div className="bg-white/50 rounded-xl p-4 border border-[rgba(46,150,245,0.14)]">
 <h4 className="text-xs font-bold text-[#4A6485] uppercase tracking-wider mb-3">Espacio virtual</h4>
 <div className="grid grid-cols-2 gap-3">
 <InfoItem icon={<MapPin className="w-4 h-4" />} label="Ubicación" valor={`(${zona.posicion_x}, ${zona.posicion_y})`} />
 <InfoItem icon={<Building2 className="w-4 h-4" />} label="Tamaño" valor={`${zona.ancho} × ${zona.alto} u²`} />
 {empresa && (
 <InfoItem icon={<Users className="w-4 h-4" />} label="Equipo" valor={`${empresa.miembros_count} personas`} />
 )}
 {empresa?.industria && (
 <InfoItem icon={<Briefcase className="w-4 h-4" />} label="Industria" valor={empresa.industria} />
 )}
 </div>
 </div>

 {/* Sitio web */}
 {empresa?.sitio_web && (
 <a
 href={empresa.sitio_web}
 target="_blank"
 rel="noopener noreferrer"
 className="flex items-center gap-3 p-4 bg-white/50 rounded-xl border border-[rgba(46,150,245,0.14)] hover:bg-[rgba(46,150,245,0.08)] transition group"
 >
 <Globe className="w-5 h-5 text-[#4A6485] group-hover:text-[#0B2240] transition" />
 <div className="flex-1 min-w-0">
 <p className="text-xs text-[#4A6485]">Sitio web</p>
 <p className="text-sm text-[#0B2240] truncate">{empresa.sitio_web.replace(/^https?:\/\//, '')}</p>
 </div>
 <ExternalLink className="w-4 h-4 text-[#4A6485] group-hover:text-[#0B2240] transition" />
 </a>
 )}

 {/* Preview 3D LIVE del interior — objetos reales + GhostAvatars animados */}
 <div>
 <h4 className="text-xs font-bold text-[#4A6485] uppercase tracking-wider mb-2">Interior en vivo</h4>
 <PreviewInteriorEmpresa3D
 objetos={objetos}
 miembros={empresa?.miembros_count || 0}
 color={color}
 />
 </div>
 </div>

 {/* Footer CTA */}
 <div className="p-6 border-t border-[rgba(46,150,245,0.14)] bg-white/60/50">
 <button
 onClick={onVerTerrenos}
 className="w-full py-3.5 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
 >
 <Sparkles className="w-4 h-4" />
 Conseguir un espacio como este
 </button>
 <p className="text-[10px] text-[#4A6485] text-center mt-2">
 Explora los terrenos disponibles y crea tu propio espacio virtual.
 </p>
 </div>
 </div>
 );
};

const InfoItem: React.FC<{ icon: React.ReactNode; label: string; valor: string }> = ({ icon, label, valor }) => (
 <div className="flex items-center gap-2">
 <div className="text-[#4A6485]">{icon}</div>
 <div>
 <p className="text-[10px] text-[#4A6485]">{label}</p>
 <p className="text-sm font-medium text-[#0B2240]">{valor}</p>
 </div>
 </div>
);
