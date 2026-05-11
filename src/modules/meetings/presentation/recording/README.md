# Sistema de Grabación y Análisis Conductual v2.0

## Descripción General

Sistema avanzado de análisis conductual en tiempo real para reuniones empresariales. Detecta microexpresiones, analiza lenguaje corporal y genera predicciones de comportamiento. Todo el procesamiento biométrico es local (privacidad garantizada).

### Casos de Uso

| Tipo | Descripción | Disclaimer |
|:-----|:------------|:-----------|
| **👔 RRHH** | Entrevistas con candidatos, one-to-one | ✅ Requerido |
| **🤝 Deals** | Negociaciones, presentaciones comerciales | ❌ No requerido |
| **👥 Equipo** | Reuniones de trabajo, brainstorming | ❌ No requerido |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     RecordingManager.tsx                        │
│            (Orquestador principal de grabación)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ MediaRecorder │   │ useTranscription│   │useEmotionAnalysis│
│   (Video)     │   │  (MoonshineJS)  │   │   (MediaPipe)   │
└───────────────┘   └─────────────────┘   └─────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Blob WebM    │   │  transcripciones│   │analisis_        │
│  (Download)   │   │     (Supabase)  │   │comportamiento   │
└───────────────┘   └─────────────────┘   └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │generar-resumen-ai│
                    │ (Edge Function) │
                    │   OpenAI GPT-4  │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  resumenes_ai   │
                    │   (Supabase)    │
                    └─────────────────┘
```

## Componentes

### 1. RecordingManager.tsx
Componente principal que integra todas las funcionalidades.

**Props:**
- `espacioId`: UUID del espacio de trabajo
- `userId`: UUID del usuario actual
- `userName`: Nombre del usuario para etiquetas
- `reunionTitulo`: Título opcional de la reunión
- `stream`: MediaStream con audio/video
- `onRecordingStateChange`: Callback cuando cambia estado de grabación
- `onProcessingComplete`: Callback con resumen AI al finalizar

### 2. useTranscription.ts (MoonshineJS)
Hook para transcripción de audio en tiempo real.

**Características:**
- Procesamiento 100% local en el navegador
- Sin envío de datos a servidores externos
- Soporte para español
- Transcripción en tiempo real durante grabación
- Fallback a transcripción de blob post-grabación

**Tecnología:** MoonshineJS (CDN)
- URL: `https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-js@latest`
- Modelo: `model/tiny`

### 3. useEmotionAnalysis.ts (MediaPipe)
Hook para análisis de microexpresiones faciales.

**Características:**
- Detecta 52 Action Units (blendshapes)
- Calcula 7 emociones básicas: happy, sad, angry, surprised, fearful, disgusted, neutral
- Mide engagement score (0-1)
- Detecta si el usuario mira a cámara
- Análisis cada segundo durante grabación

**Tecnología:** MediaPipe Face Landmarker (Google)
- URL: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest`
- Modelo: `face_landmarker.task`
- Delegado: GPU

**Emociones detectadas:**
| Emoción | Blendshapes utilizados |
|---------|----------------------|
| Happy | mouthSmileLeft/Right, cheekSquintLeft/Right |
| Sad | mouthFrownLeft/Right, browInnerUp |
| Angry | browDownLeft/Right, mouthPressLeft/Right |
| Surprised | eyeWideLeft/Right, jawOpen |
| Disgusted | noseSneerLeft/Right |

### 4. useAISummary.ts
Hook para generar resúmenes usando Edge Function.

**Flujo:**
1. Recibe transcripción + emociones + duración
2. Llama a Edge Function `generar-resumen-ai`
3. Edge Function usa OpenAI GPT-4o-mini
4. Guarda resultado en `resumenes_ai`
5. Crea notificación para el usuario

## Flujo de Ejecución

### Durante la Grabación (Paralelo)
```
Usuario presiona GRABAR
         │
         ├──▶ MediaRecorder.start() ──▶ Captura chunks cada 1s
         │
         ├──▶ startEmotionAnalysis() ──▶ Analiza frame cada 1s
         │                               Acumula en emotionHistoryRef
         │
         └──▶ startTranscription() ──▶ Transcribe audio en tiempo real
                                        Acumula en transcriptRef
```

### Post-Grabación (Secuencial)
```
Usuario presiona DETENER
         │
         ▼
   stopRecording()
         │
         ├──▶ stopEmotionAnalysis()
         ├──▶ stopTranscription()
         └──▶ MediaRecorder.stop() ──▶ processRecording()
                                             │
   ┌─────────────────────────────────────────┘
   │
   ▼ (20%) Transcribir
   │  - Usa transcripción en tiempo real si existe
   │  - Fallback: transcribe blob completo
   │
   ▼ (50%) Guardar Emociones
   │  - Inserta en analisis_comportamiento
   │  - Lotes de 50 registros
   │
   ▼ (70%) Generar Resumen AI
   │  - Llama Edge Function
   │  - OpenAI GPT-4o-mini
   │
   ▼ (100%) Completar
      - Actualiza grabacion en Supabase
      - Descarga video local
      - Muestra panel de resultados
```

## Tablas Supabase

### grabaciones
Almacena metadatos de cada grabación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| reunion_id | UUID | FK opcional a reuniones_programadas |
| espacio_id | UUID | FK a espacios_trabajo |
| creado_por | UUID | FK a auth.users |
| estado | text | grabando, procesando, transcribiendo, analizando, completado, error |
| duracion_segundos | int | Duración total |
| tipo | text | reunion, pantalla, audio_solo |

### transcripciones
Segmentos de texto transcritos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| grabacion_id | UUID | FK a grabaciones |
| texto | text | Contenido transcrito |
| inicio_segundos | numeric | Timestamp inicio |
| fin_segundos | numeric | Timestamp fin |
| speaker_nombre | text | Nombre del hablante |
| confianza | numeric | Score de confianza (0-1) |

