import { detectBestRegion, getCachedRegion } from './regionDetector';

import { CONFIG_PUBLICA_APP } from './env';

const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;

interface LivekitTokenResponse {
  token: string;
  url: string;
  sala_nombre: string;
  participante_id: string;
  region?: string;
}

interface LivekitTokenRequest {
  roomName: string;
  espacioId: string;
  accessToken: string;
  empresaId?: string | null;
  departamentoId?: string | null;
  puedePublicar?: boolean;
  puedeSuscribir?: boolean;
  puedePublicarDatos?: boolean;
  region?: string;
}

export const obtenerTokenLivekitEspacio = async (payload: LivekitTokenRequest): Promise<LivekitTokenResponse> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${payload.accessToken}`,
  };

  const regionPreferida = payload.region ?? getCachedRegion() ?? undefined;
  if (!regionPreferida) {
    detectBestRegion().catch(() => {});
  }

  const body = {
    room_name: payload.roomName,
    espacio_id: payload.espacioId,
    empresa_id: payload.empresaId ?? null,
    departamento_id: payload.departamentoId ?? null,
    puede_publicar: payload.puedePublicar ?? true,
    puede_suscribir: payload.puedeSuscribir ?? true,
    puede_publicar_datos: payload.puedePublicarDatos ?? true,
    region: regionPreferida ?? null,
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/livekit-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Error obteniendo token de LiveKit');
  }

  return data as LivekitTokenResponse;
};

export const crearSalaLivekitPorEspacio = (espacioId: string): string => {
  return `espacio_${espacioId}`;
};

/** @deprecated Usar crearSalaLivekitPorEspacio — arquitectura de 1 sala por espacio */
export const crearSalaLivekitPorChunk = (espacioId: string, _chunkClave: string): string => {
  return crearSalaLivekitPorEspacio(espacioId);
};
