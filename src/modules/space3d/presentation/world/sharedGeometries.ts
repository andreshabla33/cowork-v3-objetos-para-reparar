/**
 * @module 3d/sharedGeometries
 * @description Module-level singleton geometries shared across avatar components.
 *
 * Clean Architecture: Domain layer — inmutable geometry constants.
 *
 * WHY singletons:
 *   R3F inline JSX like `<sphereGeometry args={[...]} />` creates a NEW
 *   BufferGeometry on every mount/re-render. With 80+ visible avatars,
 *   this causes 100+ orphaned geometries per frame (GEOMETRY LEAK).
 *
 *   Module-level singletons are created once and shared via `geometry={ref}`
 *   prop, matching the pattern already used in AvatarLabels.tsx.
 *
 * Ref: Three.js manual — "How to dispose of objects"
 *   "Geometries and materials can be shared among 3D objects,
 *    so be careful about disposing shared resources."
 *
 * Ref: R3F docs — "Objects, properties and constructor arguments"
 *   "Objects become managed, reactive and auto-dispose when placed
 *    in React Three Fiber's render tree." → inline JSX = auto-dispose
 *    per unmount = re-created per mount = leak on rapid remounts.
 *
 * These singletons are NEVER disposed — they live for the app lifetime.
 * GPU cost: ~5KB total VRAM (trivial vs the 40K+ vertices leaked per frame).
 */

import * as THREE from 'three';

// ─── Avatar hit-test cylinders ──────────────────────────────────────────────
/** Invisible hit-test collider for the current user's avatar */
export const hitTestCylinderCurrentUser = new THREE.CylinderGeometry(0.65, 0.65, 2.6, 8);

/** Invisible hit-test collider for remote avatars */
export const hitTestCylinderRemote = new THREE.CylinderGeometry(0.8, 0.8, 3, 8);

// ─── Status indicators ─────────────────────────────────────────────────────
/** Small sphere next to avatar name (status dot) — matches AvatarLabels.tsx */
export const statusDotGeometry = new THREE.SphereGeometry(0.06, 8, 8);

/** Larger sphere for crowd-level avatar markers (LOD far) */
export const crowdMarkerGeometry = new THREE.SphereGeometry(0.28, 10, 10);

// ─── Ghost avatar ───────────────────────────────────────────────────────────
/** Ghost head sphere */
export const ghostHeadGeometry = new THREE.SphereGeometry(0.45, 18, 18);

/** Ghost body cylinder */
export const ghostBodyGeometry = new THREE.CylinderGeometry(0.35, 0.5, 0.9, 16);

/** Ghost shadow circle */
export const ghostShadowGeometry = new THREE.CircleGeometry(0.7, 20);

// ─── Effects ────────────────────────────────────────────────────────────────
/** Teleport flash cylinder */
export const teleportCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);

/** Teleport landing ring */
export const teleportRingGeometry = new THREE.RingGeometry(0.5, 1.2, 32);
