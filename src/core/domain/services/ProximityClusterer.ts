/**
 * @module src/core/domain/services/ProximityClusterer
 *
 * Calcula los **clusters de proximidad** activos en un workspace —
 * equivalente al patrón "Active Areas" de Gather Town (Participants Panel).
 *
 * Un cluster es un conjunto de ≥ 2 usuarios que están conversando entre sí
 * por una de estas razones:
 *
 *   1. `meeting-zone`: todos comparten el mismo `currentMeetingZoneId`
 *      (sala nombrada del mapa, ej. "Sala Diseño"). Pertenencia exacta
 *      por ID — no requiere distancia.
 *   2. `private-area`: todos comparten el mismo `areaAudioAisladaId`
 *      (huddle privado fuera de meeting zone). Pertenencia exacta por ID.
 *   3. `open-proximity`: están a ≤ `radius` unidades unos de otros en
 *      el mapa abierto (ad-hoc). Pertenencia por componentes conexos
 *      del grafo `(u,v) ∈ E ⇔ dist(u,v) ≤ radius`.
 *
 * Algoritmo:
 *   - Spatial hash grid (broad phase) + union-find (path compression).
 *   - O(n·α(n)) amortizado — con n=50 users, < 0.5 ms por cómputo.
 *
 * Clean Architecture: Domain puro. Cero deps React/Zustand/Supabase.
 * Función pura: misma input → mismo output, ideal para tests.
 *
 * Refs:
 *   - Gather Active Areas — https://support.gather.town/hc/en-us/articles/23149472282004
 *   - Connected components via union-find —
 *     https://en.wikipedia.org/wiki/Disjoint-set_data_structure
 *   - Spatial hashing — Ericson, Real-Time Collision Detection §7.1
 */

import { SpatialHashGrid, type SpatialEntity } from './SpatialHashGrid';

export type ProximityClusterKind = 'meeting-zone' | 'private-area' | 'open-proximity';

export interface ProximityClusterMember extends SpatialEntity {
  /** Sala donde está el avatar, si aplica. Null = no está en sala. */
  meetingZoneId?: string | null;
  /** Private area / huddle aislada donde está, si aplica. */
  areaAudioAisladaId?: string | null;
}

export interface ProximityCluster {
  /** ID determinista del cluster — hash de members ordenados + kind. */
  id: string;
  kind: ProximityClusterKind;
  memberIds: readonly string[];
  /** Coords promedio del cluster (open-proximity) o null si zone-based. */
  centroid: { x: number; y: number } | null;
  /** Anchor ID — `meetingZoneId` o `areaAudioAisladaId` cuando aplica. */
  anchorId: string | null;
}

export interface ClusterizeParams {
  /** Usuarios candidatos. Excluir locales no-online si querés. */
  users: readonly ProximityClusterMember[];
  /** Radio máximo en unidades-mundo para considerar 2 users del mismo cluster. */
  radius: number;
  /** Tamaño mínimo del cluster. Default 2 (estándar Gather — un cluster requiere ≥ 2). */
  minSize?: number;
}

/**
 * Calcula los clusters de proximidad activos.
 *
 * @param params  users + radius + minSize.
 * @returns       Lista de clusters ordenados por size (descendente).
 *                Lista vacía si no hay clusters con `size ≥ minSize`.
 */
export const clusterize = (params: ClusterizeParams): ProximityCluster[] => {
  const { users, radius, minSize = 2 } = params;
  if (users.length < minSize) return [];

  // ── 1. Asignar bucketId determinista por user ──────────────────────────
  // - meeting:Z → todos los users en zone Z están en el mismo cluster.
  // - private:A → todos los users en private area A están juntos.
  // - 'open'    → entrarán al grafo open-proximity.

  const bucketIdByUser = new Map<string, string>();
  const openUsers: ProximityClusterMember[] = [];

  for (const u of users) {
    if (u.meetingZoneId) {
      bucketIdByUser.set(u.id, `meeting:${u.meetingZoneId}`);
    } else if (u.areaAudioAisladaId) {
      bucketIdByUser.set(u.id, `private:${u.areaAudioAisladaId}`);
    } else {
      openUsers.push(u);
    }
  }

  // ── 2. Union-find sobre open-proximity ────────────────────────────────
  // Path compression para amortizar find. Union by rank no es crítico
  // a esta escala (n ≤ ~100 users) — saltado por simplicidad.

  const parent = new Map<string, string>();
  for (const u of openUsers) parent.set(u.id, u.id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Spatial hash grid sobre open users — cellSize = radius da 3×3 cells de query.
  const grid = new SpatialHashGrid<ProximityClusterMember>(radius);
  for (const u of openUsers) grid.insert(u);

  const radiusSq = radius * radius;
  for (const u of openUsers) {
    const candidates = grid.queryNear(u.x, u.y, radius);
    for (const v of candidates) {
      if (v.id === u.id) continue;
      const dx = u.x - v.x;
      const dy = u.y - v.y;
      if (dx * dx + dy * dy <= radiusSq) {
        union(u.id, v.id);
      }
    }
  }

  // Asignar bucketId a open users — `open:${root}`.
  for (const u of openUsers) {
    bucketIdByUser.set(u.id, `open:${find(u.id)}`);
  }

  // ── 3. Agrupar por bucketId + filtrar por minSize ─────────────────────

  const bucketToMembers = new Map<string, ProximityClusterMember[]>();
  for (const u of users) {
    const bucketId = bucketIdByUser.get(u.id)!;
    const list = bucketToMembers.get(bucketId);
    if (list) list.push(u);
    else bucketToMembers.set(bucketId, [u]);
  }

  const clusters: ProximityCluster[] = [];
  for (const [bucketId, members] of bucketToMembers) {
    if (members.length < minSize) continue;

    const kind: ProximityClusterKind = bucketId.startsWith('meeting:')
      ? 'meeting-zone'
      : bucketId.startsWith('private:')
        ? 'private-area'
        : 'open-proximity';

    const anchorId = bucketId.startsWith('meeting:') || bucketId.startsWith('private:')
      ? bucketId.split(':')[1]
      : null;

    // Centroid solo para open-proximity (zone-based usa anchor del zone).
    let centroid: { x: number; y: number } | null = null;
    if (kind === 'open-proximity') {
      let sx = 0;
      let sy = 0;
      for (const m of members) {
        sx += m.x;
        sy += m.y;
      }
      centroid = { x: sx / members.length, y: sy / members.length };
    }

    // ID determinista — hash de members sorted + kind. Permite a consumers
    // hacer React `key` stable + diff entre frames sin flickering.
    const sortedIds = [...members.map((m) => m.id)].sort();
    const id = `${kind}:${anchorId ?? 'open'}:${sortedIds.join('|')}`;

    clusters.push({
      id,
      kind,
      memberIds: sortedIds,
      centroid,
      anchorId,
    });
  }

  // Orden estable: por tamaño desc, luego por id (lexicográfico) para
  // garantizar el mismo render order entre frames.
  clusters.sort((a, b) => b.memberIds.length - a.memberIds.length || a.id.localeCompare(b.id));

  return clusters;
};
