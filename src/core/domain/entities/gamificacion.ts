/**
 * @module domain/entities/gamificacion
 * @description Entidades + lógica pura del sistema de gamificación.
 *
 * Clean Architecture: capa Domain. Sin dependencias externas — TS puro.
 * Las queries Supabase viven en `IGamificacionRepository` (port) +
 * `GamificacionSupabaseRepository` (adapter).
 *
 * Tablas relacionadas (referencia): `gamificacion_usuarios`,
 * `gamificacion_misiones`, `gamificacion_logros`,
 * `gamificacion_logros_usuario`, `gamificacion_items`.
 */

// ─── Constantes XP ────────────────────────────────────────────────────────────

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

// ─── Fórmulas de nivel (puras) ────────────────────────────────────────────────

/**
 * XP necesario para alcanzar un nivel específico.
 * Fórmula: 100 * nivel^1.5
 */
export const xpParaNivel = (nivel: number): number =>
  Math.floor(100 * Math.pow(nivel, 1.5));

/**
 * Calcula nivel actual + progreso a partir del XP total acumulado.
 *
 * Protección contra NaN/Infinity: retorna nivel 1 con valores seguros si
 * el input no es un número finito o es negativo (evita while-true infinito
 * que causaría freeze del navegador).
 */
export const calcularNivel = (
  xpTotal: number,
): { nivel: number; xpActual: number; xpSiguiente: number; progreso: number } => {
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

// ─── DTOs / Entities ──────────────────────────────────────────────────────────

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
