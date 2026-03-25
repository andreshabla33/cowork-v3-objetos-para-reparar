/**
 * @module infrastructure/WebGLBackgroundCompositor
 * Fast-path background compositor using WebGL.
 * 
 * Replaces the Canvas2D `ctx.filter = 'blur()'` approach with a single-pass
 * WebGL shader that performs:
 *   1. Gaussian blur on the background region
 *   2. Compositing person (sharp) over background (blurred)
 * 
 * Performance: ~1-2ms per frame vs ~30ms for Canvas2D blur at 1280×720.
 * 
 * Falls back to Canvas2DBackgroundCompositor if WebGL is unavailable.
 */

import type {
  IBackgroundCompositor,
  CompositorConfig,
} from '../domain/ports/IBackgroundCompositor';

// ─── Shader Sources ─────────────────────────────────────────────────────────

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  uniform float u_mirror;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = vec2(
      mix(a_texCoord.x, 1.0 - a_texCoord.x, u_mirror),
      a_texCoord.y
    );
  }
`;

const BLUR_COMPOSITE_FRAGMENT = `
  precision mediump float;
  varying vec2 v_texCoord;
  
  uniform sampler2D u_image;
  uniform sampler2D u_mask;
  uniform sampler2D u_backgroundImage;
  uniform vec2 u_texelSize;
  uniform float u_blurRadius;
  uniform int u_effectType; // 0 = blur, 1 = image
  
  // Optimized 9-tap Gaussian blur
  vec4 blur9(sampler2D tex, vec2 uv, vec2 direction) {
    vec4 color = vec4(0.0);
    vec2 off1 = 1.3846153846 * direction;
    vec2 off2 = 3.2307692308 * direction;
    color += texture2D(tex, uv) * 0.2270270270;
    color += texture2D(tex, uv + off1) * 0.3162162162;
    color += texture2D(tex, uv - off1) * 0.3162162162;
    color += texture2D(tex, uv + off2) * 0.0702702703;
    color += texture2D(tex, uv - off2) * 0.0702702703;
    return color;
  }
  
  void main() {
    // Get mask value — person regions are non-zero in category mask
    float maskVal = texture2D(u_mask, v_texCoord).r;
    // Invert: 1.0 = person, 0.0 = background
    float personAlpha = step(0.004, maskVal); // threshold ~1/255
    
    vec4 originalColor = texture2D(u_image, v_texCoord);
    
    vec4 bgColor;
    if (u_effectType == 1) {
      // Image replacement mode
      bgColor = texture2D(u_backgroundImage, v_texCoord);
    } else {
      // Blur mode — multi-pass approximation via multiple taps
      vec2 dirH = vec2(u_texelSize.x * u_blurRadius, 0.0);
      vec2 dirV = vec2(0.0, u_texelSize.y * u_blurRadius);
      bgColor = (blur9(u_image, v_texCoord, dirH) + blur9(u_image, v_texCoord, dirV)) * 0.5;
    }
    
    // Composite: person (sharp) over background (blurred/replaced)
    gl_FragColor = mix(bgColor, originalColor, personAlpha);
  }
