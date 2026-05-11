/**
 * MediaPipe Web Worker (Classic Script Version)
 * =============================================
 * Este archivo se carga como un Blob string para evitar que Vite lo procese como módulo.
 * Permite usar importScripts() para cargar MediaPipe desde CDN.
 */

/* eslint-disable no-restricted-globals */

// Configuración de CDN
const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Estado global
let faceLandmarker = null;
let poseLandmarker = null;
let isInitialized = false;

// Inicializar MediaPipe
async function initializeMediaPipe(options) {
  try {
    console.log('🔧 [Worker] Inicializando MediaPipe (Dynamic Import)...');
    
    // Usar import() dinámico para cargar el módulo ES desde CDN
    // Esto funciona en workers modernos y carga la versión correcta .mjs
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.mjs');
    
    console.log('🔧 [Worker] Módulo cargado:', vision);
    
    const { FilesetResolver, FaceLandmarker, PoseLandmarker } = vision;
    
    const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);
    
    if (options.enableFace) {
      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_URL,
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      console.log('✅ [Worker] FaceLandmarker listo');
    }
    
    if (options.enablePose) {
      poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      console.log('✅ [Worker] PoseLandmarker listo');
    }
    
    isInitialized = true;
    return { success: true };
    
  } catch (error) {
    console.error('❌ [Worker] Error inicializando:', error);
    return { success: false, error: String(error) };
  }
}

// Analizar frame
function analyzeFrame(payload) {
  if (!isInitialized) return { error: 'No inicializado' };
  
  const results = {
    timestamp: payload.timestamp,
    face: null,
    pose: null
  };
  
  try {
    if (payload.analyzeFace && faceLandmarker) {
      const result = faceLandmarker.detectForVideo(payload.imageData, payload.timestamp);
      if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
        const blendshapes = {};
        result.faceBlendshapes[0].categories.forEach(cat => {
          blendshapes[cat.categoryName] = cat.score;
        });
        results.face = {
          blendshapes,
          landmarks: result.faceLandmarks?.[0] || null,
          hasDetection: true
        };
      } else {
        results.face = { hasDetection: false };
      }
    }
    
    if (payload.analyzePose && poseLandmarker) {
      const result = poseLandmarker.detectForVideo(payload.imageData, payload.timestamp);
      if (result.landmarks && result.landmarks.length > 0) {
        results.pose = {
          landmarks: result.landmarks[0],
          hasDetection: true
        };
      } else {
        results.pose = { hasDetection: false };
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ [Worker] Error análisis:', error);
    return { error: String(error) };
  }
}

// Manejar mensajes
self.onmessage = async function(event) {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'init':
      const result = await initializeMediaPipe(payload);
      self.postMessage({ type: 'ready', payload: result });
      break;
      
    case 'analyze':
      const analysis = analyzeFrame(payload);
      self.postMessage({ type: 'result', payload: analysis });
      break;
      
    case 'stop':
      if (faceLandmarker) faceLandmarker.close();
      if (poseLandmarker) poseLandmarker.close();
      faceLandmarker = null;
      poseLandmarker = null;
      isInitialized = false;
      self.postMessage({ type: 'ready', payload: { stopped: true } });
      break;
  }
};

// Notificar listo
self.postMessage({ type: 'ready', payload: { workerReady: true } });
