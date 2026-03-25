'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '@/store/useStore';
import { hapticFeedback } from '@/lib/mobileDetect';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { ObjetoPreview3D } from '@/types/objetos3d';
import { esObjetoArquitectonicoProcedural } from '@/src/core/domain/entities/objetosArquitectonicos';
import { esObjetoInteractuable, obtenerDimensionesObjetoRuntime, obtenerEmojiInteraccionObjeto, obtenerEtiquetaInteraccionObjeto, obtenerRadioInteraccionObjeto } from '../space3d/objetosRuntime';
import { GeometriaProceduralObjeto3D } from './GeometriaProceduralObjeto3D';

interface ObjetoEscena3DProps {
  objeto: EspacioObjeto;
  playerPosition: { x: number; z: number };
  onInteractuar?: () => void;
  onMover?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotar?: (id: string, rotationY: number) => Promise<boolean>;
  onEliminar?: (id: string) => Promise<boolean>;
  onEliminarPlantillaCompleta?: (objeto: EspacioObjeto) => Promise<boolean>;
  animarEntrada?: boolean;
}

interface FantasmaColocacion3DProps {
  objeto: ObjetoPreview3D;
}

const PROXIMIDAD_INTERACCION = 3;
const PASO_GRILLA = 0.5;
const NOOP = () => {};

const ajustarAGrilla = (valor: number, paso = PASO_GRILLA) => Math.round(valor / paso) * paso;

const normalizarEscala = (objeto: any) => {
  const dimensiones = obtenerDimensionesObjetoRuntime(objeto);
  const escalaMinima = 0.05;
  return [
    Math.max(dimensiones.ancho, escalaMinima),
    Math.max(dimensiones.alto, escalaMinima),
    Math.max(dimensiones.profundidad, escalaMinima)
  ] as [number, number, number];
};

const obtenerColorHex = (valor?: string | null) => {
  if (!valor) return '#6366f1';
  return valor.startsWith('#') ? valor : `#${valor}`;
};

const descomponerModelo = (modeloUrl?: string | null) => {
  if (!modeloUrl || !modeloUrl.startsWith('builtin:')) {
    return { incorporado: false, geometria: 'cubo', color: '#6366f1' };
  }

  const [, geometria = 'cubo', color = '6366f1'] = modeloUrl.split(':');
  return {
    incorporado: true,
    geometria,
    color: obtenerColorHex(color),
  };
};

const calcularTransformacionUniformeGLTF = (
  objeto: THREE.Object3D,
  dimensiones: [number, number, number]
) => {
  const box = new THREE.Box3().setFromObject(objeto);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const factores = [
    dimensiones[0] / Math.max(size.x, 0.001),
    dimensiones[1] / Math.max(size.y, 0.001),
    dimensiones[2] / Math.max(size.z, 0.001),
  ].filter((valor) => Number.isFinite(valor) && valor > 0);
  const factorContain = Math.min(...factores);
  const escalaUniforme = Number.isFinite(factorContain) && factorContain > 0
    ? factorContain
    : 1;
  const sueloObjetivoLocalY = -(dimensiones[1] / 2);

  objeto.scale.setScalar(escalaUniforme);
  objeto.position.set(
    -center.x * escalaUniforme,
    (-box.min.y * escalaUniforme) + sueloObjetivoLocalY,
    -center.z * escalaUniforme
  );

  return objeto;
};

