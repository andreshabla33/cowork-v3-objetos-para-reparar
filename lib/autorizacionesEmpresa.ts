import { supabase } from './supabase';
import type { AutorizacionEmpresa, ZonaEmpresa } from '../types';
import type { ConfiguracionZonaEmpresa } from '../src/core/domain/entities/cerramientosZona';
import { zonaEmpresaRepository } from '../src/core/infrastructure/adapters/ZonaEmpresaSupabaseRepository';
import type {
  ActualizarEstadoZonaInput,
  AplicarLayoutInput,
  EliminarZonaInput,
  GuardarZonaInput,
} from '../src/core/domain/ports/IZonaEmpresaRepository';

const registrarActividad = async (payload: {
  usuario_id: string | null;
  empresa_id: string | null;
  espacio_id: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: string | null;
  descripcion?: string | null;
  datos_extra?: Record<string, unknown>;
}) => {
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
};

// ── Zona CRUD wrappers (delegan a ZonaEmpresaSupabaseRepository) ──────────────
// Mantenidos como funciones exportadas para no romper consumidores legacy
// (SettingsZona, AdminZoneHUD, useNotifications). Migración progresiva: nuevos
// consumers deben importar `zonaEmpresaRepository` directamente desde
// `@/src/core/infrastructure/adapters/ZonaEmpresaSupabaseRepository`.

export const cargarZonasEmpresa = (espacioId: string): Promise<ZonaEmpresa[]> =>
  zonaEmpresaRepository.cargarZonas(espacioId);

export const cargarZonaEmpresaActual = (
  espacioId: string,
  empresaId: string,
): Promise<ZonaEmpresa | null> => zonaEmpresaRepository.cargarZonaActual(espacioId, empresaId);

export const actualizarEstadoZonaEmpresa = (payload: ActualizarEstadoZonaInput): Promise<boolean> =>
  zonaEmpresaRepository.actualizarEstado(payload);

export const eliminarZonaEmpresa = (payload: EliminarZonaInput): Promise<boolean> =>
  zonaEmpresaRepository.eliminar(payload);

export const guardarZonaEmpresa = (
  payload: GuardarZonaInput & { configuracion?: ConfiguracionZonaEmpresa | null },
): Promise<ZonaEmpresa | null> => zonaEmpresaRepository.guardar(payload);

export const aplicarLayoutMasivo = (payload: AplicarLayoutInput): Promise<boolean> =>
  zonaEmpresaRepository.aplicarLayout(payload);

export const cargarSolicitudesPendientes = async (
  espacioId: string,
  empresaDestinoId: string
): Promise<AutorizacionEmpresa[]> => {
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
  const activas = (data || []) as AutorizacionEmpresa[];
  return activas.filter((autorizacion) => !autorizacion.expira_en || autorizacion.expira_en > ahora);
};

const crearNotificaciones = async (payload: {
  usuarios: string[];
  espacioId: string;
  tipo: string;
  titulo: string;
  mensaje?: string | null;
  entidadTipo?: string | null;
  entidadId?: string | null;
  datosExtra?: Record<string, unknown>;
}) => {
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
  if (error) {
    console.warn('Error creando notificaciones:', error.message);
  }
};

const obtenerAdminsEmpresa = async (payload: {
  espacioId: string;
  empresaId: string;
}): Promise<string[]> => {
  const { data, error } = await supabase
    .from('miembros_espacio')
    .select('usuario_id')
    .eq('espacio_id', payload.espacioId)
    .eq('empresa_id', payload.empresaId)
    .in('rol', ['admin', 'super_admin']);

  if (error) {
    console.warn('Error obteniendo admins:', error.message);
    return [];
  }

  return (data || []).map((registro) => registro.usuario_id);
};

