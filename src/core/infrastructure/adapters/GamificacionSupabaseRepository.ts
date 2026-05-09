/**
 * @module infrastructure/adapters/GamificacionSupabaseRepository
 * @description Supabase adapter implementando `IGamificacionRepository`.
 *
 * Cierra deuda residual del ITEM 6: el módulo `gamificacion.ts` AS-IS
 * (movido en commit `9037822` durante ITEM 12) ahora tiene Repository
 * pattern formal con port en Domain + clase singleton en Infrastructure.
 *
 * El facade en `gamificacion.ts` (sin clase) se mantiene como compat shim
 * que re-exporta las constantes/funciones puras desde Domain y delega
 * los métodos async a este singleton.
 *
 * Tablas: `gamificacion_usuarios`, `gamificacion_misiones`,
 * `gamificacion_logros`, `gamificacion_logros_usuario`, `gamificacion_items`.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import { logger } from '@/core/infrastructure/observability/logger';
import { calcularNivel, XP_POR_ACCION } from '@/core/domain/entities/gamificacion';
import type {
  PerfilGamificacion,
  Mision,
  Logro,
  LogroDesbloqueado,
  ItemCosmetico,
} from '@/core/domain/entities/gamificacion';
import type { IGamificacionRepository } from '@/core/domain/ports/IGamificacionRepository';

const log = logger.child('gamificacion-repository');

export class GamificacionSupabaseRepository implements IGamificacionRepository {
  async obtenerPerfil(usuarioId: string, espacioId: string): Promise<PerfilGamificacion | null> {
    // Fix 2026-04-21 (race condition StrictMode/dual mount):
    //   1. React montaba el hook 2× → ambos recibían 406 con .single()
    //   2. Ambos hacían INSERT → uno ganaba, el otro 409 UNIQUE constraint
    //   3. La llamada perdedora retornaba null → gamificación desincronizada
    // Ahora: maybeSingle() (null en vez de 406) + upsert con ignoreDuplicates
    // (idempotente bajo concurrencia). Re-leemos tras upsert.
    // Ref: https://supabase.com/docs/reference/javascript/upsert
    const { data, error } = await supabase
      .from('gamificacion_usuarios')
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId)
      .maybeSingle();

    if (error) {
      log.error('Error obteniendo perfil gamificación', { error: error.message, usuarioId, espacioId });
      return null;
    }
    if (data) return data as PerfilGamificacion;

    const { error: errCreate } = await supabase
      .from('gamificacion_usuarios')
      .upsert(
        { usuario_id: usuarioId, espacio_id: espacioId },
        { onConflict: 'usuario_id,espacio_id', ignoreDuplicates: true },
      );
    if (errCreate) {
      log.error('Error creando perfil gamificación', { error: errCreate.message, usuarioId, espacioId });
      return null;
    }

    const { data: refetched, error: errRefetch } = await supabase
      .from('gamificacion_usuarios')
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId)
      .maybeSingle();
    if (errRefetch) {
      log.error('Error re-leyendo perfil tras upsert', { error: errRefetch.message, usuarioId, espacioId });
      return null;
    }
    return (refetched ?? null) as PerfilGamificacion | null;
  }

  async otorgarXP(
    usuarioId: string,
    espacioId: string,
    cantidad: number,
    accion: string,
  ): Promise<{ xp_total: number; nivel: number; subioDeMivel: boolean } | null> {
    const perfil = await this.obtenerPerfil(usuarioId, espacioId);
    if (!perfil) return null;

    const cantidadSegura = Number.isFinite(cantidad) ? cantidad : 0;
    const nuevoXP = perfil.xp_total + cantidadSegura;
    const nivelAnterior = perfil.nivel;
    const { nivel: nuevoNivel } = calcularNivel(nuevoXP);

    const stats = perfil.estadisticas || {};
    stats[accion] = (stats[accion] || 0) + 1;

    const { error } = await supabase
      .from('gamificacion_usuarios')
      .update({
        xp_total: nuevoXP,
        nivel: nuevoNivel,
        estadisticas: stats,
        updated_at: new Date().toISOString(),
      })
      .eq('id', perfil.id);

    if (error) {
      log.error('Error otorgando XP', { error: error.message, usuarioId, accion });
      return null;
    }

    return { xp_total: nuevoXP, nivel: nuevoNivel, subioDeMivel: nuevoNivel > nivelAnterior };
  }

  async registrarLoginDiario(
    usuarioId: string,
    espacioId: string,
  ): Promise<{ racha: number; xpGanado: number } | null> {
    const perfil = await this.obtenerPerfil(usuarioId, espacioId);
    if (!perfil) return null;

    const hoy = new Date().toISOString().split('T')[0];
    if (perfil.ultimo_login === hoy) return { racha: perfil.racha_dias, xpGanado: 0 };

    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const nuevaRacha = perfil.ultimo_login === ayer ? perfil.racha_dias + 1 : 1;
    const rachaMax = Math.max(perfil.racha_max, nuevaRacha);

    // Bonus XP por racha: base 10 + 2 por cada día (cap 50)
    const xpLogin = Math.min(XP_POR_ACCION.login_diario + nuevaRacha * 2, 50);

    const { error } = await supabase
      .from('gamificacion_usuarios')
      .update({
        ultimo_login: hoy,
        racha_dias: nuevaRacha,
        racha_max: rachaMax,
        xp_total: perfil.xp_total + xpLogin,
        nivel: calcularNivel(perfil.xp_total + xpLogin).nivel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', perfil.id);

    if (error) {
      log.error('Error registrando login diario', { error: error.message, usuarioId });
      return null;
    }
    return { racha: nuevaRacha, xpGanado: xpLogin };
  }

  async obtenerMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]> {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('gamificacion_misiones')
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId)
      .eq('fecha', hoy)
      .order('created_at');

    if (error) {
      log.error('Error obteniendo misiones', { error: error.message, usuarioId });
      return [];
    }
    return (data ?? []) as Mision[];
  }

  async avanzarMision(misionId: string, incremento: number = 1): Promise<Mision | null> {
    const { data: mision, error: errGet } = await supabase
      .from('gamificacion_misiones')
      .select('*')
      .eq('id', misionId)
      .single();

    if (errGet || !mision) return null;
    if (mision.estado !== 'activa') return mision as Mision;

    const nuevoProgreso = Math.min(mision.progreso_actual + incremento, mision.objetivo_cantidad);
    const completada = nuevoProgreso >= mision.objetivo_cantidad;

    const { data, error } = await supabase
      .from('gamificacion_misiones')
      .update({
        progreso_actual: nuevoProgreso,
        estado: completada ? 'completada' : 'activa',
        completada_en: completada ? new Date().toISOString() : null,
      })
      .eq('id', misionId)
      .select()
      .single();

    if (error) {
      log.error('Error avanzando misión', { error: error.message, misionId });
      return null;
    }
    return data as Mision;
  }

  async generarMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]> {
    const existentes = await this.obtenerMisionesDiarias(usuarioId, espacioId);
    if (existentes.length > 0) return existentes;

    const plantillas = [
      { titulo: 'Saluda a un compañero', descripcion: 'Usa la animación wave cerca de alguien', tipo: 'social', objetivo_cantidad: 1, xp_recompensa: 30 },
      { titulo: 'Envía 5 mensajes', descripcion: 'Participa en el chat del espacio', tipo: 'chat', objetivo_cantidad: 5, xp_recompensa: 40 },
      { titulo: 'Asiste a una reunión', descripcion: 'Únete a una videollamada', tipo: 'reunion', objetivo_cantidad: 1, xp_recompensa: 50 },
      { titulo: 'Explora 3 zonas', descripcion: 'Visita diferentes áreas del espacio', tipo: 'presencia', objetivo_cantidad: 3, xp_recompensa: 35 },
      { titulo: 'Baila con tu avatar', descripcion: 'Usa la animación de baile', tipo: 'social', objetivo_cantidad: 1, xp_recompensa: 20 },
      { titulo: 'Pasa 10 min cerca de alguien', descripcion: 'Trabaja en proximidad con un compañero', tipo: 'presencia', objetivo_cantidad: 10, xp_recompensa: 45 },
    ];

    const seleccionadas = plantillas.sort(() => Math.random() - 0.5).slice(0, 3);
    const hoy = new Date().toISOString().split('T')[0];

    const inserts = seleccionadas.map((m) => ({
      usuario_id: usuarioId,
      espacio_id: espacioId,
      titulo: m.titulo,
      descripcion: m.descripcion,
      tipo: m.tipo,
      objetivo_cantidad: m.objetivo_cantidad,
      xp_recompensa: m.xp_recompensa,
      fecha: hoy,
    }));

    const { data, error } = await supabase
      .from('gamificacion_misiones')
      .insert(inserts)
      .select();

    if (error) {
      log.error('Error generando misiones', { error: error.message, usuarioId });
      return [];
    }
    return (data ?? []) as Mision[];
  }

  async obtenerCatalogoLogros(): Promise<Logro[]> {
    const { data, error } = await supabase
      .from('gamificacion_logros')
      .select('*')
      .order('xp_recompensa');
    if (error) {
      log.error('Error obteniendo catálogo logros', { error: error.message });
      return [];
    }
    return (data ?? []) as Logro[];
  }

  async obtenerLogrosUsuario(usuarioId: string, espacioId: string): Promise<LogroDesbloqueado[]> {
    const { data, error } = await supabase
      .from('gamificacion_logros_usuario')
      .select('logro_id, desbloqueado_en, logro:gamificacion_logros(*)')
      .eq('usuario_id', usuarioId)
      .eq('espacio_id', espacioId);
    if (error) {
      log.error('Error obteniendo logros usuario', { error: error.message, usuarioId });
      return [];
    }
    // Supabase tipa el join `logro:gamificacion_logros(*)` como array vacío
    // por defecto; en runtime es un objeto único. Cast vía `unknown` para
    // narrowing seguro al shape esperado por LogroDesbloqueado.
    return ((data ?? []) as unknown as Array<{
      logro_id: string;
      desbloqueado_en: string;
      logro: Logro;
    }>).map((d) => ({
      logro_id: d.logro_id,
      desbloqueado_en: d.desbloqueado_en,
      logro: d.logro,
    }));
  }

  async desbloquearLogro(usuarioId: string, espacioId: string, logroId: string): Promise<boolean> {
    const { error } = await supabase
      .from('gamificacion_logros_usuario')
      .insert({ usuario_id: usuarioId, logro_id: logroId, espacio_id: espacioId });

    // 23505 = unique violation: ya desbloqueado (idempotente).
    if (error && error.code !== '23505') {
      log.error('Error desbloqueando logro', { error: error.message, usuarioId, logroId });
      return false;
    }
    return true;
  }

  async obtenerItemsCosmeticos(): Promise<ItemCosmetico[]> {
    const { data, error } = await supabase
      .from('gamificacion_items')
      .select('*')
      .order('nivel_requerido');
    if (error) {
      log.error('Error obteniendo items cosméticos', { error: error.message });
      return [];
    }
    return (data ?? []) as ItemCosmetico[];
  }
}

export const gamificacionRepository: IGamificacionRepository = new GamificacionSupabaseRepository();
