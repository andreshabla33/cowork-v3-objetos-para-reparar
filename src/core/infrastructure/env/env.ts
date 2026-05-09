const env = import.meta.env;

function normalizarTexto(valor: string | undefined | null): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

function obtenerUrlApp(): string {
  const urlConfigurada = normalizarTexto(env.VITE_APP_URL);
  if (urlConfigurada) return urlConfigurada;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
}

function obtenerTextoRequerido(valor: string | undefined | null, nombre: string): string {
  const texto = normalizarTexto(valor);
  if (!texto) {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return texto;
}

function crearServidorTurn(url: string | null, usuario: string | null, credencial: string | null): RTCIceServer | null {
  if (!url || !usuario || !credencial) return null;
  return {
    urls: url,
    username: usuario,
    credential: credencial,
  };
}

export const CONFIG_PUBLICA_APP = {
  urlApp: obtenerUrlApp(),
  urlSupabase: obtenerTextoRequerido(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  claveAnonSupabase: obtenerTextoRequerido(env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY'),
} as const;

const SERVIDORES_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * @deprecated REMEDIATION-004b (2026-03-30):
 * Las credenciales TURN estáticas (VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL)
 * han sido reemplazadas por credenciales dinámicas con TTL 5 min generadas
 * por la Edge Function `turn-credentials`.
 *
 * Flujo nuevo:
 *   getTurnIceServers(supabase) → Edge Function → HMAC-SHA1 → RTCIceServer[]
 *
 * Una vez que `TURN_SECRET` esté configurado en Supabase secrets y todos los
 * consumers hayan migrado al `iceServerProvider` del SpaceRealtimeCoordinator,
 * eliminar: VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL, VITE_TURN_URL, VITE_TURN_URL_TCP,
 *           VITE_TURN_URL_TLS, VITE_TURN_URL_TLS_TCP del .env y esta sección.
 *
 * @see lib/network/turnCredentialsService.ts
 * @see supabase/functions/turn-credentials/index.ts
 */
const usuarioTurn = normalizarTexto(env.VITE_TURN_USERNAME);
const credencialTurn = normalizarTexto(env.VITE_TURN_CREDENTIAL);

const SERVIDORES_TURN_ESTATICOS: RTCIceServer[] = [
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TCP), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TLS), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TLS_TCP), usuarioTurn, credencialTurn),
].filter((servidor): servidor is RTCIceServer => Boolean(servidor));

/**
 * ICE servers públicos (STUN) + TURN estáticos como fallback.
 * @deprecated Para nuevas conexiones usar getTurnIceServers() con iceServerProvider.
 */
export const SERVIDORES_ICE_PUBLICOS: RTCIceServer[] = [...SERVIDORES_STUN, ...SERVIDORES_TURN_ESTATICOS];

/** Solo STUN servers (sin credenciales). Usar combinado con getTurnIceServers(). */
export const SERVIDORES_STUN_PUBLICOS: RTCIceServer[] = SERVIDORES_STUN;
