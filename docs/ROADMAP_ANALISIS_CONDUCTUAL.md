# 🎯 ROADMAP: Sistema de Análisis Conductual

## Visión General

Sistema de análisis conductual en tiempo real para reuniones empresariales, utilizando tecnologías de procesamiento local (privacidad) con tres casos de uso principales:

1. **Entrevistas RRHH** - Evaluación de candidatos y reuniones one-to-one
2. **Deals/Ventas** - Negociaciones comerciales y presentaciones
3. **Reuniones de Equipo** - Brainstorming, presentaciones de ideas, dailies

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SISTEMA DE ANÁLISIS CONDUCTUAL v2.0                     │
│                   (Procesamiento 100% local en navegador)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
         ┌─────────────────┐             ┌─────────────────┐
         │ RecordingType   │             │ RecordingManager│
         │    Selector     │────────────▶│   (Orquestador) │
         │ RRHH|Deals|Team │             │                 │
         └─────────────────┘             └────────┬────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                             ▼                             ▼
         ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
         │   useAdvanced   │           │  useBodyLanguage│           │ useTranscription│
         │ EmotionAnalysis │           │    Analysis     │           │  (MoonshineJS)  │
         │  (MediaPipe)    │           │ (MediaPipe Pose)│           │                 │
         └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
                  │                             │                             │
                  │    ┌────────────────────────┘                             │
                  │    │                                                      │
                  ▼    ▼                                                      │
         ┌─────────────────┐                                                  │
         │ useCombined     │                                                  │
         │   Analysis      │◀─────────────────────────────────────────────────┘
         │ (Integrador)    │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Analysis        │
         │   Dashboard     │
         │ (Por tipo)      │
         └─────────────────┘
