/**
 * PR-8/9: Instanced Skinning Shader Material
 *
 * Shader custom que lee matrices de huesos desde una DataTexture
 * en vez de calcularlas en CPU. Compatible con InstancedMesh.
 *
 * Per-instance attributes:
 *   - animIndex: qué animación reproducir (0=idle, 1=walk, etc.)
 *   - animTime: tiempo normalizado 0-1 dentro de la animación
 *
 * El vertex shader:
 *   1. Lee el frame actual basado en animTime * numFrames
 *   2. Busca las 4 matrices de huesos relevantes en la textura
 *   3. Aplica skinning (bone weights) al vértice
 *   4. Multiplica por la matrix de instancia (posición/rotación)
 *
 * Incluye soporte para sombras y neblina via chunks de Three.js.
 */

import * as THREE from 'three';

// ─── Fallback Texture ──────────────────────────────────────────────────────
//
// new THREE.Texture() has image=null. When THREE.UniformsUtils.merge() clones
// it, the clone gets needsUpdate=true but image stays null. Three.js
// WebGLTextures.setTexture2D then:
//   1. Detects image === null → emits "Texture marked for update but no
//      image data found."
//   2. Returns WITHOUT updating textureProperties.__version
//   3. Next frame the version check fails again → warning repeats EVERY frame
//
// Additionally, the fragment shader samples texture2D(map, vUv) on the null
// texture, which returns (0,0,0,0) on most GPUs → the mesh is fully
// transparent/invisible. On some GPUs, uninitialised texture memory appears
// as a green/magenta rectangle.
//
// Fix: use a 1×1 opaque white DataTexture with real pixel data.
// Ref: three.js/src/renderers/webgl/WebGLTextures.js → setTexture2D
// Ref: https://github.com/mrdoob/three.js/issues/7299
// ────────────────────────────────────────────────────────────────────────────
const _fallbackWhitePixel = new Uint8Array([255, 255, 255, 255]);

/**
 * Singleton 1×1 white DataTexture used as fallback when a model has no
 * diffuse map. Provides valid image data so Three.js can upload to GPU
 * without warnings, and the fragment shader reads opaque white instead of
 * transparent black.
 */
const FALLBACK_WHITE_MAP = new THREE.DataTexture(
  _fallbackWhitePixel,
  1,
  1,
  THREE.RGBAFormat,
  THREE.UnsignedByteType,
);
FALLBACK_WHITE_MAP.needsUpdate = true;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface InstancedSkinningUniforms {
  boneTexture: THREE.DataTexture;
  numBones: number;
  numFrames: number;
  animTexSize: THREE.Vector2;
}

// ─── Vertex Shader ──────────────────────────────────────────────────────────

export const instancedSkinningVertexShader = /* glsl */ `
precision highp float;

#include <common>
#include <shadowmap_pars_vertex>
#include <fog_pars_vertex>

// Skinning attributes — Three.js only injects these when the object
// is a SkinnedMesh (object.isSkinnedMesh === true → USE_SKINNING defined).
// Since we use InstancedMesh, USE_SKINNING is never set and these are
// not auto-injected. The geometry MUST have them as BufferAttributes
// (cloned from the original SkinnedMesh).
// Ref: three.js/src/renderers/webgl/WebGLPrograms.js → skinning: object.isSkinnedMesh
// Ref: three.js/src/renderers/webgl/WebGLProgram.js → #ifdef USE_SKINNING
#ifndef USE_SKINNING
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
#endif

// Per-instance attributes (set via InstancedBufferAttribute)
attribute float animIndex;   // Which animation to play
attribute float animTime;    // Normalized time 0-1

// Uniforms
uniform sampler2D boneTexture;
uniform float numBones;
uniform float numFrames;
uniform vec2 animTexSize;

// Varyings
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

/**
 * Reads a bone matrix from the baked animation texture.
 * Each bone takes 4 pixels (4×4 = 16 floats → 4 RGBA pixels).
 */
mat4 getBoneMatrix(float boneIndex, float frame) {
  float frameRow = floor(frame);
  float pixelX = boneIndex * 4.0;
  float texelSize = 1.0 / animTexSize.x;
  float texelSizeY = 1.0 / animTexSize.y;
  
  float y = (frameRow + 0.5) * texelSizeY;
  
  vec4 row0 = texture2D(boneTexture, vec2((pixelX + 0.5) * texelSize, y));
  vec4 row1 = texture2D(boneTexture, vec2((pixelX + 1.5) * texelSize, y));
  vec4 row2 = texture2D(boneTexture, vec2((pixelX + 2.5) * texelSize, y));
  vec4 row3 = texture2D(boneTexture, vec2((pixelX + 3.5) * texelSize, y));
  
  return mat4(row0, row1, row2, row3);
}

void main() {
  vUv = uv;
  
  // Calculate current frame from normalized time
  float frame = animTime * (numFrames - 1.0);
  
  // Get bone matrices for this vertex's 4 bone influences
  mat4 bm0 = getBoneMatrix(skinIndex.x, frame);
  mat4 bm1 = getBoneMatrix(skinIndex.y, frame);
  mat4 bm2 = getBoneMatrix(skinIndex.z, frame);
  mat4 bm3 = getBoneMatrix(skinIndex.w, frame);
  
  // Blend bone matrices by weights
  mat4 skinMatrix = 
    bm0 * skinWeight.x +
    bm1 * skinWeight.y +
    bm2 * skinWeight.z +
    bm3 * skinWeight.w;
  
  // Apply skinning
  vec4 skinnedPosition = skinMatrix * vec4(position, 1.0);
  vec4 skinnedNormal4 = skinMatrix * vec4(normal, 0.0);

  // Apply instance transform
  vec4 worldPosition = instanceMatrix * skinnedPosition;

  // Standard MVP
  vec4 mvPosition = modelViewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;

  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * skinnedNormal4.xyz);
  vViewPosition = -mvPosition.xyz;

  // Three.js r182 chunks (shadowmap_vertex) exigen estos símbolos por nombre:
  //  - vec3 transformedNormal:   normal en object-space post-skinning.
  //  - vec4 worldPosition:       vértice en world-space (ya declarado arriba).
  // Sin transformedNormal, el chunk falla a compilar con
  //   "Vertex shader is not compiled" (inverseTransformDirection lo
  //   referencia — ver three/src/.../shadowmap_vertex.glsl.js).
  // Ref: https://github.com/mrdoob/three.js/blob/r182/src/renderers/shaders/ShaderChunk/shadowmap_vertex.glsl.js
  vec3 transformedNormal = skinnedNormal4.xyz;

  #include <shadowmap_vertex>
  #include <fog_vertex>
}
`;

