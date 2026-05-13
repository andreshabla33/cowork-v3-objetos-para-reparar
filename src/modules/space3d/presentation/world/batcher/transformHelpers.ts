/**
 * @module space3d/world/batcher/transformHelpers
 *
 * Cómputo del world transform de un `EspacioObjeto` dado el GLTF scene
 * fuente. Devuelve una `Matrix4` fresh (cloned) — el caller la puede
 * componer con la local del mesh sin preocuparse de aliasing.
 *
 * Temps module-level reusables (`_box`, `_size`, ...) — pattern recomendado
 * por Three.js para evitar allocs en hot loops. La doc oficial Box3
 * documenta `setFromObject` con flag `precise` (costoso) — usamos default
 * (false) que ya es suficiente para nuestros bbox.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/math/Box3.setFromObject
 *   https://threejs.org/docs/#api/en/math/Matrix4
 */
import * as THREE from 'three';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import { obtenerDimensionesObjetoRuntime } from '@/modules/space3d/presentation/scene/objetosRuntime';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

/**
 * Compone el world transform (posición + rotación + escala uniforme) de un
 * EspacioObjeto basándose en el bbox del GLTF scene fuente.
 *
 * FIX 2026-05-05: XZ centering consistente con `ObjetoEscena3D.calcular-
 * TransformacionUniformeGLTF`. Sin esto, GLBs cuyo pivot no coincida con
 * el centro del bbox se renderizaban en posiciones distintas en construcción
 * (selected) vs normal (BatchedMesh). Anchor unificado: bbox center en XZ,
 * bbox.min en Y (suelo).
 */
export function computeTransform(
  gltfScene: THREE.Object3D,
  obj: EspacioObjeto,
): THREE.Matrix4 {
  const dims = obtenerDimensionesObjetoRuntime(obj);
  const w = Math.max(dims.ancho, 0.05);
  const h = Math.max(dims.alto, 0.05);
  const d = Math.max(dims.profundidad, 0.05);

  _box.setFromObject(gltfScene);
  _box.getSize(_size);
  _box.getCenter(_center);

  const factors = [
    w / Math.max(_size.x, 0.001),
    h / Math.max(_size.y, 0.001),
    d / Math.max(_size.z, 0.001),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const uniformScale = factors.length > 0 ? Math.min(...factors) : 1;
  const offsetY = -_box.min.y * uniformScale - h / 2;
  const offsetX = -_center.x * uniformScale;
  const offsetZ = -_center.z * uniformScale;

  _pos.set(
    obj.posicion_x + offsetX,
    obj.posicion_y + offsetY,
    obj.posicion_z + offsetZ,
  );
  _euler.set(obj.rotacion_x ?? 0, obj.rotacion_y ?? 0, obj.rotacion_z ?? 0);
  _quat.setFromEuler(_euler);
  _scale.setScalar(uniformScale);

  return _matrix.compose(_pos, _quat, _scale).clone();
}
