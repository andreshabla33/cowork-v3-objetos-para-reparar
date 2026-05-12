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

import { useEffect, useMemo, useRef, useState } from 'react';
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
  service: INavigationService;
  /** `true` cuando WASM cargado + navmesh construido + agente local listo. */
  ready: boolean;
  /** Id del agente local registrado en el crowd. `null` hasta que `ready`. */
  localAgentId: NavigationAgentId | null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useNavigation(params: UseNavigationParams): UseNavigationReturn {
  const { terrainBounds, espacioObjetos, localPosition, enabled = true } = params;

  const service = useMemo(() => getApplicationServices().navigation, []);
  const [initialized, setInitialized] = useState(false);
  const [built, setBuilt] = useState(false);
  const [localAgentId, setLocalAgentId] = useState<NavigationAgentId | null>(null);

  /** Set de ids de obstáculos actualmente registrados en recast. */
  const registeredObstaclesRef = useRef<Set<string>>(new Set());

  // ─── 1. Init WASM (idempotente, una vez por sesión) ───────────────────────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    service.initialize()
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
  }, [enabled, service]);

  // ─── 2. Build navmesh cuando hay terreno + initialized ────────────────────
  useEffect(() => {
    if (!initialized || !terrainBounds) {
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
    log.info('navmesh built', { initialObstaculos: initialObstaculos.length });
    // No retornamos cleanup aquí — el rebuild reemplaza internamente el navmesh.
    // El dispose final corre en el unmount handler de abajo.
  }, [initialized, terrainBounds, espacioObjetos, service]);

  // ─── 3. Sync diferencial de obstáculos (admin coloca/quita muebles) ───────
  // Se ejecuta cuando ya hay navmesh built y la lista de objetos cambia.
  // Diff incremental para no rebuildear el navmesh entero — el TileCache
  // procesa add/remove en sus queued updates (cap 64).
  useEffect(() => {
    if (!built || !terrainBounds) return;

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

  // ─── 4. Registrar agente local cuando hay navmesh + posición ──────────────
  useEffect(() => {
    if (!built || !localPosition) return;
    const id = service.addAgent(localPosition, DEFAULT_AGENT_PARAMS);
    setLocalAgentId(id);
    log.info('local agent registered', { id });
    return () => {
      service.removeAgent(id);
      setLocalAgentId(null);
    };
  }, [built, localPosition?.x, localPosition?.z, service]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 5. Tick cada frame ───────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!built) return;
    service.tick(delta);
  });

  // ─── 6. Dispose total al desmontar ────────────────────────────────────────
  useEffect(() => {
    return () => {
      service.dispose();
    };
  }, [service]);

  return {
    service,
    ready: built && localAgentId !== null,
    localAgentId,
  };
}