// ─── Fragment Shader ────────────────────────────────────────────────────────

export const instancedSkinningFragmentShader = /* glsl */ `
precision highp float;

#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

uniform sampler2D map;
uniform vec3 diffuse;
uniform float opacity;

void main() {
  vec3 normal = normalize(vNormal);
  
  // Directional light
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diffuseLight = max(dot(normal, lightDir), 0.0);
  float ambient = 0.4;
  float lighting = ambient + diffuseLight * 0.6;
  
  // Shadow mask from Three.js shadow system
  float shadow = getShadowMask();
  
  vec4 texColor = texture2D(map, vUv);
  vec3 color = texColor.rgb * diffuse * lighting * shadow;
  
  gl_FragColor = vec4(color, texColor.a * opacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// ─── Material Factory ───────────────────────────────────────────────────────

/**
 * Crea un ShaderMaterial con el shader de instanced skinning.
 * Compatible con InstancedMesh + baked animation textures.
 */
export function createInstancedSkinningMaterial(
  bakedTexture: THREE.DataTexture,
  numBones: number,
  numFrames: number,
  diffuseMap?: THREE.Texture | null,
  diffuseColor?: THREE.Color
): THREE.ShaderMaterial {
  const texWidth = numBones * 4;
  const texHeight = numFrames;

  return new THREE.ShaderMaterial({
    name: 'InstancedSkinning',
    vertexShader: instancedSkinningVertexShader,
    fragmentShader: instancedSkinningFragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      {
        boneTexture: { value: bakedTexture },
        numBones: { value: numBones },
        numFrames: { value: numFrames },
        animTexSize: { value: new THREE.Vector2(texWidth, texHeight) },
        map: { value: diffuseMap ?? FALLBACK_WHITE_MAP },
        diffuse: { value: diffuseColor || new THREE.Color(1, 1, 1) },
        opacity: { value: 1.0 },
      },
    ]),
    lights: true,
    fog: true,
    side: THREE.DoubleSide,
    transparent: false,
  });
}

// ─── Instance Attribute Helpers ─────────────────────────────────────────────

/**
 * Crea los InstancedBufferAttributes necesarios para el shader.
 * Estos se añaden a la geometry del InstancedMesh.
 *
 * @param maxInstances - Capacidad máxima de instancias
 */
export function createInstanceAnimationAttributes(maxInstances: number) {
  const animIndices = new Float32Array(maxInstances);
  const animTimes = new Float32Array(maxInstances);

  return {
    animIndex: new THREE.InstancedBufferAttribute(animIndices, 1),
    animTime: new THREE.InstancedBufferAttribute(animTimes, 1),
  };
}

/**
 * Actualiza los atributos de animación para una instancia específica.
 */
export function updateInstanceAnimation(
  attributes: ReturnType<typeof createInstanceAnimationAttributes>,
  instanceIndex: number,
  animIndex: number,
  animTime: number
): void {
  attributes.animIndex.setX(instanceIndex, animIndex);
  attributes.animTime.setX(instanceIndex, animTime);
  attributes.animIndex.needsUpdate = true;
  attributes.animTime.needsUpdate = true;
}
