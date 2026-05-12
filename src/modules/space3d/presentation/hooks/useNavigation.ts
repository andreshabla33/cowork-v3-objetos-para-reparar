/**
 * @module modules/space3d/hooks/useNavigation
 *
 * Clean Architecture — Module/Presentation. DI hook que provee acceso al
 * `INavigationService` y maneja su ciclo de vida (init WASM, build navmesh,
 * sync de obstáculos dinámicos, tick periódico, dispose).
 *
 * Consume el port `INavigationService` del Domain — nunca importa el adapter
 * concreto. La implementación canónica (RecastNavigationAdapter) se inyecta
 * via `getApplicationServices().navigation`.
 *
 * Uso típico en `Scene3D` / `Player3D`:
 *   const { service, ready, localAgentId } = useNavigation({
 *     terrainBounds,
 *     espacioObjetos,
 *     localPosition,
 *   });
 *
 * Cuando `ready === true`, se puede `service.moveAgent(localAgentId, target)`
 * y leer `service.getAgentPose(localAgentId)` en useFrame.
 *
 * Refs:
 *  - https://react.dev/reference/react/useEffect (lifecycle pattern)
 *  - https://github.com/isaac-mason/recast-navigation-js (WASM init async)
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { logger } from '@/core/infrastructure/observability/logger';
import { getApplicationServices } from '@/src/core/application/ApplicationServicesContainer';
import {
  DEFAULT_NAVIGATION_CONFIG,
  DEFAULT_AGENT_PARAMS,
  type NavigationAgentId,
} from '@/src/core/domain/entities/espacio3d/NavigationConfig';
import type {
  INavigationService,
  NavigationObstaculo,
  NavigationWalkableSurface,
} from '@/src/core/domain/ports/INavigationService';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import { obtenerDimensionesObjeto } from '@/src/core/domain/entities/espacio3d';

const log = logger.child('use-navigation');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Construye un quad caminable plano (X/Z) a partir de los bounds del terreno.
 * Recast trabaja con meshes triangulados; un quad = 2 triángulos counter-CW.
 *
 * Coords del rectángulo:
 *   p0 = (minX, y, minZ)  p1 = (maxX, y, minZ)
 *   p2 = (minX, y, maxZ)  p3 = (maxX, y, maxZ)
 *
 * Triangulación CCW (top-down):
 *   T0: p0, p2, p1
 *   T1: p1, p2, p3
 */
function buildPlanarWalkableSurface(bounds: {
  minX: number; maxX: number; minZ: number; maxZ: number; y: number;
}): NavigationWalkableSurface {
  const { minX, maxX, minZ, maxZ, y } = bounds;
  const positions = new Float32Array([
    minX, y, minZ,  // 0
    maxX, y, minZ,  // 1
    minX, y, maxZ,  // 2
    maxX, y, maxZ,  // 3
  ]);
  const indices = new Uint32Array([
    0, 2, 1,
    1, 2, 3,
  ]);
  return { positions, indices };
}

/**
 * Mapea un `EspacioObjeto` (configuracion runtime de un mueble) a un
 * `NavigationObstaculo` (AABB axis-aligned + rotationY).
 *
 * Algunos objetos no deben generar obstáculos (sillas que el avatar usa
 * para sentarse, plantillas decorativas sin colisión, etc.) — se filtran
 * upstream del hook.
 */
function mapEspacioObjetoAObstaculo(
  objeto: EspacioObjeto,
  terrainY: number,
): NavigationObstaculo {
  const dim = obtenerDimensionesObjeto(objeto);
  // Recast espera halfExtents y posición del centro. El objeto está en el
  // piso; lo elevamos a media altura para que el AABB cubra desde y=terrainY
  // hasta y=terrainY+alto.
  return {
    id: objeto.id,
    position: {
      x: objeto.posicion_x,
      y: terrainY + dim.alto / 2,
      z: objeto.posicion_z,
    },
    halfExtents: {
      x: dim.ancho / 2,
      y: dim.alto / 2,
      z: dim.profundidad / 2,
    },
    rotationY: objeto.rotacion_y || 0,
  };
}

