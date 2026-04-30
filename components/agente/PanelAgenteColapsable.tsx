
import React, { useState } from 'react';

export const PanelAgenteColapsable: React.FC = () => {
 const [isOpen, setIsOpen] = useState(false);

 return (
 <div className="border-t border-[rgba(46,150,245,0.14)] bg-white/50 mt-auto">
 <div 
 onClick={() => setIsOpen(!isOpen)}
 className="p-4 flex items-center justify-between cursor-pointer hover:bg-[rgba(46,150,245,0.08)] transition-colors group"
 >
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-[#0B2240] shadow-lg animate-pulse">
 ✨
 </div>
 <div>
 <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Viben Assistant</p>
 <p className="text-[9px] text-[#4A6485] font-bold uppercase">En línea</p>
 </div>
 </div>
 <svg className={`w-4 h-4 text-[#6B83A0] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
 </svg>
 </div>
 
 {isOpen && (
 <div className="p-4 pt-0 animate-in slide-in-from-bottom-2 duration-300">
 <div className="bg-white/60/50 rounded-xl p-3 border border-indigo-500/20">
 <p className="text-[10px] text-[#4A6485] leading-relaxed mb-3">
 ¿En qué puedo ayudarte hoy? Puedo resumir canales, crear tareas o traducir mensajes.
 </p>
 <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-[#0B2240] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
 Abrir Chat Completo
 </button>
 </div>
 </div>
 )}
 </div>
 );
};
