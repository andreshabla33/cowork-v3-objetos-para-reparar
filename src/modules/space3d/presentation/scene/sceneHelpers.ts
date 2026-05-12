/**
 * @module space3d/scene/sceneHelpers
 *
 * Helpers module-level compartidos por componentes y hooks de la escena 3D.
 * Extraídos de `Scene3D.tsx` (ITEM 15 P1-07) para que hooks especializados
 * (`usePlantillaZonaDrag`, etc.) puedan consumirlos sin re-declarar.
 *
 * Sin estado: cada export es una función pura o un objeto módulo-level
 * (singleton). Mantener este archivo libre de hooks de React.
 */

import * as THREE from 'three';
import type { Rayo } from '@/src/core/domain/entities/espacio3d/PlacementPolicy';

/**
 * Snap horizontal a la grilla. `paso=0.5m` es el grid base del editor de
 * pisos/zonas — el alto se mantiene continuo, solo X/Z se snapean.
 */
export const ajustarAGrilla = (valor: number, paso = 0.5): number =>
  Math.round(valor / paso) * paso;

/** Plano infinito en Y=0 — referencia para intersecciones con el piso. */
export const pisoMundoPlano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Convierte el `THREE.Ray` del evento R3F al tipo de dominio `Rayo`
 * (sin importar THREE en el dominio). Devuelve null si el evento no
 * trae rayo (p.ej. eventos sintéticos de drag-from-panel).
 */
export const rayoEventoADominio = (evento: any): Rayo | null => {
  const r = evento?.ray;
  if (!r || !r.origin || !r.direction) return null;
  return {
    origenX: r.origin.x,
    origenY: r.origin.y,
    origenZ: r.origin.z,
    direccionX: r.direction.x,
    direccionY: r.direction.y,
    direccionZ: r.direction.z,
  };
};

/**
 * Intersecta el ray del evento R3F con el `pisoMundoPlano`. Si no hay ray
 * (eventos sintéticos), cae al `evento.point` (que algunos handlers de
 * @react-three/fiber pueblan vía `intersect`); si tampoco está, devuelve
 * un Vector3 cero.
 */
export const obtenerPuntoSueloMundo = (evento: any): THREE.Vector3 => {
  const interseccion = new THREE.Vector3();
  if (evento?.ray?.intersectPlane && evento.ray.intersectPlane(pisoMundoPlano, interseccion)) {
    return interseccion;
  }
  return evento?.point ?? new THREE.Vector3();
};

/**
 * Elevación visual incremental para zonas anidadas — evita z-fighting entre
 * zonas que se superponen jerárquicamente (zona padre → hija → nieta).
 * Cada nivel añade 2cm sobre el piso (0.01 base + 0.02 por nivel).
 */
export const obtenerElevacionVisualZona = (nivelAnidamiento: number): number =>
  0.01 + nivelAnidamiento * 0.02;
