'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, X, Check, Clock, Swords } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface InvitacionJuego {
  id: string;
  juego: string;
  invitador_id: string;
  invitado_id: string;
  espacio_id: string;
  estado: string;
  configuracion: {
    tiempo: number;
    invitador_nombre: string;
    invitador_color: 'w' | 'b';
  };
  creada_en: string;
  expira_en: string;
}

interface GameInvitationNotificationProps {
  userId: string;
  espacioId: string;
  onAccept: (invitacion: InvitacionJuego, partidaId: string) => void;
}

export const GameInvitationNotification: React.FC<GameInvitationNotificationProps> = ({
  userId,
  espacioId,
  onAccept
}) => {
  const [invitaciones, setInvitaciones] = useState<InvitacionJuego[]>([]);

  // Suscribirse a nuevas invitaciones
  useEffect(() => {
    if (!userId || !espacioId) return;

    // Cargar invitaciones pendientes existentes
    const cargarInvitaciones = async () => {
      const { data } = await supabase
        .from('invitaciones_juegos')
        .select('*')
        .eq('invitado_id', userId)
        .eq('espacio_id', espacioId)
        .eq('estado', 'pendiente')
        .gt('expira_en', new Date().toISOString());

      if (data) {
        setInvitaciones(data);
      }
    };

    cargarInvitaciones();

    // Suscribirse a nuevas invitaciones en tiempo real
    const channel = supabase
      .channel(`invitaciones-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'invitaciones_juegos',
        filter: `invitado_id=eq.${userId}`
      }, (payload) => {
        const nueva = payload.new as InvitacionJuego;
        if (nueva.estado === 'pendiente' && nueva.espacio_id === espacioId) {
          setInvitaciones(prev => [...prev, nueva]);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'invitaciones_juegos',
        filter: `invitado_id=eq.${userId}`
      }, (payload) => {
        const updated = payload.new as InvitacionJuego;
        if (updated.estado !== 'pendiente') {
          setInvitaciones(prev => prev.filter(i => i.id !== updated.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, espacioId]);

  // Aceptar invitación
  const aceptarInvitacion = async (invitacion: InvitacionJuego) => {
    console.log('🎮 Aceptando invitación:', invitacion);
    try {
      // Crear la partida de ajedrez
      const miColor = invitacion.configuracion.invitador_color === 'w' ? 'b' : 'w';
      
      const partidaData = {
        jugador_blancas_id: invitacion.configuracion.invitador_color === 'w' 
          ? invitacion.invitador_id 
          : userId,
        jugador_negras_id: invitacion.configuracion.invitador_color === 'w' 
          ? userId 
          : invitacion.invitador_id,
        estado: 'jugando',
        turno: 'w',
        fen_actual: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        tiempo_blancas: invitacion.configuracion.tiempo || 600,
        tiempo_negras: invitacion.configuracion.tiempo || 600,
        fecha_inicio: new Date().toISOString(),
        historial_movimientos: [],
        piezas_capturadas_blancas: [],
        piezas_capturadas_negras: []
      };
      
      console.log('🎮 Creando partida con datos:', partidaData);
      
      const { data: partida, error: errorPartida } = await supabase
        .from('partidas_ajedrez')
        .insert(partidaData)
        .select()
        .single();

      console.log('🎮 Resultado crear partida:', { partida, errorPartida });

      if (errorPartida) throw errorPartida;

      // Actualizar la invitación con el ID de la partida
      const { error: errorInvitacion } = await supabase
        .from('invitaciones_juegos')
        .update({ 
          estado: 'aceptada',
          partida_id: partida.id,
          respondida_en: new Date().toISOString()
        })
        .eq('id', invitacion.id);

      if (errorInvitacion) throw errorInvitacion;

      // Remover de la lista local
      setInvitaciones(prev => prev.filter(i => i.id !== invitacion.id));

      // Notificar al padre para abrir el juego
      onAccept(invitacion, partida.id);

    } catch (error) {
      console.error('Error aceptando invitación:', error);
    }
  };

  // Rechazar invitación
  const rechazarInvitacion = async (invitacion: InvitacionJuego) => {
    try {
      await supabase
        .from('invitaciones_juegos')
        .update({ 
          estado: 'rechazada',
          respondida_en: new Date().toISOString()
        })
        .eq('id', invitacion.id);

      setInvitaciones(prev => prev.filter(i => i.id !== invitacion.id));
    } catch (error) {
      console.error('Error rechazando invitación:', error);
    }
  };

  // Formatear tiempo
  const formatTiempo = (segundos: number) => {
    if (!segundos || segundos === 0) return 'Sin límite';
    if (segundos < 60) return `${segundos}s`;
    return `${Math.floor(segundos / 60)} min`;
  };

  if (invitaciones.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 space-y-3">
      <AnimatePresence>
        {invitaciones.map((invitacion) => (
          <motion.div
            key={invitacion.id}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            className="w-80 bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl rounded-2xl border border-amber-500/30 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">¡Desafío de Ajedrez!</p>
                <p className="text-amber-400/80 text-xs">
                  {invitacion.configuracion.invitador_nombre} te invita a jugar
                </p>
              </div>
              <button
                onClick={() => rechazarInvitacion(invitacion)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Info de la partida */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-white/60">
                  <Clock className="w-4 h-4" />
                  <span>{formatTiempo(invitacion.configuracion.tiempo)}</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <div className={`w-4 h-4 rounded-full ${
                    invitacion.configuracion.invitador_color === 'w' ? 'bg-slate-800 border border-slate-600' : 'bg-white'
                  }`} />
                  <span>
                    Jugarás con {invitacion.configuracion.invitador_color === 'w' ? 'Negras' : 'Blancas'}
                  </span>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-2">
                <button
                  onClick={() => rechazarInvitacion(invitacion)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-medium text-sm transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Rechazar
                </button>
                <button
                  onClick={() => aceptarInvitacion(invitacion)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <Swords className="w-4 h-4" />
                  ¡Aceptar!
                </button>
              </div>
            </div>

            {/* Timer bar */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 300, ease: 'linear' }}
              className="h-1 bg-gradient-to-r from-amber-500 to-orange-500"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default GameInvitationNotification;
