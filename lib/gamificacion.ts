/**
 * Sistema de gamificación — XP, niveles, misiones, logros
 * Tablas BD: gamificacion_usuarios, gamificacion_misiones, gamificacion_logros, gamificacion_logros_usuario, gamificacion_items
 */
import { supabase } from './supabase';

// ========== CONSTANTES DE XP ==========
export const XP_POR_ACCION = {
  login_diario: 10,
  mensaje_chat: 2,
  reunion_asistida: 25,
  reunion_organizada: 40,
  proximidad_30s: 5,
  emote_enviado: 3,
  mision_completada: 0, // varía por misión
  saludo_wave: 5,
  interaccion_social: 5,
  teleport: 1,
} as const;

/**
 * Tipo seguro para las claves de acciones de XP.
 * Usar en lugar de `string` en firmas de grantXP para satisfacer
 * strictFunctionTypes (REMEDIATION-TS2).
 */
export type AccionXP = keyof typeof XP_POR_ACCION;

// Fórmula de nivel: XP necesario para nivel N = 100 * N^1.5
export const xpParaNivel = (nivel: number): number => Math.floor(100 * Math.pow(nivel, 1.5));

export const calcularNivel = (xpTotal: number): { nivel: number; xpActual: number; xpSiguiente: number; progreso: number } => {
  // Protección contra NaN/Infinity que causaría while(true) infinito → freeze del navegador
  if (!Number.isFinite(xpTotal) || xpTotal < 0) {
    return { nivel: 1, xpActual: 0, xpSiguiente: xpParaNivel(1), progreso: 0 };
  }
  let nivel = 1;
  let xpAcumulado = 0;
  while (true) {
    const xpNecesario = xpParaNivel(nivel);
    if (xpAcumulado + xpNecesario > xpTotal) {
      const xpEnNivel = xpTotal - xpAcumulado;
      return {
        nivel,
        xpActual: xpEnNivel,
        xpSiguiente: xpNecesario,
        progreso: xpEnNivel / xpNecesario,
      };
    }
    xpAcumulado += xpNecesario;
    nivel++;
  }
};

// ========== TIPOS ==========
export interface PerfilGamificacion {
  id: string;
  usuario_id: string;
  espacio_id: string;
  xp_total: number;
  nivel: number;
  racha_dias: number;
  racha_max: number;
  ultimo_login: string | null;
  titulo_activo: string | null;
  items_desbloqueados: string[];
  estadisticas: Record<string, number>;
}

export interface Mision {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  objetivo_cantidad: number;
  progreso_actual: number;
  xp_recompensa: number;
  estado: string;
  fecha: string;
  completada_en: string | null;
}

export interface Logro {
  id: string;
  clave: string;
  titulo: string;
  descripcion: string | null;
  icono: string | null;
  tipo: string;
  xp_recompensa: number;
}

export interface LogroDesbloqueado {
  logro_id: string;
  desbloqueado_en: string;
  logro: Logro;
}

export interface ItemCosmetico {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  nivel_requerido: number;
  icono: string | null;
}

// ========== QUERIES ==========

/** Obtener o crear perfil de gamificación del usuario */
export async function obtenerPerfilGamificacion(usuarioId: string, espacioId: string): Promise<PerfilGamificacion | null> {
  const { data, error } = await supabase
    .from('gamificacion_usuarios')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('espacio_id', espacioId)
    .single();

  if (error && error.code === 'PGRST116') {
    // No existe → crear
    const { data: nuevo, error: errCreate } = await supabase
      .from('gamificacion_usuarios')
      .insert({ usuario_id: usuarioId, espacio_id: espacioId })
      .select()
      .single();
    if (errCreate) { console.error('Error creando perfil gamificación:', errCreate); return null; }
    return nuevo;
  }
  if (error) { console.error('Error obteniendo perfil gamificación:', error); return null; }
  return data;
}

/** Otorgar XP al usuario por una acción */
export async function otorgarXP(
  usuarioId: string,
  espacioId: string,
  cantidad: number,
  accion: string
): Promise<{ xp_total: number; nivel: number; subioDeMivel: boolean } | null> {
  const perfil = await obtenerPerfilGamificacion(usuarioId, espacioId);
  if (!perfil) return null;

  const cantidadSegura = Number.isFinite(cantidad) ? cantidad : 0;
  const nuevoXP = perfil.xp_total + cantidadSegura;
  const nivelAnterior = perfil.nivel;
  const { nivel: nuevoNivel } = calcularNivel(nuevoXP);

  // Actualizar estadísticas
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

  if (error) { console.error('Error otorgando XP:', error); return null; }

  return { xp_total: nuevoXP, nivel: nuevoNivel, subioDeMivel: nuevoNivel > nivelAnterior };
}

