'use client';
import React, { useRef, useEffect, useMemo, Suspense, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Grid, Text, OrbitControls, Html, PerformanceMonitor, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { User, PresenceStatus, ZonaEmpresa } from '@/types';
import { GLTFAvatar } from '../avatar3d/GLTFAvatar';
import { useAvatarControls } from '../avatar3d/useAvatarControls';
import type { AnimationState } from '../avatar3d/shared';
import { VideoWithBackground } from '../VideoWithBackground';
import { GhostAvatar } from '../3d/GhostAvatar';
import { CerramientoZona3D } from '../3d/CerramientoZona3D';
import { ZonaEmpresa as ZonaEmpresa3D } from '../3d/ZonaEmpresa';
import { Escritorio3D } from '../3d/Escritorio3D';
import { FantasmaColocacion3D, ObjetoEscena3D } from '../3d/ObjetoEscena3D';
import type { EspacioObjeto, SpawnPersonal, TransformacionObjetoInput } from '@/hooks/space3d/useEspacioObjetos';
import type { OcupacionAsientoReal } from '@/hooks/space3d/useOcupacionAsientos';
import type { ObjetoPreview3D } from '@/types/objetos3d';
import { DayNightCycle } from '../3d/DayNightCycle';
import { ObjetosInteractivos } from '../3d/ObjetosInteractivos';
import { ParticulasClima } from '../3d/ParticulasClima';
import { EmoteSync, useSyncEffects } from '../3d/EmoteSync';
import { hapticFeedback, isMobileDevice } from '@/lib/mobileDetect';
import { useStore, type ModoEdicionObjeto } from '@/store/useStore';
import { type CameraSettings } from '../CameraSettingsMenu';
import { obtenerEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { type JoystickInput } from '../3d/MobileJoystick';
import { getSettingsSection } from '@/lib/userSettings';
import {
  AvatarLodLevel, DireccionAvatar, themeColors,
  MOVE_SPEED, RUN_SPEED, WORLD_SIZE, TELEPORT_DISTANCE,
  CHAIR_SIT_RADIUS, CHAIR_POSITIONS_3D, LOD_NEAR_DISTANCE, LOD_MID_DISTANCE,
  USAR_LIVEKIT, playTeleportSound, IconPrivacy, IconExpand,
  FACTOR_ESCALA_OBJETOS_ESCENA,
} from './shared';
import { crearAsientosObjetos3D, type AsientoRuntime3D } from './asientosRuntime';
import { crearParedesCerramientosZonas } from './cerramientosZonaRuntime';
import { crearObstaculosFisicosObjetoPersistente, crearObstaculosObjetosPersistentes } from './colisionesRuntime';
import { obtenerDimensionesObjetoRuntime } from './objetosRuntime';
import { statusColors, STATUS_LABELS, type VirtualSpace3DProps } from './spaceTypes';
import { Player, type PlayerProps } from './Player3D';
import { RemoteUsers, TeleportEffect, CameraFollow, type AvatarProps } from './Avatar3DScene';

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
  onXPEvent?: (accion: string, cooldownMs?: number) => void;
  onClickRemoteAvatar?: (userId: string) => void;
  avatarInteractions?: AvatarProps['avatarInteractions'];
  espacioObjetos?: EspacioObjeto[];
  onReclamarObjeto?: (id: string) => void;
  onLiberarObjeto?: (id: string) => void;
  ocupacionesAsientosPorObjetoId?: Map<string, OcupacionAsientoReal>;
  onInteractuarObjeto?: (objeto: EspacioObjeto, asiento: AsientoRuntime3D | null) => void;
  onOcuparAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onLiberarAsiento?: (asiento: AsientoRuntime3D | null) => Promise<boolean>;
  onRefrescarAsiento?: (asiento: AsientoRuntime3D) => Promise<boolean>;
  onMoverObjeto?: (id: string, x: number, y: number, z: number) => Promise<boolean>;
  onRotarObjeto?: (id: string, rotationY: number) => Promise<boolean>;
  onTransformarObjeto?: (id: string, cambios: TransformacionObjetoInput) => Promise<boolean>;
  onEliminarObjeto?: (id: string) => Promise<boolean>;
  objetoOwnerNames?: Map<string, string>;
  onClickZona?: (zona: ZonaEmpresa) => void;
  objetoEnColocacion?: ObjetoPreview3D | null;
  onActualizarObjetoEnColocacion?: (x: number, y: number, z: number) => void;
  onConfirmarObjetoEnColocacion?: () => void;
  ultimoObjetoColocadoId?: string | null;
  onDrawZoneEnd?: (zona: { ancho: number, alto: number, x: number, z: number }) => void;
}

const ajustarAGrilla = (valor: number, paso = 0.5) => Math.round(valor / paso) * paso;

export const Scene: React.FC<SceneProps> = ({
  currentUser,
  onlineUsers,
  setPosition,
  theme,
  orbitControlsRef,
  stream,
  remoteStreams,
  showVideoBubbles = true,
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
  onReclamarObjeto,
  onLiberarObjeto,
  ocupacionesAsientosPorObjetoId = new Map(),
  onInteractuarObjeto,
  onOcuparAsiento,
  onLiberarAsiento,
  onRefrescarAsiento,
  onMoverObjeto,
  onRotarObjeto,
  onTransformarObjeto,
  onEliminarObjeto,
  objetoOwnerNames,
  onClickZona,
  objetoEnColocacion,
  onActualizarObjetoEnColocacion,
  onConfirmarObjetoEnColocacion,
  ultimoObjetoColocadoId,
  onDrawZoneEnd,
}) => {
  const gridColor = theme === 'arcade' ? '#00ff41' : '#6366f1';
  const { camera } = useThree();
  const frustumRef = useRef(new THREE.Frustum());
  const projectionRef = useRef(new THREE.Matrix4());
  const chairMeshRef = useRef<THREE.InstancedMesh>(null);
  const chairDummy = useMemo(() => new THREE.Object3D(), []);
  const playerColliderRef = useRef<any>(null);
  const playerColliderPositionRef = useRef({ x: (currentUser.x || 400) / 16, z: (currentUser.y || 400) / 16 });
  const zonaColisionRef = useRef<string | null>(null);

  // Cargar el modelo del terreno exportado desde Blender
  const { scene: terrainScene } = useGLTF('/models/terrain.glb');
  const asientosPersistentes = useMemo(() => crearAsientosObjetos3D(espacioObjetos), [espacioObjetos]);
  const asientosRuntime = useMemo(() => [...asientosPersistentes], [asientosPersistentes]);
  const asientosPorObjetoId = useMemo(() => {
    return new Map(
      asientosPersistentes
        .filter((asiento) => !!asiento.objetoId)
        .map((asiento) => [asiento.objetoId as string, asiento])
    );
  }, [asientosPersistentes]);
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

  const handlePointerMove = useCallback((e: any) => {
    const point = e.point;
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
  }, [isDragging, selectedObjectId, onMoverObjeto, objetoSeleccionado, objetoEnColocacion, onActualizarObjetoEnColocacion, modoEdicionObjeto, onTransformarObjeto]);

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
    playerColliderPositionRef.current = { x, z };
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
        minDistance={5}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minPolarAngle={Math.PI / 6}
        enablePan={cameraMode === 'free'}
        enableRotate={cameraMode !== 'fixed' && !isDrawingZone}
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
        />
      </group>

      {/* Suelo base invisible para Raycast (eventos de clic/tap) — Restaurado para mantener estabilidad de colisiones y coordenadas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (isDrawingZone) return; // Deshabilitar click para que no interrumpa el dibujo
          if (objetoEnColocacion && onConfirmarObjetoEnColocacion) {
            onConfirmarObjetoEnColocacion();
            return;
          }
          if (onTapFloor) onTapFloor(e.point);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isDrawingZone) return;
          if (objetoEnColocacion) {
            return;
          }
          if (onDoubleClickFloor) onDoubleClickFloor(e.point);
        }}
        onPointerDown={(e) => {
          if (isDrawingZone) {
            e.stopPropagation();
            const x = ajustarAGrilla(e.point.x);
            const z = ajustarAGrilla(e.point.z);
            setPreviewZonaStart({ x, z });
            setPreviewZonaCurrent({ x, z });
          }
        }}
        onPointerUp={(e) => {
          if (isDrawingZone && previewZonaStart) {
            e.stopPropagation();
            const endX = ajustarAGrilla(e.point.x);
            const endZ = ajustarAGrilla(e.point.z);
            const minX = Math.min(previewZonaStart.x, endX);
            const maxX = Math.max(previewZonaStart.x, endX);
            const minZ = Math.min(previewZonaStart.z, endZ);
            const maxZ = Math.max(previewZonaStart.z, endZ);
            const ancho = Math.abs(maxX - minX);
            const alto = Math.abs(maxZ - minZ);
            
            if (ancho > 1.5 && alto > 1.5) {
              const cx = minX + ancho / 2;
              const cz = minZ + alto / 2;
              onDrawZoneEnd?.({ ancho, alto, x: cx, z: cz });
            }
            setPreviewZonaStart(null);
            setPreviewZonaCurrent(null);
          }
        }}
        onPointerMove={handlePointerMove}
        visible={false}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

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

        return (
          <ZonaEmpresa3D
            key={zona.id}
            posicion={[posicionX, 0.01, posicionZ]}
            ancho={anchoZona}
            alto={altoZona}
            color={colorZona}
            nombre={nombreZona}
            logoUrl={zona.empresa?.logo_url ?? null}
            esZonaComun={esZonaComun}
            variante={variante}
            opacidad={opacidad}
            tipoSuelo={zona.tipo_suelo}
            onClick={(e) => {
              if (onClickZona) {
                onClickZona(zona);
                return;
              }

              if (onTapFloor) {
                onTapFloor(e.point);
              }
            }}
          />
        );
      })}

      {cerramientosZona.map((objeto) => (
        <CerramientoZona3D key={objeto.id} objeto={objeto} />
      ))}

      {/* Renderizado temporal de la zona siendo dibujada */}
      {isDrawingZone && previewZonaRect && (
        <>
          <mesh
            position={[previewZonaRect.centroX, 0.02, previewZonaRect.centroZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[previewZonaRect.ancho, previewZonaRect.alto]} />
            <meshBasicMaterial color="#f59e0b" opacity={0.28} transparent side={THREE.DoubleSide} />
          </mesh>
          <mesh
            position={[previewZonaRect.centroX, 0.026, previewZonaRect.centroZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[previewZonaRect.ancho, previewZonaRect.alto]} />
            <meshBasicMaterial color="#fde68a" opacity={0.18} transparent wireframe side={THREE.DoubleSide} />
          </mesh>
          {previewZonaRect.ancho > 0 && previewZonaRect.alto > 0 && (
            <Text
              position={[previewZonaRect.centroX, 0.18, previewZonaRect.centroZ]}
              fontSize={0.24}
              color="#fef3c7"
              anchorX="center"
              anchorY="middle"
            >
              {`${previewZonaRect.ancho.toFixed(1)}m × ${previewZonaRect.alto.toFixed(1)}m`}
            </Text>
          )}
        </>
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
        {zonasEmpresa.filter((zona) => zona.estado === 'activa').map((zona) => {
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

        {/* Objetos persistentes DENTRO de Physics para habilitar colisiones precisas */}
        {espacioObjetos.map((obj) => {
          const obstaculosObjeto = crearObstaculosFisicosObjetoPersistente(obj);

          return (
            <RigidBody
              key={`${obj.id}-${obj.rotacion_y}-${obj.actualizado_en}`}
              type="fixed"
              colliders={false}
            >
              {/* Collider físico explícito exacto alineado con el modelo visual */}
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
              
              {obj.catalogo_id ? (
                <ObjetoEscena3D
                  objeto={obj}
                  playerPosition={playerColliderPositionRef.current}
                  onInteractuar={() => onInteractuarObjeto?.(obj, asientosPorObjetoId.get(obj.id) || null)}
                  onMover={onMoverObjeto}
                  onRotar={onRotarObjeto}
                  onEliminar={onEliminarObjeto}
                  animarEntrada={ultimoObjetoColocadoId === obj.id}
                />
              ) : (
                <Escritorio3D
                  objeto={obj}
                  playerPosition={playerColliderPositionRef.current}
                  currentUserId={currentUser.id || null}
                  onReclamar={onReclamarObjeto || (() => { })}
                  onLiberar={onLiberarObjeto || (() => { })}
                  onMover={onMoverObjeto}
                  onRotar={onRotarObjeto}
                  onEliminar={onEliminarObjeto}
                  ownerName={objetoOwnerNames?.get(obj.owner_id || '') || null}
                />
              )}
            </RigidBody>
          );
        })}
      </Physics>

      {/* Objetos Dinámicos y Zonas se renderizan antes de aquí */}

      {/* Jugador actual */}
      <Player
        currentUser={currentUser}
        setPosition={setPosition}
        stream={stream}
        showVideoBubble={showVideoBubbles && !usersInCallIds?.size} // Bug 1 Fix: Ocultar bubble local si hay llamada activa (HUD visible)
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
      <CameraFollow controlsRef={orbitControlsRef} />

      {/* Usuarios remotos */}
      <RemoteUsers users={onlineUsers} remoteStreams={remoteStreams} showVideoBubble={showVideoBubbles} usersInCallIds={usersInCallIds} usersInAudioRangeIds={usersInAudioRangeIds} remoteMessages={remoteMessages} remoteReaction={remoteReaction} realtimePositionsRef={realtimePositionsRef} interpolacionWorkerRef={interpolacionWorkerRef} posicionesInterpoladasRef={posicionesInterpoladasRef} ecsStateRef={ecsStateRef} frustumRef={frustumRef} onClickRemoteAvatar={onClickRemoteAvatar} avatarInteractions={avatarInteractions} />

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

