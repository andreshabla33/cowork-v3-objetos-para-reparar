'use client';
/**
 * @module space3d/world/StaticObjectBatcher
 *
 * Orchestrator de la Fase 4 — multi-material BatchedMesh + TextureAtlas +
 * LOD/Frustum Culling. Delega:
 *   - Registro per-modelo a `BatchedGroupLoader`.
 *   - Frustum/LOD pass a `FrustumCuller`.
 *   - Cache module-level (firma + registered models) a `batcher/registrationCache`.
 *   - Helpers THREE-puros a `batcher/{material,geometry,transform}Helpers`.
 *
 * Performance target (Fase 4): ~1-3 draw calls finales (vs ~5,800 sin batch).
 * Per-instance frustum culling oculta 30-60% en cada frame.
 *
 * Refs:
 *   https://threejs.org/docs/#api/en/objects/BatchedMesh
 *   https://r3f.docs.pmnd.rs/api/objects#putting-already-existing-objects-into-the-scene-graph
 *   https://r3f.docs.pmnd.rs/api/objects#disposal
 *   Mozilla Hubs — three-batch-manager
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { logger } from '@/core/infrastructure/observability/logger';
import { BatchedGroupLoader } from './BatchedGroupLoader';
import { FrustumCuller } from './FrustumCuller';
import type { StaticObjectBatcherProps } from './batcher/batcherTypes';
import {
  _registration,
  computeGruposSignature,
  resetRegistrationCache,
} from './batcher/registrationCache';

const log = logger.child('StaticObjectBatcher');

export const StaticObjectBatcher: React.FC<StaticObjectBatcherProps> = ({
  gruposPorModelo,
  services,
  playerPosition,
}) => {
  // P1 PERFORMANCE FIX (2026-04-10) — firma-aware signature cache.
  // Mientras la firma de `gruposPorModelo` no cambie, los BatchedMesh groups,
  // DataTextures y TextureAtlas sobreviven cualquier remount (StrictMode,
  // edit-toggle, etc.). El reset solo corre cuando cambia la firma.
  const currentSignature = useMemo(
    () => computeGruposSignature(gruposPorModelo),
    [gruposPorModelo],
  );

  // ─── Estado reactivo de meshes para `<primitive>` declarativos ─────────
  //
  // R3F-canonical: cada BatchedMesh es un `<primitive object={mesh}
  // dispose={null}>` declarativo. R3F gestiona attach/detach automático
  // en mount/unmount. `dispose={null}` desactiva el auto-dispose porque
  // el MultiBatch adapter es el owner del lifecycle.
  //
  // Los Loaders disparan `onMeshesChanged` tras registrar (o tras cache-
  // hit) → padre re-fetcha la lista actual y dispara setState → re-render.
  //
  // Ref oficial R3F v9.5.0:
  //   https://r3f.docs.pmnd.rs/api/objects#putting-already-existing-objects-into-the-scene-graph
  const [renderedMeshes, setRenderedMeshes] = useState<THREE.Object3D[]>([]);

  const refrescarListaMeshes = useCallback(() => {
    if (!services.isReady) {
      setRenderedMeshes((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const nuevos = services.multiBatch.obtenerTodosMeshes() as THREE.Object3D[];
    setRenderedMeshes((prev) => {
      // Identity-equal check para evitar re-renders inútiles.
      if (prev.length === nuevos.length && nuevos.every((m, i) => m === prev[i])) {
        return prev;
      }
      log.info('MultiBatch primitives updated', {
        previous: prev.length,
        current: nuevos.length,
      });
      return nuevos;
    });
  }, [services]);

  // ─── P1 HOTFIX (2026-04-10) — Render-phase signature detection ──────────
  //
  // BUG previo: la detección de firma vivía en un `useEffect` → corre DESPUÉS
  // de los effects de los hijos (React ejecuta effects bottom-up). Flujo
  // defectuoso en el primer render con datos:
  //   1. Render 1 (vacío): firma = "" → efecto del padre setea "" como base.
  //   2. Render 2 (datos): hijos registran ~3043 instancias.
  //      → efecto del padre detecta cambio → `limpiar()` → DESTRUYE lo recién
  //        registrado. Resultado: muros visibles, GLBs desaparecen.
  //
  // Fix: detección + reset en render-phase del padre. El padre renderiza
  // ANTES que los hijos, así que cuando los effects de los hijos corran
  // ya encontrarán los servicios limpios/estables.
  //
  // Side-effects en render aceptable porque solo actualiza state module-level
  // (idempotente, no toca setState React, no dispara renders adicionales).
  //
  // Ref oficial React 19 — "You Might Not Need an Effect":
  //   https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  if (services.isReady && _registration.signature !== currentSignature) {
    const hadPreviousData =
      _registration.signature !== null && _registration.signature !== '';
    const servicesChanged =
      _registration.services !== null && _registration.services !== services;

    if (hadPreviousData || servicesChanged) {
      log.info('Signature changed — reset completo del cache de batcher', {
        prevSignature: _registration.signature,
        nextSignature: currentSignature,
        servicesChanged,
      });
      resetRegistrationCache(_registration.services ?? services);
    }

    _registration.signature = currentSignature;
    _registration.services = services;
  }

  // Tras un reset (signature change), sincronizamos el state en useEffect
  // para no llamar setState durante render. Cubre el caso "todos borrados".
  useEffect(() => {
    refrescarListaMeshes();
  }, [currentSignature, refrescarListaMeshes]);

  if (!services.isReady) return null;

  return (
    <>
      {/* Registrar cada modelo GLTF en MultiBatch por material group */}
      {Array.from(gruposPorModelo.entries()).map(([modeloUrl, objetos]) => (
        <BatchedGroupLoader
          key={modeloUrl}
          modeloUrl={modeloUrl}
          objetos={objetos}
          services={services}
          onMeshesChanged={refrescarListaMeshes}
        />
      ))}

      {/* Fase 4C — Per-instance frustum culling + LOD */}
      <FrustumCuller services={services} playerPosition={playerPosition} />

      {/* BatchedMesh groups attached declarativamente (R3F-canonical).
          `dispose={null}` porque MultiBatch adapter es el owner del lifecycle. */}
      {renderedMeshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} dispose={null} />
      ))}
    </>
  );
};

StaticObjectBatcher.displayName = 'StaticObjectBatcher';