const GeometriaIncorporada: React.FC<{
  geometria: string;
  color: string;
  opacidad: number;
  transparente: boolean;
  resaltar: boolean;
}> = ({ geometria, color, opacidad, transparente, resaltar }) => {
  const materialProps = {
    color,
    transparent: transparente,
    opacity: opacidad,
    emissive: resaltar ? '#818cf8' : '#000000',
    emissiveIntensity: resaltar ? 0.35 : 0,
    roughness: 0.55,
    metalness: 0.08,
  };

  const outlineMaterial = (
    <meshBasicMaterial
      color="#a5b4fc"
      transparent
      opacity={transparente ? 0.18 : 0.08}
      side={THREE.BackSide}
    />
  );

  if (['pared', 'wall', 'muro'].includes(geometria)) {
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        {(transparente || resaltar) && (
          <mesh scale={[1.04, 1.04, 1.04]}>
            <boxGeometry args={[1, 1, 1]} />
            {outlineMaterial}
          </mesh>
        )}
      </>
    );
  }

  if (['cilindro', 'cylinder', 'columna'].includes(geometria)) {
    return (
      <>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        {(transparente || resaltar) && (
          <mesh scale={[1.04, 1.04, 1.04]}>
            <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
            {outlineMaterial}
          </mesh>
        )}
      </>
    );
  }

  if (['plano', 'plane'].includes(geometria)) {
    return (
      <>
        <mesh castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial side={THREE.DoubleSide} {...materialProps} />
        </mesh>
        {(transparente || resaltar) && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.04, 1.04, 1.04]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color="#a5b4fc" transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
        )}
      </>
    );
  }

  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
      {(transparente || resaltar) && (
        <mesh scale={[1.04, 1.04, 1.04]}>
          <boxGeometry args={[1, 1, 1]} />
          {outlineMaterial}
        </mesh>
      )}
    </>
  );
};

const normalizarUrlGLTF = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.split('/').map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');
    return parsed.toString();
  } catch {
    return url;
  }
};

class ErrorBoundaryGLTF extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: unknown) { console.warn('[GLTF] Error cargando modelo:', error); }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}

const ModeloGLTFObjeto: React.FC<{
  modeloUrl: string;
  dimensiones: [number, number, number];
  opacidad: number;
  transparente: boolean;
}> = ({ modeloUrl, dimensiones, opacidad, transparente }) => {
  const urlNormalizada = useMemo(() => normalizarUrlGLTF(modeloUrl), [modeloUrl]);
  const { scene } = useGLTF(urlNormalizada);

  const clon = useMemo(() => {
    const escenaClonada = scene.clone(true);
    escenaClonada.traverse((child: any) => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((material: any) => material.clone())
          : child.material.clone();
        const materiales = Array.isArray(child.material) ? child.material : [child.material];
        materiales.forEach((material: any) => {
          material.transparent = transparente;
          material.opacity = opacidad;
          material.depthWrite = !transparente;
          material.side = THREE.DoubleSide;
          if (transparente && material.color) {
            material.color = new THREE.Color('#67e8f9');
          }
          if (transparente && material.emissive) {
            material.emissive = new THREE.Color('#818cf8');
            material.emissiveIntensity = 0.75;
          }
          material.needsUpdate = true;
        });
      }
    });

    return calcularTransformacionUniformeGLTF(escenaClonada, dimensiones);
  }, [dimensiones, scene, opacidad, transparente]);

  const outlineClone = useMemo(() => {
    if (!transparente) return null;
    const escenaOutline = scene.clone(true);
    escenaOutline.traverse((child: any) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: '#a5b4fc',
          transparent: true,
          opacity: 0.16,
          side: THREE.BackSide,
          depthWrite: false,
        });
      }
    });

    return calcularTransformacionUniformeGLTF(escenaOutline, dimensiones);
  }, [dimensiones, scene, transparente]);

  return (
    <group>
      <primitive object={clon} />
      {outlineClone && <primitive object={outlineClone} scale={1.03} />}
    </group>
  );
};

