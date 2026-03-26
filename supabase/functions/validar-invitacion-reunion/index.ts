import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
  'https://cowork-v3.vercel.app',
  'http://localhost:3000',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const hashToken = async (rawToken: string): Promise<string> => {
  const tokenBytes = new TextEncoder().encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const registrarActividad = async (supabase: ReturnType<typeof createClient>, payload: {
  usuario_id?: string | null;
  empresa_id?: string | null;
  espacio_id?: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: string | null;
  descripcion?: string | null;
  datos_extra?: Record<string, unknown>;
}) => {
  try {
    await supabase.from('actividades_log').insert({
      usuario_id: payload.usuario_id ?? null,
      empresa_id: payload.empresa_id ?? null,
      espacio_id: payload.espacio_id ?? null,
      accion: payload.accion,
      entidad: payload.entidad ?? null,
      entidad_id: payload.entidad_id ?? null,
      descripcion: payload.descripcion ?? null,
      datos_extra: payload.datos_extra ?? {},
    });
  } catch (_logError) {
    // No bloquear el flujo si falla el log
  }
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const tokenHash = await hashToken(token);

    const { data: invitacion, error: invitacionError } = await supabase
      .from('invitaciones_reunion')
      .select(`
        id,
        nombre,
        email,
        expira_en,
        usado,
        sala:salas_reunion(
          id,
          nombre,
          tipo,
          configuracion,
          creador_id,
          espacio_id
        )
      `)
      .eq('token_hash', tokenHash)
      .single();

    if (invitacionError || !invitacion) {
      return new Response(JSON.stringify({ error: 'Invitación no válida' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (invitacion.expira_en && new Date(invitacion.expira_en) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invitación expirada' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const salaData = invitacion.sala as any;
    let organizadorNombre = 'Organizador';

    if (salaData?.creador_id) {
      const { data: creadorData } = await supabase
        .from('usuarios')
        .select('nombre')
        .eq('id', salaData.creador_id)
        .single();
      organizadorNombre = creadorData?.nombre || 'Organizador';
    }

    await registrarActividad(supabase, {
      usuario_id: null,
      espacio_id: salaData?.espacio_id ?? null,
      accion: 'validar_invitacion_reunion',
      entidad: 'invitaciones_reunion',
      entidad_id: invitacion.id,
      descripcion: 'Validación de invitación de reunión (invitado externo)',
      datos_extra: {
        email: invitacion.email,
        sala_id: salaData?.id,
        token_hash_prefix: tokenHash.slice(0, 8),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        organizador_nombre: organizadorNombre,
        invitacion: {
          id: invitacion.id,
          nombre: invitacion.nombre,
          email: invitacion.email,
          expira_en: invitacion.expira_en,
          usado: invitacion.usado,
          sala: salaData,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[validar-invitacion-reunion] Error interno:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
