'use client';
import React, { useRef, useEffect, useMemo, Suspense, useState, useCallback, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Grid, Text, Html, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { logger } from '@/core/infrastructure/observability/logger';
import type { AccionXP } from '@/core/infrastructure/adapters/gamificacion';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '@/modules/avatar3d/presentation/GLTFAvatar';
import { useAvatarControls } from '@/modules/avatar3d/presentation/useAvatarControls';
import type { AnimationState } from '@/modules/avatar3d/presentation/shared';
import { VideoWithBackground } from '@/modules/realtime-room/presentation/VideoWithBackground';
import { GhostAvatar } from '@/modules/space3d/presentation/world/GhostAvatar';
import { CerramientoZona3D } from '@/modules/space3d/presentation/world/CerramientoZona3D';
import { ZonaEmpresa as ZonaEmpresa3D } from '@/modules/space3d/presentation/world/ZonaEmpresa';
import { FantasmaColocacion3D, ObjetoEscena3D } from '@/modules/space3d/presentation/world/ObjetoEscena3D';
import { ObjetosInstanciados } from '@/modules/space3d/presentation/world/ObjetosInstanciados';
import { StaticObjectBatcher } from '@/modules/space3d/presentation/world/StaticObjectBatcher';
import { BuiltinWallBatcher } from '@/modules/space3d/presentation/world/BuiltinWallBatcher';
import { useSceneOptimization } from '@/modules/space3d/presentation/hooks/useSceneOptimization';
import { useOrbitDprRegression } from '@/modules/space3d/presentation/hooks/useOrbitDprRegression';
import { useSceneReadySignal } from '@/modules/space3d/presentation/hooks/useSceneReadySignal';
import { useZoneDrawingPreview } from '@/modules/space3d/presentation/hooks/useZoneDrawingPreview';
import { useZoneCollisionTracker } from '@/modules/space3d/presentation/hooks/useZoneCollisionTracker';
import { useAreasEscritorio } from '@/modules/space3d/presentation/hooks/useAreasEscritorio';
import { DeskAreasLayer } from '@/modules/space3d/presentation/world/DeskAreasLayer';
import { DeskPlacerPreview } from '@/modules/space3d/presentation/world/DeskPlacerPreview';
import { SueloPrincipal3D } from '@/modules/space3d/presentation/world/SueloPrincipal3D';
import { PisosDecorativos3D } from '@/modules/space3d/presentation/world/PisosDecorativos3D';
import { PaintFloorMode3D } from '@/modules/space3d/presentation/world/PaintFloorMode3D';
import { PaintFloorCameraPan } from '@/modules/space3d/presentation/world/PaintFloorCameraPan';
import { PRESET_DESK_STANDARD } from '@/src/core/domain/entities/espacio3d/PresetDesk';
import {
  ajustarAGrilla,
  obtenerPuntoSueloMundo,
  rayoEventoADominio,
  obtenerElevacionVisualZona,
} from './sceneHelpers';
import type { EspacioObjeto, SpawnPersonal, TransformacionObjetoInput } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import type { OcupacionAsientoReal } from '@/modules/space3d/presentation/hooks/useOcupacionAsientos';
import type { ObjetoPreview3D } from '@/types/objetos3d';
import { DayNightCycle } from '@/modules/space3d/presentation/world/DayNightCycle';
import { ObjetosInteractivos } from '@/modules/space3d/presentation/world/ObjetosInteractivos';
import { ParticulasClima } from '@/modules/space3d/presentation/world/ParticulasClima';
import { SkyDome } from '@/modules/space3d/presentation/world/SkyDome';
import { DistantSkyline } from '@/modules/space3d/presentation/world/DistantSkyline';
import { DEFAULT_SCENE_POLICY, resolveSkyColors, type ScenePolicy } from '@/src/core/domain/entities/espacio3d/ScenePolicy';
import { generarParedesPerimetrales } from '@/src/core/application/usecases/GenerarParedesPerimetralesUseCase';
import { ColocarObjetoUseCase } from '@/src/core/application/usecases/ColocarObjetoUseCase';
import type { ObjetoColocable, Rayo } from '@/src/core/domain/entities/espacio3d/PlacementPolicy';
import { useConfiguracionPerimetro } from '@/modules/space3d/presentation/hooks/useConfiguracionPerimetro';
import { useTerreno } from '@/modules/space3d/presentation/hooks/useTerreno';
import { Terrain3D } from './Terrain3D';
import { ShaderPrecompile } from './ShaderPrecompile';
import { EmoteSync, useSyncEffects } from '@/modules/space3d/presentation/world/EmoteSync';
import { hapticFeedback, isMobileDevice } from '@/core/infrastructure/platform/mobileDetect';
import type { CameraMode } from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';
import { useNavigation } from '@/modules/space3d/presentation/hooks/useNavigation';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import type { ModoEdicionObjeto, PlantillaZonaEnColocacion } from '@/modules/_state/slices';
import { FloorType, calcularNivelAnidamientoRectangulo, detectarSolapamientoSubzona, zonaDbAMundo, type RectanguloZona, resolverTipoSubsueloZona } from '@/src/core/domain/entities';
import { useFloorMaterial } from '@/modules/space3d/presentation/hooks/useFloorMaterial';
import {
  getScaledBbox,
  getScaledBboxVersion,
  subscribeToScaledBbox,
} from '@/core/infrastructure/r3f/rendering/scaledBboxRegistry';
import { SceneEnvironment } from './SceneEnvironment';
import { SceneCamera } from './SceneCamera';
import { SceneZonas } from './SceneZonas';
// FASE 5: Geometry cache para eliminar fluctuación 312↔567 en renderer-metrics
import { geoPlano, geoSueloRaycast, geoCajaUnitaria } from '@/core/infrastructure/r3f/rendering/geometriaCache';
import { type CameraSettings } from '@/modules/realtime-room';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/core/infrastructure/r3f/ecs/espacioEcs';
import { type JoystickInput } from '@/modules/space3d/presentation/world/MobileJoystick';
import { getSettingsSection } from '@/core/infrastructure/userSettings/userSettings';
import {
  AvatarLodLevel, DireccionAvatar, themeColors, themeSkyColors,
  MOVE_SPEED, RUN_SPEED, WORLD_SIZE, TELEPORT_DISTANCE,
  CHAIR_SIT_RADIUS, CHAIR_POSITIONS_3D, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE,
  IconPrivacy, IconExpand,
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
  /** LocalVideoTrack del usuario actual con processor aplicado (blur/virtual bg). */
  localVideoTrack?: import('livekit-client').LocalVideoTrack | null;
  /** Efecto activo — reenviado al Player para la burbuja local. */
  backgroundEffect?: import('@/src/core/domain/ports/IVideoTrackProcessor').EffectType;
  /** Issue 49120587 — si está seteado, la cámara sigue al avatar de ese userId. */
  followTargetId?: string | null;
  /** Resuelve la posición actual del target de follow desde el ECS. */
  getFollowTargetPosition?: (userId: string) => { x: number; z: number } | null;
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
  cameraMode?: CameraMode;
  /** OTS shoulder offset (tier 2 opcional). Default 'center' = sin offset. */
  cameraShoulderMode?: 'center' | 'left' | 'right';
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
  /**
   * Callback fired when the scene is truly ready for display.
   *
   * In normal mode: fires AFTER sceneOptimization.isReady=true AND one rAF frame,
   * guaranteeing that StaticObjectBatcher/BuiltinWallBatcher have rendered their
   * merged geometries into the scene graph.
   *
   * In edit mode: fires AFTER one rAF frame (batchers not used, ObjetosInstanciados
   * renders immediately).
   *
   * This replaces the old SceneReadyProbe which fired on mount (before batchers existed),
   * causing a race condition where the loading screen hid ~2s before merged geometry appeared.
   *
   * @see VirtualSpace3D — gates loading screen visibility on this callback
   */
  onSceneReady?: () => void;
  /**
   * Override de la política de escena (fog near/far, skydome radius/segments,
   * derivación HSL del topColor). Si no se pasa, se usa DEFAULT_SCENE_POLICY,
   * que preserva el comportamiento histórico (60/220, 500/16/8, +0.08/+0.14 HSL).
   */
  scenePolicy?: ScenePolicy;
  /**
   * Movement regression (Sketchfab pattern, recomendado por R3F docs).
   * Cuando estos 3 están definidos, OrbitControls baja temporalmente el DPR
   * a `minDpr` al iniciar orbit y lo restaura con debounce al soltar.
   * Beneficio: pan de cámara más fluido en hardware bajo. Solo se activa
   * cuando el usuario eligió graphicsQuality='auto' (ver VirtualSpace3D).
   * Ref: https://r3f.docs.pmnd.rs/advanced/scaling-performance
   */
  adaptiveDpr?: number;
  minDpr?: number;
  setAdaptiveDpr?: React.Dispatch<React.SetStateAction<number>>;
  /**
   * Config adaptativa por GPU tier. Gatea features visuales Tier 2:
   * drei `<Sky>`, `<Environment>` IBL, tone mapping ACES, FOV dinámico.
   * Ref doc: plan-tier-2-visual-upgrade-2026-04-20.
   */
  gpuRenderConfig?: import('@/core/infrastructure/r3f/gpuCapabilities').AdaptiveRenderConfig;
}

// Helpers compartidos (ajustarAGrilla, obtenerPuntoSueloMundo, rayoEventoADominio,
// obtenerElevacionVisualZona, pisoMundoPlano) extraídos a ./sceneHelpers.ts
// (ITEM 15 P1-07) — re-utilizados desde hooks especializados.

// Use case stateless — singleton module-level evita recrearlo por render.
// El Presentation se limita a construir el input y consumir el output.
const colocarObjetoUC = new ColocarObjetoUseCase();

useGLTF.preload('/models/terrain.glb');

const PreviewZonaMesh: React.FC<{
  rect: { centroX: number; centroZ: number; ancho: number; alto: number };
  floorType: FloorType;
  overlap?: boolean;
  elevacionY?: number;
}> = ({ rect, floorType, overlap = false, elevacionY = 0.02 }) => {
  // Material GPU-procedural compartido. Cache por FloorType vive en el adapter.
  const floorMaterial = useFloorMaterial(floorType);

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
          <primitive object={floorMaterial} attach="material" />
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


export const Scene: React.FC<SceneProps> = ({
  currentUser,
  onlineUsers,
  setPosition,
  theme,
  orbitControlsRef,
  stream,
  localVideoTrack,
  backgroundEffect = 'none',
  followTargetId = null,
  getFollowTargetPosition,
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
  cameraMode = 'isometric',
  cameraShoulderMode = 'center',
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
  onSceneReady,
  scenePolicy = DEFAULT_SCENE_POLICY,
  adaptiveDpr,
  minDpr,
  setAdaptiveDpr,
  gpuRenderConfig,
}) => {
  const gridColor = theme === 'arcade' ? '#00ff41' : '#6366f1';

  // Dominio: resuelve colores del skydome (override explícito o derivación HSL).
  // Memoizado por tema para evitar recalcular la conversión HSL en cada render.
  const skyColors = useMemo(
    () => resolveSkyColors(
      theme,
      themeColors,
      themeSkyColors,
      scenePolicy.sky.derivation,
    ),
    [theme, scenePolicy.sky.derivation],
  );
  const { camera, gl } = useThree();

  // Fase 3: GPU rendering optimization services (BatchedMesh, TextureAtlas, GPUSkinning)
  const sceneOptimization = useSceneOptimization();

  const frustumRef = useRef(new THREE.Frustum());
  const projectionRef = useRef(new THREE.Matrix4());
  const chairMeshRef = useRef<THREE.InstancedMesh>(null);
  const chairDummy = useMemo(() => new THREE.Object3D(), []);
  const playerColliderRef = useRef<any>(null);
  const playerColliderPositionRef = useRef({ x: (currentUser.x || 400) / 16, z: (currentUser.y || 400) / 16 });

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

  // Bounding box del terrain (computado UNA VEZ) — lo usamos para sincronizar
  // tamaño del Grid con los límites visuales del modelo, así la cuadrícula no
  // se extiende como un grid infinito sobre el espacio oscuro.
  // Posición del terreno en el espacio de mundo: [-25, -0.02, 75] (ver render).
  const TERRAIN_OFFSET_X = -25;
  const TERRAIN_OFFSET_Y = -0.02;
  const TERRAIN_OFFSET_Z = 75;
  const terrainBounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(terrainScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // El primitive está dentro de un <group position={[-25,-0.02,75]}>, el bbox
    // local se traslada al mundo sumando el offset del group.
    return {
      sizeX: size.x,
      sizeZ: size.z,
      topY: TERRAIN_OFFSET_Y + box.max.y,
      centerX: center.x + TERRAIN_OFFSET_X,
      centerZ: center.z + TERRAIN_OFFSET_Z,
    };
  }, [terrainScene]);

  // Bounds caminables derivados del terreno real — los pasa al <Player>
  // para que el dominio de movimiento clampee contra el piso visible, no
  // contra un cuadrado [0, WORLD_SIZE] desalineado.
  // Ref: src/core/domain/entities/espacio3d/MovimientoEntity.ts — MovementBounds.
  const movementBounds = useMemo(() => ({
    minX: terrainBounds.centerX - terrainBounds.sizeX / 2,
    maxX: terrainBounds.centerX + terrainBounds.sizeX / 2,
    minZ: terrainBounds.centerZ - terrainBounds.sizeZ / 2,
    maxZ: terrainBounds.centerZ + terrainBounds.sizeZ / 2,
  }), [terrainBounds]);

  const zonasActivas = useMemo(
    () => zonasEmpresa.filter((zona) => zona.estado === 'activa'),
    [zonasEmpresa]
  );
  // Fuente para avatares 3D: Supabase Presence (global cross-Room).
  //
  // NOTA (2026-04-23): previamente intersectábamos Presence ∩ LiveKit
  // remoteParticipantIds para evitar ghosts de Presence CRDT. Con multi-Room
  // meetings ese gate borraba avatares de peers en otra Room (bug reportado:
  // "no veo al usuario dentro/fuera de la sala"). Ahora confiamos en Presence
  // para renderizar avatares — el aislamiento de media (burbujas/voz/cámara)
  // se hace en useProximity.ts via remoteParticipantIds. Un ghost de ~30s
  // hasta que Presence propague disconnect es costo aceptable.
  // Ref: https://docs.livekit.io/home/server/managing-rooms/ (moveParticipant)
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
  // Config de perímetro viene de Supabase via hook (realtime). El admin la
  // modifica desde SettingsZona; otros usuarios la reciben por postgres_changes.
  // Si no hay config persistida, el hook cae a DEFAULT_PERIMETER_POLICY
  // (enabled=false, fail-closed).
  //
  // Bug histórico (fix 2026-04-21): usábamos `(currentUser as { espacio_id })`
  // pero la interface `User` nunca tuvo `espacio_id` — el cast silenciaba
  // el error y `espacioIdPerimeter` era siempre null, por lo que el hook
  // no leía la policy real y las paredes nunca aparecían aunque la DB
  // tuviera un row. Fuente correcta: `activeWorkspace.id` del store.
  const espacioIdPerimeter = useStore((s) => s.activeWorkspace?.id ?? null);
  const { policy: perimeterPolicyPersisted } = useConfiguracionPerimetro(espacioIdPerimeter);
  // Terreno (suelo + montañas) — solo renderiza algo si tipo='heightfield'
  const { terreno: terrenoPersistido } = useTerreno(espacioIdPerimeter);

  // Paredes perimetrales virtuales — generadas por el use case del Application
  // layer a partir del terrainBounds y la policy persistida. No persisten en
  // `espacio_objetos`; se concatenan al array de builtin walls reales y pasan
  // por el mismo BuiltinWallBatcher (cero duplicación de pipeline de rendering).
  const paredesPerimetrales = useMemo(() => {
    if (!perimeterPolicyPersisted.enabled) return [];
    if (terrainBounds.sizeX <= 0 || terrainBounds.sizeZ <= 0) return [];
    return generarParedesPerimetrales(
      {
        sizeX: terrainBounds.sizeX,
        sizeZ: terrainBounds.sizeZ,
        centerX: terrainBounds.centerX,
        centerZ: terrainBounds.centerZ,
        topY: terrainBounds.topY,
      },
      perimeterPolicyPersisted,
      espacioIdPerimeter ?? 'unknown',
    );
  }, [perimeterPolicyPersisted, terrainBounds, espacioIdPerimeter]);

  // Fase 5A: Array estable de objetos builtin para BuiltinWallBatcher (evita .filter() inline en JSX)
  // Concatena paredes perimetrales virtuales — BuiltinWallBatcher las trata igual
  // que las reales (mismo tipo `ObjetoEspacio3D`), merge en el mismo draw call.
  const objetosBuiltin = useMemo(() => {
    const builtinReales = espacioObjetos.filter(obj => obj.catalogo_id && (!obj.modelo_url || obj.modelo_url.startsWith('builtin:')));
    return paredesPerimetrales.length > 0 ? [...builtinReales, ...paredesPerimetrales] : builtinReales;
  }, [espacioObjetos, paredesPerimetrales]);
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
  // ── Candidatos para placement stacking ───────────────────────────────────
  // Mapea `EspacioObjeto[]` → `ObjetoColocable[]` (dominio puro) una vez por
  // cambio de lista. El use case de placement lo consume en handlePointerMove
  // para decidir si el objeto que arrastras cae al suelo o se apila encima.
  // Excluimos objetos sin catálogo resuelto (dimensiones desconocidas → no
  // pueden actuar como AABB fiable).
  // Suscripción al registry de bbox escalada — re-memoiza objetosColocables
  // cuando cualquier GLB termina de cargar y registra su bbox.
  const scaledBboxVersion = useSyncExternalStore(
    subscribeToScaledBbox,
    getScaledBboxVersion,
    getScaledBboxVersion, // SSR snapshot
  );

  const objetosColocables = useMemo<ObjetoColocable[]>(() => {
    const out: ObjetoColocable[] = [];
    for (const obj of espacioObjetos) {
      const anchoCat = obj.catalogo?.ancho ?? obj.ancho;
      const altoCat = obj.catalogo?.alto ?? obj.alto;
      const profCat = obj.catalogo?.profundidad ?? obj.profundidad;
      const ancho = Number(anchoCat);
      const alto = Number(altoCat);
      const profundidad = Number(profCat);
      if (!Number.isFinite(ancho) || ancho <= 0) continue;
      if (!Number.isFinite(alto) || alto <= 0) continue;
      if (!Number.isFinite(profundidad) || profundidad <= 0) continue;
      // Override topY usando bbox escalado real del GLB cuando esté disponible.
      // Resuelve "objeto flotando" cuando catálogo alto > altura visible real.
      // Si el GLB todavía no se cargó (registry vacío), usamos catálogo (fallback
      // al comportamiento previo) — primer drop puede flotar, pero al moverse el
      // GLB se carga y el siguiente drop snapea correcto.
      const bboxInfo = obj.modelo_url ? getScaledBbox(obj.modelo_url) : undefined;
      const topYOverride = bboxInfo
        ? obj.posicion_y + bboxInfo.maxY - alto / 2
        : undefined;
      out.push({
        id: obj.id,
        posicionX: obj.posicion_x,
        posicionY: obj.posicion_y,
        posicionZ: obj.posicion_z,
        ancho,
        alto,
        profundidad,
        esSuperficie: Boolean(obj.catalogo?.es_superficie),
        topYOverride,
      });
    }
    return out;
  }, [espacioObjetos, scaledBboxVersion]);

  // Fix 2026-04-21: antes pasábamos `zonasEmpresa` completo a la generación
  // de cerramientos. Incluía zonas con `estado='inactiva'`, y la función
  // `resolverConfiguracionCerramientoZona` aplica cerramientos default según
  // `tipo_suelo` aunque la zona no esté activa — resultado: paredes invisibles
  // en el mundo que bloqueaban al avatar. `zonasActivas` ya filtra por estado
  // y es la misma fuente que el render visual (línea 1308), ahora ambos
  // lados (visual + físico) están consistentes.
  const cerramientosZona = useMemo(() => crearParedesCerramientosZonas(zonasActivas), [zonasActivas]);
  const obstaculosMundo = useMemo(
    () => [
      ...crearObstaculosObjetosPersistentes(espacioObjetos),
      ...crearObstaculosObjetosPersistentes(cerramientosZona),
      // Fix 2026-04-21: las paredes perimetrales son `ObjetoEspacio3D`
      // virtuales (tipo='pared', dimensiones reales). El pipeline de
      // colisiones del avatar las trata igual que a las paredes persistidas
      // → el avatar ya no las atraviesa. Sin este spread, el BuiltinWallBatcher
      // las RENDERIZABA pero no había collider ⇒ eran paredes "fantasma".
      ...crearObstaculosObjetosPersistentes(paredesPerimetrales),
    ],
    [cerramientosZona, espacioObjetos, paredesPerimetrales]
  );

  // ── Navigation service (pathfinding/obstacle-avoidance) ──
  // Construye navmesh + tilecache desde el terreno + obstáculos. Phase 2
  // del feature: Player3D usa esto para que el click-to-move respete
  // obstáculos. WASD/joystick mantienen el sliding clásico (input directo,
  // sincronizado con teleportAgent para que recast no pierda el rastro).
  const navigationLocalPosition = useMemo(
    () => ({ x: currentUser.x, z: currentUser.y }),
    [currentUser.x, currentUser.y],
  );
  const navigationTerrainBounds = useMemo(() => ({
    minX: movementBounds.minX,
    maxX: movementBounds.maxX,
    minZ: movementBounds.minZ,
    maxZ: movementBounds.maxZ,
    y: terrainBounds.topY,
  }), [movementBounds, terrainBounds.topY]);
  const navigation = useNavigation({
    terrainBounds: navigationTerrainBounds,
    espacioObjetos,
    localPosition: navigationLocalPosition,
  });

  // --- Hito 8: Edit Mode dragging ---
  const isDragging = useStore((s) => s.isDragging);
  const isDrawingZone = useStore((s) => s.isDrawingZone);
  const isPaintingDecorativeFloor = useStore((s) => s.isPaintingDecorativeFloor);
  const paintFloorType = useStore((s) => s.paintFloorType);
  const addNotification = useStore((s) => s.addNotification);
  const isEditMode = useStore((s) => s.isEditMode);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  // ─── Desk Placer (Gather-style click-to-place AreaEscritorio) ────────
  const deskPlacerEstado = useStore((s) => s.deskPlacerEstado);
  const deskPlacerConfirmarClick = useStore((s) => s.deskPlacerConfirmarClick);
  // Zone drawing preview — state + memos derivados (rect, overlap, anidamiento)
  // extraídos a hook dedicado (ITEM 15 P1-07).
  const {
    previewZonaStart,
    previewZonaCurrent,
    setPreviewZonaStart,
    setPreviewZonaCurrent,
    previewZonaRect,
    zonasExistentesMundo,
    previewOverlap,
    previewNivelAnidamiento,
  } = useZoneDrawingPreview({ zonasEmpresa });
  const modoEdicionObjeto = useStore((s) => s.modoEdicionObjeto) as ModoEdicionObjeto;

  // Scene Ready Signal (Fase 5C — race condition fix). Extraído a hook
  // dedicado (ITEM 15 P1-07) — disparo idempotente post-rAF.
  useSceneReadySignal({
    sceneOptimizationReady: sceneOptimization.isReady,
    isEditMode,
    onSceneReady,
    onFired: (meta) => log.info('[Scene3D] Scene ready signal fired', meta),
  });

  const objetoSeleccionado = useMemo(
    () => espacioObjetos.find((obj) => obj.id === selectedObjectId) || null,
    [espacioObjetos, selectedObjectId]
  );
  // Plantilla-zona drag eliminado en Fase M (legacy cubículos). Stubs
  // tipados para preservar el resto del componente sin tocar el árbol JSX.
  const isDraggingPlantillaZona = false;
  const actualizarPlantillaZonaRestringida = (_p: unknown) => { /* noop */ };
  const handlePlantillaPointerDown: ((e: any) => void) | undefined = undefined;
  const handlePlantillaPointerUp: ((e: any) => void) | undefined = undefined;

  const handlePointerMove = useCallback((e: any) => {
    const point = obtenerPuntoSueloMundo(e);
    const x = ajustarAGrilla(point.x);
    const z = ajustarAGrilla(point.z);

    if (isDrawingZone && previewZonaStart) {
      setPreviewZonaCurrent({ x, z });
      return;
    }

    // Desk placer: preview sigue el cursor via useFrame del propio overlay;
    // no requiere setState aquí.

    if (objetoEnColocacion && onActualizarObjetoEnColocacion) {
      // Placement stacking (whitelist): si el rayo impacta un objeto marcado
      // `es_superficie=true` se apila sobre su topY; si no, cae al suelo.
      // Ref: PlacementPolicy (Domain) + ColocarObjetoUseCase (Application).
      const rayo = rayoEventoADominio(e);
      if (rayo) {
        const altoAColocar = Number(objetoEnColocacion.alto) || 1;
        const pos = colocarObjetoUC.ejecutar({
          rayo,
          objetos: objetosColocables,
          hitPisoX: x,
          hitPisoZ: z,
          altoAColocar,
          // Preview nuevo desde catálogo no tiene row persistido aún.
          idEnColocacion: null,
        });
        onActualizarObjetoEnColocacion(pos.x, pos.y, pos.z);
      } else {
        // Fallback defensivo: evento sintético sin ray → comportamiento anterior.
        onActualizarObjetoEnColocacion(x, objetoEnColocacion.posicion_y, z);
      }
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
      // Mismo stacking que en colocación nueva, pero excluyendo `selectedObjectId`
      // del candidate set para que el objeto no se apile sobre sí mismo.
      const rayo = rayoEventoADominio(e);
      const altoObj = Number(objetoSeleccionado.catalogo?.alto ?? objetoSeleccionado.alto) || 1;
      if (rayo) {
        const pos = colocarObjetoUC.ejecutar({
          rayo,
          objetos: objetosColocables,
          hitPisoX: x,
          hitPisoZ: z,
          altoAColocar: altoObj,
          idEnColocacion: selectedObjectId,
        });
        onMoverObjeto(selectedObjectId, pos.x, pos.y, pos.z);
      } else {
        onMoverObjeto(selectedObjectId, x, objetoSeleccionado.posicion_y ?? altoObj / 2, z);
      }
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
  }, [actualizarPlantillaZonaRestringida, isDragging, isDraggingPlantillaZona, isDrawingZone, previewZonaStart, selectedObjectId, onMoverObjeto, objetoSeleccionado, objetoEnColocacion, onActualizarObjetoEnColocacion, modoEdicionObjeto, onTransformarObjeto, plantillaZonaEnColocacion, objetosColocables]);

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

  // ─── Desk Placer click handler (Gather-style) ────────────────────────
  // Mientras `previewing`, el siguiente click sobre el piso confirma la
  // posición y pasa el state machine a `asigning` (modal abre afuera del
  // Canvas via AdminDeskHUD).
  const handleDeskPlacerClick = useCallback((e: any) => {
    if (deskPlacerEstado !== 'previewing') return;
    e.stopPropagation();
    const point = obtenerPuntoSueloMundo(e);
    deskPlacerConfirmarClick({
      x: ajustarAGrilla(point.x),
      z: ajustarAGrilla(point.z),
    });
  }, [deskPlacerEstado, deskPlacerConfirmarClick]);

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


  // ─── Áreas de escritorio (Gather-style claim) ────────────────────────
  // Provee la lista realtime + acciones (reclamar/liberar/admin). El
  // DeskAreasLayer renderiza overlays + tooltip + botón.
  const {
    areas: areasEscritorio,
    reclamar: reclamarAreaEscritorio,
    liberar: liberarAreaEscritorio,
  } = useAreasEscritorio(espacioIdPerimeter, currentUser?.id ?? null);

  // Publica al store las áreas con audio_aislado=true. `useProximity` las lee
  // y gatea el audio de proximidad (mismo patrón que meeting zones).
  //
  // ESCALA: useProximity opera en coords DB (×16) — `currentUser.x` y
  // `usuariosEnChunks[].x` se sincronizan con `setPosition(x*16, z*16, ...)`
  // desde Player3D. Nuestro bbox del Domain está en world meters → convertir
  // ×16 antes de publicar para que `isPointInZone` matche correctamente.
  const setAreasAudioAisladas = useStore((s) => s.setAreasAudioAisladas);
  useEffect(() => {
    const snapshot = areasEscritorio
      .filter((a) => a.audio_aislado)
      .map((a) => ({
        id: a.id,
        posicion_x: a.bbox.centroX * 16,
        posicion_y: a.bbox.centroZ * 16,
        ancho: a.bbox.ancho * 16,
        alto: a.bbox.alto * 16,
      }));
    setAreasAudioAisladas(snapshot);
  }, [areasEscritorio, setAreasAudioAisladas]);

  // Zone collision tracker (Rapier callbacks) extraído a hook dedicado
  // (ITEM 15 P1-07) — edge-triggered, filtra callbacks redundantes.
  const { handleZoneEnter, handleZoneExit } = useZoneCollisionTracker({ onZoneCollision });

  // Movement regression (Sketchfab pattern) + interaction timestamp tracking
  // para el auto-return de cámara. Lógica extraída a hook reutilizable
  // (ITEM 15 P1-07 — split god-component).
  const { handleOrbitStart, handleOrbitEnd, userInteractionTimestampRef } =
    useOrbitDprRegression({ adaptiveDpr, minDpr, setAdaptiveDpr });

  return (
    <>
      {/* Niebla atmosférica ligada al tema. ScenePolicy.fog.near/far evita que
          near/far se filtren al JSX (antes 60/220 hardcoded); `skyColors.bottom`
          mantiene la paridad de color con la base del skydome para que la
          transición atmósfera↔horizonte sea continua. Sin useFrame — R3F
          invalida solo cuando los args cambian (compatible con frameloop="demand").
          Ref: https://threejs.org/docs/#api/en/scenes/Fog */}
      <fog attach="fog" args={[skyColors.bottom, scenePolicy.fog.near, scenePolicy.fog.far]} />

      {/* Skydome encapsulado en <SkyDome /> (ver components/3d/SkyDome.tsx).
          Los colores provienen del dominio (resolveSkyColors) y respetan
          themeSkyColors si hay override; si no, derivan proceduralmente
          aplicando ScenePolicy.sky.derivation. */}
      {/*
        Skydome custom: solo visible en tier 0/1. En tier ≥ 2 el drei `<Sky>`
        de SceneEnvironment toma el rol del fondo. Este SkyDome se monta igual
        pero con `visible=false` para evitar overdraw cuando hay Sky shader.
        Ref: plan-tier-2-visual-upgrade-2026-04-20.
      */}
      {!gpuRenderConfig?.useSky && (
        <SkyDome
          bottomColor={skyColors.bottom}
          topColor={skyColors.top}
          radius={scenePolicy.sky.radius}
          widthSegments={scenePolicy.sky.widthSegments}
          heightSegments={scenePolicy.sky.heightSegments}
        />
      )}

      {/*
        SceneEnvironment encapsula la iluminación + Sky + Environment IBL.
        Cuando gpuRenderConfig.useSky / useEnvironmentMap están activos (tier ≥ 2)
        agrega drei `<Sky>` + `<Environment>` + hemisphereLight automáticamente.
      */}
      <SceneEnvironment
        enableDayNightCycle={enableDayNightCycle}
        theme={theme}
        gpuRenderConfig={gpuRenderConfig}
      />

      {/*
        Skyline lejana low-poly — elimina el "flotar en el vacío" que se ve
        desde la vista aérea. Gated por gpuRenderConfig.useSky (tier ≥ 2);
        en hardware bajo se oculta (solo 80 cajas instanciadas = barato,
        pero mantenemos coherencia con las demás features visuales Tier 2).
        Radio derivado del terrainBounds para escalar con el tamaño del espacio.
      */}
      <DistantSkyline
        enabled={!!gpuRenderConfig?.useSky}
        radius={Math.max(terrainBounds.sizeX, terrainBounds.sizeZ) * 1.1}
        centerX={terrainBounds.centerX}
        centerZ={terrainBounds.centerZ}
        baseY={terrainBounds.topY}
      />

      {/* Controles de cámara — toda la lógica de límites por modo/contexto
          vive en SceneCamera (Presentation infra). Domain (CameraFramingPolicy)
          define las constantes; CameraFollow muta posición/target en useFrame. */}
      <SceneCamera
        orbitControlsRef={orbitControlsRef}
        cameraMode={cameraMode}
        cameraSensitivity={cameraSensitivity}
        isDrawingZone={isDrawingZone}
        isDraggingPlantillaZona={isDraggingPlantillaZona}
        isPaintingDecorativeFloor={isPaintingDecorativeFloor}
        onStart={handleOrbitStart}
        onEnd={handleOrbitEnd}
      />

      {showFloorGrid && (
        <Grid
          // Tamaño ligado al bbox real del terrain.glb — evita que el grid
          // se extienda como una malla infinita sobre el skydome. Un pequeño
          // margen interior (0.98) lo mantiene dentro del borde visible del
          // modelo para que no se vea cortado contra la silueta del terreno.
          args={[terrainBounds.sizeX * 0.98, terrainBounds.sizeZ * 0.98]}
          // Centrado sobre el centroide del terrain en coords de mundo, con
          // un +0.01 en Y sobre la cara superior del terreno para evitar
          // z-fighting (el depthWrite del Grid no distingue polys co-planares).
          position={[terrainBounds.centerX, terrainBounds.topY + 0.01, terrainBounds.centerZ]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={gridColor}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={gridColor}
          // fadeDistance = mitad de la dimensión mayor del terreno — la grid
          // se difumina suave en los bordes para integrarse con el fog.
          fadeDistance={Math.max(terrainBounds.sizeX, terrainBounds.sizeZ) / 2}
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

      {/* Overlays de áreas de escritorio reclamables (Gather-style).
          Rectángulos color-coded + tooltip "Reclamar/Liberar" cuando el
          avatar local está cerca. */}
      <DeskAreasLayer
        areas={areasEscritorio}
        playerPosRef={playerColliderPositionRef}
        miUsuarioId={currentUser?.id ?? null}
        onlineUsers={onlineUsers}
        onReclamar={reclamarAreaEscritorio}
        onLiberar={liberarAreaEscritorio}
      />

      {/* Preview del Desk Placer (Gather-style click-to-place).
          Fantasma 3D del preset siguiendo el cursor durante `previewing`. */}
      {deskPlacerEstado === 'previewing' && (
        <DeskPlacerPreview preset={PRESET_DESK_STANDARD} />
      )}

      {/* Suelo base invisible para Raycast. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        geometry={geoSueloRaycast()}
        onClick={deskPlacerEstado === 'previewing' ? handleDeskPlacerClick : handleFloorClick}
        onDoubleClick={handleFloorDoubleClick}
        onPointerDown={handleZoneDrawStart}
        onPointerUp={handleZoneDrawEnd}
        onPointerMove={handlePointerMove}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Plano Atrapa-Eventos para Modo Construcción / Dibujo. */}
      {(objetoEnColocacion || isDrawingZone || isDragging || deskPlacerEstado === 'previewing') && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.5, 0]}
          geometry={geoSueloRaycast()}
          onClick={deskPlacerEstado === 'previewing' ? handleDeskPlacerClick : handleFloorClick}
          onPointerDown={handleZoneDrawStart}
          onPointerUp={handleZoneDrawEnd}
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
        const esZonaComun = !!zona.es_comun;
        const esZonaPropia = !!zona.empresa_id && zona.empresa_id === currentUser.empresa_id;
        const variante = esZonaComun ? 'comun' : esZonaPropia ? 'propia' : 'ajena';
        const nombreZona = zona.nombre_zona || (esZonaComun ? 'Zona común' : zona.empresa?.nombre) || undefined;
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
            nombre={nombreZona}
            logoUrl={zona.empresa?.logo_url ?? null}
            esZonaComun={esZonaComun}
            variante={variante}
            mostrarEtiqueta={tipoSubsuelo !== 'decorativo'}
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

      {/* PreviewPlantillaZonaMesh eliminado en Fase M — el flow es ahora
          click-to-place del DeskPlacerPreview (Gather-style). */}

      {/* Suelo principal global — background fill del espacio (fuera de zonas).
          Lee `terreno.tipoSueloPrincipal` del adapter Supabase. */}
      <SueloPrincipal3D tipoSueloPrincipal={terrenoPersistido.tipoSueloPrincipal} />

      {/* Pisos decorativos (alfombras/parches) — sobre suelo principal o dentro
          de zonas-empresa. Y offset ~0.01 más z-order. */}
      <PisosDecorativos3D espacioId={espacioIdPerimeter} />

      {/* Capture-plane activo solo en modo "Decorar piso" (admin). */}
      <PaintFloorMode3D espacioId={espacioIdPerimeter} />

      {/* Pan de cámara cenital con WASD / arrows en modo paint. Patrón
          industria (Sims/Roblox/Sketchup): teclas de movimiento se
          repurposean cuando el avatar no se mueve. */}
      <PaintFloorCameraPan />

      <Physics gravity={[0, 0, 0]}>
        <Terrain3D terreno={terrenoPersistido} />
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
        localVideoTrack={localVideoTrack}
        backgroundEffect={backgroundEffect}
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
        movementBounds={movementBounds}
        navigationService={navigation.service}
        navigationAgentId={navigation.localAgentId}
        navigationReady={navigation.ready}
      />
      <CameraFollow
        controlsRef={orbitControlsRef}
        cameraMode={cameraMode}
        zonasEmpresa={zonasEmpresa}
        empresaId={currentUser.empresa_id}
        espacioObjetos={espacioObjetos}
        usersInCallIds={usersInCallIds}
        usersInAudioRangeIds={usersInAudioRangeIds}
        followTargetId={followTargetId}
        getFollowTargetPosition={getFollowTargetPosition}
        gpuRenderConfig={gpuRenderConfig}
        cameraShoulderMode={cameraShoulderMode}
        isInDrawingMode={isDrawingZone || isDraggingPlantillaZona || !!plantillaZonaEnColocacion || isPaintingDecorativeFloor}
        isInPaintFloorMode={isPaintingDecorativeFloor}
        isEditMode={isEditMode}
        terrainCenter={{ x: terrainBounds.centerX, z: terrainBounds.centerZ }}
        userInteractionTimestampRef={userInteractionTimestampRef}
      />

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

      {/* Pre-compila shaders/programas WebGL upfront para eliminar lag
          inicial (~5-8s en GPU integrada / ANGLE D3D11). Montado al final
          del árbol para que TODOS los componentes hijos hayan registrado
          sus materiales antes del compileAsync.
          Ref: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.compileAsync */}
      <ShaderPrecompile />
    </>
  );
};

