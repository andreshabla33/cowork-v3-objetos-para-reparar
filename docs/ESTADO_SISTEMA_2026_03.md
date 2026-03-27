# ESTADO ACTUAL DEL SISTEMA — Marzo 2026
## v2-cowork — Plataforma de Espacios Virtuales 3D Multi-tenant

**Repositorio:** github.com/durquijop/v2-cowork  
**Rama activa:** feature/empresa-multi-tenant  
**Producción:** mvp-cowork.vercel.app  
**Supabase:** ikhwxeluyzxtbirquoch (cowork mvp) — us-east-1  
**Última auditoría:** 2 de marzo de 2026  
**Fuentes:** Código fuente, 102 documentos en BD, 52 tablas, 12 Edge Functions, documentación oficial R3F/LiveKit/Supabase  

---

## 1. OBJETIVO DEL SISTEMA

Plataforma SaaS de "Oficinas Virtuales Persistentes" donde múltiples organizaciones coexisten en infraestructura compartida con aislamiento completo a nivel de datos, presencia y comunicación. Modelo de negocio: venta de "terrenos virtuales" por espacio.

**Diferenciadores verificados vs. competencia (Gather, Virbela, Spatial, Mozilla Hubs, IR Engine):**
- Multi-tenancy nativa con privacidad inter-empresa (ningún competidor lo ofrece)
- 3D real en browser sin descargas (Three.js/R3F, no Unity)
- Análisis conductual IA de reuniones (feature enterprise que nadie tiene en 3D)
- Agente IA proactivo (Mónica) integrado en el espacio virtual

---

## 2. PROBLEMA QUE RESUELVE

"Soledad Operativa" del trabajo remoto: ausencia de señales de contexto social (¿está disponible mi colega? ¿en qué está trabajando?) que en entornos físicos son implícitas.

Slack/Zoom resuelven comunicación asíncrona y síncrona planificada. Cowork resuelve **presencia continua y orgánica** — saber quién está, dónde está, y poder interactuar espontáneamente sin agendar una llamada.

---

## 3. ARQUITECTURA ACTUAL (Verificada contra código)

