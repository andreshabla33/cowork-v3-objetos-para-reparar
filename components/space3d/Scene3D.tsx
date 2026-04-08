'use client';
import React, { useRef, useEffect, useMemo, Suspense, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Grid, Text, OrbitControls, Html, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { logger } from '@/lib/logger';
import type { AccionXP } from '@/lib/gamificacion';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import { useAvatarControls } from '../avatar3d/useAvatarControls';
import type { AnimationState } from '../avatar3d/shared';
import { VideoWithBackground } from '../VideoWithBackground';
import { GhostAvatar } from '../3d/GhostAvatar';
import { CerramientoZona3D } from '../3d/CerramientoZona3D';
import { ZonaEmpresa as ZonaEmpresa3D } from '../3d/ZonaEmpresa';
import { FantasmaColocacion3D, ObjetoEscena3D } from '../3d/ObjetoEscena3D';
import { ObjetosInstanciados } from '../3d/ObjetosInstanciados';
import { StaticObjectBatcher } from '../3d/StaticObjectBatcher';
import { BuiltinWallBatcher } from '../3d/BuiltinWallBatcher';
import { useSceneOptimization } from '@/hooks/space3d/useSceneOptimization';
import type { EspacioObjeto, SpawnPersonal, TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
import type { OcupacionAsientoReal } from '@/hooks/space3d/useOcupacionAsientos';
import type { ObjetoPreview3D } from '@/types/objetos3d';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ObjetosInteractivos } from '../3d/ObjetosInteractivos';
import { ParticulasClima } from '../3d/ParticulasClima';
import { EmoteSync, useSyncEffects } from '../3d/EmoteSync';
import { hapticFeedback, isMobileDevice } from '@/lib/mobileDetect';
import { useStore } from '@/store/useStore';
import type { ModoEdicionObjeto, PlantillaZonaEnColocacion } from '@/store/slices';
import { FloorType, calcularNivelAnidamientoRectangulo, detectarSolapamientoSubzona, zonaDbAMundo, type RectanguloZona, resolverTipoSubsueloZona } from '@/src/core/domain/entities';
import { obtenerPlantillaZona } from '@/src/core/domain/entities/plantillasEspacio';
import { crearPropsMaterialSueloPbr } from '@/lib/rendering/textureRegistry';
import { SceneEnvironment } from './SceneEnvironment';
import { SceneCamera } from './SceneCamera';
import { SceneZonas } from './SceneZonas';
// FASE 5: Geometry cache para eliminar fluctuación 312↔567 en renderer-metrics
import { geoPlano, geoSueloRaycast, geoCajaUnitaria } from '@/lib/rendering/geometriaCache';
import { type CameraSettings } from '@/modules/realtime-room';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { type JoystickInput } from '../3d/MobileJoystick';
import { getSettingsSection } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar, themeColors,
  MOVE_SPEED, RUN_SPEED, WORLD_SIZE, TELEPORT_DISTANCE,
  CHAIR_SIT_RADIUS, CHAIR_POSITIONS_3D, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE,
  playTeleportSound, IconPrivacy, IconExpand,
  FACTOR_ESCALA_OBJETOS_ESCENA,
} from './shared';
import { crearAsientosObjetos3D, type AsientoRuntime3D } from './asientosRuntime';
import { crearParedesCerramientosZonas } from './cerramientosZonaRuntime';
import { crearObstaculosFisicosObjetoPersistente, crearObstaculosObjetosPersistentes } from './colisionesRuntime';
import { obtenerDimensionesObjetoRuntime } from './objetosRuntime';
import { statusColors, STATUS_LABELS, type VirtualSpace3DProps } from './spaceTypes';
import { Player, type PlayerProps } from './Player3D';
import { RemoteUsers, TeleportEffect, CameraFollow, type AvatarProps } from './Avatar3DScene';

const log = logger.child('Scene3D');

// --- Scene ---
export interface SceneProps {
  currentUser: User;
  onlineUsers: User[];
  setPosition: (x: number, y: number, direction?: string, isSitting?: boolean, isMoving?: boolean) => void;
  theme: string;
  orbitControlsRef: React.MutableRefObject<any>;
  stream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  showVideoBubbles?: boolean;
  videoIsProcessed?: boolean;
  localMessage?: string;
  remoteMessages: Map<string, string>;
  localReactions?: Array<{ id: string; emoji: string }>;
  remoteReaction?: { emoji: string; from: string; fromName: string } | null;
  onClickAvatar?: () => void;
  moveTarget?: { x: number; z: number } | null;
  onReachTarget?: () => void;
  onDoubleClickFloor?: (point: THREE.Vector3) => void;
  onTapFloor?: (point: THREE.Vector3) => void;
  teleportTarget?: { x: number; z: number } | null;
  onTeleportDone?: () => void;
  showFloorGrid?: boolean;
  showNamesAboveAvatars?: boolean;
  cameraSensitivity?: number;
  invertYAxis?: boolean;
  cameraMode?: string;
  realtimePositionsRef?: React.MutableRefObject<Map<string, any>>;
  interpolacionWorkerRef?: React.MutableRefObject<Worker | null>;
  posicionesInterpoladasRef?: React.MutableRefObject<Map<string, { x: number; z: number; direction?: DireccionAvatar; isMoving?: boolean }>>;
  ecsStateRef?: React.MutableRefObject<EstadoEcsEspacio>;
  broadcastMovement?: (x: number, y: number, direction: string, isMoving: boolean, animState?: string, reliable?: boolean) => void;
  moveSpeed?: number;
  runSpeed?: number;
  zonasEmpresa?: ZonaEmpresa[];
  spawnPersonal?: SpawnPersonal;
  onGuardarPosicionPersistente?: (x: number, z: number) => Promise<boolean>;
  onZoneCollision?: (zonaId: string | null) => void;
  usersInCallIds?: Set<string>;
  usersInAudioRangeIds?: Set<string>;
  empresasAutorizadas?: string[];
  mobileInputRef?: React.MutableRefObject<JoystickInput>;
  enableDayNightCycle?: boolean;
  onXPEvent?: (accion: AccionXP, cooldownMs?: number) => void;
  onClickRemoteAvatar?: (userId: string) => void;
  avatarInteractions?: AvatarProps['avatarInteractions'];
  espacioObjetos?: EspacioObjeto[];
  ocupacionesAsientosPorObjetoId?: Map<string, OcupacionAsientoReal>;
  onInteractuarObjeto?: (objeto: EspacioObjeto, asiento: AsientoRuntime3D | null) => void;
  onOcuparAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onLiberarAsiento?: (asiento: AsientoRuntime3D | null) => Promise<boolean>;
  onRefrescarAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onMoverObjeto?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotarObjeto?: (id: string, rotationY: number) => Promise<boolean>;
  onTransformarObjeto?: (id: string, cambios: TransformacionObjetoInput) => Promise<boolean>;
  onEliminarObjeto?: (id: string) => Promise<boolean>;
  onEliminarPlantillaZonaCompleta?: (objeto: EspacioObjeto) => Promise<boolean>;
  onClickZona?: (zona: ZonaEmpresa) => void;
  objetoEnColocacion?: ObjetoPreview3D | null;
  onActualizarObjetoEnColocacion?: (x: number, y: number, z: number) => void;
  onConfirmarObjetoEnColocacion?: () => void;
  plantillaZonaEnColocacion?: PlantillaZonaEnColocacion | null;
  onActualizarPlantillaZonaEnColocacion?: (x: number, z: number) => void;
  onConfirmarPlantillaZonaEnColocacion?: () => void;
  ultimoObjetoColocadoId?: string | null;
  onDrawZoneEnd?: (zona: { ancho: number, alto: number, x: number, z: number, tipoSuelo: FloorType, nivelAnidamiento: number }) => void;
}

