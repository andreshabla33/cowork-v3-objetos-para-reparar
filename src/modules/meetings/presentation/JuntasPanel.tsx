'use client';
/**
 * @module meetings/presentation/JuntasPanel
 *
 * Panel "Juntas" del sidebar — vista unificada de:
 *   1. 🟢 Salas activas con personas dentro (in-room meetings).
 *   2. 📅 Reuniones programadas hoy.
 *   3. 📍 Pointer a proximidad en el espacio 3D.
 *
 * Antes: el botón "Juntas" del sidebar abría grabaciones. Bug
 * confirmado por user 2026-05-15. Este panel reemplaza ese path.
 *
 * Clean Architecture: Presentation R3F-side.
 *   - Consume `useMeetingRooms` (hook existente, realtime sub).
 *   - Consume `reunionesProgramadasRepository` (infra) via useEffect.
 *   - Zero domain/infra changes.
 *
 * Refs:
 *   - React lazy + Suspense (cargado por WorkspaceContentRouter):
 *     https://react.dev/reference/react/lazy
 *   - Zustand 5 selectors: https://github.com/pmndrs/zustand
 *   - Supabase realtime: https://supabase.com/docs/guides/realtime
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Calendar, Users, MapPin, Video } from 'lucide-react';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { useMeetingRooms } from '@/modules/meetings/presentation/hooks/useMeetingRooms';
import { reunionesProgramadasRepository } from '@/core/infrastructure/adapters/ReunionesProgramadasSupabaseRepository';
import type { ReunionProgramadaData } from '@/src/core/domain/ports/IMeetingRepository';
import { logger } from '@/core/infrastructure/observability/logger';

const log = logger.child('juntas-panel');

const JuntasPanel: React.FC = () => {
  const { activeWorkspace, setActiveSubTab } = useStore(
    useShallow((s) => ({
      activeWorkspace: s.activeWorkspace,
      setActiveSubTab: s.setActiveSubTab,
    })),
  );

  // Salas activas con realtime (hook ya existente)
  const { rooms, loading: loadingRooms, joinRoom } = useMeetingRooms();

  // Reuniones programadas (carga + realtime sub)
  const [programadas, setProgramadas] = useState<ReunionProgramadaData[]>([]);
  const [loadingProg, setLoadingProg] = useState(true);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    let cancelled = false;
    setLoadingProg(true);

    const cargar = () => {
      reunionesProgramadasRepository
        .obtenerReunionesActivas(activeWorkspace.id)
        .then((data) => {
          if (!cancelled) setProgramadas(data);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          log.error('Error cargando reuniones programadas', { msg });
        })
        .finally(() => {
          if (!cancelled) setLoadingProg(false);
        });
    };

    cargar();
    const unsub = reunionesProgramadasRepository.suscribirCambiosReuniones(
      activeWorkspace.id,
      cargar,
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [activeWorkspace?.id]);

  // Filtros derivados
  const { salasConGente, programadasHoy } = useMemo(() => {
    const hoyStart = new Date();
    hoyStart.setHours(0, 0, 0, 0);
    const hoyEnd = new Date();
    hoyEnd.setHours(23, 59, 59, 999);

    return {
      salasConGente: rooms.filter((r) => (r.participantes?.length ?? 0) > 0),
      programadasHoy: programadas.filter((r) => {
        const inicio = new Date(r.fecha_inicio);
        return inicio >= hoyStart && inicio <= hoyEnd;
      }),
    };
  }, [rooms, programadas]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <header>
        <h2 className="text-2xl md:text-4xl font-black tracking-tight">Juntas</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Reuniones activas, programadas y por proximidad en este espacio.
        </p>
      </header>

      {/* ── 1. Salas activas con personas ───────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-700">
            En reunión ahora
          </h3>
          {salasConGente.length > 0 && (
            <span className="ml-auto text-xs font-mono text-emerald-500">
              {salasConGente.length} {salasConGente.length === 1 ? 'sala' : 'salas'}
            </span>
          )}
        </div>

        {loadingRooms ? (
          <p className="text-xs text-zinc-400">Cargando salas…</p>
        ) : salasConGente.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">
            Nadie está en una sala de reunión ahora mismo.
          </p>
        ) : (
          <ul className="space-y-2">
            {salasConGente.map((sala) => {
              const count = sala.participantes?.length ?? 0;
              return (
                <li
                  key={sala.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">
                      {sala.nombre}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {count} {count === 1 ? 'persona' : 'personas'}
                      {sala.descripcion ? ` · ${sala.descripcion}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => joinRoom(sala.id)}
                    className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                  >
                    Unirse
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 2. Reuniones programadas hoy ────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-700">
            Programadas hoy
          </h3>
          {programadasHoy.length > 0 && (
            <span className="ml-auto text-xs font-mono text-indigo-500">
              {programadasHoy.length}
            </span>
          )}
        </div>

        {loadingProg ? (
          <p className="text-xs text-zinc-400">Cargando reuniones…</p>
        ) : programadasHoy.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">
            No hay reuniones programadas para hoy.
          </p>
        ) : (
          <ul className="space-y-2">
            {programadasHoy.map((r) => {
              const inicio = new Date(r.fecha_inicio);
              const hora = inicio.toLocaleTimeString('es', {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <li
                  key={r.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl border border-zinc-200 bg-white"
                >
                  <Video className="w-4 h-4 text-zinc-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">
                      {r.titulo}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {hora}
                      {r.descripcion ? ` · ${r.descripcion}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('calendar')}
                    className="text-[11px] text-indigo-500 hover:underline font-medium"
                  >
                    Detalles
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 3. Proximidad — pointer al 3D ───────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-700">
            Por proximidad
          </h3>
        </div>
        <div className="px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-600">
          Las reuniones por proximidad se forman automáticamente cuando varios
          avatares se acercan en el espacio 3D. Para verlas, entra al espacio.
          <button
            type="button"
            onClick={() => setActiveSubTab('space')}
            className="block mt-2 text-[11px] font-bold uppercase tracking-widest text-indigo-500 hover:underline"
          >
            Ir al espacio →
          </button>
        </div>
      </section>
    </div>
  );
};

export default JuntasPanel;
