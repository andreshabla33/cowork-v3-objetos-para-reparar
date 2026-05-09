/**
 * @module infrastructure/adapters/AutorizacionEmpresaSupabaseRepository
 * @description Supabase implementation of IAutorizacionEmpresaRepository.
 * Encapsulates the cross-empresa authorization workflow plus the
 * activity-log + notifications + shared-channel side effects each
 * mutation produces.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Note: `lib/autorizacionesEmpresa.ts` keeps thin wrapper functions that
 * delegate here for backwards-compat with legacy callers (SettingsZona,
 * ConsentimientoPendiente, useNotifications).
 *
 * Ref: Supabase JS v2 — .or chains, .in filters, .maybeSingle, .insert.
 */

import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  ActualizarAutorizacionInput,
  AprobarAutorizacionInput,
  IAutorizacionEmpresaRepository,
  SolicitarAccesoInput,
} from '../../domain/ports/IAutorizacionEmpresaRepository';
import type { AutorizacionEmpresa } from '@/types';

interface ActividadLogPayload {
  usuario_id: string | null;
  empresa_id: string | null;
  espacio_id: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: string | null;
  descripcion?: string | null;
  datos_extra?: Record<string, unknown>;
}

interface NotificacionWorkflowPayload {
  usuarios: string[];
  espacioId: string;
  tipo: string;
  titulo: string;
  mensaje?: string | null;
  entidadTipo?: string | null;
  entidadId?: string | null;
  datosExtra?: Record<string, unknown>;
}

async function registrarActividad(payload: ActividadLogPayload): Promise<void> {
  try {
    await supabase.from('actividades_log').insert({
      usuario_id: payload.usuario_id,
      empresa_id: payload.empresa_id,
      espacio_id: payload.espacio_id,
      accion: payload.accion,
      entidad: payload.entidad ?? null,
      entidad_id: payload.entidad_id ?? null,
      descripcion: payload.descripcion ?? null,
      datos_extra: payload.datos_extra ?? {},
    });
  } catch (error) {
    console.warn('No se pudo registrar actividad:', error);
  }
}

async function crearNotificaciones(payload: NotificacionWorkflowPayload): Promise<void> {
  if (!payload.usuarios.length) return;
  const filas = payload.usuarios.map((usuarioId) => ({
    usuario_id: usuarioId,
    espacio_id: payload.espacioId,
    tipo: payload.tipo,
    titulo: payload.titulo,
    mensaje: payload.mensaje ?? null,
    entidad_tipo: payload.entidadTipo ?? null,
    entidad_id: payload.entidadId ?? null,
    datos_extra: payload.datosExtra ?? {},
    creado_en: new Date().toISOString(),
  }));

  const { error } = await supabase.from('notificaciones').insert(filas);
  if (error) console.warn('Error creando notificaciones:', error.message);
}

