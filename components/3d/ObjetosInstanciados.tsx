'use client';
/**
 * PR-2: ObjetosInstanciados — Instanced Mesh Renderer
 *
 * Problema raíz: Con 42 cubículos × ~10 objetos cada uno (escritorios, sillas, lámparas…)
 * = ~420 ObjetoEscena3D individuales. Cada uno carga su propio GLTF (clonado) con N meshes
 * internos → 420 × N = ~5,800 draw calls saturando la GPU.
 *
 * Solución Industry-Standard (Unity, Unreal, Godot):
 * - Agrupar objetos por (catalogo_id + modelo_url) → mismo tipo visual
 * - Para cada grupo: 1 InstancedMesh por mesh único del GLTF
 * - Resultado: N_meshes_por_modelo × N_tipos_únicos ≈ ~30-60 draw calls totales
 *
 * En Edit Mode: fallback a ObjetoEscena3D individual (conserva drag/drop/gizmos).
 * Interactividad: instanceId en onClick identifica el objeto clicado exactamente.
 *
 * Clean Architecture:
 * - Este componente es SOLO presentación (Visual Layer)
 * - No accede a store directamente (recibe todo por props)
 * - Los colliders físicos siguen en Scene3D (Física Layer separada)
 */

import React, { useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { obtenerDimensionesObjetoRuntime } from '../space3d/objetosRuntime';
import { ObjetoEscena3D } from './ObjetoEscena3D';
import { useStore } from '@/store/useStore';
import { hapticFeedback } from '@/lib/mobileDetect';
import { logger } from '@/lib/logger';

const log = logger.child('ObjetosInstanciados');

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ObjetosInstanciadosProps {
  /** Todos los objetos de catálogo (con catalogo_id) del espacio */
  espacioObjetos: EspacioObjeto[];
  playerPosition: { x: number; z: number };
  isEditMode: boolean;
  selectedObjectId: string | null;
  ultimoObjetoColocadoId?: string | null;
  onInteractuar?: (objeto: EspacioObjeto) => void;
  onMover?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotar?: (id: string, rotationY: number) => Promise<boolean>;
  onEliminar?: (id: string) => Promise<boolean>;
  onEliminarPlantillaCompleta?: (objeto: EspacioObjeto) => Promise<boolean>;
}

interface GrupoModeloProps {
  modeloUrl: string;
  objetos: EspacioObjeto[];
  playerPosition: { x: number; z: number };
  isEditMode: boolean;
  selectedObjectId: string | null;
  ultimoObjetoColocadoId?: string | null;
  onInteractuar?: (objeto: EspacioObjeto) => void;
  onMover?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotar?: (id: string, rotationY: number) => Promise<boolean>;
  onEliminar?: (id: string) => Promise<boolean>;
  onEliminarPlantillaCompleta?: (objeto: EspacioObjeto) => Promise<boolean>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula la escala uniforme y el offset de pivote para un nodo del GLTF dado
 * las dimensiones objetivo del objeto de espacio.
 * Equivalente a calcularTransformacionUniformeGLTF pero devuelve valores
 * para la matriz de instancia (sin mutar la escena compartida).
 */
const calcularEscalaInstancia = (
  escenaGltf: THREE.Object3D,
  dimensiones: [number, number, number]
): { escalaUniforme: number; offsetY: number } => {
  const box = new THREE.Box3().setFromObject(escenaGltf);
  const size = box.getSize(new THREE.Vector3());

  const factores = [
    dimensiones[0] / Math.max(size.x, 0.001),
    dimensiones[1] / Math.max(size.y, 0.001),
    dimensiones[2] / Math.max(size.z, 0.001),
  ].filter((v) => Number.isFinite(v) && v > 0);

  const escalaUniforme =
    factores.length > 0
      ? Math.min(...factores)
      : 1;

  // Offset vertical para que la base del objeto quede en Y=0
  const offsetY = -box.min.y * escalaUniforme - dimensiones[1] / 2;

  return { escalaUniforme, offsetY };
};

// ─── GrupoModeloGLTF ──────────────────────────────────────────────────────────

/**
 * Renderiza N objetos del MISMO modelo GLTF usando InstancedMesh.
 * Draw calls: 1 por mesh único en el GLTF (no 1 por instancia).
 *
 * En Edit Mode o si el objeto está seleccionado → renderiza con ObjetoEscena3D
 * individual para conservar drag, gizmos, outlines e interactividad completa.
 */
const GrupoModeloGLTF: React.FC<GrupoModeloProps> = ({
  modeloUrl,
  objetos,
  playerPosition,
  isEditMode,
  selectedObjectId,
  ultimoObjetoColocadoId,
  onInteractuar,
  onMover,
  onRotar,
  onEliminar,
  onEliminarPlantillaCompleta,
}) => {
  const { scene: gltfScene } = useGLTF(modeloUrl);

  // ── Extraer meshes únicos del GLTF (sin clonar) ──────────────────────────
  const meshInfos = useMemo(() => {
    const infos: Array<{
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      localMatrix: THREE.Matrix4;
    }> = [];

    // Asegurar matrices actualizadas del GLTF original
    gltfScene.updateMatrixWorld(true);

    gltfScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        infos.push({
          geometry: mesh.geometry,
          material: mesh.material,
          localMatrix: mesh.matrixWorld.clone(),
        });
      }
    });

    return infos;
  }, [gltfScene]);

  // ── Refs para cada InstancedMesh ─────────────────────────────────────────
  const instancedMeshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Referencias reutilizables (evita allocations en el loop)
  const matrizInstancia = useMemo(() => new THREE.Matrix4(), []);
  const posicion = useMemo(() => new THREE.Vector3(), []);
  const rotacion = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const escalaVec = useMemo(() => new THREE.Vector3(), []);

  // ── Objetos para instancing vs. fallback individual ───────────────────────
  // Un objeto necesita fallback si:
  // 1. Está seleccionado en Edit Mode (gizmos)
  // 2. Es el último colocado (animación de entrada)
  const { objetosParaInstancing, objetosFallback } = useMemo(() => {
    if (!isEditMode) {
      // Fuera de edit mode: todos usan instancing
      return { objetosParaInstancing: objetos, objetosFallback: [] };
    }
    const instancing: EspacioObjeto[] = [];
    const fallback: EspacioObjeto[] = [];
    for (const obj of objetos) {
      if (obj.id === selectedObjectId || obj.id === ultimoObjetoColocadoId) {
        fallback.push(obj);
      } else {
        instancing.push(obj);
      }
    }
    return { objetosParaInstancing: instancing, objetosFallback: fallback };
  }, [isEditMode, objetos, selectedObjectId, ultimoObjetoColocadoId]);

  // ── Actualizar matrices de instancias ─────────────────────────────────────
  useEffect(() => {
    if (objetosParaInstancing.length === 0 || meshInfos.length === 0) return;

    instancedMeshRefs.current.forEach((instancedMesh, meshIdx) => {
      if (!instancedMesh) return;

      const meshLocalMatrix = meshInfos[meshIdx].localMatrix;

      objetosParaInstancing.forEach((obj, instanceIdx) => {
        const dims = obtenerDimensionesObjetoRuntime(obj);
        const dimensiones: [number, number, number] = [
          Math.max(dims.ancho, 0.05),
          Math.max(dims.alto, 0.05),
          Math.max(dims.profundidad, 0.05),
        ];

        const box = new THREE.Box3().setFromObject(gltfScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const factores = [
          dimensiones[0] / Math.max(size.x, 0.001),
          dimensiones[1] / Math.max(size.y, 0.001),
          dimensiones[2] / Math.max(size.z, 0.001),
        ].filter((v) => Number.isFinite(v) && v > 0);
        const escalaUniforme = factores.length > 0 ? Math.min(...factores) : 1;
        const offsetY = -box.min.y * escalaUniforme - dimensiones[1] / 2;
        // FIX 2026-05-05: XZ centering consistente con ObjetoEscena3D y
        // StaticObjectBatcher. Anchor unificado: bbox center en XZ,
        // bbox.min en Y. Evita que el objeto "salte" entre modo construcción
        // (selected→ObjetoEscena3D) y modo construcción (no-selected→este path).
        const offsetX = -center.x * escalaUniforme;
        const offsetZ = -center.z * escalaUniforme;

        posicion.set(
          obj.posicion_x + offsetX,
          obj.posicion_y + offsetY,
          obj.posicion_z + offsetZ,
        );
        euler.set(obj.rotacion_x ?? 0, obj.rotacion_y ?? 0, obj.rotacion_z ?? 0);
        rotacion.setFromEuler(euler);
        escalaVec.setScalar(escalaUniforme);

        matrizInstancia.compose(posicion, rotacion, escalaVec);
        matrizInstancia.multiply(meshLocalMatrix);

        instancedMesh.setMatrixAt(instanceIdx, matrizInstancia);
      });

      instancedMesh.count = objetosParaInstancing.length;
      instancedMesh.instanceMatrix.needsUpdate = true;
    });
  }, [objetosParaInstancing, meshInfos, gltfScene, matrizInstancia, posicion, rotacion, euler, escalaVec]);

  // ── Click handler ─────────────────────────────────────────────────────────
  // En edit mode → selecciona/deselecciona el objeto (shift = toggle múltiple).
  //   (Fix issue 7211b649: los InstancedMesh no disparaban toggleObjectSelection,
  //   por lo que en modo construcción los objetos eran invisibles al flujo de
  //   selección. Una vez seleccionado, el objeto pasa al fallback ObjetoEscena3D
  //   donde se habilita drag/drop y gizmos.)
  // Fuera de edit mode → ejecuta la interacción (sit/teleport/display/use) si
  // el jugador está cerca (distancia < 3).
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const instanceId = e.instanceId;
      if (instanceId === undefined) return;
      const obj = objetosParaInstancing[instanceId];
      if (!obj) return;

      if (isEditMode) {
        const currentStore = useStore.getState();
        currentStore.toggleObjectSelection?.(obj.id, e.shiftKey);
        hapticFeedback('light');
        return;
      }

      if (!onInteractuar) return;
      const dx = playerPosition.x - obj.posicion_x;
      const dz = playerPosition.z - obj.posicion_z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 3) {
        onInteractuar(obj);
      }
    },
    [objetosParaInstancing, onInteractuar, playerPosition, isEditMode]
  );

  if (objetosParaInstancing.length === 0 && objetosFallback.length === 0) return null;

  return (
    <>
      {/* ── Instanced rendering para objetos estáticos/no-seleccionados ── */}
      {objetosParaInstancing.length > 0 && meshInfos.map((info, meshIdx) => (
        <instancedMesh
          key={`${modeloUrl}-mesh-${meshIdx}`}
          ref={(el) => { instancedMeshRefs.current[meshIdx] = el; }}
          args={[info.geometry, info.material, objetosParaInstancing.length]}
          castShadow
          receiveShadow
          onClick={handleClick}
          frustumCulled={true}
        />
      ))}

      {/* ── Fallback individual para objetos seleccionados o recién colocados ── */}
      {objetosFallback.map((obj) => (
        <ObjetoEscena3D
          key={obj.id}
          objeto={obj}
          playerPosition={playerPosition}
          onInteractuar={onInteractuar ? () => onInteractuar(obj) : undefined}
          onMover={onMover}
          onRotar={onRotar}
          onEliminar={onEliminar}
          onEliminarPlantillaCompleta={onEliminarPlantillaCompleta}
          animarEntrada={ultimoObjetoColocadoId === obj.id}
        />
      ))}
    </>
  );
};

