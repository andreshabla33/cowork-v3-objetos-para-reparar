# Documentación Técnica — MVP Cowork (Auditoría de Seguridad)

**Proyecto:** MVP Cowork — Espacio de trabajo virtual 3D  
**Fecha:** 2026-02-27  
**Versión:** v2 (feature/empresa-multi-tenant)  
**URL Producción:** https://mvp-cowork.vercel.app  

---

## 1. Arquitectura General

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Supabase       │────▶│  PostgreSQL 17  │
│  React + R3F │     │  (BaaS + Auth)   │     │  RLS habilitado │
│  Vercel CDN  │     │  Edge Functions  │     │  51 tablas      │
└──────┬───────┘     └──────┬───────────┘     └─────────────────┘
       │                    │
       │              ┌─────▼──────┐
       │              │  Storage   │
       │              │  4 buckets │
       │              └────────────┘
       │
       ├────▶ LiveKit (WebRTC — audio/video)
       ├────▶ Resend (emails transaccionales)
       ├────▶ Meshy AI (generación avatares 3D)
       └────▶ OpenAI (resúmenes AI)
```

### Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Frontend** | React + TypeScript + Vite | React 18 |
| **3D Engine** | Three.js + React Three Fiber | r158+ |
| **Hosting Frontend** | Vercel | — |
| **Backend (BaaS)** | Supabase | Postgres 17.6 |
| **Auth** | Supabase Auth (JWT) | — |
| **Realtime** | Supabase Realtime (WebSocket) | — |
| **Edge Functions** | Deno (Supabase Edge) | — |
| **Video/Audio** | LiveKit Cloud (WebRTC) | — |
| **Email** | Resend API | — |
| **AI** | OpenAI API + Meshy AI | GPT-4 / Meshy v2 |
| **Región** | ap-south-1 (Mumbai) | — |

---

## 2. Autenticación y Autorización

### 2.1 Flujo de Autenticación

- **Método:** Supabase Auth con email/password + Magic Link
- **Tokens:** JWT emitidos por Supabase, contienen `user_id`, `email`, `role`
- **Sesión:** Manejada con `@supabase/supabase-js` en el cliente
- **Refresh:** Automático via `onAuthStateChange`

### 2.2 Roles del Sistema

| Rol | Descripción | Permisos |
|-----|------------|----------|
| `super_admin` | Creador del espacio | Gestión total |
| `admin` | Administrador | Gestión de miembros, cargos, departamentos |
| `moderador` | Moderador | Gestión limitada de salas |
| `miembro` | Miembro estándar | Acceso al espacio, chat, videollamadas |
| `invitado` | Visitante temporal | Solo lectura, acceso limitado |

### 2.3 Row Level Security (RLS)

**100% de tablas tienen RLS habilitado** (51/51 tablas).

Patrón general de policies:
- **SELECT:** Filtrado por `auth.uid()` o membresía al espacio via `miembros_espacio`
- **INSERT:** Verificación de autenticación + pertenencia al espacio
- **UPDATE:** Solo propios registros o admins del espacio
- **DELETE:** Solo admins o creadores del registro

### 2.4 Funciones con SECURITY DEFINER

Funciones que ejecutan con permisos elevados (bypasan RLS):

| Función | Propósito |
|---------|-----------|
| `aceptar_invitacion` | Procesa aceptación de invitación al espacio |
| `agregar_metricas_empresa` | Agrega métricas diarias |
| `crear_espacio_trabajo` | Crea espacio + asigna creador como super_admin |
| `crear_grupo_chat` | Crea grupo + añade creador como miembro |
| `handle_new_user` | Trigger: crea registro en `usuarios` al signup |
| `enviar_invitacion` | Registra invitación pendiente |
| `check_is_admin` | Verifica si usuario es admin |
| `es_admin_de_espacio` | Helper RLS |
| `es_miembro_de_espacio` | Helper RLS |
| `es_miembro_misma_empresa` | Helper RLS multi-tenant |
| `heartbeat_participante` | Actualiza presencia en salas |
| `limpiar_salas_zombie` | Cleanup de salas sin participantes |
| `get_mis_espacios` | Retorna espacios del usuario autenticado |
| `responder_consentimiento_grabacion` | Gestión de consentimiento GDPR |
| `solicitar_consentimiento_grabacion` | Envía solicitud de consentimiento |

---

## 3. Edge Functions (Serverless)

| Función | JWT | Propósito | APIs Externas |
|---------|-----|-----------|---------------|
| `enviar-invitacion` | ❌ | Envía email de invitación al espacio | Resend |
| `enviar-invitacion-reunion` | ❌ | Envía email de invitación a reunión | Resend |
| `enviar-resumen-reunion` | ❌ | Envía resumen AI post-reunión | Resend |
| `generar-resumen-ai` | ❌ | Genera resumen de reunión con AI | OpenAI |
| `livekit-token` | ❌ | Genera token de acceso a sala LiveKit | LiveKit API |
| `monica-ai-proxy` | ❌ | Proxy para agente conversacional Monica IA | OpenAI |
| `validar-invitacion-reunion` | ❌ | Valida token de invitación a reunión | — |
| `edge-proxy-posiciones` | ✅ | Proxy para posiciones de avatares | — |
| `upload-avatar-storage` | ❌ | Sube archivos GLB de avatar a Storage | Meshy AI |
| `generate-avatar` | ✅ | Genera avatar 3D desde foto | Meshy AI |
| `check-3d-status` | ✅ | Consulta estado de generación 3D | Meshy AI |
| `generar-misiones-diarias` | ✅ | Genera misiones de gamificación | — |

> **Nota:** Las funciones sin JWT (`verify_jwt: false`) implementan autenticación interna via `supabase.auth.getUser(token)`.

---

## 4. Base de Datos — Tablas principales

### 4.1 Core (Usuarios y Espacios)

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `usuarios` | 12 | Perfiles de usuario (FK → auth.users) |
| `empresas` | 2 | Empresas/organizaciones |
| `espacios_trabajo` | 2 | Espacios virtuales de trabajo |
| `miembros_espacio` | 11 | Membresías usuario↔espacio (rol, cargo, dept) |
| `departamentos` | ~8 | Departamentos por espacio |
| `cargos` | ~30 | Cargos/posiciones por espacio |

### 4.2 Comunicación

| Tabla | Descripción |
|-------|-------------|
| `grupos_chat` | Grupos de chat (público, privado, directo) |
| `miembros_grupo` | Membresías de grupos |
| `mensajes_chat` | Mensajes de chat |
| `mensajes_leidos` | Tracking de lectura |
| `salas_reunion` | Salas de videollamada |
| `participantes_sala` | Participantes activos en salas |
| `reuniones_programadas` | Reuniones agendadas |
| `reunion_participantes` | Invitados a reuniones |
| `invitaciones_reunion` | Invitaciones por email a reuniones |
| `notificaciones` | Sistema de notificaciones |

### 4.3 Grabaciones y AI

| Tabla | Descripción |
|-------|-------------|
| `grabaciones` | Grabaciones de videollamadas |
| `grabaciones_sala` | Relación grabación↔sala |
| `participantes_grabacion` | Participantes + consentimiento |
| `transcripciones` | Transcripciones de audio |
| `resumenes_ai` | Resúmenes generados por AI |
| `analisis_comportamiento` | Análisis AI de comportamiento |

### 4.4 Avatares 3D

| Tabla | Descripción |
|-------|-------------|
| `avatares_3d` | Catálogo de avatares 3D (modelo_url, escala) |
| `avatar_animaciones` | Animaciones por avatar (idle, walk, run...) |
| `avatar_configuracion` | Config de avatar por usuario |
| `avatar_categorias` | Categorías de avatares |
| `avatar_piezas` | Piezas/accesorios de avatares |
| `avatar_jobs` | Jobs de generación 3D (Meshy AI pipeline) |

### 4.5 Gamificación

| Tabla | Descripción |
|-------|-------------|
| `gamificacion_usuarios` | XP, nivel, racha por usuario |
| `gamificacion_misiones` | Misiones diarias |
| `gamificacion_logros` | Catálogo de logros |
| `gamificacion_logros_usuario` | Logros desbloqueados |
| `gamificacion_items` | Items cosméticos |

### 4.6 Métricas y Logging

| Tabla | Descripción |
|-------|-------------|
| `actividades_log` | Log de todas las actividades del sistema |
| `metricas_empresa` | Métricas diarias agregadas por empresa |
| `registro_conexiones` | Registro de conexiones/desconexiones |
| `configuracion_metricas_espacio` | Config de métricas por espacio |

### 4.7 Multi-tenant

| Tabla | Descripción |
|-------|-------------|
| `autorizaciones_empresa` | Permisos entre empresas |
| `zonas_empresa` | Zonas asignadas por empresa en el espacio |
| `invitaciones_pendientes` | Invitaciones por email pendientes |

### 4.8 Juegos/Social

| Tabla | Descripción |
|-------|-------------|
| `partidas_ajedrez` | Juego de ajedrez integrado |
| `sesiones_juego` | Sesiones de juego activas |
| `jugadores_sesion` | Jugadores en sesión |
| `invitaciones_juegos` | Invitaciones a juegos |
| `estadisticas_jugador` | Stats de juegos |
| `historial_juegos` | Historial de partidas |
| `logros_jugador` | Logros de juegos |

---

## 5. Storage (Buckets)

| Bucket | Público | Límite | MIME Types | Contenido |
|--------|---------|--------|------------|-----------|
| `avatares` | ✅ | 5MB | png, webp, gif | Fotos de perfil 2D |
| `avatars` | ✅ | Sin límite | Todos | Modelos 3D GLB + animaciones |
| `chat-files` | ✅ | Sin límite | Todos | Archivos compartidos en chat |
| `grabaciones` | ✅ | 500MB | video/webm, mp4, audio | Grabaciones de reuniones |

---

## 6. APIs Externas y Secrets

| Servicio | Propósito | Secret Name |
|----------|-----------|-------------|
| **Supabase** | Backend principal | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **LiveKit** | WebRTC audio/video | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` |
| **Resend** | Emails transaccionales | `RESEND_API_KEY` |
| **OpenAI** | Resúmenes AI, Monica IA | `OPENAI_API_KEY` |
| **Meshy AI** | Generación avatares 3D | `MESHY_API_KEY` |

