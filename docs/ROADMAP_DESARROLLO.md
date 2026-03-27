# 🚀 Roadmap de Desarrollo - MVP Cowork Virtual

> **Fecha de creación:** 15 de Enero 2026  
> **Última actualización:** 26 de Enero 2026

---

## 📊 Análisis Competitivo vs Gather.town

### Funcionalidades Comparadas

| Funcionalidad | Gather | Nosotros | Estado |
|---------------|:------:|:--------:|:------:|
| Espacio virtual | 2D Pixel | 3D React Three | ✅ Ventaja |
| Avatares animados | ✅ | ⚠️ Básico | Fase 3 |
| Video/Audio por proximidad | ✅ | ✅ | ✅ Completado |
| Screen sharing | ✅ | ✅ | ✅ Completado |
| Reacciones emoji | ✅ | ✅ | ✅ Completado |
| Chat con canales | ✅ | ✅ | ✅ Completado |
| Canales privados | ✅ | ✅ | ✅ Completado |
| Mensajes directos (DM) | ✅ | ✅ | ✅ Completado |
| Threads/Hilos | ✅ | ✅ | ✅ Completado |
| Menciones @usuario | ✅ | ✅ | ✅ Completado |
| Typing indicator | ✅ | ✅ | ✅ Completado |
| Archivos adjuntos | ✅ | ✅ | ✅ Completado |
| Toast notifications | ✅ | ✅ | ✅ Completado |
| Unread counts | ✅ | ✅ | ✅ Completado |
| Salas de reunión | ✅ | ✅ | ✅ Completado |
| Reuniones programadas | ✅ | ❌ | **Fase 1** |
| Integración Calendar | ✅ | ❌ | **Fase 1** |
| Grabación de reuniones | ✅ | ✅ | ✅ Completado |
| AI Meeting Notes | ✅ | ✅ | ✅ Completado |
| Transcripción local (MoonshineJS) | ❌ | ✅ | ✅ Ventaja |
| Análisis de emociones (MediaPipe) | ❌ | ✅ | ✅ Ventaja |
| AI Agents en espacio | ❌ | 🎯 | Diferenciador |

---

## 🏗️ Arquitectura Actual

### Componentes Principales

```
src/
├── components/
│   ├── VirtualSpace3D.tsx    # Espacio 3D principal + WebRTC
│   ├── Avatar3DGLTF.tsx      # Avatar procedural (reemplazable)
│   ├── ChatPanel.tsx         # Chat básico actual
│   ├── ChatSidebar.tsx       # Sidebar de chat
│   └── ...
├── store/
│   └── useStore.ts           # Estado global (Zustand)
├── lib/
│   └── supabase.ts           # Cliente Supabase
└── types/
    └── index.ts              # Tipos TypeScript
```

### Decisión Arquitectónica: Avatares

**El componente de avatar está DESACOPLADO del resto del sistema.**

```typescript
// Interface actual del avatar (NO CAMBIAR)
interface ProceduralAvatarProps {
  config: {
    skinColor?: string;
    clothingColor?: string;
    hairColor?: string;
    hairStyle?: string;
    accessory?: string;
    eyeColor?: string;
  };
  isMoving?: boolean;
  direction?: string;
}
```

**Impacto:** Cuando implementemos avatares GLTF (Fase 3), solo cambiamos el componente interno manteniendo la misma interfaz. Chat y Reuniones NO se ven afectados.

---

## 📅 Fases de Desarrollo

### ✅ Ya Implementado (Chat Completo)

El sistema de chat ya está **completamente funcional** con:

| Feature | Archivo | Estado |
|---------|---------|:------:|
| Canales públicos/privados | `ChatPanel.tsx` | ✅ |
| Mensajes directos (DM) | `ChatPanel.tsx` | ✅ |
| Threads/hilos | `openThread()`, `respuesta_a` | ✅ |
| Menciones @usuario | `detectMentions()`, `insertMention()` | ✅ |
| Typing indicator | `typingChannel` broadcast | ✅ |
| Toast notifications | `ChatToast.tsx` | ✅ |
| Unread counts por canal | `unreadByChannel` state | ✅ |
| Archivos adjuntos | `handleFileAttach()` | ✅ |
| Emojis | `emojis[]` picker | ✅ |
| Realtime | Supabase postgres_changes | ✅ |
| Salas de reunión | `MeetingRooms.tsx` | ✅ |
| Crear/unirse a salas | `createRoom()`, `joinRoom()` | ✅ |

---

### ✅ Fase 1: Reuniones Programadas con Google Calendar - COMPLETADO

