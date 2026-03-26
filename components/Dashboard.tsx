import React from 'react';
import { useStore } from '../store/useStore';
import { Role } from '../types';

export const Dashboard: React.FC = () => {
  const { workspaces, setActiveWorkspace, currentUser, signOut, setAuthFeedback, authFeedback } = useStore();



  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050508]">
      {/* Fondo con grid pattern estilo gaming */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      
      {/* Gradientes de fondo neon */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-violet-600/10 via-fuchsia-600/5 to-transparent blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-cyan-600/10 via-violet-600/5 to-transparent blur-[100px] rounded-full -z-10 pointer-events-none" />
      
      <div className="p-6 lg:p-8 max-w-5xl mx-auto relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 lg:mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {/* Logo con glow neon */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl blur-lg opacity-60" />
                <div className="relative w-10 h-10 lg:w-9 lg:h-9 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 rounded-xl flex items-center justify-center font-black text-lg lg:text-base text-white shadow-lg">
                  C
                </div>
              </div>
              {/* Título con gradiente */}
              <h1 className="text-3xl lg:text-2xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text text-transparent">
                  COWORK
                </span>
              </h1>
            </div>
            <p className="text-zinc-500 font-semibold uppercase tracking-[0.25em] text-[10px] lg:text-[9px] ml-[52px] lg:ml-12">
              Bienvenido, <span className="text-violet-400">{currentUser.name}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-2.5">
            {/* Botón Salir */}
            <button 
              onClick={signOut} 
              className="px-4 py-2.5 rounded-xl font-black uppercase tracking-wider text-[9px] text-zinc-400 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-violet-500/30 transition-all"
            >
              Salir
            </button>
          </div>
        </header>

      {/* Feedback de la operación */}
      {authFeedback && (
        <div className={`mb-6 p-3.5 rounded-xl border animate-in slide-in-from-top-2 flex items-center justify-between gap-3 ${
          authFeedback.type === 'success' 
            ? 'bg-green-500/10 border-green-500/20 text-green-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="text-sm">{authFeedback.type === 'success' ? '🚀' : '⚠️'}</span>
            <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
              {authFeedback.message}
            </p>
          </div>
          <button onClick={() => setAuthFeedback(null)} className="opacity-50 hover:opacity-100 p-1.5 text-base font-bold">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-3">
        {workspaces.map((ws: any) => (
          <div 
            key={ws.id} 
            onClick={() => setActiveWorkspace(ws, ws.userRole)}
            className="group relative p-5 lg:p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl hover:border-violet-500/40 transition-all duration-300 cursor-pointer overflow-hidden"
          >
            {/* Glow de fondo en hover */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-600/10 via-fuchsia-600/5 to-transparent blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4 lg:mb-3">
                {/* Icono del espacio con gradiente */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative w-11 h-11 lg:w-10 lg:h-10 bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-xl flex items-center justify-center text-lg lg:text-base font-black text-violet-400 group-hover:scale-105 transition-transform">
                    {ws.name ? ws.name.charAt(0).toUpperCase() : 'W'}
                  </div>
                </div>
                {/* Indicador de estado */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-emerald-400 text-[8px] font-bold uppercase tracking-wider">Activo</span>
                </div>
              </div>

              {/* Nombre del espacio */}
              <h3 className="text-lg lg:text-base font-bold tracking-tight mb-2 text-white group-hover:bg-gradient-to-r group-hover:from-violet-400 group-hover:to-fuchsia-400 group-hover:bg-clip-text group-hover:text-transparent transition-all truncate">
                {ws.name}
              </h3>
              
              {/* Badge de rol con gradiente */}
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider ${
                  ws.userRole === Role.SUPER_ADMIN 
                    ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-violet-300 border border-violet-500/30' 
                    : ws.userRole === Role.ADMIN 
                    ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 text-cyan-300 border border-cyan-500/30' 
                    : 'bg-gradient-to-r from-emerald-600/20 to-teal-600/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {ws.userRole ? ws.userRole.replace('_', ' ') : 'Miembro'}
                </span>
              </div>
              
              {/* Footer con acción */}
              <div className="mt-4 lg:mt-3 pt-3 lg:pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Entrar al espacio</p>
                <div className="w-7 h-7 lg:w-6 lg:h-6 rounded-lg bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 flex items-center justify-center group-hover:from-violet-600 group-hover:to-fuchsia-600 transition-all">
                  <svg className="w-3.5 h-3.5 text-violet-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        ))}

        {workspaces.length === 0 && !authFeedback && (
          <div className="col-span-full py-20 lg:py-16 border border-dashed border-violet-500/20 rounded-2xl flex flex-col items-center justify-center gap-4 text-center bg-gradient-to-b from-violet-600/5 to-transparent">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full blur-xl opacity-30" />
              <div className="relative w-14 h-14 lg:w-12 lg:h-12 bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-full flex items-center justify-center text-2xl">
                🔑
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-white font-bold text-base lg:text-sm">Sin acceso a espacios</p>
              <p className="text-zinc-500 text-xs lg:text-[10px]">Contacta a tu administrador para recibir una invitación</p>
            </div>
          </div>
        )}
      </div>


      </div>
    </div>
  );
};