const RepresentacionObjeto: React.FC<{
  objeto: EspacioObjeto | ObjetoPreview3D;
  modeloUrl?: string | null;
  escala: [number, number, number];
  opacidad: number;
  transparente: boolean;
  resaltar: boolean;
}> = ({ objeto, modeloUrl, escala, opacidad, transparente, resaltar }) => {
  const configuracion = descomponerModelo(modeloUrl);

  if (esObjetoArquitectonicoProcedural(objeto)) {
    return (
      <GeometriaProceduralObjeto3D
        objeto={objeto}
        dimensiones={escala}
        opacidad={opacidad}
        transparente={transparente}
        resaltar={resaltar}
      />
    );
  }

  if (!configuracion.incorporado && modeloUrl) {
    const fallbackCubo = (
      <group scale={escala}>
        <GeometriaIncorporada geometria="cubo" color="#6366f1" opacidad={opacidad} transparente={transparente} resaltar={resaltar} />
      </group>
    );
    return (
      <ErrorBoundaryGLTF fallback={fallbackCubo}>
        <Suspense fallback={fallbackCubo}>
          <ModeloGLTFObjeto modeloUrl={modeloUrl} dimensiones={escala} opacidad={opacidad} transparente={transparente} />
        </Suspense>
      </ErrorBoundaryGLTF>
    );
  }

  return (
    <group scale={escala}>
      <GeometriaIncorporada
        geometria={configuracion.geometria}
        color={configuracion.color}
        opacidad={opacidad}
        transparente={transparente}
        resaltar={resaltar}
      />
    </group>
  );
};

export const FantasmaColocacion3D: React.FC<FantasmaColocacion3DProps> = ({ objeto }) => {
  const escala = useMemo(() => normalizarEscala(objeto), [objeto]);
  const grupoRef = useRef<THREE.Group>(null);
  const aroRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (grupoRef.current) {
      grupoRef.current.position.y = objeto.posicion_y + Math.sin(t * 2.4) * 0.04;
    }
    if (aroRef.current) {
      const pulso = 1 + Math.sin(t * 3.2) * 0.06;
      aroRef.current.scale.setScalar(pulso);
    }
  });

  return (
    <group ref={grupoRef} position={[objeto.posicion_x, objeto.posicion_y, objeto.posicion_z]} rotation={[0, objeto.rotacion_y || 0, 0]}>
      <RepresentacionObjeto
        objeto={objeto}
        modeloUrl={objeto.modelo_url || (objeto.built_in_geometry ? `builtin:${objeto.built_in_geometry}:${(objeto.built_in_color || '#6366f1').replace('#', '')}` : null)}
        escala={escala}
        opacidad={0.5}
        transparente={true}
        resaltar={true}
      />
      <mesh scale={[escala[0] * 1.08, Math.max(escala[1] * 1.08, 1.02), escala[2] * 1.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.1} wireframe />
      </mesh>
      <mesh ref={aroRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -(escala[1] / 2) + 0.02, 0]}>
        <ringGeometry args={[Math.max(escala[0], escala[2]) * 0.42, Math.max(escala[0], escala[2]) * 0.58, 32]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(escala[1] / 2) + 0.021, 0]}>
        <ringGeometry args={[Math.max(escala[0], escala[2]) * 0.60, Math.max(escala[0], escala[2]) * 0.68, 32]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.22} />
      </mesh>
    </group>
  );
};