> **Nota:** Todos los secrets se almacenan como Supabase Edge Function Secrets (variables de entorno cifradas). No están hardcodeados en el frontend.

---

## 7. Endpoints Expuestos

### 7.1 Supabase REST API (PostgREST)
- **URL:** `https://lcryrsdyrzotjqdxcwtp.supabase.co/rest/v1/`
- **Auth:** Header `apikey` + `Authorization: Bearer <jwt>`
- **Protección:** RLS en todas las tablas

### 7.2 Supabase Realtime
- **URL:** `wss://lcryrsdyrzotjqdxcwtp.supabase.co/realtime/v1/websocket`
- **Uso:** Presencia, chat en tiempo real, notificaciones
- **Auth:** JWT en handshake

### 7.3 Edge Functions
- **Base URL:** `https://lcryrsdyrzotjqdxcwtp.supabase.co/functions/v1/`
- **Auth:** Varía por función (ver sección 3)

### 7.4 Storage
- **Public URL:** `https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/`
- **Acceso:** Público (buckets configurados como públicos)

### 7.5 LiveKit
- **WebSocket:** `wss://cowork-g3ad9x0b.livekit.cloud`
- **Auth:** Token JWT generado por Edge Function `livekit-token`

---

## 8. Superficie de Ataque Conocida

