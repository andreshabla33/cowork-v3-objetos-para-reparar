# 📹 Fase 2: Sistema de Grabación y AI Notes

## Documentación Técnica Completa

> **Fecha:** 26 de Enero 2026  
> **Versión:** 1.0  
> **Estado:** ✅ Implementado

---

## 🎯 Resumen Ejecutivo

Sistema integral de grabación de reuniones con análisis de comportamiento en tiempo real y generación automática de resúmenes usando IA. **Diferenciador clave:** Análisis de microexpresiones faciales y lenguaje no verbal de los participantes.

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Browser)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ MediaRecorder│  │  MoonshineJS │  │   MediaPipe  │                  │
│  │   (Video)    │  │    (ASR)     │  │Face Landmarker│                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                  │                          │
│         ▼                 ▼                  ▼                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ useRecording │  │useTranscript │  │useEmotionAna │                  │
│  │    Hook      │  │    Hook      │  │   lysis Hook │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                  │                          │
│         └─────────────────┼──────────────────┘                          │
│                           │                                              │
│                           ▼                                              │
│                  ┌──────────────────┐                                   │
│                  │   useAISummary   │                                   │
│                  │      Hook        │                                   │
│                  └────────┬─────────┘                                   │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────────┐ │
│  │   Storage   │  │  Database   │  │         Edge Functions           │ │
│  │ (grabaciones)│ │ (PostgreSQL)│  │   (generar-resumen-ai)          │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │   OpenAI API     │
                                    │  (GPT-4o-mini)   │
                                    └──────────────────┘
```

---

## 🔧 Tecnologías Utilizadas

### 1. Grabación de Video/Audio

| Tecnología | Descripción | Ventaja |
|------------|-------------|---------|
| **MediaRecorder API** | API nativa del navegador para captura de medios | Sin dependencias, soporte universal |
| **WebM + VP9/Opus** | Códec de video/audio eficiente | Alta compresión, buena calidad |

```typescript
// Ejemplo de uso
const recorder = new MediaRecorder(stream, { 
  mimeType: 'video/webm;codecs=vp9,opus' 
});
recorder.start(1000); // chunks cada segundo
```

### 2. Transcripción Local (MoonshineJS)

| Característica | Valor |
|----------------|-------|
| **Modelo** | Moonshine (by Useful Sensors) |
| **Ejecución** | 100% local en el navegador |
| **Velocidad** | 5-15x más rápido que Whisper |
| **Idiomas** | Español, Inglés, +50 idiomas |
| **Privacidad** | Los datos nunca salen del dispositivo |

```typescript
// Carga dinámica
const { Moonshine } = await import('@anthropics/moonshine-js');
const moonshine = new Moonshine({
  model: 'moonshine-small',
  language: 'es',
});
```

**¿Por qué MoonshineJS y no Whisper?**
- ⚡ 5-15x más rápido
- 🔒 Procesamiento local (privacidad)
- 💰 Sin costos de API
- 🌐 Funciona offline

### 3. Análisis de Emociones (MediaPipe Face Landmarker)

| Característica | Valor |
|----------------|-------|
| **Modelo** | MediaPipe Face Landmarker |
| **Puntos faciales** | 478 landmarks 3D |
| **Blendshapes** | 52 Action Units (AU) |
| **FPS** | 30+ en GPU |
| **Ejecución** | WebGL/GPU en navegador |

---

## 🎭 Sistema de Análisis de Microexpresiones

### ¿Cómo funciona?

**SÍ, el sistema lee microexpresiones y lenguaje corporal de TODOS los participantes.**

#### Paso 1: Detección de Puntos Faciales
MediaPipe detecta **478 puntos 3D** en el rostro en tiempo real:

```
     👁️  👁️
       👃
       👄
