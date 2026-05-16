/**
 * @file tests/unit/espacio3d/ProximityClusterer.test.ts
 *
 * Tests del clustering algorithm que feed el sidebar "Áreas Activas".
 * Verificación runtime del Domain layer — corazón del fix Gather-style.
 */

import { describe, it, expect } from 'vitest';
import {
  clusterize,
  type ProximityClusterMember,
} from '@/src/core/domain/services/ProximityClusterer';

const u = (
  id: string,
  x: number,
  y: number,
  extras: Partial<ProximityClusterMember> = {},
): ProximityClusterMember => ({ id, x, y, ...extras });

describe('ProximityClusterer · clusterize()', () => {
  it('devuelve [] cuando hay menos users que minSize', () => {
    const out = clusterize({ users: [u('a', 0, 0)], radius: 5 });
    expect(out).toEqual([]);
  });

  it('NO crea cluster cuando users están fuera del radio', () => {
    const out = clusterize({
      users: [u('a', 0, 0), u('b', 100, 100)],
      radius: 5,
    });
    expect(out).toEqual([]);
  });

  it('crea cluster open-proximity para 2 users a < radius', () => {
    const out = clusterize({
      users: [u('a', 0, 0), u('b', 3, 4)],
      radius: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('open-proximity');
    expect(out[0].memberIds).toEqual(['a', 'b']);
    expect(out[0].centroid).toEqual({ x: 1.5, y: 2 });
  });

  it('encadena clusters via componentes conexos (a-b-c, NO a-c directo)', () => {
    // a---b---c en línea, distancia a-b = 4, b-c = 4, a-c = 8.
    // Con radius=5, a-c NO conecta directo. Pero el componente
    // conexo {a,b,c} sí — gracias al union-find.
    const out = clusterize({
      users: [u('a', 0, 0), u('b', 4, 0), u('c', 8, 0)],
      radius: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('open-proximity');
    expect(out[0].memberIds).toEqual(['a', 'b', 'c']);
  });

  it('separa en clusters diferentes a users no conectados', () => {
    // Grupo 1: a-b cerca. Grupo 2: c-d cerca. Lejos entre sí.
    const out = clusterize({
      users: [
        u('a', 0, 0),
        u('b', 2, 0),
        u('c', 100, 100),
        u('d', 102, 100),
      ],
      radius: 5,
    });
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.kind === 'open-proximity')).toBe(true);
    expect(out.every((c) => c.memberIds.length === 2)).toBe(true);
  });

  it('agrupa users en la misma meeting zone aunque estén lejos', () => {
    // Ambos en zone-1 pero a 100 unidades. La pertenencia es por ID,
    // no por distancia (patrón Gather Private Areas).
    const out = clusterize({
      users: [
        u('a', 0, 0, { meetingZoneId: 'zone-1' }),
        u('b', 100, 100, { meetingZoneId: 'zone-1' }),
      ],
      radius: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('meeting-zone');
    expect(out[0].anchorId).toBe('zone-1');
  });

  it('separa users en meeting zones diferentes', () => {
    const out = clusterize({
      users: [
        u('a', 0, 0, { meetingZoneId: 'zone-A' }),
        u('b', 1, 1, { meetingZoneId: 'zone-A' }),
        u('c', 0, 0, { meetingZoneId: 'zone-B' }),
        u('d', 1, 1, { meetingZoneId: 'zone-B' }),
      ],
      radius: 5,
    });
    expect(out).toHaveLength(2);
    const zoneA = out.find((c) => c.anchorId === 'zone-A');
    const zoneB = out.find((c) => c.anchorId === 'zone-B');
    expect(zoneA?.memberIds.sort()).toEqual(['a', 'b']);
    expect(zoneB?.memberIds.sort()).toEqual(['c', 'd']);
  });

  it('agrupa users por private-area (mismo huddle)', () => {
    const out = clusterize({
      users: [
        u('a', 0, 0, { areaAudioAisladaId: 'huddle-1' }),
        u('b', 99, 99, { areaAudioAisladaId: 'huddle-1' }),
      ],
      radius: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('private-area');
    expect(out[0].anchorId).toBe('huddle-1');
  });

  it('NO mezcla meeting-zone con open-proximity aunque estén cerca', () => {
    // a (zone-1) cerca de b (open). NO deben quedar en mismo cluster.
    const out = clusterize({
      users: [
        u('a', 0, 0, { meetingZoneId: 'zone-1' }),
        u('b', 1, 0),
      ],
      radius: 5,
    });
    // a solo en zone-1 (size 1 → descartado), b solo (size 1 → descartado).
    expect(out).toEqual([]);
  });

  it('ordena clusters por tamaño descendente', () => {
    const out = clusterize({
      users: [
        // Cluster pequeño (2 users)
        u('a', 0, 0),
        u('b', 1, 0),
        // Cluster grande (4 users)
        u('c', 100, 100),
        u('d', 101, 100),
        u('e', 102, 100),
        u('f', 100, 101),
      ],
      radius: 5,
    });
    expect(out).toHaveLength(2);
    expect(out[0].memberIds.length).toBe(4);
    expect(out[1].memberIds.length).toBe(2);
  });

  it('genera IDs deterministas — mismo input, mismo cluster.id', () => {
    const input = {
      users: [u('a', 0, 0), u('b', 3, 4)],
      radius: 5,
    };
    const out1 = clusterize(input);
    const out2 = clusterize(input);
    expect(out1[0].id).toBe(out2[0].id);
  });

  it('respeta minSize custom', () => {
    // Cluster de 2 users — con minSize=3, debe quedar descartado.
    const out = clusterize({
      users: [u('a', 0, 0), u('b', 3, 4)],
      radius: 5,
      minSize: 3,
    });
    expect(out).toEqual([]);
  });

  it('caso realista: 5 users con mix de zone + proximity + lejanos', () => {
    const out = clusterize({
      users: [
        u('admin', 10, 10, { meetingZoneId: 'sala-diseno' }),
        u('user1', 12, 12, { meetingZoneId: 'sala-diseno' }),
        u('user2', 50, 50),
        u('user3', 52, 51),
        u('user4', 200, 200), // solo, no entra
      ],
      radius: 5,
    });
    expect(out).toHaveLength(2);
    // meeting-zone ordenado primero por tamaño (2) === open-proximity (2),
    // luego por id lexicográfico
    const zoneCluster = out.find((c) => c.kind === 'meeting-zone');
    const openCluster = out.find((c) => c.kind === 'open-proximity');
    expect(zoneCluster?.memberIds.sort()).toEqual(['admin', 'user1']);
    expect(openCluster?.memberIds.sort()).toEqual(['user2', 'user3']);
  });

  it('performance: ejecuta < 50ms para 100 users distribuidos aleatoriamente', () => {
    const seed = 12345;
    let rng = seed;
    const next = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    const users: ProximityClusterMember[] = [];
    for (let i = 0; i < 100; i++) {
      users.push(u(`user-${i}`, next() * 200, next() * 200));
    }
    const t0 = performance.now();
    clusterize({ users, radius: 5 });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});
