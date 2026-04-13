/**
 * @module lib/network/turnCredentialsService
 * Servicio cliente para obtener credenciales TURN dinámicas desde la Edge Function.
 *
 * Roadmap REMEDIATION-004:
 *  - Reemplaza VITE_TURN_USERNAME/CREDENTIAL estáticos en env.ts.
 *  - Las credenciales se solicitan on-demand con TTL de 5 minutos.
 *  - Se cachean localmente hasta 30 segundos antes de la expiración.
 *
 * Uso:
 *   const servers = await getTurnIceServers(supabaseClient)
 *   // Pasar a LiveKit ConnectOptions o RTCConfiguration
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../logger'

const log = logger.child('turn-credentials')

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TurnServer {
  urls: string
  username: string
  credential: string
}

interface TurnCredentialsResponse {
  iceServers: TurnServer[]
  ttl: number
}

// ─── Cache en memoria (evita flood de requests) ───────────────────────────────

interface CachedCredentials {
  iceServers: TurnServer[]
  expiresAt: number // timestamp ms
}

let _cache: CachedCredentials | null = null
const REFRESH_BUFFER_MS = 30_000 // Refrescar 30s antes de expirar

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Obtiene credenciales TURN dinámicas desde la Edge Function.
 * Usa caché en memoria hasta 30s antes de la expiración.
 *
 * @param supabase - Cliente Supabase autenticado (con sesión activa)
 * @returns Lista de RTCIceServer con credenciales temporales, o [] si falla.
 */
export async function getTurnIceServers(supabase: SupabaseClient): Promise<RTCIceServer[]> {
  const now = Date.now()

  // Retornar desde caché si las credenciales aún son válidas
  if (_cache && now < _cache.expiresAt - REFRESH_BUFFER_MS) {
    log.debug('Returning cached TURN credentials', {
      expiresInMs: _cache.expiresAt - now,
    })
    return _cache.iceServers
  }

  try {
    // Ensure session token is fresh before calling the Edge Function.
    // The turn-credentials function has verify_jwt=true at the Supabase gateway level,
    // which rejects expired tokens with 401 BEFORE the function code runs.
    // getSession() triggers an automatic refresh if the access_token has expired.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      log.warn('No active session for TURN credentials', {
        error: sessionError?.message ?? 'session is null',
      })
      return []
    }

    const { data, error } = await supabase.functions.invoke<TurnCredentialsResponse>(
      'turn-credentials',
      { method: 'POST' },
    )

    if (error) {
      log.warn('Failed to fetch TURN credentials', { error: error.message })
      return []
    }

    if (!data?.iceServers?.length) {
      log.warn('Empty TURN ice servers response')
      return []
    }

    // Cachear con TTL del servidor
    _cache = {
      iceServers: data.iceServers,
      expiresAt: now + data.ttl * 1000,
    }

    log.info('TURN credentials refreshed', {
      serverCount: data.iceServers.length,
      ttlSeconds: data.ttl,
    })

    return data.iceServers
  } catch (err: unknown) {
    log.error('Unexpected error fetching TURN credentials', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Invalida el caché manualmente (p. ej., al detectar conexión fallida).
 */
export function invalidateTurnCredentialsCache(): void {
  _cache = null
}