```
CAPA DE CLIENTE (Browser)
┌──────────────────────────────────────────────────────────────────┐
│  React 19.2 + React Three Fiber 9.5 + Drei 10.7 + Three 0.182  │
│  Estado Global: Zustand 5.0 (useStore.ts — monolítico)          │
│  i18n: react-i18next + i18next-browser-languagedetector         │
│  UI: Glassmorphism 2026, Lucide React icons                     │
│                                                                  │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │ VirtualSpace3D  │ │ WorkspaceLayout  │ │ MeetingRoom      │  │
│  │ (core 3D loop)  │ │ (presence+chunks)│ │ (LiveKit UI)     │  │
│  │ ~4900 líneas    │ │                  │ │                  │  │
│  └─────────────────┘ └──────────────────┘ └──────────────────┘  │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │ Avatar3DGLTF    │ │ SpatialAudio     │ │ MobileJoystick   │  │
│  │ (GLTF+anim)     │ │ (HRTF 3D)       │ │ (touch virtual)  │  │
│  └─────────────────┘ └──────────────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
CAPA DE REALTIME
┌────────────────────────────┐  ┌──────────────────────────────────┐
│  Supabase Realtime          │  │  LiveKit Cloud SFU               │
│  (WebSocket)                │  │  wss://cowork-g3ad9x0b.livekit   │
│  ├─ RealtimeChunkManager   │  │  .cloud                          │
│  │  canales por chunk:      │  │                                  │
│  │  chunk:{espacio}:{clave} │  │  1 sala por espacio              │
│  ├─ Movimiento (broadcast)  │  │  autoSubscribe: false            │
│  ├─ Chat mensajes           │  │  Patrón 3 niveles:              │
│  ├─ Reacciones/Waves        │  │  ├─ setSubscribed(true) 1 vez   │
│  ├─ lock_conversation       │  │  ├─ setEnabled(t/f) por prox.   │
│  └─ Estado presencia        │  │  └─ setSubscribed(false) +5s    │
│                             │  │      debounce al salir           │
│  Buffer: 5x5 chunks vecinos│  │                                  │
│  Chunk size: 200x200 wu     │  │  Publish delay: 500ms           │
└────────────────────────────┘  └──────────────────────────────────┘
         │
         ▼
CAPA DE DATOS (Supabase PostgreSQL)
┌──────────────────────────────────────────────────────────────────┐
│  52 tablas — TODAS con Row Level Security habilitado             │
│  39 funciones SQL públicas (25 SECURITY DEFINER)                 │
│  80+ políticas RLS                                               │
│  pg_cron: 2 jobs (limpiar-salas-zombie c/2h,                    │
│           marcar-participantes-zombie c/10min)                   │
│                                                                  │
│  Tablas core:                                                    │
│  ├─ empresas (17 cols)          ├─ miembros_espacio (17 cols)   │
│  ├─ espacios_trabajo (10 cols)  ├─ usuarios (12 cols)           │
│  ├─ zonas_empresa (16 cols)     ├─ autorizaciones_empresa       │
│  ├─ grabaciones (25 cols)       ├─ analisis_comportamiento      │
│  ├─ salas_reunion (17 cols)     ├─ participantes_sala (16 cols) │
│  ├─ mensajes_chat               ├─ grupos_chat                  │
│  ├─ avatares_3d (13 cols)       ├─ avatar_animaciones (11 cols) │
│  ├─ gamificacion_* (6 tablas)   ├─ partidas_ajedrez (19 cols)  │
│  └─ registro_conexiones         └─ actividades_log (~2300 rows) │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
CAPA DE LÓGICA DE NEGOCIO (12 Edge Functions — Deno)
┌──────────────────────────────────────────────────────────────────┐
│  enviar-invitacion (v30)      │ verify_jwt: false                │
│  enviar-invitacion-reunion    │ verify_jwt: false                │
│  enviar-resumen-reunion       │ verify_jwt: false                │
│  generar-resumen-ai (v14)     │ verify_jwt: false                │
│  livekit-token (v10)          │ verify_jwt: false                │
│  monica-ai-proxy (v7)         │ verify_jwt: false                │
│  validar-invitacion-reunion   │ verify_jwt: false                │
│  upload-avatar-storage (v5)   │ verify_jwt: false                │
│  edge-proxy-posiciones        │ verify_jwt: true                 │
│  generate-avatar (v8)         │ verify_jwt: true                 │
│  check-3d-status (v11)        │ verify_jwt: true                 │
│  generar-misiones-diarias     │ verify_jwt: true                 │
└──────────────────────────────────────────────────────────────────┘

CAPA DE STORAGE (Supabase Storage)
┌──────────────────────────────────────────────────────────────────┐
│  Buckets públicos:                                               │
│  ├─ avatars: GLBs de modelos 3D, animaciones, texturas          │
│  ├─ avatares: avatares generados por IA (pipeline Meshy)        │
│  ├─ chat-files: archivos adjuntos de chat                       │
│  └─ grabaciones: recordings de videollamadas                    │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de Privacidad Espacial (4 capas verificadas)

```
CAPA 1: No auto-activar mic/cam (patrón Gather)
  → hasActiveCall = true solo muestra banner "X está cerca"
  → Usuario DEBE activar mic/cam manualmente

CAPA 2: Lock Conversation (candado)
  → Cualquier participante puede bloquear
  → Broadcast via LiveKit DataChannel + Supabase Realtime
  → Otros usuarios que se acerquen NO se suscriben a tracks

CAPA 3: Interest Management inter-empresa
  → Usuarios fuera de empresa → esFantasma: true
  → Sin nombre real, sin estado multimedia, sin proximidad
  → Admin/Super Admin ven todos los datos

CAPA 4: Zonas de empresa (BD lista, UI pendiente)
  → zonas_empresa: color, branding, límites
  → autorizaciones_empresa: solicitud de acceso temporal
  → GhostAvatar: silueta gris sin datos