const ajustarAGrilla = (valor: number, paso = 0.5) => Math.round(valor / paso) * paso;
const pisoMundoPlano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const obtenerPuntoSueloMundo = (evento: any) => {
  const interseccion = new THREE.Vector3();
  if (evento?.ray?.intersectPlane && evento.ray.intersectPlane(pisoMundoPlano, interseccion)) {
    return interseccion;
  }
  return evento?.point ?? new THREE.Vector3();
};

const obtenerElevacionVisualZona = (nivelAnidamiento: number) => 0.01 + nivelAnidamiento * 0.02;

useGLTF.preload('/models/terrain.glb');

const PreviewZonaMesh: React.FC<{
  rect: { centroX: number; centroZ: number; ancho: number; alto: number };
  floorType: FloorType;
  overlap?: boolean;
  elevacionY?: number;
}> = ({ rect, floorType, overlap = false, elevacionY = 0.02 }) => {
  const pbrMaterialProps = React.useMemo(() => {
    if (overlap) return null;
    return crearPropsMaterialSueloPbr(floorType, rect.ancho, rect.alto, 1);
  }, [floorType, overlap, rect.alto, rect.ancho]);

  React.useEffect(() => {
    return () => {
      pbrMaterialProps?.map?.dispose();
    };
  }, [pbrMaterialProps]);

  // FASE 5: Usar geometrías cacheadas para evitar fluctuación en renderer-metrics
  const geoPreview = React.useMemo(() => geoPlano(rect.ancho, rect.alto), [rect.ancho, rect.alto]);

  return (
    <>
      <mesh
        position={[rect.centroX, elevacionY, rect.centroZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
        geometry={geoPreview}
      >
        {overlap ? (
          <meshBasicMaterial
            color="#ef4444"
            opacity={0.45}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        ) : (
          <meshStandardMaterial
            {...pbrMaterialProps}
            color="#ffffff"
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        )}
      </mesh>
      <mesh
        position={[rect.centroX, elevacionY + 0.008, rect.centroZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={11}
        geometry={geoPreview}
      >
        <meshBasicMaterial
          color={overlap ? '#ef4444' : '#ffffff'}
          opacity={overlap ? 0.5 : 0.28}
          transparent
          wireframe
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
};

const PreviewPlantillaZonaMesh: React.FC<{
  plantilla: PlantillaZonaEnColocacion;
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
}> = ({ plantilla, onPointerDown, onPointerMove, onPointerUp }) => {
  const plantillaData = React.useMemo(() => obtenerPlantillaZona(plantilla.plantillaId), [plantilla.plantillaId]);

  if (!plantillaData) {
    return null;
  }

  return (
    <group onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <mesh
        position={[plantilla.posicionX, 0.1, plantilla.posicionZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={30}
      >
        <planeGeometry args={[plantilla.anchoMetros, plantilla.altoMetros]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        position={[plantilla.posicionX, 0.112, plantilla.posicionZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={31}
      >
        <planeGeometry args={[plantilla.anchoMetros, plantilla.altoMetros]} />
        <meshBasicMaterial color="#c4b5fd" transparent opacity={0.46} wireframe side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {plantillaData.subzonas.map((subzona) => (
        <mesh
          key={`preview-subzona-${subzona.clave}`}
          position={[plantilla.posicionX + subzona.offset_x, 0.115, plantilla.posicionZ + subzona.offset_z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={32}
        >
          <planeGeometry args={[subzona.ancho_metros, subzona.alto_metros]} />
          <meshBasicMaterial color={subzona.color || '#ffffff'} transparent opacity={0.26} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {plantillaData.objetos.map((objeto) => (
        <mesh
          key={`preview-objeto-${objeto.clave}`}
          position={[plantilla.posicionX + objeto.offset_x, 0.18, plantilla.posicionZ + objeto.offset_z]}
          rotation={[0, objeto.rotacion_y || 0, 0]}
          renderOrder={33}
        >
          <boxGeometry args={[0.28, 0.16, 0.28]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      <Text
        position={[plantilla.posicionX, 0.42, plantilla.posicionZ]}
        fontSize={0.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineColor="#000000"
        outlineWidth={0.02}
      >
        {`${plantilla.nombrePlantilla} · arrastra y suelta`}
      </Text>
    </group>
  );
};

export const Scene: React.FC<SceneProps> = ({
  currentUser,
  onlineUsers,
  setPosition,
  theme,
  orbitControlsRef,
  stream,
  remoteStreams,
  showVideoBubbles = true,
  videoIsProcessed = false,
  localMessage,
  remoteMessages,
  localReactions,
  remoteReaction,
  onClickAvatar,
  moveTarget,
  onReachTarget,
  onDoubleClickFloor,
  onTapFloor,
  teleportTarget,
  onTeleportDone,
  showFloorGrid = false,
  showNamesAboveAvatars = true,
  cameraSensitivity = 5,
  invertYAxis = false,
  cameraMode = 'free',
  realtimePositionsRef,
  interpolacionWorkerRef,
  posicionesInterpoladasRef,
  ecsStateRef,
  broadcastMovement,
  moveSpeed,
  runSpeed,
  zonasEmpresa = [],
  spawnPersonal = { spawn_x: null, spawn_z: null },
  onGuardarPosicionPersistente,
  onZoneCollision,
  usersInCallIds,
  usersInAudioRangeIds,
  empresasAutorizadas = [],
  mobileInputRef,
  enableDayNightCycle = false,
  onXPEvent,
  onClickRemoteAvatar,
  avatarInteractions,
  espacioObjetos = [],
  ocupacionesAsientosPorObjetoId = new Map(),
  onInteractuarObjeto,
  onOcuparAsiento,
  onLiberarAsiento,
  onRefrescarAsiento,
  onMoverObjeto,
  onRotarObjeto,
  onTransformarObjeto,
  onEliminarObjeto,
  onEliminarPlantillaZonaCompleta,
  onClickZona,
  objetoEnColocacion,
  onActualizarObjetoEnColocacion,
  onConfirmarObjetoEnColocacion,
  plantillaZonaEnColocacion,
  onActualizarPlantillaZonaEnColocacion,
  onConfirmarPlantillaZonaEnColocacion,
  ultimoObjetoColocadoId,
  onDrawZoneEnd,
}) => {
  const gridColor = theme === 'arcade' ? '#00ff41' : '#6366f1';
  const { camera, gl } = useThree();

  // Fase 3: GPU rendering optimization services (BatchedMesh, TextureAtlas, GPUSkinning)
  const sceneOptimization = useSceneOptimization();
  const frustumRef = useRef(new THREE.Frustum());
  const projectionRef = useRef(new THREE.Matrix4());
  const chairMeshRef = useRef<THREE.InstancedMesh>(null);
  const chairDummy = useMemo(() => new THREE.Object3D(), []);
  const playerColliderRef = useRef<any>(null);
  const playerColliderPositionRef = useRef({ x: (currentUser.x || 400) / 16, z: (currentUser.y || 400) / 16 });
  const zonaColisionRef = useRef<string | null>(null);

  // PR-2: Estado de posicón del jugador a baja frecuencia (150ms) para re-render
  // de React.memo en ObjetoEscena3D y proximidad en ObjetosInstanciados.
  // useRef para no bloquear el render loop en cada frame, solo actualizamos
  // state cada 150ms para controlar cuándo React reconcilia los objetos.
  const [playerPositionState, setPlayerPositionState] = React.useState(
    () => ({ x: (currentUser.x || 400) / 16, z: (currentUser.y || 400) / 16 })
  );
  const lastPlayerPositionUpdateRef = useRef(0);

  // isEditMode y selectedObjectId ya se declaran más abajo junto con isDragging

  // Cargar el modelo del terreno exportado desde Blender
  const { scene: terrainScene } = useGLTF('/models/terrain.glb');
  const zonasActivas = useMemo(
    () => zonasEmpresa.filter((zona) => zona.estado === 'activa'),
    [zonasEmpresa]
  );
  const remoteUsers = useMemo(
    () => onlineUsers.filter((user) => user.id !== currentUser.id),
    [onlineUsers, currentUser.id]
  );
  const asientosPersistentes = useMemo(() => crearAsientosObjetos3D(espacioObjetos), [espacioObjetos]);
  const asientosRuntime = useMemo(() => [...asientosPersistentes], [asientosPersistentes]);
  const asientosPorObjetoId = useMemo(() => {
    return new Map(
      asientosPersistentes
        .filter((asiento) => !!asiento.objetoId)
        .map((asiento) => [asiento.objetoId as string, asiento])
    );
  }, [asientosPersistentes]);
  // Fase 5A: Array estable de objetos builtin para BuiltinWallBatcher (evita .filter() inline en JSX)
  const objetosBuiltin = useMemo(
    () => espacioObjetos.filter(obj => obj.catalogo_id && (!obj.modelo_url || obj.modelo_url.startsWith('builtin:'))),
    [espacioObjetos],
  );
  // Fase 5B: Grupos por modelo_url para StaticObjectBatcher (evita crear Map inline en JSX cada render)
  // Ref: https://react.dev/reference/react/useMemo — recalcula solo cuando espacioObjetos cambia.
  const gruposPorModelo = useMemo(() => {
    const grupos = new Map<string, EspacioObjeto[]>();
    for (const obj of espacioObjetos) {
      if (obj.modelo_url && !obj.modelo_url.startsWith('builtin:') && obj.catalogo_id) {
        const key = obj.modelo_url;
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(obj);
      }
    }
    return grupos;
  }, [espacioObjetos]);
  const cerramientosZona = useMemo(() => crearParedesCerramientosZonas(zonasEmpresa), [zonasEmpresa]);
  const obstaculosMundo = useMemo(
    () => [
      ...crearObstaculosObjetosPersistentes(espacioObjetos),
      ...crearObstaculosObjetosPersistentes(cerramientosZona),
    ],
    [cerramientosZona, espacioObjetos]
  );
  // --- Hito 8: Edit Mode dragging ---
  const isDragging = useStore((s) => s.isDragging);
  const isDrawingZone = useStore((s) => s.isDrawingZone);
  const paintFloorType = useStore((s) => s.paintFloorType);
  const addNotification = useStore((s) => s.addNotification);
  const isEditMode = useStore((s) => s.isEditMode);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const [previewZonaStart, setPreviewZonaStart] = useState<{ x: number, z: number } | null>(null);
  const [previewZonaCurrent, setPreviewZonaCurrent] = useState<{ x: number, z: number } | null>(null);
  const modoEdicionObjeto = useStore((s) => s.modoEdicionObjeto) as ModoEdicionObjeto;
  const objetoSeleccionado = useMemo(
    () => espacioObjetos.find((obj) => obj.id === selectedObjectId) || null,
    [espacioObjetos, selectedObjectId]
  );
  const previewZonaRect = useMemo(() => {
    if (!previewZonaStart || !previewZonaCurrent) return null;

    const minX = Math.min(previewZonaStart.x, previewZonaCurrent.x);
    const maxX = Math.max(previewZonaStart.x, previewZonaCurrent.x);
    const minZ = Math.min(previewZonaStart.z, previewZonaCurrent.z);
    const maxZ = Math.max(previewZonaStart.z, previewZonaCurrent.z);
    const ancho = Math.abs(maxX - minX);
    const alto = Math.abs(maxZ - minZ);

    return {
      ancho,
      alto,
      centroX: minX + ancho / 2,
      centroZ: minZ + alto / 2,
    };
  }, [previewZonaStart, previewZonaCurrent]);

  // Detección de solapamiento entre subsuelos (estilo Gather: cada celda un solo dueño)
  const zonasExistentesMundo = useMemo<RectanguloZona[]>(
    () => zonasEmpresa.filter((z) => z.estado === 'activa').map(zonaDbAMundo),
    [zonasEmpresa]
  );
  const previewOverlap = useMemo(() => {
    if (!previewZonaStart || !previewZonaCurrent) return false;
    const minX = Math.min(previewZonaStart.x, previewZonaCurrent.x);
    const maxX = Math.max(previewZonaStart.x, previewZonaCurrent.x);
    const minZ = Math.min(previewZonaStart.z, previewZonaCurrent.z);
    const maxZ = Math.max(previewZonaStart.z, previewZonaCurrent.z);
    const ancho = maxX - minX;
    const alto = maxZ - minZ;
    if (ancho < 0.5 || alto < 0.5) return false;
    const nueva: RectanguloZona = { x: minX + ancho / 2, z: minZ + alto / 2, ancho, alto };
    return detectarSolapamientoSubzona(nueva, zonasExistentesMundo);
  }, [previewZonaStart, previewZonaCurrent, zonasExistentesMundo]);
  const previewNivelAnidamiento = useMemo(() => {
    if (!previewZonaRect) return 0;
    return calcularNivelAnidamientoRectangulo(
      { x: previewZonaRect.centroX, z: previewZonaRect.centroZ, ancho: previewZonaRect.ancho, alto: previewZonaRect.alto },
      zonasExistentesMundo
    );
  }, [previewZonaRect, zonasExistentesMundo]);

  const zonaPlantillaObjetivo = useMemo(() => {
    if (!plantillaZonaEnColocacion) return null;
    return zonasEmpresa.find((zona) => zona.id === plantillaZonaEnColocacion.zonaId) || null;
  }, [plantillaZonaEnColocacion, zonasEmpresa]);

  const [isDraggingPlantillaZona, setIsDraggingPlantillaZona] = useState(false);
  const plantillaZonaPointerIdRef = useRef<number | null>(null);

  const actualizarPlantillaZonaRestringida = useCallback((point: THREE.Vector3 | null) => {
    if (!point || !plantillaZonaEnColocacion || !zonaPlantillaObjetivo || !onActualizarPlantillaZonaEnColocacion) {
      return;
    }

    const x = ajustarAGrilla(point.x);
    const z = ajustarAGrilla(point.z);
    const centroZonaX = Number(zonaPlantillaObjetivo.posicion_x) / 16;
    const centroZonaZ = Number(zonaPlantillaObjetivo.posicion_y) / 16;
    const anchoZona = Math.max(Number(zonaPlantillaObjetivo.ancho) / 16, plantillaZonaEnColocacion.anchoMetros);
    const altoZona = Math.max(Number(zonaPlantillaObjetivo.alto) / 16, plantillaZonaEnColocacion.altoMetros);
    const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
    const minX = centroZonaX - Math.max((anchoZona - plantillaZonaEnColocacion.anchoMetros) / 2, 0);
    const maxX = centroZonaX + Math.max((anchoZona - plantillaZonaEnColocacion.anchoMetros) / 2, 0);
    const minZ = centroZonaZ - Math.max((altoZona - plantillaZonaEnColocacion.altoMetros) / 2, 0);
    const maxZ = centroZonaZ + Math.max((altoZona - plantillaZonaEnColocacion.altoMetros) / 2, 0);

    onActualizarPlantillaZonaEnColocacion(clamp(x, minX, maxX), clamp(z, minZ, maxZ));
  }, [onActualizarPlantillaZonaEnColocacion, plantillaZonaEnColocacion, zonaPlantillaObjetivo]);

  const finalizarDragPlantillaZona = useCallback((confirmar: boolean) => {
    if (!plantillaZonaEnColocacion) {
      return;
    }

    setIsDraggingPlantillaZona(false);
    if (plantillaZonaPointerIdRef.current !== null) {
      try { gl.domElement.releasePointerCapture(plantillaZonaPointerIdRef.current); } catch {}
      plantillaZonaPointerIdRef.current = null;
    }

    if (confirmar) {
      onConfirmarPlantillaZonaEnColocacion?.();
    }
  }, [gl, onConfirmarPlantillaZonaEnColocacion, plantillaZonaEnColocacion]);

  const handlePlantillaPointerDown = useCallback((e: any) => {
    if (!plantillaZonaEnColocacion) {
      return;
    }

    e.stopPropagation();
    if (e.nativeEvent?.pointerId !== undefined) {
      plantillaZonaPointerIdRef.current = e.nativeEvent.pointerId;
      try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
    }
    setIsDraggingPlantillaZona(true);
    actualizarPlantillaZonaRestringida(obtenerPuntoSueloMundo(e));
  }, [actualizarPlantillaZonaRestringida, gl, plantillaZonaEnColocacion]);

  const handlePlantillaPointerUp = useCallback((e: any) => {
    if (!isDraggingPlantillaZona || !plantillaZonaEnColocacion) {
      return;
    }

    e.stopPropagation();
    actualizarPlantillaZonaRestringida(obtenerPuntoSueloMundo(e));
    finalizarDragPlantillaZona(true);
  }, [actualizarPlantillaZonaRestringida, finalizarDragPlantillaZona, isDraggingPlantillaZona, plantillaZonaEnColocacion]);

  const handlePointerMove = useCallback((e: any) => {
    const point = obtenerPuntoSueloMundo(e);
    const x = ajustarAGrilla(point.x);
    const z = ajustarAGrilla(point.z);

    if (isDrawingZone && previewZonaStart) {
      setPreviewZonaCurrent({ x, z });
      return;
    }

    if (objetoEnColocacion && onActualizarObjetoEnColocacion) {
      onActualizarObjetoEnColocacion(x, objetoEnColocacion.posicion_y, z);
      return;
    }

    if (plantillaZonaEnColocacion && isDraggingPlantillaZona) {
      actualizarPlantillaZonaRestringida(point);
      return;
    }

    if (!isDragging || !selectedObjectId || !objetoSeleccionado) {
      return;
    }

    if (modoEdicionObjeto === 'mover' && onMoverObjeto) {
      onMoverObjeto(selectedObjectId, x, objetoSeleccionado.posicion_y ?? 0.4, z);
      return;
    }

    if (modoEdicionObjeto === 'rotar' && onTransformarObjeto) {
      const deltaX = x - objetoSeleccionado.posicion_x;
      const deltaZ = z - objetoSeleccionado.posicion_z;
      if (Math.abs(deltaX) < 0.05 && Math.abs(deltaZ) < 0.05) {
        return;
      }
      const angulo = Math.atan2(deltaX, deltaZ);
      onTransformarObjeto(selectedObjectId, { rotacion_y: angulo });
      return;
    }

    if (modoEdicionObjeto === 'escalar' && onTransformarObjeto) {
      const deltaX = x - objetoSeleccionado.posicion_x;
      const deltaZ = z - objetoSeleccionado.posicion_z;
      const distancia = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
      const baseEscala = Math.max(Number(objetoSeleccionado.catalogo?.ancho) || 1, Number(objetoSeleccionado.catalogo?.profundidad) || 1, 0.75);
      const siguienteEscala = THREE.MathUtils.clamp(Number((distancia / baseEscala).toFixed(2)), 0.35, 4);
      onTransformarObjeto(selectedObjectId, {
        escala_x: siguienteEscala,
        escala_y: siguienteEscala,
        escala_z: siguienteEscala,
      });
    }
  }, [actualizarPlantillaZonaRestringida, isDragging, isDraggingPlantillaZona, isDrawingZone, previewZonaStart, selectedObjectId, onMoverObjeto, objetoSeleccionado, objetoEnColocacion, onActualizarObjetoEnColocacion, modoEdicionObjeto, onTransformarObjeto, plantillaZonaEnColocacion]);

  const handleFloorClick = useCallback((e: any) => {
    e.stopPropagation();
    if (isDrawingZone) return;
    if (objetoEnColocacion && onConfirmarObjetoEnColocacion) {
      onConfirmarObjetoEnColocacion();
      return;
    }
  }, [isDrawingZone, objetoEnColocacion, onConfirmarObjetoEnColocacion]);

  const handleFloorDoubleClick = useCallback((e: any) => {
    e.stopPropagation();
    if (isDrawingZone) return;
    if (objetoEnColocacion || plantillaZonaEnColocacion) {
      return;
    }
    if (onDoubleClickFloor) onDoubleClickFloor(obtenerPuntoSueloMundo(e));
  }, [isDrawingZone, objetoEnColocacion, onDoubleClickFloor, plantillaZonaEnColocacion]);

  const handleZoneDrawStart = useCallback((e: any) => {
    if (!isDrawingZone) return;
    e.stopPropagation();
    if (e.nativeEvent?.pointerId !== undefined) {
      try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
    }
    const point = obtenerPuntoSueloMundo(e);
    const x = ajustarAGrilla(point.x);
    const z = ajustarAGrilla(point.z);
    setPreviewZonaStart({ x, z });
    setPreviewZonaCurrent({ x, z });
  }, [isDrawingZone, gl]);

  const handleZoneDrawEnd = useCallback((e: any) => {
    if (!isDrawingZone || !previewZonaStart) return;
    e.stopPropagation();
    const point = obtenerPuntoSueloMundo(e);
    const endX = ajustarAGrilla(point.x);
    const endZ = ajustarAGrilla(point.z);
    const minX = Math.min(previewZonaStart.x, endX);
    const maxX = Math.max(previewZonaStart.x, endX);
    const minZ = Math.min(previewZonaStart.z, endZ);
    const maxZ = Math.max(previewZonaStart.z, endZ);
    const ancho = Math.abs(maxX - minX);
    const alto = Math.abs(maxZ - minZ);

    if (ancho > 1.5 && alto > 1.5) {
      const cx = minX + ancho / 2;
      const cz = minZ + alto / 2;
      const nueva: RectanguloZona = { x: cx, z: cz, ancho, alto };
      if (detectarSolapamientoSubzona(nueva, zonasExistentesMundo)) {
        log.warn('Zone Subsuelo bloqueado: solapa con otra zona existente');
        addNotification('No puedes solapar este subsuelo con otro existente. Puedes anidarlo como decoración, pero sin cruces parciales.', 'info');
      } else {
        onDrawZoneEnd?.({ ancho, alto, x: cx, z: cz, tipoSuelo: paintFloorType, nivelAnidamiento: calcularNivelAnidamientoRectangulo(nueva, zonasExistentesMundo) });
      }
    }

    setPreviewZonaStart(null);
    setPreviewZonaCurrent(null);
  }, [addNotification, isDrawingZone, onDrawZoneEnd, previewZonaStart, paintFloorType, zonasExistentesMundo]);

  useEffect(() => {
    if (!plantillaZonaEnColocacion && isDraggingPlantillaZona) {
      setIsDraggingPlantillaZona(false);
      plantillaZonaPointerIdRef.current = null;
    }
  }, [isDraggingPlantillaZona, plantillaZonaEnColocacion]);

  useEffect(() => {
    if (!isDraggingPlantillaZona) {
      return;
    }

    const handleWindowPointerUp = () => {
      finalizarDragPlantillaZona(true);
    };

    const handleWindowPointerCancel = () => {
      finalizarDragPlantillaZona(false);
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [finalizarDragPlantillaZona, isDraggingPlantillaZona]);

  useFrame(() => {
    projectionRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumRef.current.setFromProjectionMatrix(projectionRef.current);
  });

  useFrame(() => {
    if (!playerColliderRef.current) return;
    playerColliderRef.current.setNextKinematicTranslation({
      x: playerColliderPositionRef.current.x,
      y: 0,
      z: playerColliderPositionRef.current.z,
    });
  });

  const handlePlayerPositionUpdate = useCallback((x: number, z: number) => {
    // Siempre actualizar el ref (usado en física/colisiones, sin re-render)
    playerColliderPositionRef.current = { x, z };

    // PR-2: Actualizar state a baja frecuencia (150ms) para re-render controlado.
    // Esto activa el useMemo de proximidad en ObjetoEscena3D y actualiza
    // las matrices de instancia en ObjetosInstanciados sin saturar React a 60fps.
    const now = performance.now();
    if (now - lastPlayerPositionUpdateRef.current > 150) {
      lastPlayerPositionUpdateRef.current = now;
      setPlayerPositionState({ x, z });
    }
  }, []);


  const handleZoneEnter = useCallback((payload: any) => {
    const zonaId = payload?.other?.rigidBodyObject?.userData?.zonaId ?? payload?.other?.colliderObject?.userData?.zonaId;
    if (!zonaId || zonaColisionRef.current === zonaId) return;
    zonaColisionRef.current = zonaId;
    onZoneCollision?.(zonaId);
  }, [onZoneCollision]);

  const handleZoneExit = useCallback((payload: any) => {
    const zonaId = payload?.other?.rigidBodyObject?.userData?.zonaId ?? payload?.other?.colliderObject?.userData?.zonaId;
    if (!zonaId || zonaColisionRef.current !== zonaId) return;
    zonaColisionRef.current = null;
    onZoneCollision?.(null);
  }, [onZoneCollision]);

  useEffect(() => {
    // Si necesitas lógica para mallas instanciadas basadas en asientos dinámicos, agragarla aquí.
  }, []);

  return (
    <>
      {/* Iluminación: DayNightCycle dinámico o luces estáticas */}
      {enableDayNightCycle ? (
        <DayNightCycle enabled={true} />
      ) : (
        <>
          <ambientLight intensity={0.7} />
          <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
        </>
      )}

      {/* OrbitControls (drei) — Restaurado de la v2.2!
          - OrbitControls NO retrasa la cámara, muta la posición síncronamente en el render pass.
          - Se soluciona el lag root que causaba CameraControls de yomotsu. */}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        minDistance={1.1}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minPolarAngle={isDrawingZone ? 0.05 : Math.PI / 6}
        enablePan={cameraMode === 'free' && !isDraggingPlantillaZona}
        enableRotate={cameraMode !== 'fixed' && !isDrawingZone && !isDraggingPlantillaZona}
        rotateSpeed={cameraSensitivity / 10}
        zoomSpeed={0.8}
        enableDamping={true}
        dampingFactor={0.05}
      />

      {showFloorGrid && (
        <Grid
          args={[WORLD_SIZE * 2, WORLD_SIZE * 2]}
          position={[WORLD_SIZE / 2, 0, WORLD_SIZE / 2]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={gridColor}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={gridColor}
          fadeDistance={100}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Piso importado desde Blender (Estilo Riot Games: Malla estática pura con texturas) */}
      <group position={[-25, -0.02, 75]}>
        <primitive
          object={terrainScene}
          receiveShadow
          onClick={handleFloorClick}
          onDoubleClick={handleFloorDoubleClick}
          onPointerDown={plantillaZonaEnColocacion ? handlePlantillaPointerDown : undefined}
          onPointerUp={plantillaZonaEnColocacion ? handlePlantillaPointerUp : undefined}
          onPointerMove={handlePointerMove}
        />
      </group>

      {/* Suelo base invisible para Raycast — FASE 5: geometría cacheada (no crea nueva en cada mount) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        geometry={geoSueloRaycast()}
        onClick={handleFloorClick}
        onDoubleClick={handleFloorDoubleClick}
        onPointerDown={plantillaZonaEnColocacion ? handlePlantillaPointerDown : handleZoneDrawStart}
        onPointerUp={plantillaZonaEnColocacion ? handlePlantillaPointerUp : handleZoneDrawEnd}
        onPointerMove={handlePointerMove}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Plano Atrapa-Eventos para Modo Construcción / Dibujo — FASE 5: geometría cacheada */}
      {(objetoEnColocacion || plantillaZonaEnColocacion || isDrawingZone || isDragging) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.5, 0]}
          geometry={geoSueloRaycast()}
          onClick={handleFloorClick}
          onPointerDown={plantillaZonaEnColocacion ? handlePlantillaPointerDown : handleZoneDrawStart}
          onPointerUp={plantillaZonaEnColocacion ? handlePlantillaPointerUp : handleZoneDrawEnd}
          onPointerMove={handlePointerMove}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Zonas por empresa */}
      {zonasEmpresa.filter((zona) => zona.estado === 'activa').map((zona) => {
        const anchoZona = Math.max(1, Number(zona.ancho) / 16);
        const altoZona = Math.max(1, Number(zona.alto) / 16);
        const posicionX = Number(zona.posicion_x) / 16;
        const posicionZ = Number(zona.posicion_y) / 16;
        const colorZona = zona.color || '#64748b';
        const esZonaComun = !!zona.es_comun;
        const esZonaPropia = !!zona.empresa_id && zona.empresa_id === currentUser.empresa_id;
        const variante = esZonaComun ? 'comun' : esZonaPropia ? 'propia' : 'ajena';
        const nombreZona = zona.nombre_zona || (esZonaComun ? 'Zona común' : zona.empresa?.nombre) || undefined;
        const opacidad = variante === 'propia' ? 0.45 : variante === 'comun' ? 0.2 : 0.28;
        const rectZona: RectanguloZona = { x: posicionX, z: posicionZ, ancho: anchoZona, alto: altoZona };
        const nivelAnidamiento = calcularNivelAnidamientoRectangulo(rectZona, zonasExistentesMundo);
        const tipoSubsuelo = resolverTipoSubsueloZona(zona.configuracion, nivelAnidamiento >= 2 ? 'decorativo' : 'organizacional');
        const elevacionZona = obtenerElevacionVisualZona(nivelAnidamiento);

        return (
          <ZonaEmpresa3D
            key={zona.id}
            posicion={[posicionX, elevacionZona, posicionZ]}
            ancho={anchoZona}
            alto={altoZona}
            color={colorZona}
            nombre={nombreZona}
            logoUrl={zona.empresa?.logo_url ?? null}
            esZonaComun={esZonaComun}
            variante={variante}
            mostrarEtiqueta={tipoSubsuelo !== 'decorativo'}
            opacidad={opacidad}
            tipoSuelo={zona.tipo_suelo}
            onClick={(e) => {
              if (objetoEnColocacion || plantillaZonaEnColocacion || isDrawingZone) {
                handleFloorClick(e);
              } else if (onClickZona) {
                onClickZona(zona);
              }
            }}
            onPointerDown={plantillaZonaEnColocacion ? handlePlantillaPointerDown : handleZoneDrawStart}
            onPointerUp={plantillaZonaEnColocacion ? handlePlantillaPointerUp : handleZoneDrawEnd}
            onPointerMove={handlePointerMove}
          />
        );
      })}

      {cerramientosZona.map((objeto) => (
        <CerramientoZona3D key={objeto.id} objeto={objeto} />
      ))}

      {/* Renderizado temporal de la zona siendo dibujada — Preview con textura real del material */}
      {isDrawingZone && previewZonaRect && (
        <>
          <PreviewZonaMesh rect={previewZonaRect} floorType={paintFloorType} overlap={previewOverlap} elevacionY={obtenerElevacionVisualZona(previewNivelAnidamiento)} />
          {previewZonaRect.ancho > 0.5 && previewZonaRect.alto > 0.5 && (
            <Text
              position={[previewZonaRect.centroX, obtenerElevacionVisualZona(previewNivelAnidamiento) + 0.2, previewZonaRect.centroZ]}
              fontSize={previewOverlap ? 0.22 : 0.26}
              color={previewOverlap ? '#fca5a5' : '#ffffff'}
              anchorX="center"
              anchorY="middle"
              outlineColor="#000000"
              outlineWidth={0.025}
            >
              {previewOverlap
                ? 'Zona solapada'
                : `${previewZonaRect.ancho.toFixed(1)}m × ${previewZonaRect.alto.toFixed(1)}m`}
            </Text>
          )}
        </>
      )}

      {plantillaZonaEnColocacion && (
        <PreviewPlantillaZonaMesh
          plantilla={plantillaZonaEnColocacion}
          onPointerDown={handlePlantillaPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePlantillaPointerUp}
        />
      )}

      <Physics gravity={[0, 0, 0]}>
        <RigidBody
          ref={playerColliderRef}
          type="kinematicPosition"
          colliders={false}
          onIntersectionEnter={handleZoneEnter}
          onIntersectionExit={handleZoneExit}
        >
          <CuboidCollider args={[0.45, 1, 0.45]} />
        </RigidBody>
        {zonasActivas.map((zona) => {
          const anchoZona = Math.max(1, Number(zona.ancho) / 16);
          const altoZona = Math.max(1, Number(zona.alto) / 16);
          const posicionX = Number(zona.posicion_x) / 16;
          const posicionZ = Number(zona.posicion_y) / 16;
          return (
            <RigidBody key={`zona-collider-${zona.id}`} type="fixed" colliders={false} userData={{ zonaId: zona.id }}>
              <CuboidCollider
                args={[anchoZona / 2, 1, altoZona / 2]}
                position={[posicionX, 0, posicionZ]}
                sensor
              />
            </RigidBody>
          );
        })}

        {cerramientosZona.map((obj) => {
          const obstaculosObjeto = crearObstaculosFisicosObjetoPersistente(obj);

          return (
            <RigidBody
              key={`cerramiento-zona-${obj.id}`}
              type="fixed"
              colliders={false}
            >
              {obstaculosObjeto.map((obstaculo) => (
                <CuboidCollider
                  key={obstaculo.id}
                  position={[
                    obstaculo.posicion.x,
                    obstaculo.posicion.y,
                    obstaculo.posicion.z,
                  ]}
                  rotation={[0, obstaculo.rotacion, 0]}
                  args={[obstaculo.semiextensiones.x, obstaculo.semiextensiones.y, obstaculo.semiextensiones.z]}
                />
              ))}
            </RigidBody>
          );
        })}

        {/* PR-2: Objetos persistentes DENTRO de Physics — SOLO colisiones físicas */}
        {/* El renderizado visual se hace FUERA de Physics con ObjetosInstanciados */}
        {espacioObjetos.map((obj) => {
          const obstaculosObjeto = crearObstaculosFisicosObjetoPersistente(obj);
          if (obstaculosObjeto.length === 0) return null;
          return (
            <RigidBody
              key={`col-${obj.id}`}
              type="fixed"
              colliders={false}
            >
              {obstaculosObjeto.map((obstaculo) => (
                <CuboidCollider
                  key={obstaculo.id}
                  position={[obstaculo.posicion.x, obstaculo.posicion.y, obstaculo.posicion.z]}
                  rotation={[0, obstaculo.rotacion, 0]}
                  args={[obstaculo.semiextensiones.x, obstaculo.semiextensiones.y, obstaculo.semiextensiones.z]}
                />
              ))}
            </RigidBody>
          );
        })}
      </Physics>

      {/* Fase 3: Static objects — BatchedMesh (non-edit) or InstancedMesh (edit mode) */}
      {/* BatchedMesh collapses GLTF objects sharing same material into 1 draw call. */}
      {/* Builtin objects (walls, procedural geometry) always render individually.   */}
      {/* Edit mode needs InstancedMesh fallback for gizmos/drag interactivity.      */}
      {!isEditMode && sceneOptimization.isReady ? (
        <>
          {/* GLTF catalog objects → BatchedMesh for minimal draw calls */}
          <StaticObjectBatcher
            gruposPorModelo={gruposPorModelo}
            services={sceneOptimization}
            playerPosition={playerPositionState}
            onInteractuar={onInteractuarObjeto
              ? (obj) => onInteractuarObjeto(obj, asientosPorObjetoId.get(obj.id) || null)
              : undefined
            }
          />
          {/* Fase 5A: Builtin walls merged into ~3-5 draw calls (was ~330 individual) */}
          <BuiltinWallBatcher objetos={objetosBuiltin} />
        </>
      ) : (
        <ObjetosInstanciados
          espacioObjetos={espacioObjetos.filter(obj => !!obj.catalogo_id)}
          playerPosition={playerPositionState}
          isEditMode={isEditMode}
          selectedObjectId={selectedObjectId}
          ultimoObjetoColocadoId={ultimoObjetoColocadoId}
          onInteractuar={onInteractuarObjeto
            ? (obj) => onInteractuarObjeto(obj, asientosPorObjetoId.get(obj.id) || null)
            : undefined
          }
          onMover={onMoverObjeto}
          onRotar={onRotarObjeto}
          onEliminar={onEliminarObjeto}
          onEliminarPlantillaCompleta={onEliminarPlantillaZonaCompleta}
        />
      )}

      {/* Legacy Escritorio3D path removed — all objects come from catalog (catalogo_id) */}

      {/* Jugador actual */}
      <Player
        currentUser={currentUser}
        setPosition={setPosition}
        stream={stream}
        showVideoBubble={showVideoBubbles && !usersInCallIds?.size} // Bug 1 Fix: Ocultar bubble local si hay llamada activa (HUD visible)
        videoIsProcessed={videoIsProcessed}
        message={localMessage}
        reactions={localReactions}
        onClickAvatar={onClickAvatar}
        moveTarget={moveTarget}
        onReachTarget={onReachTarget}
        teleportTarget={teleportTarget}
        onTeleportDone={onTeleportDone}
        broadcastMovement={broadcastMovement}
        moveSpeed={moveSpeed}
        runSpeed={runSpeed}
        ecsStateRef={ecsStateRef}
        onPositionUpdate={handlePlayerPositionUpdate}
        zonasEmpresa={zonasEmpresa}
        spawnPersonal={spawnPersonal}
        onGuardarPosicionPersistente={onGuardarPosicionPersistente}
        empresasAutorizadas={empresasAutorizadas}
        usersInCallIds={usersInCallIds}
        mobileInputRef={mobileInputRef}
        onXPEvent={onXPEvent}
        espacioObjetos={espacioObjetos}
        asientos={asientosRuntime}
        ocupacionesAsientosPorObjetoId={ocupacionesAsientosPorObjetoId}
        onOcuparAsiento={onOcuparAsiento}
        onLiberarAsiento={onLiberarAsiento}
        onRefrescarAsiento={onRefrescarAsiento}
        obstaculos={obstaculosMundo}
      />
      <CameraFollow controlsRef={orbitControlsRef} zonasEmpresa={zonasEmpresa} empresaId={currentUser.empresa_id} espacioObjetos={espacioObjetos} usersInCallIds={usersInCallIds} usersInAudioRangeIds={usersInAudioRangeIds} />

      {/* Usuarios remotos */}
      <RemoteUsers users={remoteUsers} remoteStreams={remoteStreams} showVideoBubble={showVideoBubbles} usersInCallIds={usersInCallIds} usersInAudioRangeIds={usersInAudioRangeIds} remoteMessages={remoteMessages} remoteReaction={remoteReaction ?? null} realtimePositionsRef={realtimePositionsRef} interpolacionWorkerRef={interpolacionWorkerRef} posicionesInterpoladasRef={posicionesInterpoladasRef} ecsStateRef={ecsStateRef} zonasEmpresa={zonasEmpresa} frustumRef={frustumRef} onClickRemoteAvatar={onClickRemoteAvatar} avatarInteractions={avatarInteractions} />

      {/* Objetos interactivos — ocultos hasta tener modelos GLB reales
      <ObjetosInteractivos
        playerPosition={playerColliderPositionRef.current}
        onInteract={(tipo) => {
          if (tipo === 'coffee') {
            if (currentUser?.id) {}
          }
        }}
      />
      */}

      {/* Partículas clima — ocultas hasta ajuste visual
      <ParticulasClima
        centro={playerColliderPositionRef.current}
      />
      */}
    </>
  );
};