```

---

## 📁 Estructura de Archivos

```
components/meetings/recording/
├── types/
│   └── analysis.ts              # Tipos e interfaces para todo el sistema
├── RecordingManager.tsx         # Componente principal (actualizado)
├── RecordingTypeSelector.tsx    # Selector de tipo con disclaimer
├── useAdvancedEmotionAnalysis.ts # Hook análisis facial mejorado
├── useBodyLanguageAnalysis.ts   # Hook análisis corporal (Pose)
├── useCombinedAnalysis.ts       # Hook integrador
├── useTranscription.ts          # Hook transcripción (existente)
├── useAISummary.ts              # Hook resúmenes AI (existente)
├── AnalysisDashboard.tsx        # Dashboard post-reunión
└── README.md                    # Documentación técnica
```

---

## 🔬 Tecnologías Utilizadas

| Componente | Tecnología | Procesamiento | Privacidad |
|:-----------|:-----------|:--------------|:-----------|
| **Análisis Facial** | MediaPipe Face Landmarker | Local (GPU) | ✅ 100% local |
| **Análisis Corporal** | MediaPipe Pose Landmarker | Local (GPU) | ✅ 100% local |
| **Transcripción** | MoonshineJS | Local (WASM) | ✅ 100% local |
| **Resúmenes AI** | OpenAI GPT-4o-mini | Cloud (Supabase Edge) | ⚠️ Envía transcripción |

---

## 📊 Métricas por Caso de Uso

### 👔 RRHH / Entrevistas

| Métrica | Descripción | Fuente |
|:--------|:------------|:-------|
| Congruencia verbal-no verbal | Alineación expresión facial + postura | Facial + Corporal |
| Nivel de nerviosismo | Timeline de estrés normalizado | Facial + Corporal |
| Confianza percibida | Score basado en postura y expresiones | Combinado |
| Momentos de incomodidad | Detección de microexpresiones negativas | Microexpresiones |
| **Predicción: Fit Cultural** | Probabilidad de encaje | ML combinado |
| **Predicción: Interés en puesto** | Nivel de engagement promedio | Engagement |
| **Predicción: Autenticidad** | Basado en congruencia | Congruencia |

**Disclaimer:** Obligatorio antes de iniciar grabación.

### 🤝 Deals / Ventas

| Métrica | Descripción | Fuente |
|:--------|:------------|:-------|
| Momentos de interés | Picos de engagement + sorpresa positiva | Facial |
| Señales de objeción | Expresiones negativas detectadas | Microexpresiones |
| Engagement por tema | Engagement promedio por segmento | Timeline |
| Señales de cierre | Postura inclinada + engagement alto | Corporal + Facial |
| Puntos de dolor | Reacciones negativas a propuestas | Microexpresiones |
| **Predicción: Probabilidad cierre** | Score combinado 0-100% | ML combinado |
| **Predicción: Siguiente paso** | Recomendación accionable | Análisis |
| **Predicción: Objeción principal** | Identificación de bloqueadores | Microexpresiones |

### 👥 Reuniones de Equipo

| Métrica | Descripción | Fuente |
|:--------|:------------|:-------|
| Participación por persona | Tiempo + engagement individual | Multi-participante |
| Engagement grupal | Timeline de engagement promedio | Agregado |
| Reacciones a ideas | Respuesta del grupo a presentaciones | Facial grupal |
| Momentos desconexión | Bajones de engagement colectivo | Agregado |
| Dinámica grupal | Cohesión, balance, líderes naturales | Análisis patrones |
| **Predicción: Adopción ideas** | Probabilidad de implementación | Engagement |
| **Predicción: Necesidad seguimiento** | Requiere reunión adicional | Desconexiones |
| **Predicción: Riesgo conflicto** | Tensiones detectadas | Emociones negativas |

---

## ⚡ Mejoras Técnicas Implementadas

### Detección de Microexpresiones (v2.0)

| Característica | v1.0 | v2.0 |
|:---------------|:-----|:-----|
| Intervalo de análisis | 1000ms | **200ms** |
| Detección microexpresiones | ❌ | ✅ (<500ms) |
| Baseline personalizado | ❌ | ✅ (5s calibración) |
| Cambios abruptos | ❌ | ✅ (>30% delta) |
| Predicciones en tiempo real | ❌ | ✅ (cada 10s) |

### Análisis Corporal (Nuevo)

- **Postura:** Abierta, Cerrada, Inclinado adelante/atrás, Neutral
- **Gestos:** Manos activas, Brazos cruzados, Auto-toque, Manos juntas
- **Tensión:** Score de tensión en hombros (0-1)
- **Inclinación:** Grados X/Y de cabeza respecto a torso

### Sistema de Predicciones

```typescript
interface PrediccionComportamiento {
  tipo: string;              // Tipo de predicción
  probabilidad: number;      // 0-1
  confianza: number;         // 0-1 (qué tan seguro está el modelo)
  factores: string[];        // Factores que contribuyen
  timestamp: number;         // Cuándo se generó
}
```

---

## 🛡️ Consideraciones Éticas y Legales

### ✅ Implementado

1. **Disclaimer obligatorio para RRHH** - Requiere aceptación antes de grabar
2. **Consentimiento explícito** - Checkbox de confirmación
3. **Procesamiento local** - Datos biométricos no salen del navegador
4. **Sin identificación** - No reconocimiento facial, solo expresiones
5. **Herramienta de apoyo** - No decisiones automáticas

### ⚠️ Recomendaciones de Uso

| Caso de Uso | Recomendación |
|:------------|:--------------|
| RRHH | Informar al candidato que se realiza análisis conductual |
| Deals | Usar como herramienta de coaching post-reunión |
| Equipo | Compartir métricas agregadas, no individuales |

### 📋 Texto del Disclaimer (RRHH)

```
⚠️ AVISO IMPORTANTE

Este análisis es una herramienta de APOYO para la reflexión post-entrevista.

• Los datos reflejan expresiones faciales observadas, NO estados mentales reales
• No debe usarse como único criterio para decisiones de contratación
• El candidato debe ser informado de que se realiza análisis conductual
• Cumple con las normativas de protección de datos aplicables