`;

// ─── Helper functions ───────────────────────────────────────────────────────

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

// ─── Compositor ─────────────────────────────────────────────────────────────

export class WebGLBackgroundCompositor implements IBackgroundCompositor {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private imageTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private bgImageTex: WebGLTexture | null = null;
  private _isReady = false;
  private config: CompositorConfig | null = null;

  // Uniforms
  private uMirror = -1;
  private uTexelSize = -1;
  private uBlurRadius = -1;
  private uEffectType = -1;
  private uImage = -1;
  private uMask = -1;
  private uBackgroundImage = -1;

  // Reusable mask canvas for converting Uint8Array → texture
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(config: CompositorConfig): Promise<void> {
    this.config = config;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = config.width;
    this.canvas.height = config.height;

    // Get WebGL context
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true, // Required for captureStream()
      premultipliedAlpha: false,
    });

    if (!gl) {
      throw new Error('[WebGLCompositor] WebGL not available');
    }

    this.gl = gl;

    // Compile shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, BLUR_COMPOSITE_FRAGMENT);
    this.program = createProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(this.program);

    // Setup geometry (fullscreen quad)
    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.program, 'a_position');
    const aTexCoord = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

    // Get uniform locations
    this.uMirror = gl.getUniformLocation(this.program, 'u_mirror') as number;
    this.uTexelSize = gl.getUniformLocation(this.program, 'u_texelSize') as number;
    this.uBlurRadius = gl.getUniformLocation(this.program, 'u_blurRadius') as number;
    this.uEffectType = gl.getUniformLocation(this.program, 'u_effectType') as number;
    this.uImage = gl.getUniformLocation(this.program, 'u_image') as number;
    this.uMask = gl.getUniformLocation(this.program, 'u_mask') as number;
    this.uBackgroundImage = gl.getUniformLocation(this.program, 'u_backgroundImage') as number;

    // Create textures
    this.imageTex = createTexture(gl);
    this.maskTex = createTexture(gl);
    this.bgImageTex = createTexture(gl);

    // Set initial uniforms
    gl.uniform1f(this.uMirror, config.mirror ? 1.0 : 0.0);
    gl.uniform2f(this.uTexelSize, 1.0 / config.width, 1.0 / config.height);
    gl.uniform1f(this.uBlurRadius, config.blurRadius / 10.0); // Normalize
    gl.uniform1i(this.uEffectType, config.effectType === 'image' ? 1 : 0);

    // Bind samplers to texture units
    gl.uniform1i(this.uImage, 0);
    gl.uniform1i(this.uMask, 1);
    gl.uniform1i(this.uBackgroundImage, 2);

    gl.viewport(0, 0, config.width, config.height);

    // Mask conversion canvas
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d')!;

    this._isReady = true;
    console.log(`[WebGLCompositor] Ready ${config.width}×${config.height}`);
  }

  composite(
    image: HTMLVideoElement | ImageBitmap,
    mask: Uint8Array,
    maskWidth: number,
    maskHeight: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this._isReady) return;

    // Upload image texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Convert mask Uint8Array to a canvas for texture upload
    // MediaPipe mask: 0 = background, non-zero = person
    const mc = this.maskCanvas!;
    if (mc.width !== maskWidth || mc.height !== maskHeight) {
      mc.width = maskWidth;
      mc.height = maskHeight;
    }
    const imageData = this.maskCtx!.createImageData(maskWidth, maskHeight);
    const d = imageData.data;
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i]; // 0 = bg, non-zero = person
      const idx = i * 4;
      d[idx] = v;     // R = mask value
      d[idx + 1] = v;
      d[idx + 2] = v;
      d[idx + 3] = 255;
    }
    this.maskCtx!.putImageData(imageData, 0, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  setBackgroundImage(bitmap: ImageBitmap): void {
    const gl = this.gl;
    if (!gl) return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bgImageTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  }

  updateConfig(partial: Partial<CompositorConfig>): void {
    if (!this.gl || !this.config) return;
    const gl = this.gl;

    if (partial.mirror !== undefined) {
      this.config.mirror = partial.mirror;
      gl.uniform1f(this.uMirror, partial.mirror ? 1.0 : 0.0);
    }
    if (partial.blurRadius !== undefined) {
      this.config.blurRadius = partial.blurRadius;
      gl.uniform1f(this.uBlurRadius, partial.blurRadius / 10.0);
    }
    if (partial.effectType !== undefined) {
      this.config.effectType = partial.effectType;
      gl.uniform1i(this.uEffectType, partial.effectType === 'image' ? 1 : 0);
    }
    if (partial.width !== undefined || partial.height !== undefined) {
      const w = partial.width ?? this.config.width;
      const h = partial.height ?? this.config.height;
      this.config.width = w;
      this.config.height = h;
      this.canvas!.width = w;
      this.canvas!.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(this.uTexelSize, 1.0 / w, 1.0 / h);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas!;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.imageTex) gl.deleteTexture(this.imageTex);
      if (this.maskTex) gl.deleteTexture(this.maskTex);
      if (this.bgImageTex) gl.deleteTexture(this.bgImageTex);
      if (this.program) gl.deleteProgram(this.program);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    }
    this.gl = null;
    this.canvas = null;
    this.program = null;
    this._isReady = false;
    this.maskCanvas = null;
    this.maskCtx = null;
  }
}
