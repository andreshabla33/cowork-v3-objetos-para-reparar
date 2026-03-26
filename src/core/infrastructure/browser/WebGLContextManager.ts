/**
 * @module infrastructure/browser/WebGLContextManager
 * Singleton manager para contextos WebGL.
 * La industria recomienda máximo 8-16 contextos WebGL simultáneos.
 * Este manager asegura que solo haya 1 contexto compartido para background effects.
 */

interface WebGLContextInstance {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  program: WebGLProgram | null;
  refCount: number;
}

let globalWebGLContext: WebGLContextInstance | null = null;
let globalContextPromise: Promise<WebGLContextInstance> | null = null;

export interface WebGLContextConfig {
  width: number;
  height: number;
  preserveDrawingBuffer?: boolean;
}

/**
 * Obtener o crear el singleton de contexto WebGL
 * Este es el patrón de la industria para evitar "Too many WebGL contexts"
 */
export async function acquireWebGLContext(
  config: WebGLContextConfig
): Promise<WebGLContextInstance> {
  if (globalContextPromise) {
    const instance = await globalContextPromise;
    instance.refCount++;
    return instance;
  }

  globalContextPromise = createWebGLContext(config);
  const instance = await globalContextPromise;
  instance.refCount++;
  return instance;
}

function createWebGLContext(
  config: WebGLContextConfig
): Promise<WebGLContextInstance> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: config.preserveDrawingBuffer ?? true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      reject(new Error('WebGL not available'));
      return;
    }

    const instance: WebGLContextInstance = {
      gl,
      canvas,
      program: null,
      refCount: 0,
    };

    resolve(instance);
  });
}

/**
 * Liberar referencia al contexto WebGL global
 * Solo destruye cuando refCount llega a 0
 */
export function releaseWebGLContext(): void {
  if (globalWebGLContext) {
    globalWebGLContext.refCount--;
    
    if (globalWebGLContext.refCount <= 0) {
      // Destruir contexto
      const ext = globalWebGLContext.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      globalWebGLContext = null;
      globalContextPromise = null;
    }
  }
}

/**
 * Verificar si WebGL está disponible en el navegador
 */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}