/** Registrar login diario y actualizar racha */
export async function registrarLoginDiario(usuarioId: string, espacioId: string): Promise<{ racha: number; xpGanado: number } | null> {
  const perfil = await obtenerPerfilGamificacion(usuarioId, espacioId);
  if (!perfil) return null;

  const hoy = new Date().toISOString().split('T')[0];
  if (perfil.ultimo_login === hoy) return { racha: perfil.racha_dias, xpGanado: 0 };

  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const nuevaRacha = perfil.ultimo_login === ayer ? perfil.racha_dias + 1 : 1;
  const rachaMax = Math.max(perfil.racha_max, nuevaRacha);

  // Bonus XP por racha: base 10 + 2 por cada día de racha (cap 50)
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

  if (error) { console.error('Error registrando login diario:', error); return null; }
  return { racha: nuevaRacha, xpGanado: xpLogin };
}

/** Obtener misiones del día */
export async function obtenerMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]> {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('gamificacion_misiones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('espacio_id', espacioId)
    .eq('fecha', hoy)
    .order('created_at');

  if (error) { console.error('Error obteniendo misiones:', error); return []; }
  return data || [];
}

/** Avanzar progreso de una misión */
export async function avanzarMision(misionId: string, incremento: number = 1): Promise<Mision | null> {
  // Obtener misión actual
  const { data: mision, error: errGet } = await supabase
    .from('gamificacion_misiones')
    .select('*')
    .eq('id', misionId)
    .single();

  if (errGet || !mision) return null;
  if (mision.estado !== 'activa') return mision;

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

  if (error) { console.error('Error avanzando misión:', error); return null; }
  return data;
}

/** Generar misiones diarias para un usuario (si no tiene del día) */
export async function generarMisionesDiarias(usuarioId: string, espacioId: string): Promise<Mision[]> {
  const existentes = await obtenerMisionesDiarias(usuarioId, espacioId);
  if (existentes.length > 0) return existentes;

  // Plantillas de misiones
  const plantillas = [
    { titulo: 'Saluda a un compañero', descripcion: 'Usa la animación wave cerca de alguien', tipo: 'social', objetivo_cantidad: 1, xp_recompensa: 30 },
    { titulo: 'Envía 5 mensajes', descripcion: 'Participa en el chat del espacio', tipo: 'chat', objetivo_cantidad: 5, xp_recompensa: 40 },
    { titulo: 'Asiste a una reunión', descripcion: 'Únete a una videollamada', tipo: 'reunion', objetivo_cantidad: 1, xp_recompensa: 50 },
    { titulo: 'Explora 3 zonas', descripcion: 'Visita diferentes áreas del espacio', tipo: 'presencia', objetivo_cantidad: 3, xp_recompensa: 35 },
    { titulo: 'Baila con tu avatar', descripcion: 'Usa la animación de baile', tipo: 'social', objetivo_cantidad: 1, xp_recompensa: 20 },
    { titulo: 'Pasa 10 min cerca de alguien', descripcion: 'Trabaja en proximidad con un compañero', tipo: 'presencia', objetivo_cantidad: 10, xp_recompensa: 45 },
  ];

  // Seleccionar 3 misiones aleatorias
  const seleccionadas = plantillas.sort(() => Math.random() - 0.5).slice(0, 3);
  const hoy = new Date().toISOString().split('T')[0];

  const inserts = seleccionadas.map(m => ({
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

  if (error) { console.error('Error generando misiones:', error); return []; }
  return data || [];
}

/** Obtener todos los logros del catálogo */
export async function obtenerCatalogoLogros(): Promise<Logro[]> {
  const { data, error } = await supabase
    .from('gamificacion_logros')
    .select('*')
    .order('xp_recompensa');
  if (error) { console.error('Error obteniendo logros:', error); return []; }
  return data || [];
}

/** Obtener logros desbloqueados por usuario */
export async function obtenerLogrosUsuario(usuarioId: string, espacioId: string): Promise<LogroDesbloqueado[]> {
  const { data, error } = await supabase
    .from('gamificacion_logros_usuario')
    .select('logro_id, desbloqueado_en, logro:gamificacion_logros(*)')
    .eq('usuario_id', usuarioId)
    .eq('espacio_id', espacioId);
  if (error) { console.error('Error obteniendo logros usuario:', error); return []; }
  return (data || []).map((d: any) => ({ logro_id: d.logro_id, desbloqueado_en: d.desbloqueado_en, logro: d.logro }));
}

/** Desbloquear un logro */
export async function desbloquearLogro(usuarioId: string, espacioId: string, logroId: string): Promise<boolean> {
  const { error } = await supabase
    .from('gamificacion_logros_usuario')
    .insert({ usuario_id: usuarioId, logro_id: logroId, espacio_id: espacioId });
  if (error && error.code !== '23505') { // 23505 = unique violation (ya desbloqueado)
    console.error('Error desbloqueando logro:', error);
    return false;
  }
  return true;
}

/** Obtener items cosméticos disponibles */
export async function obtenerItemsCosmeticos(): Promise<ItemCosmetico[]> {
  const { data, error } = await supabase
    .from('gamificacion_items')
    .select('*')
    .order('nivel_requerido');
  if (error) { console.error('Error obteniendo items:', error); return []; }
  return data || [];
}
