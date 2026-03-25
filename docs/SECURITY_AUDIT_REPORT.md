# 🔒 AUDITORÍA DE SEGURIDAD INFORMÁTICA — Cowork CRM

**Fecha:** 2026-03-19  
**Auditor:** Cascade Security Analysis  
**Alcance:** Frontend (React/Vite), Backend (Supabase Edge Functions), Base de datos (PostgreSQL/Supabase), Infraestructura (Vercel)  
**Clasificación:** OWASP Top 10:2025 + OWASP Secure Headers Project

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Vulnerabilidades Críticas](#2-vulnerabilidades-críticas)
3. [Vulnerabilidades Altas](#3-vulnerabilidades-altas)
4. [Vulnerabilidades Medias](#4-vulnerabilidades-medias)
5. [Vulnerabilidades Bajas](#5-vulnerabilidades-bajas)
6. [CVEs de Dependencias](#6-cves-de-dependencias)
7. [Cabeceras de Seguridad Faltantes](#7-cabeceras-de-seguridad-faltantes)
8. [Mejores Prácticas Enterprise/SaaS](#8-mejores-prácticas-enterprisesaas)
9. [Plan de Mitigación Paso a Paso](#9-plan-de-mitigación-paso-a-paso)

---

## 1. RESUMEN EJECUTIVO

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 CRÍTICA | 2 | Requiere acción inmediata |
| 🟠 ALTA | 5 | Requiere acción esta semana |
| 🟡 MEDIA | 6 | Planificar para sprint actual |
| 🟢 BAJA | 4 | Backlog / mejora continua |
| **TOTAL** | **17** | — |

### Buenas prácticas ya implementadas ✅
- RLS habilitado en 52/52 tablas
- Tokens de invitación hasheados con SHA-256 antes de almacenarse
- Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` solo server-side (Deno.env)
- Auth delegada a Supabase Auth (no auth custom vulnerable a SQLi)
- No se encontró `dangerouslySetInnerHTML` ni `eval()` en el código
- Password recovery fuerza re-login limpio después del cambio
- Rate limiting en recovery vía mensajes de error localizados

---

## 2. VULNERABILIDADES CRÍTICAS

### VULN-001 🔴 — SERVICE_ROLE KEY EXPUESTA COMO ANON KEY EN CLIENTE

**Archivo:** `.env` línea 3  
**CVSS estimado:** 9.8 (Crítico)  
**OWASP:** A07:2025 — Security Misconfiguration  
**Vector de ataque:** Acceso directo desde navegador → bypass total de RLS

**Evidencia:**
```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxjcnlyc2R5cnpvdGpxZHhjd3RwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIs...
```

Al decodificar el JWT: `"role": "service_role"`. **Esta NO es la anon key, es la SERVICE_ROLE KEY**. Esto significa que **cualquier usuario** que inspeccione el JavaScript del navegador puede:
- Leer TODAS las tablas sin restricción de RLS
- Insertar/actualizar/eliminar datos de cualquier usuario
- Acceder a datos de cualquier empresa (bypass multi-tenant)
- Eliminar grabaciones, transcripciones, mensajes de otros usuarios

**Impacto:** Compromiso total de la base de datos. Un atacante con la devtools del navegador tiene acceso root a PostgreSQL.

**Solución:**
1. **INMEDIATAMENTE** rotar la service_role key en Supabase Dashboard → Settings → API
2. Generar una nueva anon key y reemplazar en `.env`
3. Verificar que el JWT decodificado tenga `"role": "anon"` y NO `"service_role"`
4. Auditar logs de acceso en Supabase para detectar posible explotación previa

---

### VULN-002 🔴 — GUEST LOGIN SIN AUTENTICACIÓN (BYPASS TOTAL DE AUTH)

**Archivo:** `components/LoginScreen.tsx` líneas 59-75  
**CVSS estimado:** 9.1 (Crítico)  
**OWASP:** A01:2025 — Broken Access Control  

**Evidencia:**
```typescript
const handleGuestLogin = () => {
    const mockSession = {
      access_token: '',
      refresh_token: '',
      expires_in: 0,
      user: {
        id: 'guest-' + Math.random().toString(36).substr(2, 9),
        email: 'invitado@cowork.app',
        ...
      }
    } as any;
    setSession(mockSession);
};
```

Esto crea una sesión falsa **sin ningún token válido**, con un ID de usuario aleatorio del lado del cliente. Cualquier persona puede:
- Acceder a la aplicación sin credenciales
- El `access_token` vacío será rechazado por Supabase en queries directas, PERO el estado de la app cree que hay una sesión activa
- Si se combina con VULN-001 (service_role key), el impacto es total

**Solución:**
1. Eliminar `handleGuestLogin` completamente o reemplazarlo con un flujo de usuario anónimo real de Supabase (`supabase.auth.signInAnonymously()`)
2. Si se necesita modo demo, crear un usuario de solo lectura real en Supabase con permisos restringidos vía RLS

---

## 3. VULNERABILIDADES ALTAS

### VULN-003 🟠 — AUSENCIA TOTAL DE CABECERAS DE SEGURIDAD HTTP

**Archivo:** `vercel.json`  
**CVSS estimado:** 7.5  
**OWASP:** A05:2025 — Security Misconfiguration  

`vercel.json` solo tiene rewrites, **sin ninguna cabecera de seguridad**. Faltan:

| Cabecera | Estado | Riesgo |
|----------|--------|--------|
| `Strict-Transport-Security` (HSTS) | ❌ FALTA | Downgrade a HTTP, MITM |
| `Content-Security-Policy` (CSP) | ❌ FALTA | XSS, inyección de scripts |
| `X-Frame-Options` | ❌ FALTA | Clickjacking |
| `X-Content-Type-Options` | ❌ FALTA | MIME sniffing |
| `Referrer-Policy` | ❌ FALTA | Fuga de URLs sensibles |
| `Permissions-Policy` | ❌ FALTA | Abuso de cámara/micrófono |
| `Cross-Origin-Opener-Policy` | ❌ FALTA | Cross-origin attacks |
| `Cross-Origin-Resource-Policy` | ❌ FALTA | Cross-origin data leak |
| `X-DNS-Prefetch-Control` | ❌ FALTA | DNS leak |

**Impacto:** Sin HSTS, un atacante MITM puede interceptar tráfico degradando HTTPS a HTTP. Sin CSP, scripts de terceros o XSS reflejado pueden ejecutar código arbitrario.

---

### VULN-004 🟠 — CORS WILDCARD EN TODAS LAS EDGE FUNCTIONS

**Archivos:** Todas las Edge Functions en `supabase/functions/*/index.ts`  
**CVSS estimado:** 7.2  
**OWASP:** A01:2025 — Broken Access Control  

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

`Access-Control-Allow-Origin: *` permite que **cualquier sitio web** llame a las Edge Functions. Un atacante puede:
- Crear una página maliciosa que invoque `enviar-invitacion` con el JWT del usuario (si tiene la sesión abierta)
- Leer respuestas de `validar-invitacion-reunion` desde cualquier origen
- Explotar CSRF en funciones que mutan estado

**Solución:** Restringir a los dominios permitidos: `https://mvp-cowork.vercel.app` y `http://localhost:3000` (solo dev).

---

### VULN-005 🟠 — AUSENCIA DE PROTECCIÓN CSRF

**CVSS estimado:** 7.0  
**OWASP:** A01:2025 — Broken Access Control  

No hay token CSRF en ningún formulario ni petición mutante. Supabase Auth usa JWT en header `Authorization`, lo cual mitiga CSRF para API calls. **PERO**:
- Las Edge Functions con `verify_jwt: false` (6 de 12 funciones) son vulnerables
- `enviar-invitacion`, `enviar-invitacion-reunion`, `enviar-resumen-reunion`, `generar-resumen-ai`, `livekit-token`, `monica-ai-proxy` no verifican JWT
- Un atacante puede crear un formulario en otro sitio que haga POST a estas funciones

**Nota:** Las funciones que sí validan JWT manualmente (como `enviar-invitacion` que extrae el token del header y valida con `getUser`) están parcialmente protegidas, pero la combinación con CORS `*` debilita esta protección.

---

### VULN-006 🟠 — TAILWINDCSS CARGADO DESDE CDN EXTERNO (SIN SRI)

**Archivo:** `index.html` línea 13  
```html
<script src="https://cdn.tailwindcss.com"></script>
```

**CVSS estimado:** 7.0  
**OWASP:** A08:2025 — Software and Data Integrity Failures  

Si `cdn.tailwindcss.com` es comprometido o sufre un ataque de supply chain, se inyectará JavaScript arbitrario en TODOS los usuarios del CRM. No hay Subresource Integrity (SRI) hash.

Además, `cdn.tailwindcss.com` es el **runtime de Tailwind para desarrollo**, no para producción. En producción debería usarse Tailwind compilado en el build.

**Solución:**
1. Instalar Tailwind como dependencia del proyecto: `npm install tailwindcss @tailwindcss/vite`
2. Eliminar el `<script>` del CDN
3. Configurar Tailwind en `vite.config.ts`

---

### VULN-007 🟠 — IMPORT MAPS CON DEPENDENCIAS EXTERNAS SIN SRI

**Archivo:** `index.html` líneas 147-159  
```html
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@^19.2.3",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@^2.47.10",
    ...
  }
}
</script>
```

**CVSS estimado:** 6.8  
**OWASP:** A08:2025 — Software and Data Integrity Failures  

Dependencias cargadas desde `esm.sh` sin SRI hashes. Si `esm.sh` es comprometido, el código malicioso se ejecutará con acceso completo a la aplicación (cookies, tokens, localStorage).

**Nota:** Esto puede ser un artefacto de desarrollo. En producción con `vite build`, estas importaciones se resuelven en bundling. Verificar que en producción NO se usen import maps externos.

---

## 4. VULNERABILIDADES MEDIAS

### VULN-008 🟡 — SESSION TOKENS EN localStorage (NO httpOnly)

**CVSS estimado:** 6.5  
**OWASP:** A07:2025 — Identification and Authentication Failures  

Supabase JS SDK almacena tokens de sesión en `localStorage` por defecto. Esto es inherente a la arquitectura SPA + Supabase, pero:
- Un XSS exitoso puede robar `access_token` y `refresh_token` de localStorage
- Cualquier extensión de navegador puede leer localStorage
- No hay mecanismo de `httpOnly` cookie disponible sin un proxy backend

**Mitigación parcial:** Implementar CSP estricta para prevenir XSS. A largo plazo, considerar un backend proxy que maneje sesiones con cookies httpOnly.

---

### VULN-009 🟡 — CONTRASEÑA MÍNIMA DE 6 CARACTERES

**Archivo:** `components/LoginScreen.tsx` línea 284  
```html
<input type="password" minLength={6} ... />
```

Pero en `lib/authRecoveryService.ts` línea 84, el recovery exige 8 caracteres. **Inconsistencia**: el registro permite 6, el recovery exige 8.

**OWASP:** A07:2025 — Identification and Authentication Failures  
**Solución:** Mínimo 8 caracteres en ambos flujos. Implementar validación de complejidad (mayúscula, número, carácter especial) para CRM enterprise.

---

### VULN-010 🟡 — NO HAY RATE LIMITING EN LOGIN

**CVSS estimado:** 6.0  
**OWASP:** A07:2025 — Identification and Authentication Failures  

El formulario de login (`handleEmailAuth`) no tiene:
- Límite de intentos fallidos
- Delay exponencial
- CAPTCHA después de N intentos

Supabase Auth tiene rate limiting interno, pero es permisivo (varios cientos de intentos por hora). Un atacante puede hacer fuerza bruta contra cuentas con contraseñas débiles.

---

### VULN-011 🟡 — INFORMACIÓN DE ERROR EXCESIVA EN EDGE FUNCTIONS

**Archivos:** `supabase/functions/enviar-invitacion/index.ts` línea 276, `validar-invitacion-reunion/index.ts` línea 140  

```typescript
// enviar-invitacion
return new Response(JSON.stringify({ error: 'Function Error', detail: error.message }), ...);

// validar-invitacion-reunion  
return new Response(JSON.stringify({ error: 'Error interno', detalle: String(error) }), ...);
```

**OWASP:** A04:2025 — Insecure Design  
Exponer `error.message` al cliente puede revelar información interna (rutas de archivos, queries SQL, estructura de BD).

---

### VULN-012 🟡 — ENUMERACIÓN DE USUARIOS VÍA REGISTRO

**Archivo:** `components/LoginScreen.tsx` líneas 131-138  
```typescript
if (err.message === 'Invalid login credentials') {
    setError('Credenciales inválidas...');
} else if (err.message === 'Email not confirmed') {
    setError('Email no confirmado...');
}
```

El mensaje "Email no confirmado" confirma que el email existe en el sistema. Un atacante puede enumerar emails válidos probando registros y observando respuestas diferentes.

---

### VULN-013 🟡 — ALMACENAMIENTO DE WORKSPACE ID EN localStorage SIN VALIDACIÓN

**Archivo:** `store/useStore.ts` línea 509  
```typescript
localStorage.setItem(STORAGE_WS_KEY, workspace.id);
```

Y se lee en línea 374:
```typescript
const savedId = localStorage.getItem(STORAGE_WS_KEY);
```

Si un atacante manipula localStorage (vía XSS), puede forzar la carga de un workspace diferente. Combinado con VULN-001, podría acceder a datos de otros espacios.

---

## 5. VULNERABILIDADES BAJAS

### VULN-014 🟢 — TOKEN DE INVITACIÓN EN URL (QUERY STRING)

**Archivo:** `components/LoginScreen.tsx` línea 29  
```typescript
const token = urlParams.get('token');
```

Los tokens en query strings quedan en:
- Historial del navegador
- Logs de servidor/CDN
- Referrer header si hay links externos

**Mitigación existente:** El token se hashea antes de buscar en BD, y las invitaciones expiran. Riesgo residual bajo.

---

### VULN-015 🟢 — SERVICE WORKER SIN RESTRICCIÓN DE SCOPE

**Archivo:** `public/sw.js`  
El SW cachea `'/'` y `'/index.html'` y tiene lógica de cache-first para assets. Si se inyecta un SW malicioso (via XSS), puede interceptar todas las requests.

---

### VULN-016 🟢 — GOOGLE FONTS EXTERNO SIN PRECONNECT SEGURO

**Archivo:** `index.html` línea 14  
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Genera una dependencia externa que puede ser usada para tracking o, en caso de compromiso de Google Fonts CDN, inyección.

---

### VULN-017 🟢 — CONSOLE.LOG EXTENSIVO EN PRODUCCIÓN

**Múltiples archivos:** `store/useStore.ts`, `services/chatService.ts`, `services/geminiService.ts`  
Logs extensivos con `console.log` que revelan IDs de usuario, tokens, estados de sesión. Un atacante con acceso a DevTools ve información sensible.

---

## 6. CVEs DE DEPENDENCIAS

### Vite (v6.2.0)

| CVE | Severidad | Descripción | Versión afectada | Fix |
|-----|-----------|-------------|------------------|-----|
| CVE-2025-30208 | **Alta (7.5)** | Arbitrary File Read via query string bypass en `server.fs.deny` | < 6.0.15 | Actualizar a ≥ 6.2.x (ya mitigado en dev, verificar deploy) |
| CVE-2025-24010 | **Media (5.3)** | Cross-origin request leak en dev server | < 6.0.9 | Actualizar a ≥ 6.2.x |
| GHSA-93m4-6634-74q7 | **Media** | `server.fs.deny` bypass via backslash en Windows | < 6.0.x | Actualizar a ≥ 6.2.x |

**Estado actual:** v6.2.0 instalada. Verificar que en producción (Vercel) se use el build compilado y no el dev server.

### Supabase Auth (Server-side)

| Advisory | Severidad | Descripción | Fecha |
|----------|-----------|-------------|-------|
| GHSA-v36f-qvww-8w8m | **Moderada** | Insecure Apple/Azure auth con ID tokens | 2026-03-11 |
| GHSA-3529-5m8x-rpv3 | **Alta** | Email link poisoning | 2024-11-06 |

**Acción:** Verificar en Supabase Dashboard que GoTrue (auth) esté en la última versión. Supabase Cloud actualiza automáticamente, pero revisar.

### Supabase JS SDK (v2.47.10)

No hay CVEs conocidos directos, pero verificar regularmente. La versión 2.x es estable.

---

## 7. CABECERAS DE SEGURIDAD FALTANTES

Según OWASP Secure Headers Project, las cabeceras requeridas y su estado:

| # | Cabecera | Estado | Prioridad |
|---|----------|--------|-----------|
| 1 | `Strict-Transport-Security` | ❌ | P0 — Crítica |
| 2 | `Content-Security-Policy` | ❌ | P0 — Crítica |
| 3 | `X-Frame-Options` | ❌ | P1 — Alta |
| 4 | `X-Content-Type-Options` | ❌ | P1 — Alta |
| 5 | `Referrer-Policy` | ❌ | P1 — Alta |
| 6 | `Permissions-Policy` | ❌ | P2 — Media |
| 7 | `Cross-Origin-Opener-Policy` | ❌ | P2 — Media |
| 8 | `Cross-Origin-Resource-Policy` | ❌ | P2 — Media |
| 9 | `X-DNS-Prefetch-Control` | ❌ | P3 — Baja |
| 10 | `Cache-Control` (para APIs) | ❌ | P2 — Media |

---

## 8. MEJORES PRÁCTICAS ENTERPRISE/SaaS PENDIENTES

Para escalar como CRM SaaS o software empresarial privado:

### Autenticación & Sesión
- [ ] MFA/2FA (Supabase soporta TOTP nativo)
- [ ] Sesiones con idle timeout (auto-logout tras inactividad)
- [ ] Invalidación de sesiones en otros dispositivos al cambiar contraseña
- [ ] Política de contraseñas configurable por tenant (empresa)

### Auditoría & Compliance
- [ ] Audit log inmutable (ya existe `actividades_log`, pero falta inmutabilidad)
- [ ] Data retention policy configurable
- [ ] Export de datos del usuario (GDPR Art. 20)
- [ ] Derecho al olvido (GDPR Art. 17)
- [ ] Cifrado en reposo para campos sensibles (PII)

### API Security
- [ ] Rate limiting por IP y por usuario en Edge Functions
- [ ] API versioning
- [ ] Request size limits
- [ ] Input validation schemas (Zod/Joi) en Edge Functions
- [ ] API key rotation automática

### Infraestructura
- [ ] WAF (Web Application Firewall) — Vercel Pro incluye esto
- [ ] DDoS protection (Vercel/Cloudflare)
- [ ] Penetration testing periódico
- [ ] Dependency scanning automático (Dependabot/Snyk)
- [ ] SAST/DAST en CI/CD pipeline

### Multi-Tenant Security
- [ ] Aislamiento de datos por tenant a nivel de query (ya con RLS, bien)
- [ ] Encriptación de datos por tenant con claves separadas
- [ ] Configuración de políticas de seguridad por empresa
- [ ] IP allowlisting por empresa

---

## 9. PLAN DE MITIGACIÓN PASO A PASO

### FASE 1 — EMERGENCIA (Hacer HOY) 🔴

#### Paso 1.1: Rotar service_role key y usar anon key correcta
- **Qué:** El `.env` tiene la service_role key como `VITE_SUPABASE_ANON_KEY`
- **Cómo:**
  1. Ir a Supabase Dashboard → Settings → API
  2. Copiar la **anon/public** key (NOT service_role)
  3. Reemplazar en `.env` y `.env.example`
  4. Rotar la service_role key actual (ya está comprometida, estuvo en el bundle de producción)
  5. Actualizar las Edge Functions con la nueva service_role key como secret
  6. Redesplegar
- **Impacto en funcionalidad:** Ninguno. El frontend solo necesita la anon key.
- **Verificación:** Decodificar el JWT en jwt.io y confirmar `"role": "anon"`

#### Paso 1.2: Desactivar o asegurar Guest Login
- **Qué:** Eliminar `handleGuestLogin` que crea sesiones falsas
- **Cómo:**
  1. Reemplazar con `supabase.auth.signInAnonymously()` (Supabase lo soporta)
  2. O eliminar el botón "Invitado" completamente
  3. Si se necesita demo, crear un usuario `demo@cowork.app` con RLS restrictivo
- **Impacto en funcionalidad:** Los usuarios invitados necesitarán el flujo anónimo de Supabase.
- **Verificación:** Probar que el botón crea una sesión real con token válido

---

### FASE 2 — ESTA SEMANA (Cabeceras + CORS) 🟠

#### Paso 2.1: Agregar cabeceras de seguridad en vercel.json
- **Qué:** Configurar todas las cabeceras HTTP de seguridad
- **Cómo:** Agregar bloque `headers` en `vercel.json`:
  ```json
  {
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(self), microphone=(self), geolocation=(), payment=()" },
          { "key": "X-DNS-Prefetch-Control", "value": "off" },
          { "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" },
          { "key": "Content-Security-Policy", "value": "..." }
        ]
      }
    ]
  }
  ```
- **CSP específica para Cowork** (requiere permitir Supabase, LiveKit, Google Fonts, esm.sh):
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://*.livekit.cloud wss://*.livekit.cloud;
  media-src 'self' blob: https://*.supabase.co;
  worker-src 'self' blob:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
  ```
- **Impacto en funcionalidad:** Podría romper CDN de Tailwind (pero lo eliminaremos en Paso 2.3). Probar en staging primero.
- **Verificación:** `curl -I https://mvp-cowork.vercel.app` y verificar cabeceras

#### Paso 2.2: Restringir CORS en Edge Functions
- **Qué:** Cambiar `'Access-Control-Allow-Origin': '*'` por dominios específicos
- **Cómo:** En cada Edge Function:
  ```typescript
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
  ```
- **Impacto:** Ninguno si se despliega desde los dominios permitidos.
- **Verificación:** Llamar desde un dominio externo y verificar que se rechace

#### Paso 2.3: Eliminar Tailwind CDN, instalar como dependencia
- **Qué:** Eliminar `<script src="https://cdn.tailwindcss.com">` del index.html
- **Cómo:**
  1. `npm install tailwindcss @tailwindcss/vite`
  2. Configurar en `vite.config.ts` con el plugin `@tailwindcss/vite`
  3. Crear `styles/global.css` con `@import "tailwindcss";`
  4. Importar en `index.tsx`
  5. Eliminar `<script>` del CDN en `index.html`
- **Impacto:** Mejor performance (no descarga runtime JS de Tailwind en cada page load) + elimina dependencia externa insegura
- **Verificación:** Build + verificar que estilos se aplican correctamente

#### Paso 2.4: Evaluar y limpiar import maps
- **Qué:** Los import maps en `index.html` cargan React, Supabase, etc. desde `esm.sh`
- **Cómo:** Si Vite ya bundlea estas dependencias en el build:
  1. Verificar que `vite build` resuelve los imports desde `node_modules`
  2. Si los import maps son solo para dev/HMR, confirmar que no llegan a producción
  3. Si llegan a producción, eliminarlos y usar solo el bundle de Vite
- **Verificación:** Inspeccionar el HTML desplegado en Vercel y confirmar que no hay import maps

---

### FASE 3 — SPRINT ACTUAL (Auth Hardening) 🟡

#### Paso 3.1: Unificar política de contraseñas
- **Qué:** Login exige 6 chars, recovery exige 8
- **Cómo:**
  1. En `LoginScreen.tsx`, cambiar `minLength={6}` a `minLength={8}`
  2. Agregar validación de complejidad en frontend (informativa)
  3. Configurar en Supabase Dashboard → Auth → Password Min Length: 8
- **Impacto:** Usuarios con contraseñas de 6-7 chars no podrán registrarse (los existentes no se afectan)

#### Paso 3.2: Implementar rate limiting visual en login
- **Qué:** Agregar delay exponencial + CAPTCHA tras intentos fallidos
- **Cómo:**
  1. Contador de intentos fallidos en state
  2. Tras 3 intentos: delay de 5s, mostrar mensaje
  3. Tras 5 intentos: delay de 30s + bloquear botón
  4. Considerar integrar hCaptcha o Turnstile de Cloudflare
- **Impacto:** UX ligeramente más restrictiva, pero protege contra brute force

#### Paso 3.3: Limpiar información de error en Edge Functions
- **Qué:** No exponer `error.message` al cliente
- **Cómo:** En cada Edge Function, reemplazar:
  ```typescript
  // ANTES
  return new Response(JSON.stringify({ error: 'Function Error', detail: error.message }));
  
  // DESPUÉS  
  console.error('[EdgeFn] Error interno:', error);
  return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
  ```
- **Impacto:** Los errores se loguean server-side (visibles en Supabase Dashboard → Edge Functions → Logs)

#### Paso 3.4: Prevenir enumeración de usuarios
- **Qué:** Unificar mensajes de error en login/registro
- **Cómo:** Usar mensaje genérico: "Credenciales inválidas o cuenta no encontrada" para TODOS los errores de auth
- **Impacto:** UX levemente peor (el usuario no sabe si el email está mal o la contraseña), pero previene enumeración

#### Paso 3.5: Eliminar console.logs sensibles en producción
- **Qué:** Limpiar logs que exponen datos sensibles
- **Cómo:** Crear un wrapper de logging:
  ```typescript
  const isDev = import.meta.env.DEV;
  export const devLog = (...args: any[]) => { if (isDev) console.log(...args); };
  ```
  Reemplazar `console.log` con `devLog` en archivos sensibles.
- **Impacto:** Ninguno en producción, mantiene logs en desarrollo

---

### FASE 4 — PRÓXIMO SPRINT (Enterprise Hardening) 🟢

#### Paso 4.1: Implementar MFA/2FA
- Supabase soporta TOTP nativo
- Agregar pantalla de configuración en Settings
- Hacer MFA obligatorio para roles admin/super_admin

#### Paso 4.2: Idle session timeout
- Detectar inactividad de 30min y cerrar sesión
- Ya existe `useIdleDetection.ts` — extenderlo para auto-logout

#### Paso 4.3: Dependency scanning en CI
- Agregar `npm audit` en `.github/workflows/ci.yml`
- Considerar Snyk o Dependabot para alertas automáticas

#### Paso 4.4: Input validation schemas en Edge Functions
- Usar Zod para validar body de requests
- Previene payloads malformados y edge cases

#### Paso 4.5: Considerar backend proxy para cookies httpOnly
- Para SaaS enterprise, mover la sesión a cookies httpOnly vía un middleware en Vercel Edge
- Esto elimina el riesgo de robo de tokens vía XSS

---

## RESUMEN DE PRIORIDADES DE IMPLEMENTACIÓN

| # | Paso | Severidad | Esfuerzo | Riesgo de regresión |
|---|------|-----------|----------|---------------------|
| 1.1 | Rotar service_role key | 🔴 CRÍTICO | 15 min | Bajo |
| 1.2 | Fix guest login | 🔴 CRÍTICO | 30 min | Bajo |
| 2.1 | Cabeceras seguridad | 🟠 ALTO | 1 hora | Medio (CSP puede romper cosas) |
| 2.2 | Fix CORS Edge Functions | 🟠 ALTO | 1 hora | Bajo |
| 2.3 | Eliminar CDN Tailwind | 🟠 ALTO | 2 horas | Medio |
| 2.4 | Limpiar import maps | 🟠 ALTO | 30 min | Bajo |
| 3.1 | Política contraseñas | 🟡 MEDIO | 15 min | Bajo |
| 3.2 | Rate limiting login | 🟡 MEDIO | 2 horas | Bajo |
| 3.3 | Limpiar errores Edge | 🟡 MEDIO | 1 hora | Bajo |
| 3.4 | Anti-enumeración | 🟡 MEDIO | 15 min | Bajo |
| 3.5 | Limpiar console.logs | 🟡 MEDIO | 1 hora | Bajo |
| 4.1 | MFA/2FA | 🟢 BAJO | 1 día | Bajo |
| 4.2 | Idle timeout | 🟢 BAJO | 2 horas | Bajo |
| 4.3 | CI security scanning | 🟢 BAJO | 1 hora | Ninguno |
| 4.4 | Zod validation | 🟢 BAJO | 4 horas | Bajo |
| 4.5 | httpOnly cookies proxy | 🟢 BAJO | 1 día | Alto |

---

---

## 10. REGISTRO DE IMPLEMENTACIÓN — 2026-03-19

### Cambios aplicados ✅

| # | Vulnerabilidad | Archivo(s) | Cambio |
|---|---|---|---|
| VULN-002 | Guest login falso (mock session) | `components/LoginScreen.tsx` | Reemplazado por `supabase.auth.signInAnonymously()` |
| VULN-003 | 0 cabeceras de seguridad HTTP | `vercel.json` | Agregadas 8 cabeceras OWASP: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, X-DNS-Prefetch-Control |
| VULN-004 | CORS wildcard `*` en Edge Functions | `supabase/functions/enviar-invitacion/index.ts`, `enviar-invitacion-reunion/index.ts`, `enviar-resumen-reunion/index.ts`, `generar-resumen-ai/index.ts`, `validar-invitacion-reunion/index.ts` | CORS restringido a `mvp-cowork.vercel.app` y `localhost:3000` con `Vary: Origin` |
| VULN-009 | Contraseña mínima 6 chars | `components/LoginScreen.tsx` | `minLength` cambiado de 6 a 8, texto de ayuda actualizado |
| VULN-010 | Sin rate limiting en login | `components/LoginScreen.tsx` | Rate limiting client-side: 5 intentos → lockout 30s |
| VULN-011 | Info leak en errores Edge Functions | 5 Edge Functions | `error.message` reemplazado por mensajes genéricos; errores logueados server-side con `console.error` |
| VULN-012 | Enumeración de usuarios | `components/LoginScreen.tsx` | Mensajes de error unificados: "Credenciales inválidas o cuenta no encontrada" |
| VULN-017 | Console.logs sensibles en prod | `lib/devLog.ts` (nuevo) | Utilidad `devLog`/`devWarn`/`devError` que silencia logs en producción |

### Archivos creados
- `lib/devLog.ts` — Logger condicional desarrollo/producción
- `docs/SECURITY_AUDIT_REPORT.md` — Este documento

### Archivos modificados
- `components/LoginScreen.tsx` — Guest auth, rate limiting, minLength, anti-enumeración
- `vercel.json` — 8 cabeceras de seguridad HTTP
- `supabase/functions/enviar-invitacion/index.ts` — CORS + error sanitization
- `supabase/functions/enviar-invitacion-reunion/index.ts` — CORS + error sanitization
- `supabase/functions/enviar-resumen-reunion/index.ts` — CORS + error sanitization
- `supabase/functions/generar-resumen-ai/index.ts` — CORS + error sanitization
- `supabase/functions/validar-invitacion-reunion/index.ts` — CORS + error sanitization

### Pendiente — Acción manual requerida 🔴

1. **Rotar service_role key** — Supabase Dashboard → Settings → API → copiar la **anon key** real, rotar la service_role comprometida, actualizar `.env`
2. **Habilitar Anonymous Auth** — Dashboard → Authentication → Settings → activar "Allow anonymous sign-ins"
3. **Eliminar Tailwind CDN** — `npm install tailwindcss @tailwindcss/vite`, configurar plugin, eliminar `<script>` de `index.html`
4. **Verificar import maps en prod** — Confirmar que `esm.sh` no llega al HTML desplegado
5. **Redesplegar Edge Functions** — `supabase functions deploy` para las 5 funciones modificadas
6. **Adoptar devLog** — Reemplazar `console.log` por `devLog` progresivamente en archivos sensibles

---

*Documento generado como parte de auditoría de seguridad interna. Actualizar tras cada fase de remediación.*
