/**
 * @module infrastructure/adapters/MiembrosEspacioSupabaseRepository
 * @description Supabase implementation of IMiembrosEspacioRepository.
 *
 * Tablas: `miembros_espacio` (con joins usuario/departamento/cargo),
 * `invitaciones_pendientes`, `registro_conexiones`.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  IMiembrosEspacioRepository,
  MiembroEspacio,
  InvitacionPendiente,
  RegistroConexion,
  MiembroAdminEspacio,
  CambioMiembroCallback,
  EstadoTour,
  UpdateTour,
  CambioTourPayload,
} from '@/core/domain/ports/IMiembrosEspacioRepository';

export class MiembrosEspacioSupabaseRepository implements IMiembrosEspacioRepository {
  async listarMiembrosAceptados(espacioId: string): Promise<MiembroEspacio[]> {
    const { data, error } = await supabase
      .from('miembros_espacio')
      .select('*, usuario:usuarios(*), departamento:departamentos(*), cargo_ref:cargos!cargo_id(nombre, clave)')
      .eq('espacio_id', espacioId)
      .eq('aceptado', true);

    if (error) throw error;
    return (data ?? []) as MiembroEspacio[];
  }

  async listarInvitacionesPendientes(espacioId: string): Promise<InvitacionPendiente[]> {
    const { data, error } = await supabase
      .from('invitaciones_pendientes')
      .select('*')
      .eq('espacio_id', espacioId)
      .eq('usada', false);

    if (error) throw error;
    return (data ?? []) as InvitacionPendiente[];
  }

  async listarConexionesDesde(espacioId: string, desdeISO: string): Promise<RegistroConexion[]> {
    const { data, error } = await supabase
      .from('registro_conexiones')
      .select('usuario_id, conectado_en, desconectado_en, duracion_minutos')
      .eq('espacio_id', espacioId)
      .gte('conectado_en', desdeISO);

    if (error) throw error;
    return (data ?? []) as RegistroConexion[];
  }

  async resetearTour(usuarioId: string, espacioId: string): Promise<void> {
    const { error } = await supabase
      .from('miembros_espacio')
      .update({ tour_completado: false, tour_veces_mostrado: 0 })
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId);
    if (error) throw error;
  }

  async listarMiembrosAdmin(espacioId: string): Promise<MiembroAdminEspacio[]> {
    const { data, error } = await supabase
      .from('miembros_espacio')
      .select(`id, usuario_id, rol, cargo, cargo_id, aceptado, usuario:usuarios(nombre, email), cargo_ref:cargos!cargo_id(nombre)`)
      .eq('espacio_id', espacioId);
    if (error) throw error;
    return (data ?? []) as unknown as MiembroAdminEspacio[];
  }

  async listarInvitacionesAdmin(espacioId: string): Promise<InvitacionPendiente[]> {
    const { data, error } = await supabase
      .from('invitaciones_pendientes')
      .select('id, email, rol, creada_en, expira_en')
      .eq('espacio_id', espacioId)
      .eq('usada', false)
      .order('creada_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as InvitacionPendiente[];
  }

  async obtenerCargoClave(usuarioId: string, espacioId: string): Promise<string | null> {
    const { data } = await supabase
      .from('miembros_espacio')
      .select('cargo_id, cargo_ref:cargos!cargo_id(clave)')
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId)
      .single();
    const clave = (data?.cargo_ref as { clave?: string } | null)?.clave;
    return clave ?? null;
  }

  async cancelarInvitacionConCount(invitacionId: string): Promise<{ count: number }> {
    const { error, count } = await supabase
      .from('invitaciones_pendientes')
      .delete({ count: 'exact' })
      .eq('id', invitacionId);
    if (error) throw error;
    return { count: count ?? 0 };
  }

  suscribirCambiosMiembros(espacioId: string, callback: CambioMiembroCallback): () => void {
    const canal = supabase
      .channel(`settings_members:${espacioId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'miembros_espacio', filter: `espacio_id=eq.${espacioId}` }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitaciones_pendientes', filter: `espacio_id=eq.${espacioId}` }, callback)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }

  async obtenerEstadoTour(usuarioId: string, espacioId: string): Promise<EstadoTour | null> {
    const { data } = await supabase
      .from('miembros_espacio')
      .select('id, tour_completado, tour_veces_mostrado, tour_no_mostrar')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', usuarioId)
      .single();
    if (!data) return null;
    return {
      tour_completado: data.tour_completado ?? false,
      tour_veces_mostrado: data.tour_veces_mostrado ?? 0,
      tour_no_mostrar: data.tour_no_mostrar ?? false,
    };
  }

  async actualizarEstadoTour(usuarioId: string, espacioId: string, updates: UpdateTour): Promise<void> {
    const { error } = await supabase
      .from('miembros_espacio')
      .update(updates)
      .eq('espacio_id', espacioId)
      .eq('usuario_id', usuarioId);
    if (error) throw error;
  }

  suscribirCambiosTourUsuario(usuarioId: string, callback: (payload: CambioTourPayload) => void): () => void {
    const canal = supabase
      .channel(`tour-reset-${usuarioId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'miembros_espacio',
        filter: `usuario_id=eq.${usuarioId}`,
      }, (payload) => {
        const nuevo = payload.new as { espacio_id: string; tour_completado?: boolean | null };
        const viejo = payload.old as { tour_completado?: boolean | null };
        callback({
          espacio_id: nuevo.espacio_id,
          tour_completado_anterior: viejo?.tour_completado ?? null,
          tour_completado_nuevo: nuevo?.tour_completado ?? null,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }
}

export const miembrosEspacioRepository = new MiembrosEspacioSupabaseRepository();