### analisis_comportamiento
Datos de emociones por frame.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| grabacion_id | UUID | FK a grabaciones |
| timestamp_segundos | numeric | Momento del análisis |
| emocion_dominante | text | happy, sad, angry, etc. |
| engagement_score | numeric | Score de atención (0-1) |
| action_units | jsonb | 52 blendshapes raw |

### resumenes_ai
Resúmenes generados por AI.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| grabacion_id | UUID | FK a grabaciones |
| resumen_corto | text | Resumen breve |
| resumen_detallado | text | Resumen completo |
| action_items | jsonb | Lista de tareas |
| puntos_clave | jsonb | Puntos importantes |
| sentimiento_general | text | positivo, neutral, negativo, mixto |
| modelo_usado | text | gpt-4o-mini |
| tokens_usados | int | Consumo de tokens |

## Configuración Requerida

### Variables de Entorno (Supabase Edge Functions)
```
OPENAI_API_KEY=sk-...
```

### Permisos del Navegador
- Cámara (video)
- Micrófono (audio)

## Privacidad

- **Transcripción:** 100% local (MoonshineJS)
- **Emociones:** 100% local (MediaPipe)
- **Video:** No se sube, solo descarga local
- **Resúmenes:** Se envía transcripción a OpenAI

## Limitaciones

1. MoonshineJS requiere navegadores modernos con WebAssembly
2. MediaPipe requiere GPU para rendimiento óptimo
3. La Edge Function requiere API key de OpenAI válida
4. El análisis de emociones solo funciona con cámara frontal

## Componentes v2.0 (Avanzados)

### RecordingManagerV2.tsx
Nueva versión del orquestador con selector de tipo y análisis avanzado.

**Características:**
- Selector de tipo de grabación (RRHH/Deals/Equipo)
- Disclaimer condicional (solo RRHH)
- Indicadores en tiempo real durante grabación
- Dashboard de análisis post-reunión

### RecordingTypeSelector.tsx
Modal para seleccionar tipo de grabación antes de iniciar.

### useAdvancedEmotionAnalysis.ts
Hook mejorado para análisis facial.

**Mejoras sobre v1:**
| Característica | v1.0 | v2.0 |
|:---------------|:-----|:-----|
| Intervalo | 1000ms | **200ms** |
| Microexpresiones | ❌ | ✅ (<500ms) |
| Baseline | ❌ | ✅ (5s calibración) |
| Cambios abruptos | ❌ | ✅ (>30% delta) |
| Predicciones | ❌ | ✅ (cada 10s) |

### useBodyLanguageAnalysis.ts
Nuevo hook para análisis de lenguaje corporal con MediaPipe Pose.

**Métricas:**
- **Postura:** abierta, cerrada, inclinado_adelante, inclinado_atras, neutral
- **Gestos:** manos_activas, brazos_cruzados, auto_toque, manos_juntas
- **Tensión:** Score de tensión en hombros (0-1)

### useCombinedAnalysis.ts
Hook que integra análisis facial + corporal y genera métricas específicas por tipo.

### AnalysisDashboard.tsx
Dashboard de resultados post-reunión con visualizaciones específicas por tipo.

## Estructura de Archivos v2.0

```
components/meetings/recording/
├── types/
│   └── analysis.ts              # Tipos para análisis avanzado
├── RecordingManager.tsx         # v1 (legacy)
├── RecordingManagerV2.tsx       # v2 (nuevo)
├── RecordingTypeSelector.tsx    # Selector de tipo
├── useAdvancedEmotionAnalysis.ts
├── useBodyLanguageAnalysis.ts
├── useCombinedAnalysis.ts
├── AnalysisDashboard.tsx
└── index.ts                     # Exportaciones
```

## Predicciones por Tipo

### RRHH
- **Fit Cultural:** Basado en engagement + congruencia
- **Interés en Puesto:** Basado en engagement promedio
- **Autenticidad:** Basado en congruencia facial/corporal

### Deals
- **Probabilidad Cierre:** Score combinado 0-100%
- **Siguiente Paso:** Recomendación accionable
- **Objeción Principal:** Detección de bloqueadores

### Equipo
- **Adopción Ideas:** Probabilidad de implementación
- **Necesidad Seguimiento:** Si requiere reunión adicional
- **Riesgo Conflicto:** Tensiones detectadas

## Changelog

### v2.0.0 (2026-01-28)
- **NUEVO:** Selector de tipo de grabación (RRHH, Deals, Equipo)
- **NUEVO:** Disclaimer obligatorio solo para RRHH
- **NUEVO:** Detección de microexpresiones (<500ms)
- **NUEVO:** Análisis de lenguaje corporal (MediaPipe Pose)
- **NUEVO:** Predicciones de comportamiento por tipo
- **NUEVO:** Dashboard de análisis post-reunión
- **NUEVO:** Baseline personalizado (calibración 5s)
- **NUEVO:** Indicadores en tiempo real durante grabación
- **MEJORA:** Intervalo de análisis reducido a 200ms
- **MEJORA:** Detección de cambios abruptos de emoción

### v1.0.0 (2026-01-28)
- Integración de transcripción real con MoonshineJS
- Análisis de emociones con MediaPipe Face Landmarker
- Resúmenes AI con OpenAI GPT-4o-mini
- Panel de resultados con action items y puntos clave

## Documentación Adicional

Ver `docs/ROADMAP_ANALISIS_CONDUCTUAL.md` para:
- Plan de implementación completo
- Consideraciones éticas y legales
- Métricas detalladas por caso de uso
- Requisitos técnicos
