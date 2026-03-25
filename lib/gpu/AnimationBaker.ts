/**
 * PR-8: AnimationBaker — Hornea animaciones de SkinnedMesh en DataTexture
 *
 * En vez de que la CPU calcule 60 matrices de huesos × 500 avatares × 60fps,
 * pre-calculamos TODAS las poses de cada animación y las guardamos en una textura.
 * La GPU lee la textura en el vertex shader para posicionar los vértices.
 *
 * Formato de la textura:
 *   - Ancho: numBones * 4 (cada bone = 4 pixels para una Matrix4)
 *   - Alto: numFrames (cada fila = un frame de la animación)
 *   - Tipo: FloatType (RGBA32F)
 *
 * Cada pixel RGBA almacena una fila de la Matrix4:
 *   pixel[0] = (m11, m12, m13, m14)
 *   pixel[1] = (m21, m22, m23, m24)
 *   pixel[2] = (m31, m32, m33, m34)
 *   pixel[3] = (m41, m42, m43, m44)
 *
 * Clean Architecture: Infraestructura pura (no React, no DOM)
 */

import * as THREE from 'three';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface BakedAnimation {
  /** Nombre del clip (e.g. "idle", "walk", "run") */
  name: string;
  /** Duración del clip en segundos */
  duration: number;
  /** Número de frames horneados */
  numFrames: number;
  /** Número de huesos */
  numBones: number;
  /** FPS al que se horneó */
  fps: number;
  /** Textura con los datos de huesos (FloatType RGBA) */
  boneTexture: THREE.DataTexture;
}

export interface BakedAnimationSet {
  /** Mapa de nombre de animación → datos horneados */
  animations: Map<string, BakedAnimation>;
  /** Número de huesos del skeleton */
  numBones: number;
  /** Geometría compartida (para InstancedMesh) */
  geometry: THREE.BufferGeometry;
  /** Material base (para clonar con shader custom) */
  baseMaterial: THREE.Material | THREE.Material[];
}

// ─── Baker ──────────────────────────────────────────────────────────────────

/**
 * Hornea un clip de animación en una DataTexture.
 * Samplea la animación a `fps` frames por segundo y guarda
 * las matrices de huesos de cada frame.
 *
 * @param mesh - SkinnedMesh con skeleton
 * @param clip - AnimationClip a hornear
 * @param fps - Frames por segundo para samplear (default: 30)
 */
export function bakeAnimationClip(
  mesh: THREE.SkinnedMesh,
  clip: THREE.AnimationClip,
  fps: number = 30
): BakedAnimation {
  const skeleton = mesh.skeleton;
  const numBones = skeleton.bones.length;
  const duration = clip.duration;
  const numFrames = Math.ceil(duration * fps) + 1;

  // Textura: ancho = numBones * 4 (4 pixels por bone), alto = numFrames
  const width = numBones * 4;
  const height = numFrames;
  const data = new Float32Array(width * height * 4); // RGBA

  // Crear mixer temporal para samplear
  const mixer = new THREE.AnimationMixer(mesh);
  const action = mixer.clipAction(clip);
  action.play();

  // Matrices temporales
  const boneInverses = skeleton.boneInverses;
  const boneMatrixWorld = new THREE.Matrix4();
  const identityMatrix = new THREE.Matrix4();

  for (let frame = 0; frame < numFrames; frame++) {
    const time = (frame / fps) % duration;
    mixer.setTime(time);

    // Actualizar matrices del skeleton
    mesh.updateMatrixWorld(true);
    skeleton.update();

    // Guardar matrices de huesos en la textura
    for (let boneIdx = 0; boneIdx < numBones; boneIdx++) {
      const bone = skeleton.bones[boneIdx];

      // Matrix final = boneMatrixWorld * boneInverse
      boneMatrixWorld.multiplyMatrices(bone.matrixWorld, boneInverses[boneIdx]);

      // Cada bone ocupa 4 pixels (16 floats para Matrix4)
      const pixelOffset = (frame * width + boneIdx * 4) * 4;
      const elements = boneMatrixWorld.elements;

      // Fila 0: (m11, m21, m31, m41) — column-major
      data[pixelOffset + 0] = elements[0];
      data[pixelOffset + 1] = elements[1];
      data[pixelOffset + 2] = elements[2];
      data[pixelOffset + 3] = elements[3];

      // Fila 1
      data[pixelOffset + 4] = elements[4];
      data[pixelOffset + 5] = elements[5];
      data[pixelOffset + 6] = elements[6];
      data[pixelOffset + 7] = elements[7];

      // Fila 2
      data[pixelOffset + 8] = elements[8];
      data[pixelOffset + 9] = elements[9];
      data[pixelOffset + 10] = elements[10];
      data[pixelOffset + 11] = elements[11];

      // Fila 3
      data[pixelOffset + 12] = elements[12];
      data[pixelOffset + 13] = elements[13];
      data[pixelOffset + 14] = elements[14];
      data[pixelOffset + 15] = elements[15];
    }
  }

  // Cleanup mixer
  mixer.stopAllAction();
  mixer.uncacheRoot(mesh);

  // Crear textura
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  return {
    name: clip.name,
    duration,
    numFrames,
    numBones,
    fps,
    boneTexture: texture,
  };
}

/**
 * Hornea todas las animaciones de un GLTF en un BakedAnimationSet.
 * Busca los clips estándar (idle, walk, run, sit) o usa todos los disponibles.
 */
export function bakeAllAnimations(
  skinnedMesh: THREE.SkinnedMesh,
  clips: THREE.AnimationClip[],
  fps: number = 30
): BakedAnimationSet {
  const animations = new Map<string, BakedAnimation>();

  for (const clip of clips) {
    const baked = bakeAnimationClip(skinnedMesh, clip, fps);
    animations.set(clip.name, baked);
  }

  return {
    animations,
    numBones: skinnedMesh.skeleton.bones.length,
    geometry: skinnedMesh.geometry,
    baseMaterial: skinnedMesh.material,
  };
}

// ─── Cache global de animaciones horneadas ────────────────────────────────────

const bakedAnimationCache = new Map<string, BakedAnimationSet>();

/**
 * Obtiene o crea el set de animaciones horneadas para un modelo.
 * Cache por URL del modelo para no re-hornear el mismo GLTF.
 */
export function getOrBakeAnimations(
  modelUrl: string,
  skinnedMesh: THREE.SkinnedMesh,
  clips: THREE.AnimationClip[],
  fps: number = 30
): BakedAnimationSet {
  if (bakedAnimationCache.has(modelUrl)) {
    return bakedAnimationCache.get(modelUrl)!;
  }

  const bakedSet = bakeAllAnimations(skinnedMesh, clips, fps);
  bakedAnimationCache.set(modelUrl, bakedSet);
  return bakedSet;
}

export function clearBakedAnimationCache(): void {
  for (const set of bakedAnimationCache.values()) {
    for (const anim of set.animations.values()) {
      anim.boneTexture.dispose();
    }
  }
  bakedAnimationCache.clear();
}
