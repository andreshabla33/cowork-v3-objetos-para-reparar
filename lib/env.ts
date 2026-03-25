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

const usuarioTurn = normalizarTexto(env.VITE_TURN_USERNAME);
const credencialTurn = normalizarTexto(env.VITE_TURN_CREDENTIAL);

const SERVIDORES_TURN: RTCIceServer[] = [
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TCP), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TLS), usuarioTurn, credencialTurn),
  crearServidorTurn(normalizarTexto(env.VITE_TURN_URL_TLS_TCP), usuarioTurn, credencialTurn),
].filter((servidor): servidor is RTCIceServer => Boolean(servidor));

export const SERVIDORES_ICE_PUBLICOS: RTCIceServer[] = [...SERVIDORES_STUN, ...SERVIDORES_TURN];