const crearCanalCompartidoTemporal = async (payload: {
  espacioId: string;
  empresaOrigenId: string;
  empresaDestinoId: string;
}): Promise<string | null> => {
  const idsOrdenados = [payload.empresaOrigenId, payload.empresaDestinoId].sort();
  const claveCanal = `compartido:${idsOrdenados.join(':')}`;

  const { data: canalExistente } = await supabase
    .from('grupos_chat')
    .select('id')
    .eq('espacio_id', payload.espacioId)
    .eq('descripcion', claveCanal)
    .maybeSingle();

  if (canalExistente?.id) return canalExistente.id;

  const { data: empresasData } = await supabase
    .from('empresas')
    .select('id, nombre')
    .in('id', idsOrdenados);

  const nombreA = empresasData?.find((empresa) => empresa.id === idsOrdenados[0])?.nombre || 'Empresa A';
  const nombreB = empresasData?.find((empresa) => empresa.id === idsOrdenados[1])?.nombre || 'Empresa B';
  const nombreCanal = `Compartido · ${nombreA} + ${nombreB}`;

  const { data: nuevoCanal, error: canalError } = await supabase
    .from('grupos_chat')
    .insert({
      espacio_id: payload.espacioId,
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

  const { data: miembros } = await supabase
    .from('miembros_espacio')
    .select('usuario_id')
    .eq('espacio_id', payload.espacioId)
    .in('empresa_id', idsOrdenados);

  if (miembros?.length) {
    await supabase.from('miembros_grupo').insert(
      miembros.map((miembro) => ({
        grupo_id: nuevoCanal.id,
        usuario_id: miembro.usuario_id,
        rol: 'miembro',
      }))
    );
  }

  return nuevoCanal.id;
};

export const cargarSolicitudesEnviadas = async (
  espacioId: string,
  empresaOrigenId: string
): Promise<AutorizacionEmpresa[]> => {
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
};

export const cargarAutorizacionesActivas = async (
  espacioId: string,
  empresaId: string
): Promise<AutorizacionEmpresa[]> => {
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
};

export const solicitarAccesoEmpresa = async (payload: {
  espacioId: string;
  empresaOrigenId: string;
  empresaDestinoId: string;
  usuarioId: string;
}): Promise<string | null> => {
  const { data, error } = await supabase
    .from('autorizaciones_empresa')
    .insert({
      espacio_id: payload.espacioId,
      empresa_origen_id: payload.empresaOrigenId,
      empresa_destino_id: payload.empresaDestinoId,
      estado: 'pendiente',
      solicitada_por: payload.usuarioId,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('Error solicitando autorización:', error.message);
    return null;
  }

  await registrarActividad({
    usuario_id: payload.usuarioId,
    empresa_id: payload.empresaOrigenId,
    espacio_id: payload.espacioId,
    accion: 'solicitud_autorizacion_empresa_enviada',
    entidad: 'autorizaciones_empresa',
    entidad_id: data?.id ?? null,
    descripcion: 'Solicitud de autorización enviada',
    datos_extra: {
      empresa_destino_id: payload.empresaDestinoId,
    },
  });

  const adminsDestino = await obtenerAdminsEmpresa({
    espacioId: payload.espacioId,
    empresaId: payload.empresaDestinoId,
  });

  await crearNotificaciones({
    usuarios: adminsDestino,
    espacioId: payload.espacioId,
    tipo: 'solicitud_autorizacion_empresa',
    titulo: 'Nueva solicitud de acceso',
    mensaje: 'Una empresa solicita acceso a tu zona privada.',
    entidadTipo: 'autorizaciones_empresa',
    entidadId: data?.id ?? null,
    datosExtra: {
      empresa_origen_id: payload.empresaOrigenId,
      empresa_destino_id: payload.empresaDestinoId,
    },
  });

  return data?.id ?? null;
};

const actualizarAutorizacion = async (payload: {
  autorizacionId: string;
  estado: 'rechazada' | 'revocada';
  usuarioId: string;
  empresaId: string;
  espacioId: string;
}): Promise<boolean> => {
  const { data: autorizacion } = await supabase
    .from('autorizaciones_empresa')
    .select('solicitada_por, empresa_origen_id, empresa_destino_id, canal_compartido_id')
    .eq('id', payload.autorizacionId)
    .single();

  const { error } = await supabase
    .from('autorizaciones_empresa')
    .update({
      estado: payload.estado,
      aprobada_por: null,
      expira_en: payload.estado === 'revocada' ? new Date().toISOString() : undefined,
      actualizada_en: new Date().toISOString(),
    })
    .eq('id', payload.autorizacionId);

  if (error) {
    console.warn('Error actualizando autorización:', error.message);
    return false;
  }

  await registrarActividad({
    usuario_id: payload.usuarioId,
    empresa_id: payload.empresaId,
    espacio_id: payload.espacioId,
    accion: `autorizacion_empresa_${payload.estado}`,
    entidad: 'autorizaciones_empresa',
    entidad_id: payload.autorizacionId,
    descripcion: `Autorización actualizada a ${payload.estado}`,
  });

  if (autorizacion?.solicitada_por) {
    await crearNotificaciones({
      usuarios: [autorizacion.solicitada_por],
      espacioId: payload.espacioId,
      tipo: `autorizacion_empresa_${payload.estado}`,
      titulo: payload.estado === 'revocada' ? 'Acceso revocado' : 'Solicitud rechazada',
      mensaje: payload.estado === 'revocada'
        ? 'El acceso entre empresas fue revocado.'
        : 'La solicitud de acceso fue rechazada.',
      entidadTipo: 'autorizaciones_empresa',
      entidadId: payload.autorizacionId,
      datosExtra: {
        empresa_origen_id: autorizacion.empresa_origen_id,
        empresa_destino_id: autorizacion.empresa_destino_id,
        canal_compartido_id: autorizacion.canal_compartido_id,
      },
    });
  }

  return true;
};

export const aprobarAutorizacionEmpresa = async (payload: {
  autorizacionId: string;
  usuarioId: string;
  empresaId: string;
  espacioId: string;
}): Promise<boolean> => {
  const { data: autorizacion } = await supabase
    .from('autorizaciones_empresa')
    .select('*')
    .eq('id', payload.autorizacionId)
    .single();

  if (!autorizacion) return false;

  const canalCompartidoId = autorizacion.canal_compartido_id
    || await crearCanalCompartidoTemporal({
      espacioId: payload.espacioId,
      empresaOrigenId: autorizacion.empresa_origen_id,
      empresaDestinoId: autorizacion.empresa_destino_id,
    });

  const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('autorizaciones_empresa')
    .update({
      estado: 'aprobada',
      aprobada_por: payload.usuarioId,
      canal_compartido_id: canalCompartidoId,
      expira_en: expiraEn,
      actualizada_en: new Date().toISOString(),
    })
    .eq('id', payload.autorizacionId);

  if (error) {
    console.warn('Error aprobando autorización:', error.message);
    return false;
  }

  await registrarActividad({
    usuario_id: payload.usuarioId,
    empresa_id: payload.empresaId,
    espacio_id: payload.espacioId,
    accion: 'autorizacion_empresa_aprobada',
    entidad: 'autorizaciones_empresa',
    entidad_id: payload.autorizacionId,
    descripcion: 'Autorización aprobada con canal compartido',
    datos_extra: {
      canal_compartido_id: canalCompartidoId,
      expira_en: expiraEn,
    },
  });

  if (autorizacion.solicitada_por) {
    await crearNotificaciones({
      usuarios: [autorizacion.solicitada_por],
      espacioId: payload.espacioId,
      tipo: 'autorizacion_empresa_aprobada',
      titulo: 'Acceso aprobado',
      mensaje: 'Tu solicitud de acceso fue aprobada.',
      entidadTipo: 'autorizaciones_empresa',
      entidadId: payload.autorizacionId,
      datosExtra: {
        canal_compartido_id: canalCompartidoId,
        expira_en: expiraEn,
      },
    });
  }

  return true;
};

export const rechazarAutorizacionEmpresa = (payload: {
  autorizacionId: string;
  usuarioId: string;
  empresaId: string;
  espacioId: string;
}) => actualizarAutorizacion({ ...payload, estado: 'rechazada' });

export const revocarAutorizacionEmpresa = (payload: {
  autorizacionId: string;
  usuarioId: string;
  empresaId: string;
  espacioId: string;
}) => actualizarAutorizacion({ ...payload, estado: 'revocada' });
