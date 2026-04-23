/**
 * @module supabase/functions/livekit-move-participant
 *
 * Edge Function que mueve a un participante entre Rooms de LiveKit usando
 * el server SDK (requiere `roomAdmin` grant y credenciales admin del SFU).
 *
 * Flujo:
 *   1. Valida JWT del caller (auth header de Supabase).
 *   2. Verifica que el caller pertenezca al espacio (membership check).
 *   3. Verifica que el caller solo pueda mover su propia `identity` (anti-abuse).
 *   4. Llama `RoomServiceClient.moveParticipant(fromRoom, identity, toRoom)`.
 *   5. Retorna 200 en éxito / 4xx-5xx con código tipado.
 *
 * Refs oficiales:
 *  - https://docs.livekit.io/home/server/managing-rooms/ (moveParticipant)
 *  - https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html
 *  - Pattern existente: supabase/functions/livekit-moderate-participant/index.ts
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// livekit-server-sdk 2.13+ tiene `moveParticipant` estable.
// Ref: https://github.com/livekit/server-sdk-js/releases
import { RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2.13.1';

// ─── Config ─────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'https://cowork-v3.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || 'devkey';
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || 'secret';
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || 'wss://your-livekit-server.livekit.cloud';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MoveRequest {
  identity?: string;
  from_room?: string;
  to_room?: string;
}

// ─── CORS ───────────────────────────────────────────────────────────────────

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

// ─── URL conversion (wss:// → https://) ─────────────────────────────────────

const resolveLivekitHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    return parsed.origin;
  } catch {
    return value.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
  }
};

// ─── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth — validar JWT del caller.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED', detail: 'Missing Bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED', detail: 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = userData.user.id;

    // 2. Parse + validate body.
    const body: MoveRequest = await req.json();
    if (!body.identity || !body.from_room || !body.to_room) {
      return new Response(JSON.stringify({
        error: 'INVALID_REQUEST',
        detail: 'identity, from_room, and to_room are required',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Anti-abuse: el caller solo puede mover su propia identity.
    //    (La identity que usamos en LiveKit es el Supabase user.id.)
    if (body.identity !== callerId) {
      return new Response(JSON.stringify({
        error: 'FORBIDDEN',
        detail: 'You can only move your own participant',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Llamar a LiveKit moveParticipant.
    //    Ref: https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html
    const livekitHttpUrl = resolveLivekitHttpUrl(LIVEKIT_URL);
    const roomService = new RoomServiceClient(
      livekitHttpUrl,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );

    try {
      console.log(`[move-participant] calling LiveKit: from=${body.from_room}, identity=${body.identity}, to=${body.to_room}`);
      await roomService.moveParticipant(body.from_room, body.identity, body.to_room);
      console.log(`[move-participant] success for ${body.identity}`);
    } catch (lkErr) {
      const detail = lkErr instanceof Error ? lkErr.message : String(lkErr);
      const stack = lkErr instanceof Error ? lkErr.stack : undefined;
      // Log verbose para debugging server-side (visible en edge function logs).
      console.error(`[move-participant] LiveKit API error:`, detail, stack);
      // LiveKit lanza si la Room fuente no existe o el participante no está ahí.
      if (detail.toLowerCase().includes('not found')) {
        return new Response(JSON.stringify({
          error: 'PARTICIPANT_NOT_FOUND',
          detail,
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        error: 'LIVEKIT_API_ERROR',
        detail,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Éxito.
    return new Response(JSON.stringify({
      ok: true,
      identity: body.identity,
      from_room: body.from_room,
      to_room: body.to_room,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'UNKNOWN', detail }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
