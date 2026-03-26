# Web Worker para MediaPipe - Optimización de Rendimiento

**Fecha:** 2026-01-29  
**Versión:** 1.0  
**Estado:** Implementado

## Descripción

Implementación de Web Workers para ejecutar el análisis facial y corporal de MediaPipe en un hilo separado, liberando el hilo principal para WebRTC y audio.

## Problema Resuelto

- ❌ Audio entrecortado durante grabación con análisis facial
- ❌ Bloqueo de UI durante procesamiento de MediaPipe
- ❌ Conflicto entre MediaPipe, WebRTC y Web Speech API

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    HILO PRINCIPAL                        │
│  - WebRTC (videollamada)                                │
│  - Web Speech API (transcripción)                       │
│  - UI React                                             │
│  ✅ Ya no se bloquea por MediaPipe                      │
└────────────────────┬────────────────────────────────────┘
                     │ postMessage (ImageBitmap)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   WEB WORKER                             │
│  - MediaPipe FaceLandmarker                             │
│  - MediaPipe PoseLandmarker                             │
│  - Cálculos de emociones/microexpresiones               │
└─────────────────────────────────────────────────────────┘
```

## Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `components/meetings/recording/mediapipe.worker.ts` | Worker que ejecuta MediaPipe en hilo separado |
| `components/meetings/recording/useMediaPipeWorker.ts` | Hook React para comunicación con el Worker |

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `components/meetings/recording/useAdvancedEmotionAnalysis.ts` | Usa Worker para análisis facial |
| `components/meetings/recording/useBodyLanguageAnalysis.ts` | Usa Worker para análisis corporal |

## Uso

### Hook useMediaPipeWorker

```typescript
import { useMediaPipeWorker } from './useMediaPipeWorker';

const { isReady, initialize, analyze, stop } = useMediaPipeWorker({
  enableFace: true,
  enablePose: true,
  onResult: (result) => console.log(result),
  onError: (error) => console.error(error)
});

// Inicializar el Worker
await initialize();

// Analizar un frame de video
const result = await analyze(videoElement, {
  analyzeFace: true,
  analyzePose: false
});

// Resultado
// result.face.blendshapes -> Record<string, number> de emociones
// result.pose.landmarks -> Array de landmarks corporales

// Detener el Worker
stop();
```

### Estructura del Resultado

```typescript
interface MediaPipeResult {
  timestamp: number;
  face: {
    blendshapes: Record<string, number>;
    landmarks: any[] | null;
    hasDetection: boolean;
  } | null;
  pose: {
    landmarks: any[];
    hasDetection: boolean;
  } | null;
  error?: string;
}
```

## Configuración

En cada hook de análisis hay un flag para controlar el uso del Worker:

```typescript
const USE_WEB_WORKER = true; // Cambiar a false para fallback
```

- `true` (default): Usa Web Worker (mejor rendimiento)
- `false`: Fallback a análisis directo (bloquea hilo principal)

## Comunicación Worker ↔ Hilo Principal

### Mensajes del Hilo Principal al Worker

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `init` | `{ enableFace, enablePose }` | Inicializar MediaPipe |
| `analyze` | `{ imageData, timestamp, analyzeFace, analyzePose }` | Analizar frame |
| `stop` | - | Detener y limpiar recursos |

### Mensajes del Worker al Hilo Principal

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `ready` | `{ workerReady: true }` | Worker listo para recibir mensajes |
| `ready` | `{ success: true }` | MediaPipe inicializado |
| `result` | `{ timestamp, face, pose }` | Resultado del análisis |
| `error` | `{ message }` | Error durante procesamiento |

## Flujo de Datos

```
1. Video Frame (HTMLVideoElement)
       ↓
2. createImageBitmap(video) - Crea bitmap transferible
       ↓
3. worker.postMessage({ type: 'analyze', payload: { imageData } })
       ↓
4. [WORKER] MediaPipe detectForVideo(imageData, timestamp)
       ↓
5. [WORKER] self.postMessage({ type: 'result', payload: results })
       ↓
6. Procesar blendshapes → calcular emociones/engagement/stress
```

## Beneficios

1. **Audio fluido**: WebRTC no compite por CPU con MediaPipe
2. **UI responsiva**: Sin bloqueos durante análisis
3. **Escalable**: Fácil agregar más análisis al Worker
4. **Fallback**: Si el Worker falla, hay modo directo disponible

## Notas Técnicas

### Errores de TypeScript Esperados

Los imports CDN de MediaPipe generan errores de TypeScript:
```
Cannot find module 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
```

**Esto es esperado** y funciona en runtime. TypeScript no puede resolver módulos dinámicos de CDN en tiempo de compilación.

### import.meta.url

El hook usa `import.meta.url` para crear el Worker:
```typescript
// @ts-ignore - Vite maneja esto en build time
const worker = new Worker(new URL('./mediapipe.worker.ts', import.meta.url), { type: 'module' });
```

### Timeout de Seguridad

Hay un timeout de 3 segundos para evitar bloqueos si el Worker no responde:
```typescript
setTimeout(() => {
  if (pendingCallbacksRef.current.has(timestamp)) {
    pendingCallbacksRef.current.delete(timestamp);
    resolve(null);
  }
}, 3000);
```

## Troubleshooting

### El Worker no se inicializa

1. Verificar que el navegador soporte Web Workers
2. Revisar la consola para errores de CORS con CDN de MediaPipe
3. Verificar que GPU esté disponible (delegate: 'GPU')

### Audio sigue entrecortado

1. Verificar que `USE_WEB_WORKER = true`
2. Revisar que el Worker esté inicializado (`workerReady`)
3. Aumentar `ANALYSIS_INTERVAL_MS` (actualmente 500ms)

### Sin detección de rostro/pose

1. Verificar iluminación adecuada
2. Verificar que la cámara esté activa
3. Revisar logs del Worker para errores de MediaPipe

## Referencias

- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Vite Worker Import](https://vitejs.dev/guide/features.html#web-workers)