```

### Flujo de Audio Espacial (verificado en código)

```
SpatialAudio.tsx — Web Audio API:
  PannerNode:
    panningModel = 'HRTF'
    distanceModel = 'inverse'
    rolloffFactor = 0.8            ← (NO 1.5 como decía el resumen anterior)
    refDistance = 1
    maxDistance = 25 (≈400 world units con SCALE=1/16)
  
  AudioListener posicionado en usuario actual (lx, lz)
  Cada PannerNode posicionado en coordenadas del remoto

Constantes de proximidad (VirtualSpace3D.tsx):
  PROXIMITY_RADIUS = 180           ← configurable por usuario
  AUDIO_SPATIAL_RADIUS_FACTOR = 2  ← radio audio = 360 (default)
  Histéresis: 1.2x para desconectar (evita flicker en borde)
  Unsubscribe debounce: 5000ms
```

---

## 4. QUÉ ESTÁ FUNCIONANDO

### Core de Comunicación A/V — Producción
- **LiveKit sala única por espacio** con autoSubscribe:false. Eliminó 42 room sessions/semana → 1-2. Reconexiones al moverse: 0.
- **Suscripción selectiva** por proximidad con patrón setEnabled/setSubscribed de 3 niveles (documentado y verificado en código).
- **Audio espacial 3D HRTF** con PannerNode. Atenuación perceptible validada con 2 usuarios concurrentes.
- **9 fixes de estabilidad LiveKit** documentados y verificados (race conditions, TrackUnsubscribed, publish delay, debounce).

### Multi-tenancy RLS — Producción
- **52 tablas con RLS habilitado** sin excepción.
- **25 funciones SECURITY DEFINER** como helpers (es_miembro_de_espacio, es_admin_espacio, es_miembro_misma_empresa, etc.).
- empresa_id en miembros_espacio, invitaciones_pendientes, zonas_empresa. Usuario de Empresa A no puede consultar filas de Empresa B.

### Sistema de Videollamadas — Funcional
- Salas con tipos (equipo/deal/entrevista), lobby para externos, controles glassmorphism.
- **Auto-cierre de salas zombie**: 5 capas (trigger DELETE, trigger UPDATE estado, pg_cron 2h, heartbeat 60s, pg_cron 10min marcado zombie).
- **Invitados externos** sin cuenta: token_hash + Edge Function + consentimiento via DataChannel.

### Sistema de Grabación + Análisis Conductual — Funcional
- Grabación local MediaRecorder (WebM VP9) con consentimiento.
- **generar-resumen-ai** (Edge Function v14): transcripción + resumen IA.
- Tablas: grabaciones (25 cols), participantes_grabacion, transcripciones, resumenes_ai, analisis_comportamiento.
- Métricas customizables por tipo de reunión.

### Avatares Pre-rigged (Mixamo) — Funcional
- Sistema 100% dinámico desde BD: `avatares_3d` + `avatar_animaciones`.
- 9 animaciones por avatar (idle, walk, run, dance, cheer, sit, wave, jump, victory).
- `remapAnimationTracks()` con normalización de huesos y matchRate threshold 30%.
- **Nuevo: GLB all-in-one** — avatares con todas las animaciones embebidas funcionan sin entradas en avatar_animaciones (EMBEDDED_NAME_MAP automático).
- Clone inteligente: SkeletonUtils.clone para SkinnedMesh, scene.clone para estáticos.

### Gamificación — Funcional
- 6 tablas: `gamificacion_items`, `gamificacion_logros`, `gamificacion_logros_usuario`, `gamificacion_misiones` (21 misiones), `gamificacion_usuarios`, `estadisticas_jugador`.
- Edge Function `generar-misiones-diarias`.
- Minijuego de ajedrez online: `partidas_ajedrez` (19 cols), `sesiones_juego`, `historial_juegos`, `invitaciones_juegos`.

### Otros Módulos Funcionales
- **Agente IA Mónica**: Edge Function `monica-ai-proxy` (v7) como proxy a OpenAI/OpenRouter.
- **i18n**: react-i18next con detección automática de idioma del browser.
- **Product Tour**: Driver.js para onboarding guiado.
- **Sistema de invitaciones**: Edge Function v30, empresa_id fallback 3 niveles, email via Resend (noreply@urpeailab.com).
- **Tracking de conexiones**: registro_conexiones (~782 registros), duracion_minutos calculado, visible para CEO/COO.
- **Mini Mode**: overlay flotante para trabajo en paralelo.
- **Optimizaciones 3D implementadas**: PerformanceMonitor + DPR adaptativo, LOD (Full/Sprite/Dot), frustum culling, instancing de props, throttle broadcast, frameloop="demand" (2fps idle → 93% menos GPU).

---

## 5. QUÉ NO ESTÁ FUNCIONANDO

### BLOQUEADO: T-Pose en Avatares Meshy AI
- **Causa raíz verificada**: Rigs Meshy usan jerarquía de spine invertida (Hips→Spine02→Spine01→Spine) vs. Mixamo (Hips→Spine→Spine1→Spine2). 24 huesos vs 25.
- `remapAnimationTracks()` normaliza nombres pero **no retargetea la jerarquía**. Resultado: T-pose al reproducir animaciones Mixamo sobre esqueleto Meshy.
- **Cada avatar Meshy necesita sus propias animaciones** (misma rest pose). Las animaciones de Monica/Mixamo no son intercambiables.
- Los `.scale` tracks de Meshy causan inflación de huesos (cabeza como globo) → se stripean. Los `.position` tracks se conservan.
- **Impacto**: Pipeline de generación de avatares por IA (generate-avatar Edge Function + Meshy API) produce avatares que se ven en T-pose en el espacio virtual. Solo funcionan en el customizer.

### DEGRADADO: Rendering con >10 avatares simultáneos
- Sin InstancedMesh para avatares (solo para props/sillas).
- Cada avatar SkinnedMesh = múltiples draw calls (mesh + materiales + skinning).
- Con 10+ avatares animados y cámaras activas, se superan 200-300 draw calls.
- **No verificado en producción masiva** — máximo probado: 2 usuarios concurrentes. Estimación teórica basada en documentación R3F.

### FUNCIONAL BÁSICO: UX Móvil
- MobileJoystick.tsx existe con dead zone configurable (0.15), run threshold (0.7) y feedback háptico.
- **No validado** extensivamente en múltiples dispositivos.
- Responsive UI auditada pero con issues documentados pendientes.

### NO IMPLEMENTADO: Zonas de Empresa (Visual)
- BD lista: tablas `zonas_empresa` (16 cols), `autorizaciones_empresa` (11 cols) con RLS.
- Componentes `ZonaEmpresa.tsx`, `GhostAvatar.tsx`, `SettingsZona.tsx` **planificados pero no implementados** en código.

---

## 6. NIVEL REAL DE AVANCE (% Honesto)

| Componente | Estado | % | Evidencia |
|---|---|---|---|
| Core comunicación A/V | Producción | **92%** | 9 fixes LiveKit documentados. Validado 2 usuarios. No probado con >5. |
| Multi-tenancy RLS | Producción | **98%** | 52/52 tablas con RLS. 80+ policies. Funciones helper DEFINER. |
| Sistema de videollamadas | Funcional | **88%** | Salas, lobby, tipos, grabación, zombie cleanup. Falta screen share HD estable. |
| Sistema de grabación + IA | Funcional | **80%** | Grabación + transcripción + resumen funciona. Análisis conductual parcial. |
| Avatares pre-rigged | Funcional | **90%** | Dinámico desde BD, 9 anims, GLB all-in-one. Escala manual (no auto). |
| Avatares generados IA | Bloqueado | **25%** | Pipeline Meshy genera modelos. T-pose en espacio virtual. Sin retargeting. |
| Gamificación | Funcional básico | **55%** | BD completa (6 tablas, misiones). UI parcial. Ajedrez funcional. |
| UX Móvil | Funcional básico | **50%** | Joystick existe. No validado multi-dispositivo. Responsive con gaps. |
| Optimización rendering | Parcial | **45%** | LOD/DPR/frustum/frameloop implementados. Sin InstancedMesh avatares. |
| Zonas de empresa (visual) | BD lista | **20%** | Tablas + RLS listos. Componentes UI no implementados. |
| Privacidad 4 capas | Funcional | **75%** | Capas 1-3 funcionales. Capa 4 (zonas) solo BD. |
| Agente IA Mónica | Funcional básico | **40%** | Proxy funciona. Sin proactividad, sin avatar 3D integrado en espacio. |

### **Avance Global Ponderado: ~72%**

Justificación: El core (comunicación, RLS, videollamadas) está sólido. Pero módulos enteros (zonas visuales, IA proactiva, avatares generados, optimización para escala) están incompletos. El número 85% del resumen anterior era optimista.

---

## 7. RIESGOS TÉCNICOS IDENTIFICADOS

### RIESGO ALTO: Escalabilidad de Rendering

**Documentación oficial R3F** (r3f.docs.pmnd.rs/advanced/scaling-performance):
> "Each mesh is a draw call, you should be mindful of how many of these you employ: no more than 1000 as the very maximum, and optimally a few hundred or less."

- Cada avatar SkinnedMesh con materiales genera 3-8 draw calls.
- Con 10 avatares: ~30-80 draw calls solo de avatares + escena base.
- **Límite práctico estimado sin InstancedMesh: 15-20 usuarios** antes de caer bajo 30fps en GPUs integradas.
- InstancedMesh NO es trivial para SkinnedMesh animados — requiere instanced skinning (Three.js no lo soporta nativamente en 0.182).
- **Mitigación actual**: LOD (sprites a distancia), entity sleep, frustum culling, frameloop demand. Esto ayuda pero no resuelve el problema raíz.

### RIESGO ALTO: Costos LiveKit en Escala

**LiveKit pricing verificado** (blog.livekit.io, Ene 2026):
- Bandwidth: $0.12/GB (baja con volumen)
- Free tier: 500GB/mes

**Cálculo corregido** (considerando suscripción selectiva ya implementada):
- Con autoSubscribe:false, un usuario solo consume bandwidth de los ~2-4 peers cercanos, no de toda la sala.
- Sesión 10 personas, 1h, pero cada par solo conecta ~15min promedio → ~0.5-1GB por sesión (no 3-5GB).
- 100 sesiones concurrentes/mes → ~50-100GB → ~$0-$6/mes en bandwidth puro (dentro del free tier).
- **Riesgo real**: participant minutes ($0.006/min). 100 sesiones × 10 participantes × 30min = 30,000 min = $180/mes.
- **Riesgo mayor**: si se escala a 1000 sesiones concurrentes → ~$1,800/mes en participant minutes.

### RIESGO MEDIO: VirtualSpace3D.tsx Monolítico

- **~4,900 líneas** en un solo archivo.
- Contiene: lógica de movimiento, proximidad, LiveKit, Realtime, chunks, rendering, UI, animaciones contextuales, lock conversation, screen share.
- **Impacto**: debugging costoso, merge conflicts frecuentes, re-renders innecesarios.
- No hay separación en hooks custom o sub-componentes aislados para las distintas responsabilidades.

### RIESGO MEDIO: Edge Functions sin verify_jwt

- **8 de 12** Edge Functions tienen `verify_jwt: false`.
- Justificación documentada: el gateway de Supabase rechazaba tokens antes de llegar a la función. Cada función maneja auth internamente con `getUser(token)`.
- **Riesgo**: si alguna función tiene un bug en su validación interna, queda expuesta sin la capa de protección del gateway.

---

## 8. DEUDA TÉCNICA EXISTENTE

### 1. useStore Monolítico (store/useStore.ts)
**Verificado**: AppState interface tiene 77 propiedades/métodos en un solo store Zustand. Mezcla:
- **Red**: setOnlineUsers, empresasAutorizadas (debería ser NetworkSlice)
- **UI**: view, activeSubTab, isMiniMode, notifications (debería ser UISlice)
- **Dominio**: currentUser, workspaces, tasks, avatar3DConfig (debería ser PlayerSlice/WorkspaceSlice)

Sin separación en slices → cada `set()` causa re-evaluation de todos los selectores. Con 50+ componentes suscritos, esto es medible.

### 2. Mixamo Lock-in en Avatar3DGLTF.tsx
- `normalizeBoneName()` + `BONE_ALIASES` asumen nomenclatura Mixamo (mixamorigHips, mixamorigSpine, etc.)
- Para Meshy se agregó spine chain detection como parche, no como solución genérica.
- **No existe módulo de retargeting** entre esqueletos arbitrarios. Three.js `SkeletonUtils.retarget()` tiene bugs conocidos (discutido en Three.js forums).
- Cualquier avatar con rig diferente (VRM, Meshy, RPM, custom) requiere trabajo manual.

### 3. Hardcoded STORAGE_BASE
- `Avatar3DGLTF.tsx` línea 42: `const STORAGE_BASE = 'https://lcryrsdyrzotjqdxcwtp.supabase.co/...'`
- Apunta al proyecto viejo. Con la migración a `ikhwxeluyzxtbirquoch`, esto debe actualizarse.
- `DEFAULT_MODEL_URL` también hardcoded al proyecto viejo.

### 4. Avatares 3D con Escala Manual
- `Box3.setFromObject()` no funciona con SkinnedMesh (reporta ~0.027m cuando el modelo real es ~1.7m).
- Auto-escala eliminada. Escala viene 100% del campo `escala` en tabla `avatares_3d`.
- Cada nuevo avatar requiere calcular manualmente: `TARGET_HEIGHT / geometryHeight`.

### 5. Sin Tests Automatizados
- 0 tests unitarios, 0 tests de integración, 0 tests E2E.
- Toda la validación es manual.
- Riesgo alto de regresiones silenciosas.

---

## 9. LIMITACIONES DE INFRAESTRUCTURA

### RLS Overhead — Cuantificado
**Documentación oficial Supabase** (supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices):
- SIN optimizar: queries con `auth.uid()` en tablas 100K rows → **170ms**
- CON index + (select auth.uid()) wrapping → **<0.1ms** (mejora 1700x)
- CON security definer functions + wrapping → **7-12ms** (mejora 100x)

**Estado del proyecto**: Usa funciones SECURITY DEFINER (`es_miembro_de_espacio()`, `es_admin_espacio()`) que se evalúan por fila. **No verificado si están wrapped con `(select ...)`**. Si no lo están, cada query con RLS complejo podría añadir 100-300ms en tablas grandes.

**Dato actual**: La tabla más grande es `actividades_log` con ~2,300 filas. A esta escala, el overhead de RLS es insignificante (<5ms). El riesgo aparece cuando tablas como `mensajes_chat` o `registro_conexiones` superen las 100K filas.

### Edge Function Cold Starts — Cuantificado
**Supabase blog** (Dic 2024): "97% faster cold starts" con persistent storage.  
**Comunidad GitHub** (#29301): "1.2s cold starts to ~400-200ms with repeated requests."

**Estado real**: Cold starts de 200-400ms para funciones medianas (~50 imports como `enviar-invitacion`). Warm requests: <50ms. No comparable con Cloudflare Workers (<20ms cold) pero aceptable para operaciones no-críticas.

**Mitigación**: Las funciones más sensibles a latencia (livekit-token) son pequeñas y se mantienen warm con uso frecuente.

### Supabase Realtime — Límites
- Canales concurrentes por proyecto: 200 (plan Pro), 500 (Enterprise)
- Con chunks 200x200 y buffer 5x5 = 25 canales por usuario
- **Límite teórico**: ~8 usuarios concurrentes en plan Free, ~20 en Pro
- **Mitigación**: RealtimeChunkManager reduce fan-out ~100x vs. canal global

### LiveKit — Límites
- Cloud free tier: 500GB bandwidth/mes, 1000 participant-minutes (estimado)
- Sin bitrate adaptativo implementado (Simulcast/Dynacast disponible en LiveKit pero no configurado)
- Screen share: encoding VP8 por defecto, no configurado para alta resolución

---

## 10. DATOS DUROS DEL PROYECTO

### Base de Datos
| Métrica | Valor |
|---|---|
| Tablas públicas | 52 |
| Tablas con RLS | 52/52 (100%) |
| Funciones SQL | 39 (25 SECURITY DEFINER) |
| Políticas RLS | 80+ |
| pg_cron jobs | 2 |
| Documentos en BD | 103 |
| Tareas de desarrollo | 79 |
| Total filas (aprox) | ~4,500 |

### Frontend
| Métrica | Valor |
|---|---|
| Framework | React 19.2.3 + Vite 6.2 |
| 3D Engine | Three.js 0.182 + R3F 9.5 + Drei 10.7 |
| State | Zustand 5.0 |
| Physics | @react-three/rapier 2.2 |
| Video | LiveKit (livekit-client 2.17, components-react 2.9) |
| i18n | i18next 25.8 + react-i18next 16.5 |
| Onboarding | Driver.js 1.4 |
| TypeScript | 5.8.2 |

### Edge Functions
| Función | Versión | JWT | Propósito |
|---|---|---|---|
| enviar-invitacion | v30 | false | Invitaciones por email (Resend) |
| generar-resumen-ai | v14 | false | Transcripción + resumen IA (OpenAI) |
| livekit-token | v10 | false | Genera tokens JWT para LiveKit |
| enviar-invitacion-reunion | v11 | false | Invitación calendario (Resend) |
| enviar-resumen-reunion | v4 | false | Email post-reunión |
| monica-ai-proxy | v7 | false | Proxy a OpenAI/OpenRouter |
| validar-invitacion-reunion | v4 | false | Validar token invitado externo |
| upload-avatar-storage | v5 | false | Upload + auto-registro avatar |
| generate-avatar | v8 | true | Pipeline Meshy AI 3D |
| check-3d-status | v11 | true | Polling estado job Meshy |
| generar-misiones-diarias | v5 | true | Gamificación diaria |
| edge-proxy-posiciones | v4 | true | Proxy posiciones servidor |

### Storage Buckets
| Bucket | Tipo | Contenido |
|---|---|---|
| avatars | público | GLBs modelos, animaciones, texturas |
| avatares | público | Avatares generados por Meshy AI |
| chat-files | público | Archivos adjuntos de chat |
| grabaciones | público | Recordings videollamadas |

---

## 11. PRÓXIMOS PASOS CRÍTICOS (Priorizado)

1. **Configurar secrets en nuevo proyecto Supabase** (MANUAL) — RESEND_API_KEY, OPENAI_API_KEY, LIVEKIT_API_KEY/SECRET/URL, GEMINI_API_KEY, MESHY_API_KEY
2. **Actualizar STORAGE_BASE** en Avatar3DGLTF.tsx al nuevo proyecto
3. **Resolver T-pose Meshy** — evaluar: (a) generar animaciones con rest pose del avatar, (b) retargeting en Blender pre-export, (c) Mixamo auto-rig como paso intermedio
4. **Refactorizar VirtualSpace3D.tsx** — extraer hooks: useProximity, useLiveKitRoom, useRealtimeChunks, useAnimationState
5. **Implementar Simulcast/Dynacast en LiveKit** — reducción de bandwidth sin esfuerzo
6. **Agregar tests** — al menos E2E para flujos críticos (login → espacio → proximidad → audio)
7. **Wrapping de funciones RLS** — `(select es_miembro_de_espacio())` para prevenir degradación en escala