**Objetivo:** Sistema de reuniones con calendario  
**Fecha completado:** 27 de Enero 2026

#### Funcionalidades Implementadas

| # | Feature | Estado | Archivo |
|---|---------|:------:|---------|
| 1.1 | Programar reuniones con fecha/hora | ✅ | `CalendarPanel.tsx` |
| 1.2 | Integración Google Calendar | ✅ | `lib/googleCalendar.ts` |
| 1.3 | Invitaciones por email a participantes | ✅ | Google Calendar API |
| 1.4 | Google Meet automático | ✅ | `createEvent()` |
| 1.5 | Eliminación sincronizada | ✅ | `deleteEvent()` |
| 1.6 | Vista de calendario en UI | ✅ | Mini calendario |

#### Documentación
Ver `docs/FASE1_CALENDARIO_GOOGLE.md` para documentación completa.

#### Tablas Supabase Requeridas

```sql
-- Reuniones programadas
CREATE TABLE IF NOT EXISTS reuniones_programadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio_id UUID NOT NULL REFERENCES espacios_trabajo(id) ON DELETE CASCADE,
  sala_id UUID REFERENCES salas_reunion(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  creado_por UUID REFERENCES auth.users(id),
  google_event_id VARCHAR(255), -- Para sincronización con Google Calendar
  es_recurrente BOOLEAN DEFAULT false,
  recurrencia_regla TEXT, -- Ej: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  recordatorio_minutos INTEGER DEFAULT 15,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Participantes de reunión programada
CREATE TABLE IF NOT EXISTS reunion_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id UUID NOT NULL REFERENCES reuniones_programadas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado VARCHAR(20) DEFAULT 'pendiente', -- pendiente, aceptado, rechazado, tentativo
  notificado BOOLEAN DEFAULT false,
  UNIQUE(reunion_id, usuario_id)
);
```

---

### ✅ Fase 2: Grabación y AI Notes - COMPLETADO

**Objetivo:** Grabar reuniones y generar notas automáticas con AI  
**Fecha completado:** 26 de Enero 2026

#### Tecnologías Implementadas

| Tecnología | Propósito | Ventaja |
|------------|-----------|---------|
| **MoonshineJS** | Transcripción ASR local | 5-15x más rápido que Whisper, sin costos API |
| **MediaPipe Face Landmarker** | Análisis de emociones | 52 blendshapes, engagement en tiempo real |
| **OpenAI GPT-4o-mini** | Resumen AI | Action items, puntos clave |
| **MediaRecorder API** | Grabación nativa | Sin dependencias externas |

#### Funcionalidades Implementadas

| # | Feature | Estado | Archivo |
|---|---------|:------:|---------|
| 2.1 | Grabación de audio/video | ✅ | `useRecording.ts` |
| 2.2 | Almacenamiento en Supabase Storage | ✅ | Bucket `grabaciones` |
| 2.3 | Transcripción local (MoonshineJS) | ✅ | `useTranscription.ts` |
| 2.4 | Análisis de emociones (MediaPipe) | ✅ | `useEmotionAnalysis.ts` |
| 2.5 | Resumen AI con GPT-4o-mini | ✅ | `generar-resumen-ai/` |
| 2.6 | Extracción de action items | ✅ | Edge Function |
| 2.7 | Notificación al creador | ✅ | `useAISummary.ts` |

#### Componentes UI

```
components/meetings/recording/
├── RecordingButton.tsx       # Botón con animación de pulso
├── RecordingIndicator.tsx    # Badge "REC" con timer
├── RecordingConsent.tsx      # Modal de consentimiento
├── TranscriptionTimeline.tsx # Timeline con emociones
└── AISummaryPanel.tsx        # Panel resumen + action items
```

#### Flujo de Datos

```
Audio Stream → MoonshineJS → Transcripción Tiempo Real
                    ↓
Video Stream → MediaPipe → Análisis Emociones (52 blendshapes)
                    ↓
            Al finalizar grabación
                    ↓
Edge Function (OpenAI GPT-4o-mini) → Resumen + Action Items
                    ↓
            Notificación al creador
```

#### Tablas Supabase

Ver `docs/FASE2_GRABACION_MIGRACIONES.sql` para schema completo:
- `grabaciones` - Metadata de grabaciones
- `transcripciones` - Segmentos con timestamps
- `analisis_comportamiento` - Emociones y engagement
- `resumenes_ai` - Resumen, action items, métricas
- `notificaciones` - Sistema de notificaciones

---

### Fase 3: Avatares 3D Avanzados

**Objetivo:** Avatares GLTF con animaciones completas