### 8.1 Riesgos Identificados

| # | Riesgo | Severidad | Estado |
|---|--------|-----------|--------|
| 1 | Buckets de Storage públicos sin restricción MIME en `avatars` y `chat-files` | Media | Conocido |
| 2 | Edge Functions sin `verify_jwt` (auth interna) | Baja | Mitigado con auth manual |
| 3 | `anon` key expuesta en frontend (por diseño de Supabase) | Baja | Mitigado con RLS |
| 4 | Bucket `grabaciones` público — videos accesibles por URL directa | Media | Conocido |
| 5 | Funciones SECURITY DEFINER podrían bypasear RLS si tienen bugs | Media | Monitorear |
| 6 | Sin rate limiting en Edge Functions | Media | Pendiente |
| 7 | `avatares_3d` tiene INSERT/UPDATE público (solo service_role debería) | Baja | Policy permisiva |

### 8.2 Controles Implementados

- ✅ RLS en 100% de tablas (51/51)
- ✅ Auth via Supabase JWT
- ✅ Secrets en variables de entorno (no hardcodeados)
- ✅ HTTPS obligatorio en todas las comunicaciones
- ✅ Funciones de verificación de permisos (es_admin, es_miembro, etc.)
- ✅ Consentimiento explícito para grabaciones (GDPR-like)
- ✅ Logging de actividades en `actividades_log`

---

## 9. Contacto

- **Proyecto:** MVP Cowork by URPE AI LAB
- **Dominio:** urpeailab.com
- **Email técnico:** noreply@urpeailab.com