const _ObjetoEscena3D: React.FC<ObjetoEscena3DProps> = ({
  objeto,
  playerPosition,
  onInteractuar,
  onMover,
  onRotar,
  onEliminar,
  onEliminarPlantillaCompleta,
  animarEntrada = false,
}) => {
  const escala = useMemo(() => normalizarEscala(objeto), [objeto]);
  const [hover, setHover] = useState(false);
  // PR-3: cercano computed via useMemo below — declared here for useEffect ordering
  // cercanoRef for click-handler immediate read (no re-render needed)
  const cercanoRef = useRef(false);
  const tiempoAnimacionRef = useRef<number | null>(null);
  const rotateInFlightRef = useRef(false);
  const grupoRef = useRef<THREE.Group>(null);
  const isEditMode = useStore((s) => s.isEditMode);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const selectedObjectIds = useStore((s) => s.selectedObjectIds);
  const toggleObjectSelectionStore = useStore((s) => s.toggleObjectSelection);
  const toggleObjectSelection = toggleObjectSelectionStore ?? NOOP;
  const setSelectedObjectIdStore = useStore((s) => s.setSelectedObjectId);
  const clearObjectSelectionStore = useStore((s) => s.clearObjectSelection);
  const setIsDraggingStore = useStore((s) => s.setIsDragging);
  const setSelectedObjectId = setSelectedObjectIdStore ?? NOOP;
  const clearObjectSelection = clearObjectSelectionStore ?? NOOP;
  const setIsDragging = setIsDraggingStore ?? NOOP;
  const isSelected = selectedObjectIds.includes(objeto.id);
  const isPrimarySelected = selectedObjectId === objeto.id;
  const esInteractuable = esObjetoInteractuable(objeto);
  const radioInteraccion = esInteractuable ? obtenerRadioInteraccionObjeto(objeto, PROXIMIDAD_INTERACCION) : PROXIMIDAD_INTERACCION;
  const etiquetaInteraccion = esInteractuable
    ? obtenerEtiquetaInteraccionObjeto(objeto, objeto.nombre || 'Objeto interactivo')
    : (objeto.nombre || 'Objeto decorativo');
  const emojiInteraccion = esInteractuable
    ? obtenerEmojiInteraccionObjeto(objeto, '✨')
    : '📦';
  const esObjetoPlantilla = Boolean(objeto.es_de_plantilla || objeto.plantilla_origen);

  // PR-3: cercano computed here (before useEffect that uses it)
  const cercano = useMemo(() => {
    const dx = playerPosition.x - objeto.posicion_x;
    const dz = playerPosition.z - objeto.posicion_z;
    return Math.sqrt(dx * dx + dz * dz) < radioInteraccion;
  }, [playerPosition.x, playerPosition.z, objeto.posicion_x, objeto.posicion_z, radioInteraccion]);

  // Keep ref in sync for click-handler immediate read
  useEffect(() => { cercanoRef.current = cercano; }, [cercano]);

  useEffect(() => {
    if (animarEntrada) {
      tiempoAnimacionRef.current = performance.now();
    }
  }, [animarEntrada]);

  // PR-3: Animación de entrada — useFrame SOLO si animarEntrada es true (muy raro)
  // El check temprano (tiempoAnimacionRef.current === null) hace que este
  // useFrame sea un no-op en el 99.9% de los frames, con costo ~0.
  useFrame(() => {
    if (!grupoRef.current || tiempoAnimacionRef.current === null) return;
    const transcurrido = performance.now() - tiempoAnimacionRef.current;
    if (transcurrido >= 300) {
      grupoRef.current.scale.setScalar(1);
      tiempoAnimacionRef.current = null;
      return;
    }
    const multiplicador = transcurrido <= 150
      ? THREE.MathUtils.lerp(0.8, 1.1, transcurrido / 150)
      : THREE.MathUtils.lerp(1.1, 1, (transcurrido - 150) / 150);
    grupoRef.current.scale.setScalar(multiplicador);
  });

  const handleRotate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (rotateInFlightRef.current) {
      return;
    }
    rotateInFlightRef.current = true;
    try {
      if (onRotar) {
        await onRotar(objeto.id, objeto.rotacion_y || 0);
      }
    } finally {
      rotateInFlightRef.current = false;
    }
    hapticFeedback('medium');
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de que deseas eliminar este objeto?')) {
      if (onEliminar) {
        const success = await onEliminar(objeto.id);
        if (success) {
          clearObjectSelection();
        }
      }
    }
    hapticFeedback('heavy');
  };

  const handleDeleteTemplate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onEliminarPlantillaCompleta) {
      return;
    }

    if (window.confirm('¿Eliminar toda la plantilla asociada a este objeto?')) {
      const success = await onEliminarPlantillaCompleta(objeto);
      if (success) {
        clearObjectSelection();
      }
    }
    hapticFeedback('heavy');
  };

  const moverPorPaso = async (deltaX: number, deltaZ: number) => {
    if (!onMover) return;
    await onMover(
      objeto.id,
      ajustarAGrilla(objeto.posicion_x + deltaX),
      objeto.posicion_y,
      ajustarAGrilla(objeto.posicion_z + deltaZ)
    );
    hapticFeedback('light');
  };

  return (
    <group ref={grupoRef} position={[objeto.posicion_x, objeto.posicion_y, objeto.posicion_z]} rotation={[objeto.rotacion_x || 0, objeto.rotacion_y || 0, objeto.rotacion_z || 0]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          if (isEditMode) {
            toggleObjectSelection(objeto.id, e.shiftKey);
            hapticFeedback('light');
            return;
          }

          if (esInteractuable && cercanoRef.current && onInteractuar) {
            onInteractuar();
            hapticFeedback('light');
          }
        }}
        onPointerDown={(e) => {
          if (isEditMode && isSelected) {
            e.stopPropagation();
            (e.target as any).setPointerCapture(e.pointerId);
            setIsDragging(true);
          }
        }}
        onPointerUp={(e) => {
          if (isEditMode && isSelected) {
            e.stopPropagation();
            (e.target as any).releasePointerCapture(e.pointerId);
            setIsDragging(false);
          }
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <RepresentacionObjeto
          objeto={objeto}
          modeloUrl={objeto.modelo_url}
          escala={escala}
          opacidad={1}
          transparente={false}
          resaltar={Boolean(isSelected || hover)}
        />
      </group>

      {isSelected && (
        <>
          <mesh scale={[escala[0] * 1.08, Math.max(escala[1] * 1.08, 1.02), escala[2] * 1.08]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#6366f1" transparent opacity={0.18} side={THREE.BackSide} />
          </mesh>
          <pointLight color="#6366f1" intensity={2.5} distance={5} position={[0, Math.max(escala[1], 1), 0]} />
        </>
      )}

      {isPrimarySelected && isEditMode && (
        <Html position={[0, Math.max(escala[1], 1) + 0.55, 0]} center zIndexRange={[100, 0]}>
          <ObjectContextMenu
            onRotate={handleRotate}
            onDelete={handleDelete}
            onDeleteTemplate={esObjetoPlantilla ? handleDeleteTemplate : undefined}
            onClose={() => clearObjectSelection()}
            objectName={objeto.nombre}
          />
        </Html>
      )}

    </group>
  );
};

// PR-3: React.memo evita re-renders de objetos estáticos cuando cambian
// solo propiedades que no afectan este objeto específico (e.g., se mueve otro objeto).
// El comparador solo permite re-render si las props relevantes cambian.
export const ObjetoEscena3D = React.memo(_ObjetoEscena3D, (prev, next) => {
  // Re-render si cambia el objeto en sí (posición, rotación, etc.)
  if (prev.objeto !== next.objeto) return false;
  // Re-render si la posición del jugador cambia a diferente cuadrante de 1 unidad
  // (evita re-render por cada pixel movido, solo cuando cruza ~1m)
  const prevCuadX = Math.floor(prev.playerPosition.x);
  const prevCuadZ = Math.floor(prev.playerPosition.z);
  const nextCuadX = Math.floor(next.playerPosition.x);
  const nextCuadZ = Math.floor(next.playerPosition.z);
  if (prevCuadX !== nextCuadX || prevCuadZ !== nextCuadZ) return false;
  // Re-render si cambia animarEntrada
  if (prev.animarEntrada !== next.animarEntrada) return false;
  // Si todo es igual, skip re-render (return true = son iguales)
  return true;
});

/* ─────────────────────────────────────────────────────────────────────────────
   ObjectContextMenu — Premium minimal gizmo, 2026 design
   • Thin pill header: rotate · delete · close
   • Compact 4-arrow snap pad below, always visible
   • Auto-fades to 15% opacity after 3s of inactivity (restores on hover)
   • Clean Architecture: only emits events, no direct store access
───────────────────────────────────────────────────────────────────────────── */
interface ObjectContextMenuProps {
  onRotate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDeleteTemplate?: (e: React.MouseEvent) => void;
  onClose: () => void;
  objectName?: string | null;
}

const ObjectContextMenu: React.FC<ObjectContextMenuProps> = ({
  onRotate, onDelete, onDeleteTemplate, onClose, objectName,
}) => {
  const [idle, setIdle] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showDeleteTemplateConfirm, setShowDeleteTemplateConfirm] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = React.useCallback(() => {
    setIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), 3000);
  }, []);

  React.useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
    resetTimer();
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    onDelete(e);
    setShowDeleteConfirm(false);
  };

  const handleDeleteTemplateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteTemplateConfirm(true);
    setShowDeleteConfirm(false);
    resetTimer();
  };

  const handleConfirmDeleteTemplate = (e: React.MouseEvent) => {
    onDeleteTemplate?.(e);
    setShowDeleteTemplateConfirm(false);
  };

  const baseStyle: React.CSSProperties = {
    transition: 'opacity 0.6s ease',
    opacity: idle ? 0.15 : 1,
    userSelect: 'none',
  };

  return (
    <div
      style={baseStyle}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={resetTimer}
      onMouseMove={resetTimer}
      className="flex flex-col items-center gap-1.5 select-none"
    >
      {/* ── Pill header ── */}
      <div
        className="flex items-center gap-1 rounded-full px-2 py-1"
        style={{
          background: 'rgba(10,10,20,0.82)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Rotate */}
        <button
          onClick={(e) => { e.stopPropagation(); onRotate(e); resetTimer(); }}
          title="Rotar 90°"
          className="group w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-indigo-500/30 active:scale-90"
        >
          <svg className="w-3.5 h-3.5 text-indigo-300 group-hover:text-indigo-100 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <span className="w-px h-3 bg-white/10" />

        {/* Delete */}
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1 pl-0.5">
            <span className="text-[10px] text-red-300/80 font-medium">¿Eliminar?</span>
            <button
              onClick={handleConfirmDelete}
              title="Confirmar"
              className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center hover:bg-red-400 active:scale-90 transition-all"
            >
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); resetTimer(); }}
              title="Cancelar"
              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all"
            >
              <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeleteClick}
            title="Eliminar objeto"
            className="group w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-red-500/30 active:scale-90"
          >
            <svg className="w-3.5 h-3.5 text-red-400/80 group-hover:text-red-300 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        {onDeleteTemplate && (
          <>
            <span className="w-px h-3 bg-white/10" />
            {showDeleteTemplateConfirm ? (
              <div className="flex items-center gap-1 pl-0.5">
                <span className="text-[10px] text-amber-300/80 font-medium">¿Plantilla?</span>
                <button
                  onClick={handleConfirmDeleteTemplate}
                  title="Confirmar eliminar plantilla"
                  className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center hover:bg-amber-400 active:scale-90 transition-all"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDeleteTemplateConfirm(false); resetTimer(); }}
                  title="Cancelar"
                  className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-90 transition-all"
                >
                  <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={handleDeleteTemplateClick}
                title="Eliminar plantilla completa"
                className="group w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-amber-500/30 active:scale-90"
              >
                <svg className="w-3.5 h-3.5 text-amber-300/80 group-hover:text-amber-200 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 7l1 12h10l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </button>
            )}
          </>
        )}

        <span className="w-px h-3 bg-white/10" />

        {/* Close / deselect */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Deseleccionar"
          className="group w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-white/10 active:scale-90"
        >
          <svg className="w-3.5 h-3.5 text-white/40 group-hover:text-white/80 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