// ─── Params del hook ────────────────────────────────────────────────────────

export interface UseNavigationParams {
  /** Bounds del terreno caminable en world coords. */
  terrainBounds: {
    minX: number; maxX: number; minZ: number; maxZ: number; y: number;
  } | null;
  /** Objetos del espacio que actúan como obstáculos (muebles, paredes). */
  espacioObjetos: EspacioObjeto[];
  /** Posición inicial del avatar local. Cuando esté lista, se registra el agent. */
  localPosition: { x: number; z: number } | null;
  /**
   * Si `false`, el hook no inicializa nada (útil para gatear el feature
   * mientras la integración está en desarrollo). Default `true`.
   */
  enabled?: boolean;
}

export interface UseNavigationReturn {
  /**
   * El adapter concreto. `null` mientras se resuelve el chunk lazy (~50-200ms
   * en la primera carga). Consumers deben handle null + fallback al
   * comportamiento previo.
   */
  service: INavigationService | null;
  /** `true` cuando WASM cargado + navmesh construido + agente local listo. */
  ready: boolean;
  /** Id del agente local registrado en el crowd. `null` hasta que `ready`. */
  localAgentId: NavigationAgentId | null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useNavigation(params: UseNavigationParams): UseNavigationReturn {
  const { terrainBounds, espacioObjetos, localPosition, enabled = true } = params;

  const [service, setService] = useState<INavigationService | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [built, setBuilt] = useState(false);
  const [localAgentId, setLocalAgentId] = useState<NavigationAgentId | null>(null);
  /**
   * Counter incremental que cambia con cada build/rebuild del navmesh.
   *
   * Bug 2026-05-12: `service.build()` internamente hace `disposeNavData()`
   * que limpia el Map de agents del adapter. Pero `setBuilt(true)` era
   * idempotente — React no re-renderizaba → effect del agent NO re-corría
   * → `localAgentId` quedaba stale apuntando a un agent que ya no existía
   * en el crowd nuevo. Resultado: avatar congelado tras rebuild.
   *
   * Fix: `buildVersion` cambia con cada rebuild → el effect del agent lo
   * tiene en deps → re-corre (cleanup remove agent stale, register nuevo).
   */
  const [buildVersion, setBuildVersion] = useState(0);

  /** Set de ids de obstáculos actualmente registrados en recast. */
  const registeredObstaclesRef = useRef<Set<string>>(new Set());

  // ─── 1. Resolver dynamic import + init WASM ───────────────────────────────
  // Resolve carga el chunk lazy (vendor-navigation) — solo cuando el usuario
  // entra a Scene3D. Initial load del workspace no paga el peso del WASM.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getApplicationServices()
      .resolveNavigationService()
      .then((resolved) => {
        if (cancelled) return;
        setService(resolved);
        return resolved.initialize();
      })
      .then(() => {
        if (!cancelled) {
          setInitialized(true);
          log.info('navigation service initialized');
        }
      })
      .catch((err) => {
        log.error('navigation initialize failed', { error: (err as Error)?.message });
      });
    return () => { cancelled = true; };
  }, [enabled]);

  // ─── 2. Build navmesh cuando hay terreno + initialized ────────────────────
  useEffect(() => {
    if (!service || !initialized || !terrainBounds) {
      setBuilt(false);
      return;
    }
    const walkable = buildPlanarWalkableSurface(terrainBounds);
    const initialObstaculos = espacioObjetos.map((o) =>
      mapEspacioObjetoAObstaculo(o, terrainBounds.y),
    );

    const result = service.build(walkable, initialObstaculos, DEFAULT_NAVIGATION_CONFIG);
    if (!result.success) {
      log.error('navmesh build failed', { error: result.error });
      setBuilt(false);
      return;
    }

    registeredObstaclesRef.current = new Set(initialObstaculos.map((o) => o.id));
    setBuilt(true);
    setBuildVersion((prev) => prev + 1);
    log.info('navmesh built', { initialObstaculos: initialObstaculos.length });
    // No retornamos cleanup aquí — el rebuild reemplaza internamente el navmesh.
    // El dispose final corre en el unmount handler de abajo.
  }, [initialized, terrainBounds, espacioObjetos, service]);

  // ─── 3. Sync diferencial de obstáculos (admin coloca/quita muebles) ───────
  // Se ejecuta cuando ya hay navmesh built y la lista de objetos cambia.
  // Diff incremental para no rebuildear el navmesh entero — el TileCache
  // procesa add/remove en sus queued updates (cap 64).
  useEffect(() => {
    if (!service || !built || !terrainBounds) return;

    const currentIds = new Set(espacioObjetos.map((o) => o.id));
    const registered = registeredObstaclesRef.current;

    // Agregar nuevos
    espacioObjetos.forEach((obj) => {
      if (!registered.has(obj.id)) {
        const obstaculo = mapEspacioObjetoAObstaculo(obj, terrainBounds.y);
        const ok = service.addObstacle(obstaculo);
        if (ok) registered.add(obj.id);
      }
    });

    // Remover los que ya no están
    Array.from(registered).forEach((id) => {
      if (!currentIds.has(id)) {
        service.removeObstacle(id);
        registered.delete(id);
      }
    });
  }, [built, espacioObjetos, terrainBounds, service]);

  // ─── 4. Registrar agente local cuando hay navmesh listo ───────────────────
  // Patrón canónico React: ref para leer "última pose" sin que cambios de
  // posición disparen re-run del effect. Sin esto, cada paso del avatar
  // re-ejecutaba register+cleanup → 85+ agentes leakeados en 46s → crowd
  // saturado retornaba NaN en position() → SpatialAudio AudioParam crash
  // (bug 2026-05-12 #1, confirmado en logs producción).
  //
  // Ref: https://react.dev/learn/referencing-values-with-refs
  //   "Use a ref when you want a component to 'remember' some information,
  //    but you don't want that information to trigger new renders."
  //
  // Deps `[service, built, buildVersion]`:
  // - service: re-init si el adapter cambia
  // - built: re-register cuando termina el build inicial
  // - buildVersion: CRÍTICO — cuando obstáculos cambian, `service.build()`
  //   internamente hace `disposeNavData()` que clear el Map de agents del
  //   adapter. `setBuilt(true)` era idempotente → effect NO re-corría →
  //   `localAgentId` quedaba stale → avatar congelado (bug 2026-05-12 #2).
  //
  // La posición se sincroniza vía `teleportAgent` desde Player3D (sync
  // inicial al primer frame con coords válidas).
  const localPositionRef = useRef(localPosition);
  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);

  useEffect(() => {
    if (!service || !built) return;
    // Snapshot via ref: lee la última pose sin que el effect re-corra.
    // Puede ser sentinel (0,0) si el avatar aún no hidrató — el sync
    // inicial en Player3D (agentInitialSyncDoneRef) corrige al primer frame.
    const initialPos = localPositionRef.current ?? { x: 0, z: 0 };
    const id = service.addAgent(initialPos, DEFAULT_AGENT_PARAMS);
    setLocalAgentId(id);
    log.info('local agent registered', { id, buildVersion });
    return () => {
      service.removeAgent(id);
      setLocalAgentId(null);
    };
  }, [service, built, buildVersion]);

  // ─── 5. Tick cada frame ───────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!service || !built) return;
    service.tick(delta);
  });

  // ─── 6. Dispose total al desmontar ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (service) service.dispose();
    };
  }, [service]);

  return {
    service,
    ready: built && localAgentId !== null,
    localAgentId,
  };
}
