/**
 * Edge Function: turn-credentials
 * Genera credenciales TURN temporales con TTL corto (5 minutos).
 *
 * Roadmap REMEDIATION-004:
 *  - Elimina VITE_TURN_USERNAME y VITE_TURN_CREDENTIAL del cliente.
 *  - Las credenciales nunca viajan en el bundle JS del cliente.
 *  - El cliente las solicita on-demand antes de conectar a LiveKit.
 *
 * Seguridad:
 *  - Requiere JWT de Supabase (Authorization: Bearer <token>)
 *  - Genera credenciales temporales usando HMAC-SHA1 (Coturn estándar)
 *  - TTL: 5 minutos (300 segundos)
 *
 * Vars de entorno requeridas (Supabase secrets):
 *  - TURN_SECRET     → Shared secret con el servidor TURN (Coturn)
 *  - TURN_URL        → wss://turn.example.com:443
 *  - TURN_URL_TCP    → turn:turn.example.com:3478?transport=tcp  (opcional)
 *  - TURN_URL_TLS    → turns:turn.example.com:5349               (opcional)
 *
 * @see https://supabase.com/docs/guides/functions
 * @see https://www.rfc-editor.org/rfc/rfc8489 (TURN credentials)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'https://cowork-v3.vercel.app',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

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

// ─── Generación de credenciales temporales HMAC-SHA1 (Coturn estándar) ───────

/**
 * Genera credenciales temporales compatibles con Coturn y Twilio NTS.
 * username = `${timestamp}:${userId}`
 * credential = base64(HMAC-SHA1(secret, username))
 */
async function generateTimedCredentials(
  secret: string,
  userId: string,
  ttlSeconds: number,
): Promise<{ username: string; credential: string }> {
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds
  const username = `${timestamp}:${userId}`

  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const msgData = encoder.encode(username)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)))

  return { username, credential }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Verificar JWT de Supabase ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Generar credenciales ─────────────────────────────────────────────────
  const turnSecret = Deno.env.get('TURN_SECRET')
  if (!turnSecret) {
    console.error('[turn-credentials] TURN_SECRET not configured')
    return new Response(JSON.stringify({ error: 'TURN not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const TTL_SECONDS = 300 // 5 minutos
  const { username, credential } = await generateTimedCredentials(
    turnSecret,
    user.id,
    TTL_SECONDS,
  )

  // ── Construir lista de ICE servers ───────────────────────────────────────
  const turnUrl     = Deno.env.get('TURN_URL')
  const turnUrlTcp  = Deno.env.get('TURN_URL_TCP')
  const turnUrlTls  = Deno.env.get('TURN_URL_TLS')
  const turnUrlTlsTcp = Deno.env.get('TURN_URL_TLS_TCP')

  const iceServers: TurnServer[] = []

  const addServer = (url: string | undefined) => {
    if (url) iceServers.push({ urls: url, username, credential })
  }

  addServer(turnUrl)
  addServer(turnUrlTcp)
  addServer(turnUrlTls)
  addServer(turnUrlTlsTcp)

  if (iceServers.length === 0) {
    return new Response(JSON.stringify({ error: 'No TURN URLs configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const response: TurnCredentialsResponse = {
    iceServers,
    ttl: TTL_SECONDS,
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
