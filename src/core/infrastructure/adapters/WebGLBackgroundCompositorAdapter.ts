/**
 * @module infrastructure/adapters/WebGLBackgroundCompositorAdapter
 * Adaptador de infraestructura que implementa IBackgroundCompositor
 * usando WebGLContextManager (singleton) para evitar múltiples contextos.
 */

import {
  IBackgroundCompositor,
  CompositorConfig,
  EffectType,
} from '../../domain/ports/IBackgroundCompositor';
import { acquireWebGLContext, releaseWebGLContext } from '../browser/WebGLContextManager';

// Shaders optimizados para composición de fondo
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
    float maskVal = texture2D(u_mask, v_texCoord).r;
    // maskVal: 0 = background, non-zero = person
    float personAlpha = step(0.5, maskVal); // Smooth threshold
    
    vec4 originalColor = texture2D(u_image, v_texCoord);
    
    vec4 bgColor;
    if (u_effectType == 1) {
      bgColor = texture2D(u_backgroundImage, v_texCoord);
    } else {
      vec2 dirH = vec2(u_texelSize.x * u_blurRadius, 0.0);
      vec2 dirV = vec2(0.0, u_texelSize.y * u_blurRadius);
      bgColor = (blur9(u_image, v_texCoord, dirH) + blur9(u_image, v_texCoord, dirV)) * 0.5;
    }
    
    // Composite: sharp person over processed background
    gl_FragColor = mix(bgColor, originalColor, personAlpha);
  }
`;

export class WebGLBackgroundCompositorAdapter implements IBackgroundCompositor {
  private ctxInstance: Awaited<ReturnType<typeof acquireWebGLContext>> | null = null;
  private config: CompositorConfig | null = null;
  private _isReady = false;
  
  // GL objects
  private program: WebGLProgram | null = null;
  private imageTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private bgImageTex: WebGLTexture | null = null;
  
  // Uniforms
  private uMirror = -1;
  private uTexelSize = -1;
  private uBlurRadius = -1;
  private uEffectType = -1;
  
  // Mask conversion
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(config: CompositorConfig): Promise<void> {
    this.config = config;
    
    // Adquirir contexto WebGL singleton
    this.ctxInstance = await acquireWebGLContext({
      width: config.width,
      height: config.height,
      preserveDrawingBuffer: true,
    });

    const gl = this.ctxInstance.gl;
    const canvas = this.ctxInstance.canvas;
    
    canvas.width = config.width;
    canvas.height = config.height;

    // Compile shaders
    const vs = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, BLUR_COMPOSITE_FRAGMENT);
    this.program = this.createProgram(gl, vs, fs);
    
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(this.program);

    // Setup geometry
    this.setupGeometry(gl);
    
    // Create textures
    this.imageTex = this.createTexture(gl);
    this.maskTex = this.createTexture(gl);
    this.bgImageTex = this.createTexture(gl);
    
    // Get uniforms
    this.uMirror = gl.getUniformLocation(this.program, 'u_mirror') as number;
    this.uTexelSize = gl.getUniformLocation(this.program, 'u_texelSize') as number;
    this.uBlurRadius = gl.getUniformLocation(this.program, 'u_blurRadius') as number;
    this.uEffectType = gl.getUniformLocation(this.program, 'u_effectType') as number;
    
    // Set initial uniforms
    this.updateUniforms(gl);
    
    // Mask canvas
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d')!;

    this._isReady = true;
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
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

  private createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
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

  private createTexture(gl: WebGLRenderingContext): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private setupGeometry(gl: WebGLRenderingContext): void {
    if (!this.program) return;
    
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
  }

  private updateUniforms(gl: WebGLRenderingContext): void {
    if (!this.config || !this.program) return;
    
    gl.uniform1f(this.uMirror, this.config.mirror ? 1.0 : 0.0);
    gl.uniform2f(this.uTexelSize, 1.0 / this.config.width, 1.0 / this.config.height);
    gl.uniform1f(this.uBlurRadius, this.config.blurRadius / 10.0);
    gl.uniform1i(this.uEffectType, this.config.effectType === 'image' ? 1 : 0);
    
    // Bind samplers
    const uImage = gl.getUniformLocation(this.program, 'u_image') as number;
    const uMask = gl.getUniformLocation(this.program, 'u_mask') as number;
    const uBackgroundImage = gl.getUniformLocation(this.program, 'u_backgroundImage') as number;
    
    gl.uniform1i(uImage, 0);
    gl.uniform1i(uMask, 1);
    gl.uniform1i(uBackgroundImage, 2);
    
    gl.viewport(0, 0, this.config.width, this.config.height);
  }

  composite(
    image: HTMLVideoElement | ImageBitmap | HTMLCanvasElement,
    mask: Uint8Array,
    maskWidth: number,
    maskHeight: number
  ): void {
    if (!this.ctxInstance || !this._isReady) return;
    
    const gl = this.ctxInstance.gl;
    
    // Upload image
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image as HTMLVideoElement);
    
    // Convert mask to canvas and upload
    const mc = this.maskCanvas!;
    if (mc.width !== maskWidth || mc.height !== maskHeight) {
      mc.width = maskWidth;
      mc.height = maskHeight;
    }
    
    const imageData = this.maskCtx!.createImageData(maskWidth, maskHeight);
    const d = imageData.data;
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i];
      const idx = i * 4;
      d[idx] = v;
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

  updateConfig(partial: Partial<CompositorConfig>): void {
    if (!this.config || !this.ctxInstance) return;
    
    const gl = this.ctxInstance.gl;
    
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
      this.ctxInstance.canvas.width = w;
      this.ctxInstance.canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(this.uTexelSize, 1.0 / w, 1.0 / h);
    }
  }

  setBackgroundImage(bitmap: ImageBitmap): void {
    if (!this.ctxInstance) return;
    
    const gl = this.ctxInstance.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bgImageTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  }

  getCanvas(): HTMLCanvasElement {
    return this.ctxInstance!.canvas;
  }

  dispose(): void {
    if (this.ctxInstance) {
      releaseWebGLContext();
      this.ctxInstance = null;
    }
    this._isReady = false;
    this.program = null;
    this.imageTex = null;
    this.maskTex = null;
    this.bgImageTex = null;
  }
}
