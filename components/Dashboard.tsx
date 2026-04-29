import React from 'react';
import { useStore } from '../store/useStore';
import { Role } from '../types';
import { CoworkAnimatedBackground } from './shared/CoworkAnimatedBackground';

export const Dashboard: React.FC = () => {
  const { workspaces, setActiveWorkspace, currentUser, signOut, setAuthFeedback, authFeedback } = useStore();

  return (
    <div className="min-h-screen relative overflow-hidden text-slate-700">
      {/* Capa decorativa: mismo lenguaje visual que el LoginScreen. */}
      <CoworkAnimatedBackground positioning="absolute" cornerMeta="VIRTUAL HUB · ONLINE" />

      <div className="relative z-10 p-6 lg:p-10 max-w-5xl mx-auto">
        <header
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 lg:mb-12 gap-4"
          style={{ animation: 'cwbg-fade-up 0.7s 0.1s both' }}
        >
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="relative">
                <span
                  className="absolute -inset-1 rounded-full border border-dashed border-sky-400/40"
                  style={{ animation: 'cwbg-spin 18s linear infinite' }}
                />
                <div
                  className="relative w-12 h-12 rounded-full flex items-center justify-center font-black text-xl text-white"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, #6FBBFF, #2E96F5 60%, #1E86E5)',
                    boxShadow:
                      '0 0 0 6px rgba(46, 150, 245, 0.12), 0 0 0 12px rgba(46, 150, 245, 0.06), 0 12px 32px -8px rgba(46, 150, 245, 0.55)',
                    animation: 'cwbg-logo-float 4s ease-in-out infinite',
                  }}
                >
                  C
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl lg:text-[22px] font-black tracking-[0.02em] text-[#0B2240]">COWORK</h1>
                <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Virtual Collaboration Hub
                </span>
              </div>
            </div>
            <p className="text-slate-400 font-semibold uppercase tracking-[0.25em] text-[10px] ml-[64px]">
              Bienvenido, <span className="text-sky-600">{currentUser.name}</span>
            </p>
          </div>

          <button
            onClick={signOut}
            className="px-4 py-2.5 rounded-xl font-black uppercase tracking-[0.16em] text-[10px] text-slate-500 bg-white/65 border border-white/70 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(46,100,175,0.22)] hover:text-sky-600 hover:bg-white/85 hover:border-sky-300/70 transition-all"
            style={{ animation: 'cwbg-fade-up 0.7s 0.2s both' }}
          >
            Salir
          </button>
        </header>

        {authFeedback && (
          <div
            className={`mb-6 p-3.5 rounded-2xl border backdrop-blur-xl flex items-center justify-between gap-3 ${
              authFeedback.type === 'success'
                ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-700'
                : 'bg-rose-50/70 border-rose-200/80 text-rose-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm">{authFeedback.type === 'success' ? '🚀' : '⚠️'}</span>
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {authFeedback.message}
              </p>
            </div>
            <button onClick={() => setAuthFeedback(null)} className="opacity-50 hover:opacity-100 p-1.5 text-base font-bold">
              ×
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {workspaces.map((ws: any, idx: number) => (
            <button
              key={ws.id}
              onClick={() => setActiveWorkspace(ws, ws.userRole)}
              type="button"
              className="group relative text-left overflow-hidden p-5 rounded-2xl border border-white/72 bg-white/55 backdrop-blur-2xl shadow-[0_22px_60px_-28px_rgba(46,100,175,0.28)] hover:-translate-y-0.5 hover:border-sky-300/70 hover:shadow-[0_28px_70px_-26px_rgba(46,100,175,0.4)] transition-all duration-200 cursor-pointer"
              style={{ animation: `cwbg-fade-up 0.7s ${0.25 + idx * 0.06}s both` }}
            >
              {/* Gradiente interior glass */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 via-white/10 to-sky-100/30" />
              {/* Resplandor sky en hover */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-sky-300/0 via-sky-300/0 to-sky-300/0 group-hover:from-sky-300/15 group-hover:to-sky-200/5 transition-opacity" />

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4 lg:mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black text-white group-hover:scale-105 transition-transform"
                    style={{
                      background: 'linear-gradient(135deg, #6FBBFF, #2E96F5 60%, #1E86E5)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 12px 24px -10px rgba(46,150,245,0.55)',
                    }}
                  >
                    {ws.name ? ws.name.charAt(0).toUpperCase() : 'W'}
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200/80 backdrop-blur-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-emerald-600 text-[8px] font-bold uppercase tracking-wider">Activo</span>
                  </div>
                </div>

                <h3 className="text-lg lg:text-base font-bold tracking-tight mb-2 text-[#0B2240] group-hover:text-sky-600 transition-colors truncate">
                  {ws.name}
                </h3>

                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                      ws.userRole === Role.SUPER_ADMIN
                        ? 'bg-sky-50/80 text-sky-700 border border-sky-200/80'
                        : ws.userRole === Role.ADMIN
                        ? 'bg-teal-50/80 text-teal-700 border border-teal-200/80'
                        : 'bg-emerald-50/80 text-emerald-700 border border-emerald-200/80'
                    }`}
                  >
                    {ws.userRole ? ws.userRole.replace('_', ' ') : 'Miembro'}
                  </span>
                </div>

                <div className="mt-4 lg:mt-3 pt-3 lg:pt-2.5 border-t border-white/60 flex items-center justify-between">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Entrar al espacio
                  </p>
                  <div className="w-7 h-7 rounded-lg bg-sky-50/80 border border-sky-200/80 flex items-center justify-center group-hover:bg-sky-500 group-hover:border-sky-500 transition-all">
                    <svg
                      className="w-3.5 h-3.5 text-sky-500 group-hover:text-white group-hover:translate-x-0.5 transition-all"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </button>
          ))}

          {workspaces.length === 0 && !authFeedback && (
            <div
              className="col-span-full py-20 lg:py-16 rounded-2xl border border-dashed border-sky-200/80 bg-white/40 backdrop-blur-xl flex flex-col items-center justify-center gap-4 text-center"
              style={{ animation: 'cwbg-fade-up 0.7s 0.3s both' }}
            >
              <div className="w-14 h-14 lg:w-12 lg:h-12 bg-sky-100/80 border border-sky-200/80 rounded-full flex items-center justify-center text-2xl">
                🔑
              </div>
              <div className="space-y-1">
                <p className="text-slate-700 font-bold text-base lg:text-sm">Sin acceso a espacios</p>
                <p className="text-slate-400 text-xs lg:text-[10px]">
                  Contacta a tu administrador para recibir una invitación
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
