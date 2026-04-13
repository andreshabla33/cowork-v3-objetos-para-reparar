/**
 * @module infrastructure/adapters/OnboardingSupabaseRepository
 * @description Supabase implementation of IOnboardingRepository.
 * Encapsulates all onboarding-related Supabase queries.
 *
 * Ref: Supabase JS v2 — typed queries with maybeSingle() for optional rows.
 */

import { supabase } from '../../../../lib/supabase';
import { logger } from '../../../../lib/logger';
import type {
  IOnboardingRepository,
  MiembroOnboarding,
} from '../../domain/ports/IOnboardingRepository';
import type { Departamento, MiembroEspacioData, OnboardingInvitadorData, CargoDB } from '../../domain/entities/onboarding';

const log = logger.child('onboarding-repo');

export class OnboardingSupabaseRepository implements IOnboardingRepository {
  async obtenerMiembroPendiente(userId: string, espacioId?: string): Promise<MiembroOnboarding | null> {
    let query = supabase
      .from('miembros_espacio')
      .select(`
        id,
        cargo,
        rol,
        espacio_id,
        onboarding_completado,
        espacios_trabajo:espacio_id (nombre)
      `)
      .eq('usuario_id', userId)
      .eq('aceptado', true)
      .eq('onboarding_completado', false);

    // ROLE-MISMATCH-001: si viene espacioId, filtrar por workspace exacto.
    // Esto evita retornar una membresía de otro workspace con un rol diferente
    // (ej: super_admin en workspace A cuando el usuario fue invitado como miembro en B).
    if (espacioId) {
      query = query.eq('espacio_id', espacioId);
    }

    const { data: miembro, error } = await query
      .order('aceptado_en', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    if (error || !miembro) {
      log.debug('No pending onboarding membership found', { userId, error: error?.message });
      return null;
    }

    const espacioData = miembro.espacios_trabajo as MiembroEspacioData | null;

    return {
      id: miembro.id,
      cargo: miembro.cargo,
      rol: (miembro as { rol?: string }).rol || 'miembro',
      espacio_id: miembro.espacio_id,
      onboarding_completado: miembro.onboarding_completado,
      espacioNombre: espacioData?.nombre || 'tu espacio',
    };
  }

  async obtenerDatosOnboarding(
    userId: string,
    userEmail: string,
    espacioId: string,
  ): Promise<{
    departamentos: Departamento[];
    cargosDB: CargoDB[];
    cargoSugerido: string | null;
    invitadorNombre: string;
  }> {
    const [departamentosRes, cargosRes, invitacionRes] = await Promise.all([
      supabase
        .from('departamentos')
        .select('id, nombre, color, icono')
        .eq('espacio_id', espacioId)
        .order('nombre'),
      supabase
        .from('cargos')
        .select('id, nombre, clave, descripcion, categoria, icono, orden, activo, tiene_analisis_avanzado, analisis_disponibles, solo_admin')
        .eq('espacio_id', espacioId)
        .eq('activo', true)
        .order('orden'),
      supabase
        .from('invitaciones_pendientes')
        .select('cargo_sugerido, creada_por, invitador:usuarios!creada_por(nombre)')
        .eq('email', userEmail)
        .eq('usada', true)
        .order('expira_en', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const invitadorData = invitacionRes.data?.invitador as OnboardingInvitadorData | null;

    return {
      departamentos: (departamentosRes.data || []) as Departamento[],
      cargosDB: (cargosRes.data || []) as CargoDB[],
      cargoSugerido: invitacionRes.data?.cargo_sugerido || null,
      invitadorNombre: invitadorData?.nombre || '',
    };
  }

  async completarOnboarding(
    miembroId: string,
    cargoId: string,
    departamentoId?: string,
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {
      cargo_id: cargoId,
      onboarding_completado: true,
    };
    if (departamentoId) {
      updatePayload.departamento_id = departamentoId;
    }

    const { error } = await supabase
      .from('miembros_espacio')
      .update(updatePayload)
      .eq('id', miembroId);

    if (error) throw error;
  }
}