#### Funcionalidades

| # | Feature | Prioridad | Esfuerzo |
|---|---------|-----------|----------|
| 3.1 | Modelos GLTF chibi | Alta | 5 días* |
| 3.2 | Animaciones (idle, walk, sit, work) | Alta | 3 días |
| 3.3 | Sistema de emotes animados | Media | 2 días |
| 3.4 | Accesorios modulares | Baja | 2 días |
| 3.5 | Selector de avatar mejorado | Media | 2 días |

*Depende de si compramos assets o creamos custom

#### Opciones para Modelos

| Opción | Costo | Tiempo | Calidad |
|--------|-------|--------|---------|
| Synty Studios Pack | ~$30-40 | 1 día | Alta |
| Quaternius (gratis) | $0 | 1 día | Media |
| Artista 3D (Fiverr) | ~$100-300 | 1-2 semanas | Custom |
| Crear en Blender | $0 | 2-4 semanas | Variable |

#### Cambios Requeridos

```typescript
// Avatar3DGLTF.tsx - Nuevo componente
import { useGLTF, useAnimations } from '@react-three/drei';

export const GLTFAvatar: React.FC<AvatarProps> = ({ config, isMoving, direction }) => {
  const { scene, animations } = useGLTF('/avatars/chibi-base.glb');
  const { actions } = useAnimations(animations, scene);
  
  useEffect(() => {
    const anim = isMoving ? 'walk' : 'idle';
    actions[anim]?.reset().fadeIn(0.2).play();
  }, [isMoving]);
  
  // Aplicar colores a materiales
  // Rotar según direction
  
  return <primitive object={scene} />;
};
```

**Impacto en otras fases:** NINGUNO - El avatar es un componente aislado.

---

### 🚧 Fase 3.5: Zonas de Empresa y Privacidad Multi-empresa

**Objetivo:** Crear zonas visuales por empresa y mostrar avatares fantasma para usuarios no autorizados.

#### Entregables principales

| # | Feature | Estado | Archivo |
|---|---------|:------:|---------|
| 3.5.1 | Render de zonas por empresa | ✅ | `components/3d/ZonaEmpresa.tsx`, `VirtualSpace3D.tsx` |
| 3.5.2 | Avatares fantasma para empresas no autorizadas | ✅ | `components/3d/GhostAvatar.tsx`, `VirtualSpace3D.tsx` |
| 3.5.3 | Servicio de autorizaciones entre empresas | ✅ | `lib/autorizacionesEmpresa.ts` |
| 3.5.4 | Panel de zonas y autorizaciones | ✅ | `components/settings/sections/SettingsZona.tsx` |

#### Próximos pasos
- [x] Notificaciones en tiempo real para nuevas solicitudes (Realtime)
- [x] Indicadores visuales en el HUD cuando una empresa solicita acceso

---

### ✅ Fase 4: Experiencia Multi-empresa en Tiempo Real

**Objetivo:** Diferenciar zonas por empresa, solicitar acceso por proximidad y operar autorizaciones con notificaciones y canales compartidos temporales.

#### Entregables principales

| # | Feature | Estado | Archivo |
|---|---------|:------:|---------|
| 4.1 | Diferenciación visual de zonas (propia/ajena/común) | ✅ | `components/3d/ZonaEmpresa.tsx`, `VirtualSpace3D.tsx` |
| 4.2 | Botón "Solicitar acceso" por proximidad | ✅ | `components/VirtualSpace3D.tsx` |
| 4.3 | Notificaciones realtime de solicitudes/aprobaciones | ✅ | `components/VirtualSpace3D.tsx`, `lib/autorizacionesEmpresa.ts` |
| 4.4 | Canales compartidos temporales al aprobar | ✅ | `lib/autorizacionesEmpresa.ts`, `SettingsZona.tsx` |
| 4.5 | Etiqueta "Hay alguien aquí" en GhostAvatar | ✅ | `components/3d/GhostAvatar.tsx`, `VirtualSpace3D.tsx` |
| 4.6 | Expiración y refresco de autorizaciones activas | ✅ | `lib/autorizacionesEmpresa.ts` |

#### Notas técnicas
- Las notificaciones usan `notificaciones` (Supabase Realtime) con filtrado por `usuario_id`.
- Se prioriza privacidad: empresas no autorizadas permanecen como GhostAvatar.

---

### FASE 5: Optimizaciones Avanzadas + Scaling (ongoing)

**Objetivo:** Escalar a 1000+ usuarios.

#### Estado actual (2026-02)

