import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AccessToken, type VideoGrant } from 'https://esm.sh/livekit-server-sdk@2.0.0'

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'https://cowork-v3.vercel.app',
  'http://localhost:3000',
]

const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || 'devkey'
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || 'secret'
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || 'wss://your-livekit-server.livekit.cloud'

interface ModerationRequest {
  action?: 'mute_microphone'
  room_name?: string
  participant_identity?: string
  track_sid?: string
  token_invitacion?: string
}

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const resolveLivekitHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:'
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:'
    return parsed.origin
  } catch {
    return value.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body: ModerationRequest = await req.json()
    if (body.action !== 'mute_microphone' || !body.room_name || !body.participant_identity || !body.track_sid) {
      return new Response(JSON.stringify({ error: 'Solicitud de moderación inválida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: sala, error: salaError } = await supabase
      .from('salas_reunion')
      .select('id, espacio_id, livekit_room_name')
      .eq('livekit_room_name', body.room_name)
      .single()

    if (salaError || !sala) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada para moderación' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    let moderatorIdentity: string | null = null

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (!authError && user) {
        const { data: miembro } = await supabase
          .from('miembros_espacio')
          .select('id')
          .eq('espacio_id', sala.espacio_id)
          .eq('usuario_id', user.id)
          .single()

        if (miembro) {
          moderatorIdentity = `moderator_${user.id}`
        }
      }
    }

    if (!moderatorIdentity && body.token_invitacion) {
      const { data: invitacion } = await supabase
        .from('invitaciones_reunion')
        .select('id, sala_id, expira_en')
        .eq('token_unico', body.token_invitacion)
        .single()

      const invitationExpired = invitacion?.expira_en && new Date(invitacion.expira_en) < new Date()
      if (invitacion && invitacion.sala_id === sala.id && !invitationExpired) {
        moderatorIdentity = `moderator_guest_${invitacion.id.slice(0, 8)}`
      }
    }

    if (!moderatorIdentity) {
      return new Response(JSON.stringify({ error: 'No tienes permisos para moderar esta sala' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const moderationGrant: VideoGrant = {
      room: body.room_name,
      roomAdmin: true,
    }

    const accessToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: moderatorIdentity,
      name: 'Room Moderator',
      ttl: '5m',
    })
    accessToken.addGrant(moderationGrant)

    const roomServiceToken = await accessToken.toJwt()
    const livekitHttpUrl = resolveLivekitHttpUrl(LIVEKIT_URL)
    const moderationResponse = await fetch(`${livekitHttpUrl}/twirp/livekit.RoomService/MutePublishedTrack`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${roomServiceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        room: body.room_name,
        identity: body.participant_identity,
        track_sid: body.track_sid,
        muted: true,
      }),
    })

    if (!moderationResponse.ok) {
      const details = await moderationResponse.text()
      return new Response(JSON.stringify({ error: 'LiveKit rechazó la moderación', details }), {
        status: moderationResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado moderando participante'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
