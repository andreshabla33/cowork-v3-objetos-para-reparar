/**
 * @module infrastructure/adapters/JuegosSupabaseRepository
 * @description Supabase adapter for IJuegosRepository.
 *
 * Tablas: `invitaciones_juegos`, `partidas_ajedrez`, `miembros_espacio`, `usuarios`.
 *
 * Realtime patterns documented in port. Broadcast channel uses
 * `supabase.channel().on('broadcast', { event }, cb)` + `channel.send()`.
 * Ref: https://supabase.com/docs/guides/realtime/broadcast
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  IJuegosRepository,
  InvitacionJuego,
  PartidaAjedrez,
  CrearInvitacionAjedrezInput,
  MiembroOnline,
  CanalAjedrezCallbacks,
  CanalAjedrezController,
} from '@/core/domain/ports/IJuegosRepository';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class JuegosSupabaseRepository implements IJuegosRepository {
  async listarInvitacionesPendientes(usuarioId: string, espacioId: string): Promise<InvitacionJuego[]> {
    const { data, error } = await supabase
      .from('invitaciones_juegos')
      .select('*')
      .eq('invitado_id', usuarioId)
      .eq('espacio_id', espacioId)
      .eq('estado', 'pendiente')
      .gt('expira_en', new Date().toISOString());
    if (error) throw error;
    return (data ?? []) as InvitacionJuego[];
  }

  async crearInvitacionAjedrez(input: CrearInvitacionAjedrezInput): Promise<InvitacionJuego> {
    const { data, error } = await supabase
      .from('invitaciones_juegos')
      .insert({
        juego: 'ajedrez',
        invitador_id: input.invitador_id,
        invitado_id: input.invitado_id,
        espacio_id: input.espacio_id,
        configuracion: {
          tiempo: input.tiempo,
          invitador_nombre: input.invitador_nombre,
          invitador_color: input.invitador_color,
        },
      })
      .select()
      .single();
    if (error) throw error;
    return data as InvitacionJuego;
  }

  async cancelarInvitacion(invitacionId: string): Promise<void> {
    const { error } = await supabase
      .from('invitaciones_juegos')
      .update({ estado: 'cancelada' })
      .eq('id', invitacionId);
    if (error) throw error;
  }

  async rechazarInvitacion(invitacionId: string): Promise<void> {
    const { error } = await supabase
      .from('invitaciones_juegos')
      .update({ estado: 'rechazada', respondida_en: new Date().toISOString() })
      .eq('id', invitacionId);
    if (error) throw error;
  }

  async aceptarInvitacionConPartida(
    invitacion: InvitacionJuego,
    invitadoId: string,
  ): Promise<PartidaAjedrez> {
    const blancasId = invitacion.configuracion.invitador_color === 'w'
      ? invitacion.invitador_id
      : invitadoId;
    const negrasId = invitacion.configuracion.invitador_color === 'w'
      ? invitadoId
      : invitacion.invitador_id;

    const { data: partida, error: errorPartida } = await supabase
      .from('partidas_ajedrez')
      .insert({
        jugador_blancas_id: blancasId,
        jugador_negras_id: negrasId,
        estado: 'jugando',
        turno: 'w',
        fen_actual: DEFAULT_FEN,
        tiempo_blancas: invitacion.configuracion.tiempo || 600,
        tiempo_negras: invitacion.configuracion.tiempo || 600,
        fecha_inicio: new Date().toISOString(),
        historial_movimientos: [],
        piezas_capturadas_blancas: [],
        piezas_capturadas_negras: [],
      })
      .select()
      .single();
    if (errorPartida) throw errorPartida;

    const { error: errorInvitacion } = await supabase
      .from('invitaciones_juegos')
      .update({
        estado: 'aceptada',
        partida_id: partida.id,
        respondida_en: new Date().toISOString(),
      })
      .eq('id', invitacion.id);
    if (errorInvitacion) throw errorInvitacion;

    return partida as PartidaAjedrez;
  }

  suscribirInvitacionesUsuario(
    usuarioId: string,
    callbacks: {
      onInsert?: (invitacion: InvitacionJuego) => void;
      onUpdate?: (invitacion: InvitacionJuego) => void;
    },
  ): () => void {
    const channel = supabase
      .channel(`invitaciones-${usuarioId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'invitaciones_juegos',
        filter: `invitado_id=eq.${usuarioId}`,
      }, (payload) => {
        callbacks.onInsert?.(payload.new as InvitacionJuego);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'invitaciones_juegos',
        filter: `invitado_id=eq.${usuarioId}`,
      }, (payload) => {
        callbacks.onUpdate?.(payload.new as InvitacionJuego);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  suscribirCambiosInvitacion(invitacionId: string, callback: (invitacion: InvitacionJuego) => void): () => void {
    const channel = supabase
      .channel(`invitacion-${invitacionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'invitaciones_juegos',
        filter: `id=eq.${invitacionId}`,
      }, (payload) => {
        callback(payload.new as InvitacionJuego);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  suscribirCambiosPartida(partidaId: string, callback: (partida: PartidaAjedrez & { ultimo_movimiento?: unknown }) => void): () => void {
    const channel = supabase
      .channel(`partida-ajedrez-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'partidas_ajedrez',
        filter: `id=eq.${partidaId}`,
      }, (payload) => {
        callback(payload.new as PartidaAjedrez & { ultimo_movimiento?: unknown });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async actualizarPartidaAjedrez(partidaId: string, updates: Partial<PartidaAjedrez>): Promise<void> {
    const { error } = await supabase
      .from('partidas_ajedrez')
      .update(updates)
      .eq('id', partidaId);
    if (error) throw error;
  }

  crearCanalAjedrez(sessionId: string, callbacks: CanalAjedrezCallbacks): CanalAjedrezController {
    const channel = supabase.channel(`chess-game-${sessionId}`)
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        callbacks.onMove?.(payload as { playerId: string; move: unknown });
      })
      .on('broadcast', { event: 'join' }, ({ payload }) => {
        callbacks.onJoin?.(payload as { playerId: string; playerName: string });
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        callbacks.onChat?.(payload as { from: string; text: string; timestamp: number });
      })
      .on('broadcast', { event: 'resign' }, ({ payload }) => {
        callbacks.onResign?.(payload as { playerId: string });
      })
      .subscribe();
    return {
      send(event, payload) {
        channel.send({ type: 'broadcast', event, payload });
      },
      close() {
        supabase.removeChannel(channel);
      },
    };
  }

  async listarMiembrosOnline(espacioId: string, excluirUsuarioId?: string): Promise<MiembroOnline[]> {
    let query = supabase
      .from('miembros_espacio')
      .select('usuario_id')
      .eq('espacio_id', espacioId)
      .eq('aceptado', true);
    if (excluirUsuarioId) query = query.neq('usuario_id', excluirUsuarioId);

    const { data: membersData, error: membersError } = await query;
    if (membersError) throw membersError;
    if (!membersData || membersData.length === 0) return [];

    const userIds = membersData.map((m: { usuario_id: string }) => m.usuario_id);
    const { data: usersData, error: usersError } = await supabase
      .from('usuarios')
      .select('id, nombre, avatar_url, estado_disponibilidad')
      .in('id', userIds);
    if (usersError) throw usersError;

    return (usersData ?? []) as MiembroOnline[];
  }
}

export const juegosRepository: IJuegosRepository = new JuegosSupabaseRepository();