Al continuar, confirmas que el participante ha dado su consentimiento.
```

---

## 🗓️ Fases de Implementación

### ✅ FASE 1: Fundamentos (Completado)
- [x] Definición de tipos e interfaces (`types/analysis.ts`)
- [x] Selector de tipo de grabación (`RecordingTypeSelector.tsx`)
- [x] Hook de análisis facial avanzado (`useAdvancedEmotionAnalysis.ts`)
- [x] Hook de análisis corporal (`useBodyLanguageAnalysis.ts`)
- [x] Hook combinado (`useCombinedAnalysis.ts`)
- [x] Dashboard de análisis (`AnalysisDashboard.tsx`)
- [x] Documentación y roadmap

### 🔄 FASE 2: Integración (Pendiente)
- [ ] Actualizar `RecordingManager.tsx` para usar nuevos hooks
- [ ] Integrar selector de tipo en flujo de grabación
- [ ] Conectar dashboard con resultados reales
- [ ] Testing end-to-end

### 📋 FASE 3: Refinamiento (Futuro)
- [ ] Mejorar modelos de predicción con más datos
- [ ] Añadir análisis de voz (tono, velocidad, pausas)
- [ ] Multi-participante real (múltiples streams)
- [ ] Exportación de reportes PDF
- [ ] Integración con calendario (asociar a reunión programada)

### 🚀 FASE 4: Avanzado (Futuro)
- [ ] Comparación histórica (candidato vs promedio)
- [ ] Alertas en tiempo real configurables
- [ ] API para integración con ATS/CRM
- [ ] Modo entrenamiento (feedback en vivo)

---

## 🔧 Configuración Técnica

### Variables de Entorno

```env
# Supabase (para resúmenes AI y almacenamiento)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# En Supabase Edge Functions
OPENAI_API_KEY=sk-xxx
```

### CDNs Utilizados

```javascript
// MediaPipe Face Landmarker
'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// MediaPipe Pose Landmarker
'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// MoonshineJS (Transcripción)
'https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-js@latest'
```

### Requisitos del Navegador

- WebGL 2.0 (para GPU delegate)
- WebAssembly
- MediaDevices API
- Cámara y micrófono

---

## 📈 Métricas de Rendimiento

| Operación | Intervalo | CPU/GPU | Memoria |
|:----------|:----------|:--------|:--------|
| Análisis facial | 200ms | GPU | ~150MB |
| Análisis corporal | 500ms | GPU | ~100MB |
| Transcripción | Continuo | CPU (WASM) | ~50MB |
| Combinado total | - | GPU + CPU | ~300MB |

---

## 📚 Referencias

### Investigación

- **Paul Ekman** - Facial Action Coding System (FACS)
- **MediaPipe** - Google Research, Vision Tasks
- **Affectiva AFFDEX** - Emotion AI SDK (referencia comercial)

### Software Comercial de Referencia

| Software | Características | Diferencia con nuestra solución |
|:---------|:----------------|:-------------------------------|
| iMotions | 32 métricas, AFFDEX | Cloud, $$$, enterprise |
| Noldus FaceReader | Facial + voz + eye tracking | Desktop, $$$, licencia |
| MorphCast | In-browser, 130+ detecciones | SaaS, pay-as-you-go |
| HireVue | ⚠️ Eliminó análisis facial (2021) | Controversia ética |

**Nuestra ventaja:** 100% local, privacidad garantizada, sin costos por uso.

---

## 🔒 Cumplimiento Normativo

| Regulación | Estado | Notas |
|:-----------|:-------|:------|
| GDPR (UE) | ⚠️ Revisar | Datos biométricos requieren consentimiento explícito |
| CCPA (California) | ⚠️ Revisar | Right to know, delete |
| Illinois BIPA | ⚠️ Revisar | Requiere consentimiento escrito para biometría |
| NYC AI Law (Local Law 144) | ⚠️ Revisar | Auditoría de sesgo para AEDT en contratación |

**Recomendación:** Consultar con equipo legal antes de uso en producción para RRHH.

---

## 📞 Soporte y Mantenimiento

### Logs de Debug

```javascript
// Activar logs detallados
localStorage.setItem('DEBUG_ANALYSIS', 'true');
```

### Errores Comunes

| Error | Causa | Solución |
|:------|:------|:---------|
| MediaPipe no carga | GPU no disponible | Fallback a CPU delegate |
| Baseline no completa | Cara no detectada en 5s | Verificar iluminación/cámara |
| Predicciones no generan | Pocos frames | Esperar >30 segundos |

---

*Documento actualizado: 2026-01-28*
*Versión del sistema: 2.0.0-advanced*
