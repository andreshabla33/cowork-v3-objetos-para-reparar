import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_REUNIONES');

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

interface Destinatario {
  email: string;
  nombre: string;
  es_invitado_externo: boolean;
}

interface ResumenReunion {
  titulo: string;
  fecha: string;
  duracion_minutos: number;
  organizador_nombre: string;
  transcripcion_resumida?: string;
  puntos_clave?: string[];
  action_items?: string[];
  // Estos campos NO se envían a invitados externos
  analisis_comportamiento?: any;
  metricas_emocionales?: any;
  scores_participacion?: any;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { destinatarios, resumen }: { destinatarios: Destinatario[]; resumen: ResumenReunion } = await req.json();

    if (!destinatarios || destinatarios.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No hay destinatarios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_REUNIONES no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resultados = [];

    for (const dest of destinatarios) {
      // Para invitados externos, NO incluir análisis de comportamiento
      const incluirAnalisis = !dest.es_invitado_externo;
      
      const puntosClaveHtml = resumen.puntos_clave?.length 
        ? resumen.puntos_clave.map(p => `<li style="margin-bottom: 8px; color: #e4e4e7;">${p}</li>`).join('')
        : '<li style="color: #71717a;">No hay puntos clave registrados</li>';

      const actionItemsHtml = resumen.action_items?.length
        ? resumen.action_items.map(a => `<li style="margin-bottom: 8px; color: #e4e4e7;">☐ ${a}</li>`).join('')
        : '';

      const transcripcionHtml = resumen.transcripcion_resumida
        ? `<div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-top: 16px;">
             <h3 style="color: #a5b4fc; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">📝 Resumen de la conversación</h3>
             <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0;">${resumen.transcripcion_resumida}</p>
           </div>`
        : '';

      // Sección de análisis SOLO para usuarios internos
      const analisisHtml = incluirAnalisis && resumen.analisis_comportamiento
        ? `<div style="background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: 12px; padding: 16px; margin-top: 16px;">
             <h3 style="color: #c4b5fd; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">📊 Análisis de la reunión</h3>
             <p style="color: #38bdf8; font-size: 13px; margin: 0;">Este análisis está disponible en el panel de la aplicación.</p>
           </div>`
        : '';

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #fafafa; padding: 40px 20px; margin: 0; }
            .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #18181b 0%, #0f0f12 100%); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
            .header { padding: 32px; background: linear-gradient(135deg, #2563eb 0%, #2563eb 100%); text-align: center; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: white; }
            .header p { margin: 8px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.8); }
            .content { padding: 32px; }
            .stats { display: flex; gap: 16px; margin-bottom: 24px; }
            .stat { flex: 1; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: 700; color: #a5b4fc; }
            .stat-label { font-size: 12px; color: #71717a; margin-top: 4px; }
            .section { margin-top: 24px; }
            .section h3 { color: #a5b4fc; font-size: 14px; font-weight: 600; margin: 0 0 12px 0; }
            .section ul { margin: 0; padding-left: 20px; }
            .footer { padding: 24px 32px; background: rgba(0,0,0,0.3); text-align: center; }
            .footer p { margin: 0; font-size: 12px; color: #52525b; }
            .btn { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #2563eb 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 Resumen de Reunión</h1>
              <p>${resumen.titulo}</p>
            </div>
            <div class="content">
              <p style="margin: 0 0 24px 0; color: #a1a1aa;">Hola <strong style="color: #fafafa;">${dest.nombre}</strong>, aquí tienes el resumen de la reunión organizada por ${resumen.organizador_nombre}.</p>
              
              <div class="stats">
                <div class="stat">
                  <div class="stat-value">📅</div>
                  <div class="stat-label">${resumen.fecha}</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${resumen.duracion_minutos}</div>
                  <div class="stat-label">minutos</div>
                </div>
              </div>

              <div class="section">
                <h3>🎯 Puntos Clave</h3>
                <ul>${puntosClaveHtml}</ul>
              </div>

              ${actionItemsHtml ? `
              <div class="section">
                <h3>✅ Tareas Pendientes</h3>
                <ul>${actionItemsHtml}</ul>
              </div>
              ` : ''}

              ${transcripcionHtml}
              
              ${analisisHtml}

              ${dest.es_invitado_externo ? `
              <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 16px; margin-top: 24px;">
                <p style="color: #4ade80; font-size: 13px; margin: 0;">
                  ✅ Como invitado externo, has recibido el resumen de la conversación y los puntos clave acordados.
                </p>
              </div>
              ` : ''}
            </div>
            <div class="footer">
              <p>Generado automáticamente por Cowork Virtual</p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Cowork Virtual <onboarding@resend.dev>',
            to: [dest.email],
            subject: `📋 Resumen: ${resumen.titulo}`,
            html: emailHtml,
          }),
        });

        const resData = await res.json();
        resultados.push({
          email: dest.email,
          es_invitado_externo: dest.es_invitado_externo,
          incluyo_analisis: incluirAnalisis,
          success: res.ok,
          status: res.status,
          resend_response: resData,
        });
      } catch (emailError) {
        resultados.push({
          email: dest.email,
          success: false,
          error: String(emailError),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, resultados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[enviar-resumen-reunion] Error interno:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
