/**
 * @module infrastructure/adapters/MembershipSupabaseRepository
 * @description Adapter Supabase para `IMembershipRepository`.
 *
 * Tabla: `miembros_espacio`. Operaciones de membresía simple (no incluye
 * workflow de autorizaciones cross-empresa — ese vive en
 * `AutorizacionEmpresaSupabaseRepository`).
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import type { IMembershipRepository } from '@/core/domain/ports/IMembershipRepository';

const log = logger.child('membership-repository');

class MembershipSupabaseRepository implements IMembershipRepository {
  async obtenerEmpresaDeUsuario(espacioId: string, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      log.warn('Error obteniendo empresa del usuario', { espacioId, userId, error: error.message });
      // No throw: si falla la query (RLS o miembro inexistente), retornamos null
      // — comportamiento equivalente al original que solo destructuraba `data`.
      return null;
    }

    return (data as { empresa_id: string | null } | null)?.empresa_id ?? null;
  }

  async contarMiembrosPorEmpresa(espacioId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacioId)
      .not('empresa_id', 'is', null);

    if (error) {
      log.warn('Error contando miembros por empresa', { espacioId, error: error.message });
      return {};
    }

    const conteo: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ empresa_id: string | null }>) {
      if (row.empresa_id) {
        conteo[row.empresa_id] = (conteo[row.empresa_id] ?? 0) + 1;
      }
    }
    return conteo;
  }
}

export const membershipRepository: IMembershipRepository = new MembershipSupabaseRepository();
