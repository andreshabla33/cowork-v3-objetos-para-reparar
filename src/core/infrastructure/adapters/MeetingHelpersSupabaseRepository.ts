/**
 * @module infrastructure/adapters/MeetingHelpersSupabaseRepository
 * @description Supabase adapter para `IMeetingHelpersRepository`.
 *
 * Sub-adapter del split 2026-05-09 (ITEM 17 fase B). Helpers de queries
 * sobre `usuarios` y `miembros_espacio` usados en flujos de reuniones.
 *
 * Si en el futuro estos métodos se reusan cross-feature (no solo meetings),
 * extraer a `IUsuariosRepository` compartido.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { IMeetingHelpersRepository } from '@/core/domain/ports/IMeetingHelpersRepository';
import type { MiembroBasicoData } from '@/core/domain/ports/IMeetingRepository';

const log = logger.child('meeting-helpers-repo');

export class MeetingHelpersSupabaseRepository implements IMeetingHelpersRepository {
  async obtenerMiembrosEspacio(espacioId: string): Promise<MiembroBasicoData[]> {
    try {
      const { data: miembroData, error: miembroError } = await supabase
        .from('miembros_espacio')
        .select('usuario_id')
        .eq('espacio_id', espacioId)
        .eq('aceptado', true);

      if (miembroError) {
        log.warn('Failed to fetch workspace members', {
          error: miembroError.message, espacioId,
        });
        return [];
      }
      if (!miembroData || miembroData.length === 0) return [];

      const userIds = (miembroData as Array<{ usuario_id: string }>).map((m) => m.usuario_id);
      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuarios')
        .select('id, nombre, email, avatar_url')
        .in('id', userIds);

      if (usuariosError) {
        log.warn('Failed to fetch user details', {
          error: usuariosError.message, espacioId,
        });
        return [];
      }
      return (usuarios as MiembroBasicoData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching workspace members', { error: message, espacioId });
      return [];
    }
  }

  async obtenerInfoUsuarios(userIds: string[]): Promise<MiembroBasicoData[]> {
    try {
      if (userIds.length === 0) return [];

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, avatar_url')
        .in('id', userIds);

      if (error) {
        log.warn('Failed to fetch user info', { error: error.message, count: userIds.length });
        return [];
      }
      return (data as MiembroBasicoData[]) || [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching user info', { error: message });
      return [];
    }
  }

  async obtenerCargoUsuario(espacioId: string, usuarioId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('miembros_espacio')
        .select('cargo_ref:cargos_laborales(clave)')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

      if (error) {
        log.warn('Failed to fetch user role', {
          error: error.message, espacioId, usuarioId,
        });
        return null;
      }
      const clave = (data?.cargo_ref as { clave?: string } | null)?.clave;
      return clave || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception fetching user role', {
        error: message, espacioId, usuarioId,
      });
      return null;
    }
  }
}

export const meetingHelpersRepository: IMeetingHelpersRepository =
  new MeetingHelpersSupabaseRepository();
