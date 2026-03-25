/**
 * Edge Proxy Service
 * ==================
 * Cliente para la Edge Function `edge-proxy-posiciones`.
 * Proporciona acceso cacheado a posiciones de usuarios y zonas,
 * reduciendo queries directas a la base de datos.
 */

import { CONFIG_PUBLICA_APP } from './env';

const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
const EDGE_PROXY_URL = `${SUPABASE_URL}/functions/v1/edge-proxy-posiciones`;

export interface ZonaProxy {
  id: string;
  empresa_id: string | null;
  nombre_zona: string | null;
  posicion_x: number;
  posicion_y: number;
  ancho: number;
  alto: number;
  color: string | null;
  estado: string;
  es_comun: boolean;
}

export interface UsuarioProxy {
  usuario_id: string;
  rol: string;
  empresa_id: string | null;
  departamento_id: string | null;
  usuario: {
    id: string;
    nombre: string;
    apellido: string | null;
    avatar_url: string | null;
    estado_disponibilidad: string | null;
  } | null;
}

export interface EstadoEspacioProxy {
  zonas: ZonaProxy[];
  usuarios: UsuarioProxy[];
  fuente: { zonas: string; usuarios: string };
}

async function fetchProxy<T>(accessToken: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Edge proxy error (${res.status})`);
  }

  return res.json() as Promise<T>;
}

/**
 * Obtiene zonas activas de un espacio (cacheadas 2min en edge).
 */
export async function obtenerZonasProxy(
  accessToken: string,
  espacioId: string,
): Promise<{ zonas: ZonaProxy[]; fuente: string }> {
  return fetchProxy(accessToken, { accion: 'zonas_espacio', espacio_id: espacioId });
}

/**
 * Obtiene usuarios miembros por chunks (cacheados 10s en edge).
 */
export async function obtenerPosicionesChunkProxy(
  accessToken: string,
  espacioId: string,
  chunks: string[],
): Promise<{ usuarios: UsuarioProxy[]; fuente: string }> {
  return fetchProxy(accessToken, { accion: 'posiciones_chunk', espacio_id: espacioId, chunks });
}

/**
 * Obtiene estado completo del espacio (zonas + usuarios) en una sola llamada.
 */
export async function obtenerEstadoEspacioProxy(
  accessToken: string,
  espacioId: string,
): Promise<EstadoEspacioProxy> {
  return fetchProxy(accessToken, { accion: 'estado_espacio', espacio_id: espacioId });
}
