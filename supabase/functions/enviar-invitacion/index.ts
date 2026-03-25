import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://mvp-cowork.vercel.app',
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado', detail: authError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, espacio_id, rol, nombre_invitado } = await req.json();

    if (!email || !espacio_id || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan parametros' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: espacio, error: espacioError } = await supabaseClient
      .from('espacios_trabajo')
      .select('nombre')
      .eq('id', espacio_id)
      .single();

    if (espacioError || !espacio) {
      return new Response(JSON.stringify({ error: 'Espacio no encontrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: miembroInvitador, error: miembroError } = await supabaseClient
      .from('miembros_espacio')
      .select('empresa_id')
      .eq('espacio_id', espacio_id)
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (miembroError || !miembroInvitador?.empresa_id) {
      return new Response(JSON.stringify({ error: 'No se encontró empresa del invitador' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const empresaId = miembroInvitador.empresa_id;

    // Verificar si ya existe invitación pendiente para este email+espacio
    const { data: existente } = await supabaseClient
      .from('invitaciones_pendientes')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('espacio_id', espacio_id)
      .eq('usada', false)
      .maybeSingle();

    if (existente) {
      return new Response(JSON.stringify({ error: 'Ya existe una invitación pendiente para este email' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar si el usuario ya es miembro del espacio
    const { data: yaEsMiembro } = await supabaseClient
      .from('miembros_espacio')
      .select('id')
      .eq('espacio_id', espacio_id)
      .eq('usuario_id', (await supabaseClient.from('usuarios').select('id').eq('email', email.toLowerCase().trim()).maybeSingle()).data?.id || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (yaEsMiembro) {
      return new Response(JSON.stringify({ error: 'Este usuario ya es miembro del espacio' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SHA-256 Token Hashing
    const invitationToken = crypto.randomUUID();
    const tokenBytes = new TextEncoder().encode(invitationToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { error: insertError } = await supabaseClient
      .from('invitaciones_pendientes')
      .insert({
        email: email.toLowerCase().trim(),
        espacio_id,
        empresa_id: empresaId,
        rol,
        token: invitationToken,
        token_hash: tokenHash,
        creada_por: user.id,
        usada: false,
        expira_en: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: 'DB Insert Error', detail: insertError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? Deno.env.get('APP_URL') ?? '').trim().replace(/\/$/, '');
    const invitationLink = `${frontendUrl}/invitation?token=${invitationToken}`;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    try {
      await supabaseClient.from('actividades_log').insert({
        usuario_id: user.id,
        empresa_id: empresaId,
        espacio_id,
        accion: 'crear_invitacion',
        entidad: 'invitaciones_pendientes',
        descripcion: 'Invitacion enviada por edge function',
        datos_extra: { email: email.toLowerCase().trim(), rol }
      });
    } catch (_logError) {
      // No bloquear el flujo si falla el log
    }
    
    if (!RESEND_API_KEY) {
        return new Response(JSON.stringify({ error: 'Configuration Error: RESEND_API_KEY missing' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Template HTML restaurado (Neon/Glassmorphism)
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Te han invitado - Cowork</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050508; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #050508;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px;">
          
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #8b5cf6, #d946ef, #06b6d4); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px; font-weight: 900; color: white;">C</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 40px 32px;">
              
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; padding: 8px 16px; background: linear-gradient(90deg, rgba(139,92,246,0.2), rgba(217,70,239,0.2)); border: 1px solid rgba(139,92,246,0.3); border-radius: 20px; color: #a78bfa; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">
                  🎉 Nueva invitación
                </span>
              </div>

              <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 800; text-align: center; background: linear-gradient(90deg, #ffffff, #c4b5fd, #ffffff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                ¡Te han invitado a ${espacio.nombre}!
              </h1>
              
              <p style="margin: 0 0 32px 0; color: #71717a; font-size: 14px; text-align: center;">
                Únete a un espacio de trabajo colaborativo
              </p>

              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 80px; height: 80px; background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); border: 1px solid rgba(16,185,129,0.3); border-radius: 20px; line-height: 80px;">
                  <span style="font-size: 36px;">👥</span>
                </div>
              </div>

              <p style="margin: 0 0 24px 0; color: #a1a1aa; font-size: 15px; text-align: center; line-height: 1.6;">
                Has sido invitado a colaborar en <strong style="color: #8b5cf6;">${espacio.nombre}</strong>. Acepta la invitación para unirte al equipo y comenzar a trabajar juntos.
              </p>

              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${invitationLink}" 
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(90deg, #10b981, #06b6d4); color: white; text-decoration: none; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; border-radius: 16px; box-shadow: 0 20px 40px rgba(16,185,129,0.3);">
                  Aceptar invitación
                </a>
              </div>

              <div style="background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.1); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #a1a1aa; font-size: 13px; text-align: center;">
                  ✨ Al unirte podrás colaborar en tiempo real con avatares 3D, chat, videollamadas y más.
                </p>
              </div>

              <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 24px 0;"></div>

              <p style="margin: 0; color: #52525b; font-size: 12px; text-align: center;">
                ¿El botón no funciona? Copia y pega este enlace:
              </p>
              <p style="margin: 8px 0 0 0; word-break: break-all; color: #10b981; font-size: 11px; text-align: center;">
                ${invitationLink}
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #3f3f46; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;">
                Virtual Collaboration Hub
              </p>
              <p style="margin: 0; color: #27272a; font-size: 11px;">
                Si no esperabas esta invitación, puedes ignorar este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Cowork <onboarding@resend.dev>', // FIX: Mantener dominio permitido
            to: [email],
            subject: `Invitacion a ${espacio.nombre} - Cowork`,
            html: emailHtml,
        }),
    });

    if (!resendResponse.ok) {
        const errText = await resendResponse.text();
        return new Response(JSON.stringify({ 
            error: `Resend API Error: ${resendResponse.status}`, 
            detail: errText 
        }), {
            // Mantenemos 200 OK para que el frontend muestre el detalle del error en el modal
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[enviar-invitacion] Error interno:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