| # | Tarea | Estado | Evidencia |
|---|-------|:------:|-----------|
| 5.1 | **Web Workers (chunks/interpolación)** | ✅ | `workers/chunkWorker.ts`, `workers/interpolacionWorker.ts`, `components/VirtualSpace3D.tsx` |
| 5.2 | **bitECS base** (world + sync posiciones) | 🟡 Parcial | `lib/ecs/espacioEcs.ts`, `components/VirtualSpace3D.tsx` |
| 5.3 | **Agones (K8s)** | ❌ | Pendiente de infraestructura |
| 5.4 | **OffscreenCanvas** | ❌ | Pendiente de I+D |
| 5.5 | **WebGPU** | ❌ | Pendiente (evaluación futura) |
| 5.6 | **WASM Physics (Rapier.js)** | ❌ | Pendiente de integración |
| 5.7 | **Edge Computing (Workers + LiveKit Edge)** | ❌ | Pendiente de arquitectura |
| 5.8 | **AI Layer** (noise cancellation + routing) | 🟡 Parcial | `components/meetings/recording/useTranscription.ts`, `components/meetings/recording/useMediaPipeWorker.ts` |

#### Pendientes para completar Fase 5
1. **bitECS completo:** mover movimiento/colisiones/visibilidad a sistemas ECS y remover lógica legacy.
2. **Rapier.js:** integración de colisiones de zonas (WASM) con zonas/teleports.
3. **OffscreenCanvas:** PoC Three.js render en worker + pipeline de mensajes.
4. **WebGPU:** plan de migración gradual + detección de soporte.
5. **Agones:** infraestructura K8s, autoscaling, health checks.
6. **Edge computing:** LiveKit Edge + Cloudflare Workers (routing regional).
7. **AI Layer:** noise cancellation real (DSP/ML), routing inteligente y fallback.

---

## ✅ Checklist Fase 1 - Reuniones Programadas (COMPLETADO)

### Preparación
- [x] Crear tabla `reuniones_programadas` en Supabase
- [x] Crear tabla `reunion_participantes` en Supabase
- [x] Crear tabla `notificaciones_calendario` en Supabase
- [x] Configurar RLS policies
- [x] Configurar Google Calendar API (OAuth)

### Desarrollo
- [x] **1.1 Programar Reuniones**
  - [x] Modal para crear reunión (fecha, hora, título, descripción)
  - [x] Selector de participantes del espacio
  - [x] Vincular con sala existente (opcional)

- [x] **1.2 Integración Google Calendar**
  - [x] OAuth flow para conectar cuenta
  - [x] Crear eventos en Google Calendar
  - [x] Google Meet automático para cada reunión
  - [x] Guardar `google_event_id` para sincronización
  - [x] Enviar invitaciones por email a participantes

- [x] **1.3 Vista de Calendario**
  - [x] Mini calendario mensual con indicadores
  - [x] Ver reuniones programadas
  - [x] Quick actions (unirse, eliminar)
  - [x] Badges "EN VIVO" y "EN 15 MIN"

- [x] **1.4 Eliminación Sincronizada**
  - [x] Eliminar de Google Calendar
  - [x] Notificar cancelación a invitados por email
  - [x] Eliminar de Supabase

### Testing
- [x] Crear reunión programada
- [x] Invitar participantes (emails automáticos)
- [x] Ver evento en Google Calendar
- [x] Eliminar reunión (sincronizado)
- [x] Unirse a reunión con Google Meet

---

## ✅ Checklist Chat (YA COMPLETADO)

### Features Implementados
- [x] Canales públicos/privados (`grupos_chat`)
- [x] Mensajes directos (DM)
- [x] Threads/hilos (`respuesta_a`)
- [x] Menciones @usuario (`detectMentions()`)
- [x] Typing indicator
- [x] Toast notifications
- [x] Unread counts por canal
- [x] Archivos adjuntos
- [x] Emojis
- [x] Realtime con Supabase
- [x] Salas de reunión (`MeetingRooms.tsx`)

---

## 🔗 Referencias

- [Gather.town Features](https://www.gather.town/features)
- [Gather What's New](https://www.gather.town/whats-new)
- [AI Agents 2026 Trends](https://eoxysit.com/blogs/ai-agents-in-2026-from-helpful-assistants-to-autonomous-digital-co-workers/)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)

---

## 📝 Notas

1. **Avatares 3D son independientes** - Se pueden implementar en cualquier momento sin afectar Chat o Reuniones
2. **Priorizar funcionalidades core** - Chat y Reuniones son esenciales para competir
3. **AI Agents es el diferenciador** - Ningún competidor lo tiene actualmente