async function obtenerAdminsEmpresa(input: {
  espacioId: string;
  empresaId: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from('miembros_espacio')
    .select('usuario_id')
    .eq('espacio_id', input.espacioId)
    .eq('empresa_id', input.empresaId)
    .in('rol', ['admin', 'super_admin']);

  if (error) {
    console.warn('Error obteniendo admins:', error.message);
    return [];
  }
  return (data || []).map((registro) => (registro as { usuario_id: string }).usuario_id);
}

async function crearCanalCompartidoTemporal(input: {
  espacioId: string;
  empresaOrigenId: string;
  empresaDestinoId: string;
}): Promise<string | null> {
  const idsOrdenados = [input.empresaOrigenId, input.empresaDestinoId].sort();
  const claveCanal = `compartido:${idsOrdenados.join(':')}`;

  const { data: canalExistente } = await supabase
    .from('grupos_chat')
    .select('id')
    .eq('espacio_id', input.espacioId)
    .eq('descripcion', claveCanal)
    .maybeSingle();

  if (canalExistente?.id) return (canalExistente as { id: string }).id;

  const { data: empresasData } = await supabase
    .from('empresas')
    .select('id, nombre')
    .in('id', idsOrdenados);

  const lista = (empresasData ?? []) as Array<{ id: string; nombre: string }>;
  const nombreA = lista.find((e) => e.id === idsOrdenados[0])?.nombre || 'Empresa A';
  const nombreB = lista.find((e) => e.id === idsOrdenados[1])?.nombre || 'Empresa B';
  const nombreCanal = `Compartido · ${nombreA} + ${nombreB}`;

  const { data: nuevoCanal, error: canalError } = await supabase
    .from('grupos_chat')
    .insert({
      espacio_id: input.espacioId,
      nombre: nombreCanal,
      descripcion: claveCanal,
      tipo: 'privado',
      icono: '🔗',
      color: '#38bdf8',
    })
    .select('id')
    .single();

  if (canalError || !nuevoCanal) {
    console.warn('Error creando canal compartido:', canalError?.message);
    return null;
  }

  const nuevoCanalId = (nuevoCanal as { id: string }).id;

  const { data: miembros } = await supabase
    .from('miembros_espacio')
    .select('usuario_id')
    .eq('espacio_id', input.espacioId)
    .in('empresa_id', idsOrdenados);

  if (miembros?.length) {
    const filas = (miembros as Array<{ usuario_id: string }>).map((m) => ({
      grupo_id: nuevoCanalId,
      usuario_id: m.usuario_id,
      rol: 'miembro',
    }));
    await supabase.from('miembros_grupo').insert(filas);
  }

  return nuevoCanalId;
}

export class AutorizacionEmpresaSupabaseRepository
  implements IAutorizacionEmpresaRepository
{
  async cargarSolicitudesPendientes(
    espacioId: string,
    empresaDestinoId: string,
  ): Promise<AutorizacionEmpresa[]> {
    const { data, error } = await supabase
      .from('autorizaciones_empresa')
      .select('*')
      .eq('espacio_id', espacioId)
      .eq('empresa_destino_id', empresaDestinoId)
      .eq('estado', 'pendiente')
      .order('creada_en', { ascending: false });

    if (error) {
      console.warn('Error cargando solicitudes pendientes:', error.message);
      return [];
    }

    const ahora = new Date().toISOString();
    return ((data || []) as AutorizacionEmpresa[]).filter(
      (a) => !a.expira_en || a.expira_en > ahora,
    );
  }

  async cargarSolicitudesEnviadas(
    espacioId: string,
    empresaOrigenId: string,
  ): Promise<AutorizacionEmpresa[]> {
    const { data, error } = await supabase
      .from('autorizaciones_empresa')
      .select('*')
      .eq('espacio_id', espacioId)
      .eq('empresa_origen_id', empresaOrigenId)
      .eq('estado', 'pendiente')
      .order('creada_en', { ascending: false });

    if (error) {
      console.warn('Error cargando solicitudes enviadas:', error.message);
      return [];
    }
    return (data || []) as AutorizacionEmpresa[];
  }

  async cargarAutorizacionesActivas(
    espacioId: string,
    empresaId: string,
  ): Promise<AutorizacionEmpresa[]> {
    const { data, error } = await supabase
      .from('autorizaciones_empresa')
      .select('*')
      .eq('espacio_id', espacioId)
      .eq('estado', 'aprobada')
      .or(`empresa_origen_id.eq.${empresaId},empresa_destino_id.eq.${empresaId}`)
      .order('actualizada_en', { ascending: false });

    if (error) {
      console.warn('Error cargando autorizaciones activas:', error.message);
      return [];
    }
    return (data || []) as AutorizacionEmpresa[];
  }

  async solicitarAcceso(input: SolicitarAccesoInput): Promise<string | null> {
    const { data, error } = await supabase
      .from('autorizaciones_empresa')
      .insert({
        espacio_id: input.espacioId,
        empresa_origen_id: input.empresaOrigenId,
        empresa_destino_id: input.empresaDestinoId,
        estado: 'pendiente',
        solicitada_por: input.usuarioId,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Error solicitando autorización:', error.message);
      return null;
    }

    const autorizacionId = (data as { id: string } | null)?.id ?? null;

    await registrarActividad({
      usuario_id: input.usuarioId,
      empresa_id: input.empresaOrigenId,
      espacio_id: input.espacioId,
      accion: 'solicitud_autorizacion_empresa_enviada',
      entidad: 'autorizaciones_empresa',
      entidad_id: autorizacionId,
      descripcion: 'Solicitud de autorización enviada',
      datos_extra: {
        empresa_destino_id: input.empresaDestinoId,
      },
    });

    const adminsDestino = await obtenerAdminsEmpresa({
      espacioId: input.espacioId,
      empresaId: input.empresaDestinoId,
    });

    await crearNotificaciones({
      usuarios: adminsDestino,
      espacioId: input.espacioId,
      tipo: 'solicitud_autorizacion_empresa',
      titulo: 'Nueva solicitud de acceso',
      mensaje: 'Una empresa solicita acceso a tu zona privada.',
      entidadTipo: 'autorizaciones_empresa',
      entidadId: autorizacionId,
      datosExtra: {
        empresa_origen_id: input.empresaOrigenId,
        empresa_destino_id: input.empresaDestinoId,
      },
    });

    return autorizacionId;
  }

  async aprobar(input: AprobarAutorizacionInput): Promise<boolean> {
    const { data: autorizacion } = await supabase
      .from('autorizaciones_empresa')
      .select('*')
      .eq('id', input.autorizacionId)
      .single();

    if (!autorizacion) return false;

    const aut = autorizacion as Record<string, string | null>;
    const canalCompartidoId =
      aut.canal_compartido_id ??
      (await crearCanalCompartidoTemporal({
        espacioId: input.espacioId,
        empresaOrigenId: aut.empresa_origen_id as string,
        empresaDestinoId: aut.empresa_destino_id as string,
      }));

    const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('autorizaciones_empresa')
      .update({
        estado: 'aprobada',
        aprobada_por: input.usuarioId,
        canal_compartido_id: canalCompartidoId,
        expira_en: expiraEn,
        actualizada_en: new Date().toISOString(),
      })
      .eq('id', input.autorizacionId);

    if (error) {
      console.warn('Error aprobando autorización:', error.message);
      return false;
    }

    await registrarActividad({
      usuario_id: input.usuarioId,
      empresa_id: input.empresaId,
      espacio_id: input.espacioId,
      accion: 'autorizacion_empresa_aprobada',
      entidad: 'autorizaciones_empresa',
      entidad_id: input.autorizacionId,
      descripcion: 'Autorización aprobada con canal compartido',
      datos_extra: {
        canal_compartido_id: canalCompartidoId,
        expira_en: expiraEn,
      },
    });

    if (aut.solicitada_por) {
      await crearNotificaciones({
        usuarios: [aut.solicitada_por as string],
        espacioId: input.espacioId,
        tipo: 'autorizacion_empresa_aprobada',
        titulo: 'Acceso aprobado',
        mensaje: 'Tu solicitud de acceso fue aprobada.',
        entidadTipo: 'autorizaciones_empresa',
        entidadId: input.autorizacionId,
        datosExtra: {
          canal_compartido_id: canalCompartidoId,
          expira_en: expiraEn,
        },
      });
    }

    return true;
  }

  async rechazar(input: ActualizarAutorizacionInput): Promise<boolean> {
    return this.actualizarEstado(input, 'rechazada');
  }

  async revocar(input: ActualizarAutorizacionInput): Promise<boolean> {
    return this.actualizarEstado(input, 'revocada');
  }

  private async actualizarEstado(
    input: ActualizarAutorizacionInput,
    estado: 'rechazada' | 'revocada',
  ): Promise<boolean> {
    const { data: autorizacion } = await supabase
      .from('autorizaciones_empresa')
      .select('solicitada_por, empresa_origen_id, empresa_destino_id, canal_compartido_id')
      .eq('id', input.autorizacionId)
      .single();

    const { error } = await supabase
      .from('autorizaciones_empresa')
      .update({
        estado,
        aprobada_por: null,
        expira_en: estado === 'revocada' ? new Date().toISOString() : undefined,
        actualizada_en: new Date().toISOString(),
      })
      .eq('id', input.autorizacionId);

    if (error) {
      console.warn('Error actualizando autorización:', error.message);
      return false;
    }

    await registrarActividad({
      usuario_id: input.usuarioId,
      empresa_id: input.empresaId,
      espacio_id: input.espacioId,
      accion: `autorizacion_empresa_${estado}`,
      entidad: 'autorizaciones_empresa',
      entidad_id: input.autorizacionId,
      descripcion: `Autorización actualizada a ${estado}`,
    });

    const aut = autorizacion as Record<string, string | null> | null;
    if (aut?.solicitada_por) {
      await crearNotificaciones({
        usuarios: [aut.solicitada_por as string],
        espacioId: input.espacioId,
        tipo: `autorizacion_empresa_${estado}`,
        titulo: estado === 'revocada' ? 'Acceso revocado' : 'Solicitud rechazada',
        mensaje:
          estado === 'revocada'
            ? 'El acceso entre empresas fue revocado.'
            : 'La solicitud de acceso fue rechazada.',
        entidadTipo: 'autorizaciones_empresa',
        entidadId: input.autorizacionId,
        datosExtra: {
          empresa_origen_id: aut.empresa_origen_id,
          empresa_destino_id: aut.empresa_destino_id,
          canal_compartido_id: aut.canal_compartido_id,
        },
      });
    }

    return true;
  }
}

export const autorizacionEmpresaRepository = new AutorizacionEmpresaSupabaseRepository();
