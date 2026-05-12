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

  // ─── 2. Build navmesh + registrar agente local (lifecycle acoplado) ───────
  //
  // Refactor 2026-05-12 #2: build + addAgent en el MISMO effect.
  //
  // Patrón canónico React (https://react.dev/reference/react/useEffect):
  // "Each Effect in your code should represent a separate and independent
  //  synchronization process."
  //
  // El agent local es CONSECUENCIA del build (no existe sin navmesh). Su
  // lifecycle debe acoplarse: cuando build/rebuild ocurre, el cleanup quita
  // el agent viejo + el body registra uno nuevo. Sin necesidad de version
  // counters o setState idempotentes.
  //
  // Bug previo (resuelto por este refactor): `setBuilt(true)` idempotente
  // hacía bail-out via Object.is — el effect del agent separado NO re-corría
  // tras rebuild → `localAgentId` quedaba stale → avatar congelado.
  //
  // Ref: https://react.dev/reference/react/useState#caveats
  //   "If the new value you provide is identical to the current state, as
  //    determined by an Object.is comparison, React will skip re-rendering"
  const localPositionRef = useRef(localPosition);
  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);

  useEffect(() => {
    if (!service || !initialized || !terrainBounds) {
      setBuilt(false);
      setLocalAgentId(null);
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
      setLocalAgentId(null);
      return;
    }

    registeredObstaclesRef.current = new Set(initialObstaculos.map((o) => o.id));
    log.info('navmesh built', { initialObstaculos: initialObstaculos.length });

    // Registrar agent local INMEDIATAMENTE tras build — su lifecycle se
    // acopla al del navmesh. Snapshot de pos via ref para no disparar
    // re-runs con cambios de posición (que pasarían por cleanup+register
    // infinitos — bug 2026-05-12 #1).
    const initialPos = localPositionRef.current ?? { x: 0, z: 0 };
    const agentId = service.addAgent(initialPos, DEFAULT_AGENT_PARAMS);
    setLocalAgentId(agentId);
    setBuilt(true);
    log.info('local agent registered', { id: agentId });

    return () => {
      // Cleanup en orden inverso: quita agent ANTES del próximo build (que
      // disposeNavData → clears agents). En unmount, el dispose() final
      // limpia todo.
      service.removeAgent(agentId);
      setLocalAgentId(null);
    };
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

  // (El agent register vive ahora dentro del effect de build — ver §2.
  // Su lifecycle está acoplado al del navmesh para garantizar re-register
  // automático tras rebuild, sin counter de version.)

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
