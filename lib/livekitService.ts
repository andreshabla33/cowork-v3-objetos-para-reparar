import { detectBestRegion, getCachedRegion } from './regionDetector';
import { CONFIG_PUBLICA_APP } from './env';
import { logger } from './logger';

const log = logger.child('livekit-service');
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

function isLivekitTokenResponse(data: unknown): data is LivekitTokenResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.token === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.sala_nombre === 'string' &&
    typeof obj.participante_id === 'string'
  );
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

  const data: unknown = await response.json();
  if (!response.ok) {
    const errorMsg = (typeof data === 'object' && data !== null && 'error' in data)
      ? String((data as Record<string, unknown>).error)
      : 'Error obteniendo token de LiveKit';
    log.error('Token request failed', { status: response.status, error: errorMsg, roomName: payload.roomName });
    throw new Error(errorMsg);
  }

  if (!isLivekitTokenResponse(data)) {
    log.error('Invalid token response shape', { roomName: payload.roomName });
    throw new Error('Respuesta del servidor LiveKit inválida');
  }

  log.info('Token obtained', { roomName: payload.roomName, region: data.region });
  return data;
};

export const crearSalaLivekitPorEspacio = (espacioId: string): string => {
  return `espacio_${espacioId}`;
};