// Error boundary para grupos individuales fallo silencioso
class GrupoModeloErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: unknown, _info: React.ErrorInfo) {
    log.warn('Error en grupo GLTF, usando fallback individual:', error as Record<string, unknown>);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

// ─── ObjetosInstanciados (entrada principal) ──────────────────────────────────

/**
 * Punto de entrada: agrupa los espacioObjetos por modelo_url y delega
 * a GrupoModeloGLTF para el instancing. Objetos sin modelo_url (builtin)
 * siguen usando ObjetoEscena3D individual (son pocos y varían en color/forma).
 */
export const ObjetosInstanciados: React.FC<ObjetosInstanciadosProps> = ({
  espacioObjetos,
  playerPosition,
  isEditMode,
  selectedObjectId,
  ultimoObjetoColocadoId,
  onInteractuar,
  onMover,
  onRotar,
  onEliminar,
  onEliminarPlantillaCompleta,
}) => {
  // ── Separar por tipo de renderizado ──────────────────────────────────────
  const { gruposPorModelo, objetosBuiltin } = useMemo(() => {
    const grupos = new Map<string, EspacioObjeto[]>();
    const builtin: EspacioObjeto[] = [];

    for (const obj of espacioObjetos) {
      // Solo instanciar objetos de catálogo con modelo GLTF
      if (obj.modelo_url && !obj.modelo_url.startsWith('builtin:') && obj.catalogo_id) {
        const key = obj.modelo_url; // Agrupar por URL del modelo
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(obj);
      } else {
        // Builtin, sin modelo, o sin catalogo_id → individual
        builtin.push(obj);
      }
    }

    return { gruposPorModelo: grupos, objetosBuiltin: builtin };
  }, [espacioObjetos]);

  const commonProps = {
    playerPosition,
    isEditMode,
    selectedObjectId,
    ultimoObjetoColocadoId,
    onInteractuar,
    onMover,
    onRotar,
    onEliminar,
    onEliminarPlantillaCompleta,
  };

  return (
    <>
      {/* ── Grupos instanciados por modelo GLTF ── */}
      {Array.from(gruposPorModelo.entries()).map(([modeloUrl, objetos]) => {
        // Fallback: si el grupo falla, renderizar individualmente
        const fallbackIndividual = (
          <>
            {objetos.map((obj) => (
              <ObjetoEscena3D
                key={obj.id}
                objeto={obj}
                playerPosition={playerPosition}
                onInteractuar={onInteractuar ? () => onInteractuar(obj) : undefined}
                onMover={onMover}
                onRotar={onRotar}
                onEliminar={onEliminar}
                onEliminarPlantillaCompleta={onEliminarPlantillaCompleta}
                animarEntrada={ultimoObjetoColocadoId === obj.id}
              />
            ))}
          </>
        );

        return (
          <GrupoModeloErrorBoundary key={modeloUrl} fallback={fallbackIndividual}>
            <Suspense fallback={fallbackIndividual}>
              <GrupoModeloGLTF
                modeloUrl={modeloUrl}
                objetos={objetos}
                {...commonProps}
              />
            </Suspense>
          </GrupoModeloErrorBoundary>
        );
      })}

      {/* ── Objetos builtin/sin modelo: siguen con ObjetoEscena3D ── */}
      {objetosBuiltin.map((obj) => (
        <ObjetoEscena3D
          key={obj.id}
          objeto={obj}
          playerPosition={playerPosition}
          onInteractuar={onInteractuar ? () => onInteractuar(obj) : undefined}
          onMover={onMover}
          onRotar={onRotar}
          onEliminar={onEliminar}
          onEliminarPlantillaCompleta={onEliminarPlantillaCompleta}
          animarEntrada={ultimoObjetoColocadoId === obj.id}
        />
      ))}
    </>
  );
};
