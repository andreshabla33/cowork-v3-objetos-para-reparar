/**
 * @module infrastructure/adapters/InvitacionSupabaseRepository
 * @description Supabase implementation of IInvitacionRepository.
 * Encapsulates all invitation-related Supabase queries.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase JS v2 — typed .from().select() with JOIN syntax.
 */

import { supabase } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';
import { pickOneRelation } from '../../domain/utils/supabaseRelations';
import type { IInvitacionRepository, AceptarInvitacionPayload } from '../../domain/ports/IInvitacionRepository';
import type {
  InvitacionInfo,
  InvitacionEspacioData,
  InvitacionInvitadorData,
} from '../../domain/entities/invitation';

const log = logger.child('invitacion-repo');

export class InvitacionSupabaseRepository implements IInvitacionRepository {
  async buscarPorTokenHash(tokenHash: string): Promise<{
    data: InvitacionInfo | null;
    estado: 'valido' | 'usado' | 'expirado' | 'error';
  }> {
    try {
      const { data, error } = await supabase
        .from('invitaciones_pendientes')
        .select(`
          email,
          rol,
          empresa_id,
          usada,
          expira_en,
          espacio:espacios_trabajo (id, nombre, slug),
          invitador:usuarios!creada_por (nombre)
        `)
        .eq('token_hash', tokenHash)
        .single();

      if (error || !data) {
        log.warn('Invitation not found or query error', { error: error?.message });
        return { data: null, estado: 'error' };
      }

      if (data.usada) {
        return { data: null, estado: 'usado' };
      }

      if (new Date(data.expira_en) < new Date()) {
        return { data: null, estado: 'expirado' };
      }

      const espacioData = pickOneRelation<InvitacionEspacioData>(data.espacio);
      if (!espacioData || !espacioData.nombre) {
        log.error('Workspace data is null (possible RLS restriction)');
        return { data: null, estado: 'error' };
      }

      const invitadorData = pickOneRelation<InvitacionInvitadorData>(data.invitador);

      const info: InvitacionInfo = {
        email: data.email,
        rol: data.rol,
        empresa_id: data.empresa_id,
        espacio: espacioData,
        invitador: { nombre: invitadorData?.nombre || 'Un colega' },
      };

      return { data: info, estado: 'valido' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to query invitation', { error: message });
      return { data: null, estado: 'error' };
    }
  }

  async aceptar(payload: AceptarInvitacionPayload, tokenHash: string): Promise<void> {
    const { error: upsertError } = await supabase
      .from('miembros_espacio')
      .upsert(payload, { onConflict: 'espacio_id,usuario_id' });

    if (upsertError) throw upsertError;

    await supabase
      .from('invitaciones_pendientes')
      .update({ usada: true })
      .eq('token_hash', tokenHash);
  }
}
