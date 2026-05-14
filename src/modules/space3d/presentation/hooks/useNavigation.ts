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
 * Selecciona los `maxCount` obstáculos más cercanos al anchor (player spawn).
 *
 * Why: recast TileCache cap absoluto upstream = 64 (DT_BUFFER_TOO_SMALL al
 * superar). Sin prioridad, recast acepta los primeros 64 en orden de inserción
 * (DB ordering, no determinístico) y descarta el resto silenciosamente con un
 * warn. Priorizar por distancia² al anchor garantiza que los obstáculos
 * relevantes al pathfinding del jugador local queden incluidos.
 *
 * Ref: https://github.com/isaac-mason/recast-navigation-js — README, TileCache.
 */
export function selectObstaculosByPriority(
  obstaculos: readonly NavigationObstaculo[],
  anchor: { x: number; z: number },
  maxCount: number,
): { selected: NavigationObstaculo[]; deprioritized: number } {
  if (obstaculos.length <= maxCount) {
    return { selected: [...obstaculos], deprioritized: 0 };
  }
  const withDistSq = obstaculos.map((o) => {
    const dx = o.position.x - anchor.x;
    const dz = o.position.z - anchor.z;
    return { obs: o, dSq: dx * dx + dz * dz };
  });
  withDistSq.sort((a, b) => a.dSq - b.dSq);
  return {
    selected: withDistSq.slice(0, maxCount).map((w) => w.obs),
    deprioritized: obstaculos.length - maxCount,
  };
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

  // Snapshot ref para espacioObjetos. CRÍTICO: si esto estuviera en el dep
  // array del build effect, agregar/quitar UN solo obstáculo dispararía un
  // FULL REBUILD del navmesh (dispose + build + addAgent → setState →
  // re-render → nueva ref de espacioObjetos → loop infinito).
  //
  // Bug observado 2026-05-14 al colocar una silla: storm de 32 rebuilds en 8s
  // (agent-90 → agent-121). Cada iteración recreaba el agent en posición
  // potencialmente stale → camera follow drifteaba → frustum cull 100% →
  // pantalla negra + avatar congelado.
  //
  // Fix: el build effect snapshot via ref el contenido actual. Los add/remove
  // incrementales viven en el effect §3 (diff sync) que SÍ tiene espacioObjetos
  // como dep — pero solo llama addObstacle/removeObstacle (incremental, sin
  // rebuild ni dispose).
  const espacioObjetosRef = useRef(espacioObjetos);
  useEffect(() => {
    espacioObjetosRef.current = espacioObjetos;
  }, [espacioObjetos]);

  useEffect(() => {
    if (!service || !initialized || !terrainBounds) {
      setBuilt(false);
      setLocalAgentId(null);
      return;
    }
    const walkable = buildPlanarWalkableSurface(terrainBounds);
    const allObstaculos = espacioObjetosRef.current.map((o) =>
      mapEspacioObjetoAObstaculo(o, terrainBounds.y),
    );

    // Recast TileCache cap absoluto upstream = maxObstacles (64). Priorizamos
    // por proximidad al spawn local: los obstáculos lejanos quedan fuera del
    // pathfinding pero no afectan al jugador hasta que se acerque. Ver
    // selectObstaculosByPriority() para el rationale.
    const anchor = localPositionRef.current ?? { x: 0, z: 0 };
    const { selected: initialObstaculos, deprioritized } = selectObstaculosByPriority(
      allObstaculos,
      anchor,
      DEFAULT_NAVIGATION_CONFIG.maxObstacles,
    );
    if (deprioritized > 0) {
      log.info('Obstáculos priorizados por distancia al spawn', {
        total: allObstaculos.length,
        selected: initialObstaculos.length,
        deprioritized,
        cap: DEFAULT_NAVIGATION_CONFIG.maxObstacles,
      });
    }

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
  }, [initialized, terrainBounds, service]);

  // ─── 3. Sync diferencial de obstáculos (admin coloca/quita muebles) ───────
  // Se ejecuta cuando ya hay navmesh built y la lista de objetos cambia.
  // Diff incremental para no rebuildear el navmesh entero — el TileCache
  // procesa add/remove en sus queued updates (cap 64).
  //
  // Importante: aplicamos el MISMO filtro de prioridad que el build inicial
  // para garantizar coherencia. Sin esto, los obstáculos deprioritized
  // intentarían registrarse en cada render → bucle de warns "TileCache
  // saturated".
  useEffect(() => {
    if (!service || !built || !terrainBounds) return;

    const allObstaculos = espacioObjetos.map((o) =>
      mapEspacioObjetoAObstaculo(o, terrainBounds.y),
    );
    const anchor = localPositionRef.current ?? { x: 0, z: 0 };
    const { selected: prioritizedObstaculos } = selectObstaculosByPriority(
      allObstaculos,
      anchor,
      DEFAULT_NAVIGATION_CONFIG.maxObstacles,
    );
    const prioritizedIds = new Set(prioritizedObstaculos.map((o) => o.id));
    const registered = registeredObstaclesRef.current;

    // Remover los que ya no están (eliminados O deprioritized por desplazamiento
    // del set top-N, p.ej. admin agregó un mueble más cercano al spawn).
    Array.from(registered).forEach((id) => {
      if (!prioritizedIds.has(id)) {
        service.removeObstacle(id);
        registered.delete(id);
      }
    });

    // Agregar los que están en el set prioritized pero aún no registrados.
    prioritizedObstaculos.forEach((obstaculo) => {
      if (!registered.has(obstaculo.id)) {
        const ok = service.addObstacle(obstaculo);
        if (ok) registered.add(obstaculo.id);
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
