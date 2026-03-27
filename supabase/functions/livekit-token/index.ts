import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AccessToken, VideoGrant } from 'https://esm.sh/livekit-server-sdk@2.0.0'

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'https://cowork-v3.vercel.app',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || 'devkey'
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || 'secret'
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || 'wss://your-livekit-server.livekit.cloud'

interface SolicitudToken {
  room_name?: string
  espacio_id?: string
  empresa_id?: string | null
  departamento_id?: string | null
  sala_id?: string
  token_invitacion?: string
  nombre_invitado?: string
  puede_publicar?: boolean
  puede_suscribir?: boolean
  puede_publicar_datos?: boolean
}

interface RespuestaToken {
  token: string
  url: string
  sala_nombre: string
  participante_id: string
  permisos: VideoGrant
}

const esUuid = (value?: string | null) => {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

const hashToken = async (rawToken: string): Promise<string> => {
  const tokenBytes = new TextEncoder().encode(rawToken)
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const normalizarNombreInvitado = (nombre?: string | null) => {
  const limpio = nombre?.trim()
  if (limpio) return limpio
  return `Invitado ${Math.random().toString(36).slice(2, 6).toUpperCase()}`
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

    const body: SolicitudToken = await req.json()

    let participantIdentity: string
    let participantName: string
    let roomName: string
    let canPublish = body.puede_publicar ?? true
    let canSubscribe = body.puede_suscribir ?? true
    let canPublishData = body.puede_publicar_datos ?? true
    let isHost = false
    let roomCreate = false
    let participantMetadata: string | undefined
    let empresaIdRegistro: string | null = null
    let espacioIdRegistro: string | null = null
    let tipoSolicitud: 'espacio_3d' | 'reunion' | 'invitado' = 'reunion'

    const registrarActividad = async (payload: {
      usuario_id: string | null
      empresa_id: string | null
      espacio_id: string | null
      accion: string
      entidad?: string | null
      entidad_id?: string | null
      descripcion?: string | null
      datos_extra?: Record<string, unknown>
    }) => {
      try {
        await supabase
          .from('actividades_log')
          .insert({
            usuario_id: payload.usuario_id,
            empresa_id: payload.empresa_id,
            espacio_id: payload.espacio_id,
            accion: payload.accion,
            entidad: payload.entidad ?? null,
            entidad_id: payload.entidad_id ?? null,
            descripcion: payload.descripcion ?? null,
            datos_extra: payload.datos_extra ?? {},
          })
      } catch (error) {
        console.warn('No se pudo registrar actividad:', error)
      }
    }

    if (body.room_name && body.espacio_id) {
      tipoSolicitud = 'espacio_3d'
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Se requiere autenticación' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Token de autenticación inválido' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: miembro } = await supabase
        .from('miembros_espacio')
        .select('id, rol, empresa_id, departamento_id')
        .eq('espacio_id', body.espacio_id)
        .eq('usuario_id', user.id)
        .single()

      if (!miembro) {
        return new Response(
          JSON.stringify({ error: 'No tienes acceso a este espacio' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nombre, apellido, avatar_url')
        .eq('id', user.id)
        .single()

      participantIdentity = user.id
      participantName = usuario?.nombre || user.email?.split('@')[0] || 'Usuario'
      roomName = body.room_name
      empresaIdRegistro = body.empresa_id ?? miembro.empresa_id ?? null
      espacioIdRegistro = body.espacio_id
      roomCreate = true
      participantMetadata = JSON.stringify({
        empresa_id: empresaIdRegistro,
        departamento_id: body.departamento_id ?? miembro.departamento_id ?? null,
        rol: miembro.rol ?? null,
      })
    } else if (body.token_invitacion) {
      tipoSolicitud = 'invitado'

      const tokenHash = await hashToken(body.token_invitacion)

      let { data: invitacion, error: invError } = await supabase
        .from('invitaciones_reunion')
        .select(`
          *,
          sala:salas_reunion(*),
          participante:participantes_sala(*)
        `)
        .eq('token_hash', tokenHash)
        .single()

      if (invError || !invitacion) {
        const fallback = await supabase
          .from('invitaciones_reunion')
          .select(`
            *,
            sala:salas_reunion(*),
            participante:participantes_sala(*)
          `)
          .eq('token_unico', body.token_invitacion)
          .single()

        invitacion = fallback.data
        invError = fallback.error
      }

      if (invError || !invitacion) {
        return new Response(
          JSON.stringify({ error: 'Token de invitación inválido o expirado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (invitacion.expira_en && new Date(invitacion.expira_en) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'La invitación ha expirado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!invitacion.sala) {
        return new Response(
          JSON.stringify({ error: 'La sala no existe' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!invitacion.sala.activa) {
        await supabase
          .from('salas_reunion')
          .update({ activa: true })
          .eq('id', invitacion.sala.id)

        invitacion.sala.activa = true
      }

      await supabase
        .from('invitaciones_reunion')
        .update({
          usado: true,
          veces_accedido: (invitacion.veces_accedido || 0) + 1,
          ultimo_acceso: new Date().toISOString(),
        })
        .eq('id', invitacion.id)

      const nombreFinal = normalizarNombreInvitado(body.nombre_invitado || invitacion.nombre || null)
      const accesoGeneral = !invitacion.participante_id
      let participanteSalaId = invitacion.participante_id as string | null

      if (accesoGeneral) {
        const { data: participanteGeneral, error: participanteGeneralError } = await supabase
          .from('participantes_sala')
          .insert({
            sala_id: invitacion.sala.id,
            usuario_id: null,
            nombre_invitado: nombreFinal,
            email_invitado: null,
            tipo_participante: invitacion.tipo_invitado || 'invitado',
            estado_participante: 'esperando',
            unido_en: new Date().toISOString(),
            permisos: {
              puede_hablar: true,
              puede_video: true,
              puede_compartir_pantalla: false,
              puede_admitir: false,
            },
          })
          .select('id')
          .single()

        if (participanteGeneralError || !participanteGeneral) {
          return new Response(
            JSON.stringify({ error: 'No se pudo registrar el acceso del invitado externo' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        participanteSalaId = participanteGeneral.id
      } else if (invitacion.participante_id) {
        await supabase
          .from('participantes_sala')
          .update({
            nombre_invitado: nombreFinal,
            estado_participante: 'esperando',
            unido_en: new Date().toISOString(),
          })
          .eq('id', invitacion.participante_id)
      }

      participantIdentity = accesoGeneral
        ? `guest_${invitacion.id.substring(0, 8)}_${crypto.randomUUID().slice(0, 8)}`
        : `guest_${invitacion.id.substring(0, 8)}`
      participantName = nombreFinal
      roomName = invitacion.sala.livekit_room_name || `sala_${invitacion.sala.id.substring(0, 8)}`
      espacioIdRegistro = invitacion.sala.espacio_id ?? null
      canPublish = accesoGeneral ? true : (invitacion.participante?.permisos?.puede_hablar ?? true)
      participantMetadata = JSON.stringify({
        tipo_acceso: accesoGeneral ? 'link_general' : 'link_personal',
        invitacion_id: invitacion.id,
        participante_sala_id: participanteSalaId,
        tipo_invitado: invitacion.tipo_invitado || 'invitado',
      })
    } else if (body.sala_id) {
      tipoSolicitud = 'reunion'
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Se requiere autenticación' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Token de autenticación inválido' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: sala, error: salaError } = await supabase
        .from('salas_reunion')
        .select('*, espacio:espacios_trabajo(*)')
        .eq('id', body.sala_id)
        .single()

      if (salaError || !sala) {
        return new Response(
          JSON.stringify({ error: 'Sala no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!sala.activa) {
        await supabase
          .from('salas_reunion')
          .update({ activa: true })
          .eq('id', body.sala_id)

        sala.activa = true
      }

      const { data: miembro } = await supabase
        .from('miembros_espacio')
        .select('*')
        .eq('espacio_id', sala.espacio_id)
        .eq('usuario_id', user.id)
        .single()

      if (!miembro) {
        return new Response(
          JSON.stringify({ error: 'No tienes acceso a esta sala' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nombre, apellido, avatar_url')
        .eq('id', user.id)
        .single()

      isHost = sala.creador_id === user.id
      roomCreate = isHost

      const { data: participanteExistente } = await supabase
        .from('participantes_sala')
        .select('*')
        .eq('sala_id', body.sala_id)
        .eq('usuario_id', user.id)
        .single()

      if (!participanteExistente) {
        await supabase
          .from('participantes_sala')
          .insert({
            sala_id: body.sala_id,
            usuario_id: user.id,
            tipo_participante: isHost ? 'host' : 'miembro',
            estado_participante: 'en_sala',
            unido_en: new Date().toISOString(),
            permisos: {
              puede_hablar: true,
              puede_video: true,
              puede_compartir_pantalla: isHost || miembro.rol === 'admin',
              puede_admitir: isHost,
            },
          })
      } else {
        await supabase
          .from('participantes_sala')
          .update({
            estado_participante: 'en_sala',
            unido_en: new Date().toISOString(),
          })
          .eq('id', participanteExistente.id)
      }

      participantIdentity = user.id
      participantName = usuario?.nombre || user.email?.split('@')[0] || 'Usuario'
      roomName = sala.livekit_room_name || `sala_${sala.id.substring(0, 8)}`
      empresaIdRegistro = miembro.empresa_id ?? null
      espacioIdRegistro = sala.espacio_id

      if (!sala.livekit_room_name) {
        await supabase
          .from('salas_reunion')
          .update({ livekit_room_name: roomName })
          .eq('id', body.sala_id)
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Se requiere sala_id, room_name o token_invitacion' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const videoGrant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
      roomAdmin: isHost,
      roomCreate,
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: '6h',
      metadata: participantMetadata,
    })
    at.addGrant(videoGrant)

    const livekitToken = await at.toJwt()

    registrarActividad({
      usuario_id: esUuid(participantIdentity) ? participantIdentity : null,
      empresa_id: empresaIdRegistro,
      espacio_id: espacioIdRegistro,
      accion: 'livekit_token_emitido',
      entidad: 'livekit_room',
      descripcion: `Token LiveKit emitido (${roomName})`,
      datos_extra: {
        room_name: roomName,
        tipo_solicitud: tipoSolicitud,
        puede_publicar: canPublish,
        puede_suscribir: canSubscribe,
        puede_publicar_datos: canPublishData,
        room_create: roomCreate,
      },
    }).catch(() => {})

    const response: RespuestaToken = {
      token: livekitToken,
      url: LIVEKIT_URL,
      sala_nombre: roomName,
      participante_id: participantIdentity,
      permisos: videoGrant,
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Error generando token:', error)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
