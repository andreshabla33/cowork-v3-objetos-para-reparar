# Análisis de Tecnologías de Visión Artificial en Navegador (Tendencias 2026)

**Fecha:** 2026-01-29
**Objetivo:** Evaluar viabilidad de mantener MediaPipe vs. pivotar a nuevas tecnologías Open Source.

## Resumen Ejecutivo

Para el caso de uso de **análisis biométrico en tiempo real (facial y postural) en videollamadas**, **MediaPipe sigue siendo la opción líder en rendimiento y eficiencia** para 2025-2026. Sin embargo, el ecosistema se está moviendo hacia **WebGPU** y runtimes universales como **ONNX Runtime Web** y **Transformers.js**.

**Recomendación:** ✅ **Mantener MediaPipe** a corto/mediano plazo, pero migrar la implementación a **WebGPU** (ya soportado experimentalmente en MediaPipe) y encapsularlo en Workers (como estamos haciendo). Pivotar a Transformers.js solo si se requieren modelos de lenguaje/visión más complejos (ej. descripciones semánticas de video) que detección de puntos.

---

## 1. Panorama Tecnológico 2025-2026

### A. Google MediaPipe (Tecnología Actual)
*   **Estado:** Estándar de facto para detección de landmarks en web.
*   **Ventajas:**
    *   Modelos extremadamente ligeros (<10MB) y rápidos.
    *   Optimizado específicamente para Face Mesh y Pose (BlazeFace/BlazePose).
    *   Soporte WebAssembly (WASM) y WebGL/WebGPU.
*   **Desventajas:**
    *   Menos flexible para modelos "custom" fuera del ecosistema TFLite.
    *   Caja negra en el pre-procesamiento.

### B. Transformers.js (Hugging Face) + ONNX Runtime Web
*   **Estado:** La tendencia de mayor crecimiento. Permite correr modelos de Hugging Face en el navegador.
*   **Ventajas:**
    *   **Acceso a SOTA:** Puedes usar cualquier modelo moderno (YOLOv11, ViT, Depth-Anything) convertido a ONNX.
    *   **Agnóstico:** No depende de Google. Open Source puro.
    *   **WebGPU First:** Diseñado para aprovechar aceleración de hardware moderna.
*   **Desventajas:**
    *   **Peso:** Los modelos suelen ser más grandes que los micro-modelos de MediaPipe.
    *   **Overhead:** Mayor consumo de memoria inicial.

### C. TensorFlow.js (Legacy)
*   **Estado:** En mantenimiento. Google prioriza MediaPipe para soluciones "listas para usar" y TFLite para edge.
*   **Recomendación:** No migrar aquí. Es tecnología 2020-2023.

---

## 2. Comparativa para "V2 Cowork"

| Característica | MediaPipe (Actual) | Transformers.js / ONNX |
| :--- | :--- | :--- |
| **Detección Facial** | 🚀 **Excelente** (468 puntos, <5ms) | ⚠️ Bueno, pero modelos más pesados |
| **Detección Pose** | 🚀 **Excelente** (33 puntos, ligero) | ✅ Muy bueno (YOLOv8-Pose), pero más lento |
| **Carga Inicial** | ⚡ **Rápida** (WASM modular) | 🐢 Lenta (Modelos ONNX >20MB) |
| **Consumo CPU/GPU** | 🟢 **Bajo** (Optimizado Edge) | 🟡 Medio (Depende del modelo) |
| **Flexibilidad** | 🔴 Baja (Solo tareas predefinidas) | 🟢 Alta (Cualquier modelo) |

## 3. Hoja de Ruta Tecnológica (Roadmap)

### Fase 1: Optimización Actual (Q1 2026)
*   **Web Workers:** Desacoplar procesamiento del hilo principal (✅ Implementado).
*   **WebGPU Delegate:** Activar `delegate: 'GPU'` en MediaPipe en lugar de WebGL para reducir uso de CPU.

### Fase 2: Evaluación de Pivote (Q3 2026)
*   Si requerimos **análisis de emociones más complejo** (no solo geometría facial, sino contexto visual), evaluar **Transformers.js** con modelos pequeños de Vision-Language (ej. Moondream optimizado para web).

## Conclusión Técnica

El problema actual ("audio entrecortado" o fallos de carga) **no es culpa de la tecnología MediaPipe**, sino de la **arquitectura de implementación (Hilo principal vs Worker)** y de la **integración con bundlers modernos (Vite)**.

**Cambiar de tecnología ahora introduciría:**
1.  Mayor latencia de descarga (modelos más pesados).
2.  Mayor complejidad de ingeniería.
3.  Pérdida de las optimizaciones específicas de BlazeFace/BlazePose.

**Decisión:** Reparar la integración del Worker de MediaPipe es el camino correcto.
