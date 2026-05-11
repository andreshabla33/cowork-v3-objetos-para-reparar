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
}

export const miembrosEspacioRepository = new MiembrosEspacioSupabaseRepository();