```

#### Paso 2: Extracción de Blendshapes (52 Action Units)
Los blendshapes son coeficientes que representan movimientos faciales específicos:

| Blendshape | Descripción | Emoción asociada |
|------------|-------------|------------------|
| `mouthSmileLeft/Right` | Sonrisa | Felicidad |
| `browDownLeft/Right` | Ceño fruncido | Enojo, concentración |
| `eyeSquintLeft/Right` | Ojos entrecerrados | Felicidad genuina |
| `jawOpen` | Boca abierta | Sorpresa |
| `browInnerUp` | Cejas elevadas centro | Tristeza, preocupación |
| `cheekPuff` | Mejillas infladas | Frustración contenida |
| `noseSneerLeft/Right` | Nariz arrugada | Disgusto |

#### Paso 3: Mapeo a Emociones

```typescript
const EMOTION_BLENDSHAPE_MAP = {
  happy: [
    { blendshapes: ['mouthSmileLeft', 'mouthSmileRight'], weight: 0.4 },
    { blendshapes: ['eyeSquintLeft', 'eyeSquintRight'], weight: 0.3 },
    { blendshapes: ['cheekSquintLeft', 'cheekSquintRight'], weight: 0.3 },
  ],
  angry: [
    { blendshapes: ['browDownLeft', 'browDownRight'], weight: 0.5 },
    { blendshapes: ['eyeSquintLeft', 'eyeSquintRight'], weight: 0.2 },
    { blendshapes: ['jawForward'], weight: 0.3 },
  ],
  surprised: [
    { blendshapes: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'], weight: 0.4 },
    { blendshapes: ['eyeWideLeft', 'eyeWideRight'], weight: 0.3 },
    { blendshapes: ['jawOpen'], weight: 0.3 },
  ],
  // ... más emociones
};
```

#### Paso 4: Cálculo de Engagement Score

El **engagement score** (0-1) mide qué tan atento/involucrado está el participante:

```typescript
const calculateEngagement = (blendshapes) => {
  let score = 0.5; // Base neutral
  
  // Factores positivos (+)
  score += blendshapes.mouthSmileLeft * 0.1;   // Sonrisa
  score += blendshapes.eyeSquintLeft * 0.1;    // Atención
  score += blendshapes.browInnerUp * 0.05;     // Interés
  
  // Factores negativos (-)
  score -= blendshapes.eyeBlinkLeft * 0.1;     // Parpadeo excesivo
  score -= blendshapes.eyeLookDownLeft * 0.1;  // Mirando abajo (distracción)
  
  return Math.max(0, Math.min(1, score));
};
```

#### Paso 5: Detección de "Mirando a Cámara"

Usando la matriz de transformación facial 3D:

```typescript
if (results.facialTransformationMatrixes?.length) {
  const matrix = results.facialTransformationMatrixes[0];
  const rotationY = Math.abs(matrix.data[2]); // Rotación horizontal
  const rotationX = Math.abs(matrix.data[6]); // Rotación vertical
  lookingAtCamera = rotationY < 0.3 && rotationX < 0.3;
}
```

---

## 📊 Tipos de Análisis Generados

### 1. Análisis en Tiempo Real (por participante)

```typescript
interface EmotionAnalysis {
  timestamp_segundos: number;
  participante_id: string;
  participante_nombre: string;
  emocion_dominante: 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted' | 'neutral';
  emocion_confianza: number;      // 0-1
  emociones_detalle: {            // Todas las emociones con scores
    happy: number;
    sad: number;
    angry: number;
    // ...
  };
  engagement_score: number;        // 0-1
  mirando_camara: boolean;
  action_units: Record<string, number>; // 52 blendshapes raw
}
```

### 2. Insights de Comportamiento

Detectamos automáticamente momentos importantes:

```typescript
interface BehaviorInsight {
  minuto: number;
  tipo: 'pico_engagement' | 'baja_atencion' | 'cambio_emocion' | 'momento_clave';
  descripcion: string;
  score: number;
}
```

**Ejemplos de insights detectados:**
- 📈 "Minuto 5: Pico de engagement - tema X generó interés"
- 📉 "Minuto 12: Baja atención generalizada"
- 😮 "Minuto 8: Reacción de sorpresa ante propuesta"
- 😠 "Minuto 15: Tensión detectada en discusión"

### 3. Métricas Conductuales Agregadas

```typescript
interface MetricasConductuales {
  engagement_promedio: number;      // Promedio de toda la reunión
  emocion_dominante: string;        // Emoción más frecuente
  picos_atencion: number[];         // Minutos con alta atención
  bajas_atencion: number[];         // Minutos con baja atención
  participacion_por_persona: {      // Engagement por participante
    [nombre: string]: number;
  };
}
```

---

## 🤖 Resumen AI (GPT-4o-mini)

### Flujo de Generación

1. **Entrada:** Transcripción + Emociones + Insights
2. **Procesamiento:** Edge Function con GPT-4o-mini
3. **Salida:** JSON estructurado

### Estructura del Resumen

```typescript
interface AISummary {
  resumen_corto: string;           // 1-2 oraciones
  resumen_detallado: string;       // 3-5 oraciones
  puntos_clave: string[];          // Puntos principales discutidos
  action_items: ActionItem[];      // Tareas extraídas
  sentimiento_general: 'positivo' | 'neutral' | 'negativo' | 'mixto';
  momentos_clave: BehaviorInsight[]; // Del análisis de emociones
  metricas_conductuales: MetricasConductuales;
}

interface ActionItem {
  tarea: string;
  responsable: string | null;
  prioridad: 'alta' | 'media' | 'baja';
}
```

### Prompt del Sistema

```
Eres un asistente experto en análisis de reuniones de trabajo.
Tu tarea es generar un resumen estructurado basándote en:
1. La transcripción de la reunión
2. Datos de engagement promedio: X%
3. Emoción predominante: Y

Identifica:
- Puntos clave discutidos
- Tareas/action items mencionados
- Sentimiento general
- Momentos de alta/baja atención
```

---

## 📁 Estructura de Archivos

```
components/meetings/recording/
├── types.ts                 # Interfaces TypeScript
├── index.ts                 # Exports del módulo
├── useRecording.ts          # Hook de grabación (MediaRecorder)
├── useTranscription.ts      # Hook de transcripción (MoonshineJS)
├── useEmotionAnalysis.ts    # Hook de análisis emociones (MediaPipe)
├── useAISummary.ts          # Hook de resumen AI
├── RecordingButton.tsx      # Botón animado de grabación
├── RecordingIndicator.tsx   # Badge "REC" con timer
├── RecordingConsent.tsx     # Modal de consentimiento
├── TranscriptionTimeline.tsx # Timeline con emociones
└── AISummaryPanel.tsx       # Panel de resumen + action items

supabase/functions/
└── generar-resumen-ai/
    └── index.ts             # Edge Function OpenAI

docs/
├── FASE2_GRABACION_MIGRACIONES.sql  # Schema SQL
└── FASE2_DOCUMENTACION_COMPLETA.md  # Este documento
```

---

## 🗄️ Tablas de Base de Datos

### `grabaciones`
Metadata de cada grabación.

### `transcripciones`
Segmentos de texto con timestamps.

### `analisis_comportamiento`
Análisis de emociones por timestamp y participante.

### `resumenes_ai`
Resúmenes generados con action items.

### `notificaciones`
Alertas al creador cuando termina el procesamiento.

---

## 🔄 Flujo Completo de una Grabación

```
1. Usuario hace clic en "Grabar"
          │
          ▼
2. MediaRecorder captura video/audio
   MoonshineJS transcribe en tiempo real
   MediaPipe analiza emociones cada 200ms
          │
          ▼
3. Datos se van acumulando:
   - chunks de video
   - segmentos de transcripción
   - análisis de emociones
          │
          ▼
4. Usuario hace clic en "Detener"
          │
          ▼
5. Video se sube a Supabase Storage
          │
          ▼
6. Se llama Edge Function "generar-resumen-ai"
   - Recibe: transcripción + emociones + insights
   - Envía a GPT-4o-mini
   - Retorna resumen estructurado
          │
          ▼
7. Se guarda en tablas:
   - grabaciones (metadata)
   - transcripciones (segmentos)
   - analisis_comportamiento (emociones)
   - resumenes_ai (resumen + action items)
          │
          ▼
8. Se crea notificación para el creador:
   "📝 Resumen de reunión listo"
```

---

## 🎨 Componentes UI

### RecordingButton
- Estados: idle, recording (pulso rojo), paused, processing
- Animación CSS de pulso durante grabación

### RecordingIndicator
- Badge "REC" rojo con timer
- Muestra duración en formato MM:SS

### TranscriptionTimeline
- Muestra segmentos de transcripción con scroll automático
- Cada segmento muestra emoji de emoción + barra de engagement
- Click para saltar a ese momento en el video

### AISummaryPanel
- Pestañas: Resumen | Tareas | Insights
- Checkbox para marcar tareas completadas
- Botón de copiar resumen

---

## 🔐 Consideraciones de Privacidad

1. **Transcripción 100% local** - MoonshineJS no envía audio a servidores
2. **Análisis de emociones local** - MediaPipe procesa en el navegador
3. **Consentimiento explícito** - Modal antes de grabar
4. **Solo el resumen se envía a OpenAI** - No el video/audio crudo
5. **RLS en todas las tablas** - Solo miembros del espacio pueden ver

---

## 📈 Métricas de Performance

| Operación | Tiempo estimado |
|-----------|-----------------|
| Análisis de frame (MediaPipe) | ~30ms |
| Transcripción de 10s audio | ~500ms |
| Generación de resumen (OpenAI) | ~3-5s |
| Upload de 5min video a Storage | ~10-30s |

---

## 🚀 Uso Básico

```tsx
import { 
  useRecording, 
  useTranscription, 
  useEmotionAnalysis,
  useAISummary,
  RecordingButton 
} from '@/components/meetings/recording';

function MeetingRoom() {
  const recording = useRecording({ espacioId, creadorId });
  const transcription = useTranscription({ grabacionId });
  const emotions = useEmotionAnalysis({ grabacionId });
  const summary = useAISummary({ grabacionId, espacioId, creadorId });

  return (
    <div>
      <RecordingButton
        status={recording.status}
        duration={recording.duration}
        onStart={recording.startRecording}
        onStop={recording.stopRecording}
      />
      
      <TranscriptionTimeline
        segments={transcription.segments}
        emotions={emotions.emotionHistory}
      />
      
      <AISummaryPanel
        summary={summary.summary}
        isLoading={summary.isLoading}
        onGenerateSummary={summary.generateSummary}
      />
    </div>
  );
}
```

---

## ✅ Checklist de Implementación

- [x] MediaRecorder para captura de video/audio
- [x] MoonshineJS para transcripción local
- [x] MediaPipe Face Landmarker para emociones
- [x] 52 blendshapes / Action Units
- [x] Cálculo de engagement score
- [x] Detección de "mirando a cámara"
- [x] Insights automáticos de comportamiento
- [x] Edge Function con GPT-4o-mini
- [x] Extracción de action items
- [x] Notificación al creador
- [x] Componentes UI completos
- [x] Tablas Supabase con RLS
- [x] Storage bucket para grabaciones

---

## 🔮 Próximas Mejoras (Roadmap)

1. **Diarización de speakers** - Identificar quién habla en cada momento
2. **Análisis de tono de voz** - Detectar emociones en el audio
3. **Resumen en tiempo real** - Actualizar resumen mientras se graba
4. **Exportar a PDF/Notion** - Compartir resúmenes fácilmente
5. **Integración con calendarios** - Vincular con reuniones programadas

---

## 📋 Changelog - Actualizaciones Recientes

### v2.1.0 - 28 Enero 2026

#### 🔧 Correcciones

| Issue | Descripción | Solución |
|-------|-------------|----------|
| **Duración 0 minutos** | La duración de grabación se guardaba como 0 | Usar `startTimeRef` para calcular duración en vez del estado |
| **Página en blanco en análisis** | Error `probabilidad_cierre_estimada undefined` | Añadir config por defecto y verificación de datos |
| **Botón Transcripción no funcionaba** | Solo hacía `setGrabacionSeleccionada` sin acción | Implementar modal de transcripción completo |
| **Error de stream** | Error persistente "No hay stream disponible" | Auto-limpiar error después de 5 segundos o cuando stream disponible |
| **useCallback order** | Funciones usadas antes de declararse | Reorganizar orden de declaración de funciones |

#### ✨ Nuevas Funcionalidades

1. **Modal de Transcripción** (`GrabacionesHistorial.tsx`)
   - Vista completa del texto transcrito
   - Timestamps por segmento
   - Nombre del speaker
   - Botón para copiar al portapapeles

2. **Generación de Análisis Completo desde Historial** (`generateAnalisisFromFrames`)
   - Reconstruye análisis detallado desde frames guardados en DB
   - Soporta tipos: `deals`, `rrhh`, `equipo`
   - Calcula dinámicamente:
     - Probabilidad de cierre (deals)
     - Momentos de interés/objeciones
     - Predicciones con factores
     - Recomendaciones de seguimiento

3. **Sistema de Permisos por Cargo** (`types/analysis.ts`)
   - COO/CEO: Acceso total a todos los análisis
   - Director RRHH: Solo análisis RRHH
   - Director Comercial: Solo análisis Deals
   - Team Lead/Scrum Master: Solo análisis Equipo

#### 🏗️ Arquitectura de Privacidad

```
┌─────────────────────────────────────────────────────────────┐
│                    NAVEGADOR (Local)                         │
├─────────────────────────────────────────────────────────────┤
│  📹 Video → MediaRecorder → Blob → NO SE SUBE              │
│  🎤 Audio → MoonshineJS → Transcripción                     │
│  👤 Frames → MediaPipe → Análisis Facial                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ Solo metadata
┌─────────────────────────────────────────────────────────────┐
│                       SUPABASE                               │
├─────────────────────────────────────────────────────────────┤
│  📝 transcripciones → texto, timestamps, speaker            │
│  📊 analisis_comportamiento → emociones, engagement         │
│  📋 grabaciones → metadatos (sin video)                     │
│  🤖 resumenes_ai → resumen generado por GPT                 │
└─────────────────────────────────────────────────────────────┘
```

**Principio:** El video permanece en el navegador del usuario y nunca se sube a la nube, garantizando privacidad total de las reuniones.

#### 📁 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `RecordingManagerV2.tsx` | Auto-limpieza de errores, reorganización de funciones |
| `GrabacionesHistorial.tsx` | Modal transcripción, generación de análisis completo |
| `AnalysisDashboard.tsx` | Config por defecto, vista de análisis básico |
| `VirtualSpace3D.tsx` | Carga de cargo desde `miembros_espacio` |

---

*Documentación generada automáticamente - Cowork Virtual v2.1*
