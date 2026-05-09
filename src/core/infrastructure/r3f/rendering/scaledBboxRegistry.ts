/**
 * @module lib/rendering/scaledBboxRegistry
 * @description Registry runtime de bbox escalada por modelo_url.
 *
 * Problema:
 *   El catálogo declara dims (ancho/alto/profundidad), pero `Math.min(...factors)`
 *   en computeTransform produce un uniformScale que puede no llenar todos los
 *   ejes. El alto declarado puede ser mayor que el alto rendered → al apilar un
 *   objeto encima, la política de placement apunta al "top declarado" pero el
 *   visible top está más abajo → objeto flotando.
 *
 * Solución:
 *   Cuando un GLB se carga y se registra en un batcher, anotamos su bbox real
 *   escalada (uniformScale × bbox.max.y, etc). Scene3D consulta este registry
 *   al construir `objetosColocables` para que la AABB de placement use el
 *   visible top, no el declarado.
 *
 * Convención: clave = modelo_url. Mismo GLB → misma escala (catálogo fija dims).
 *
 * Clean Architecture: Infrastructure layer (Three.js/Browser only). Domain
 * sigue usando AABBs sin conocer este registry; Scene3D (Presentation) hace
 * el bridge.
 */

export interface ScaledBboxInfo {
  /** Y mínima del bbox escalado (suele ser ≈ 0 para GLBs normalizados). */
  readonly minY: number;
  /** Y máxima del bbox escalado — visible top del modelo. */
  readonly maxY: number;
  /** Altura escalada visible = maxY - minY. */
  readonly height: number;
}

const _registry = new Map<string, ScaledBboxInfo>();
let _version = 0;
const _listeners = new Set<() => void>();

function notify(): void {
  _version += 1;
  for (const l of _listeners) l();
}

export function registerScaledBbox(
  modeloUrl: string,
  info: ScaledBboxInfo,
): void {
  const prev = _registry.get(modeloUrl);
  // Evita re-notificar si el bbox no cambió (estable entre re-renders).
  if (
    prev &&
    prev.minY === info.minY &&
    prev.maxY === info.maxY &&
    prev.height === info.height
  ) {
    return;
  }
  _registry.set(modeloUrl, info);
  notify();
}

export function getScaledBbox(modeloUrl: string): ScaledBboxInfo | undefined {
  return _registry.get(modeloUrl);
}

export function getScaledBboxVersion(): number {
  return _version;
}

/** Suscripción para useSyncExternalStore. Llama listener en cada update. */
export function subscribeToScaledBbox(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function clearScaledBboxRegistry(): void {
  _registry.clear();
  notify();
}
