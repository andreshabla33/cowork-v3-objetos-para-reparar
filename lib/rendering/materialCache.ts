/**
 * @module lib/rendering/materialCache
 *
 * Cache global de materiales Three.js para reducir shader programs.
 *
 * Problema detectado (logs renderer-metrics):
 *   programs: 28–32 (muchos materiales únicos → muchas compilaciones de shader)
 * Causa: cada <meshStandardMaterial> con propiedades diferentes compila un shader.
 * Solución: compartir instancias de material y variar solo via uniforms.
 *
 * Ref: R3F docs pitfalls — "Every material or light you put into the scene
 *      has to compile, and every geometry you create will be processed."
 * https://r3f.docs.pmnd.rs/advanced/pitfalls
 *
 * Ref: Three.js — "Share materials if you can"
 * https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
 *
 * IMPACTO ESPERADO:
 *   Programs: 32 → ~12–15 (reducción ~50–60% de compilaciones de shader)
 */

import * as THREE from 'three';

// ─── Cache Singleton ──────────────────────────────────────────────────────────

const _cacheMateriales = new Map<string, THREE.Material>();

type MaterialFactory = () => THREE.Material;

/**
 * Obtiene un material cacheado por clave.
 * Los materiales se comparten entre todos los meshes con la misma configuración.
 */
export const obtenerMaterial = (
  clave: string,
  factory: MaterialFactory,
): THREE.Material => {
  if (_cacheMateriales.has(clave)) {
    return _cacheMateriales.get(clave)!;
  }
  const mat = factory();
  _cacheMateriales.set(clave, mat);
  return mat;
};

// ─── Materiales predefinidos del workspace ────────────────────────────────────

/** Material invisible para planos de raycast (suelo, construcción) */
export const obtenerMaterialRaycast = (): THREE.MeshBasicMaterial =>
  obtenerMaterial('raycast:invisible', () =>
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  ) as THREE.MeshBasicMaterial;

/** Material básico para zona de empresa tipo 'propia' */
export const obtenerMaterialZonaPropia = (color: string): THREE.MeshBasicMaterial => {
  const clave = `zona:propia:${color}`;
  return obtenerMaterial(clave, () =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  ) as THREE.MeshBasicMaterial;
};

/** Material para preview de zona solapada (error) */
export const obtenerMaterialZonaSolapada = (): THREE.MeshBasicMaterial =>
  obtenerMaterial('zona:solapada', () =>
    new THREE.MeshBasicMaterial({
      color: '#ef4444',
      opacity: 0.45,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  ) as THREE.MeshBasicMaterial;

/** Material wireframe para preview de zona */
export const obtenerMaterialWireframePreview = (color = '#ffffff'): THREE.MeshBasicMaterial => {
  const clave = `wireframe:${color}`;
  return obtenerMaterial(clave, () =>
    new THREE.MeshBasicMaterial({
      color,
      opacity: 0.28,
      transparent: true,
      wireframe: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  ) as THREE.MeshBasicMaterial;
};

/** Material básico para el preview de plantilla de zona (violeta) */
export const obtenerMaterialPlantillaPreview = (): THREE.MeshBasicMaterial =>
  obtenerMaterial('plantilla:preview', () =>
    new THREE.MeshBasicMaterial({
      color: '#2563eb',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  ) as THREE.MeshBasicMaterial;

// ─── Gestión del ciclo de vida ────────────────────────────────────────────────

/** Estadísticas del cache de materiales */
export const obtenerEstadisticasMateriales = (): { total: number; claves: string[] } => ({
  total: _cacheMateriales.size,
  claves: Array.from(_cacheMateriales.keys()),
});

/**
 * Libera todos los materiales cacheados de GPU.
 * LLAMAR al desmontar el workspace 3D.
 */
export const limpiarCacheMateriales = (): void => {
  for (const mat of _cacheMateriales.values()) {
    mat.dispose();
  }
  _cacheMateriales.clear();
};
