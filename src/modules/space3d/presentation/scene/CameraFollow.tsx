'use client';
/**
 * @module space3d/scene/CameraFollow
 *
 * R3F component que gobierna posición + target de OrbitControls cada frame.
 * Extraído de `Avatar3DScene.tsx` (deuda ITEM 15 P1-07 — god-component
 * 1372 LOC). Responsabilidad acotada: chase-cam + idle-hero blend + drawing
 * overview transition + camera collision + FOV dinámico + OTS shoulder
 * offset + auto-return al framing isométrico tras zoom idle.
 *
 * Clean Architecture — Presentation. Consume constants/types del Domain
 * (`CameraFramingPolicy`) y refs del store (isDragging). No accede a Supabase
 * ni hace I/O — sólo manipula el camera/target/refs de R3F.
 *
 * Refs:
 *  - https://r3f.docs.pmnd.rs/api/hooks#useframe
 *  - https://drei.docs.pmnd.rs/controls/orbit-controls
 *  - https://threejs.org/docs/#api/en/math/MathUtils.damp
 *  - https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/ (patrón
 *    State-Driven Camera / FreeLook m_RecenterTime referenciado en Domain).
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ZonaEmpresa } from '@/types';
import type { EspacioObjeto } from '@/modules/space3d/presentation/hooks/useEspacioObjetos';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';
import { obtenerDimensionesObjetoRuntime } from './objetosRuntime';
import {
  IDLE_HERO_FRAMING,
  ISOMETRIC_FRAMING,
  selectGameplayFraming,
  dampLambdaForDurationMs,
  IDLE_THRESHOLD_MS,
  TRANSITION_TO_IDLE_MS,
  TRANSITION_TO_MOVING_MS,
  DRAWING_OVERVIEW_FRAMING,
  TRANSITION_TO_DRAWING_MS,
  ZOOM_RETURN_IDLE_MS,
  type CameraMode,
} from '@/src/core/domain/entities/espacio3d/CameraFramingPolicy';

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CAMERA FOLLOW (OrbitControls) ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export const CameraFollow: React.FC<{
  controlsRef: React.MutableRefObject<any>;
  /**
   * Modo de cámara activo. `'isometric'` (default) deshabilita el idle-hero
   * close-up y la chase-cam rotation — la cámara mantiene orientación fija
   * y solo translada para seguir al avatar. `'free'` mantiene el chase-cam
   * clásico con idle-hero blend. Ver Domain `CameraFramingPolicy.CameraMode`.
   */
  cameraMode?: CameraMode;
  zonasEmpresa?: ZonaEmpresa[];
  empresaId?: string | null;
  espacioObjetos?: EspacioObjeto[];
  usersInCallIds?: Set<string>;
  usersInAudioRangeIds?: Set<string>;
  /**
   * Issue 49120587 — cuando el usuario activa "Follow" sobre otro avatar,
   * `followTargetId` contiene el id del target; `getFollowTargetPosition`
   * resuelve la posición actual del avatar remoto. El CameraFollow usa esa
   * posición en vez de la del propio jugador, haciendo que la cámara orbite
   * al target. La chase-cam rotation se congela mientras dura el follow
   * (no conocemos la dirección del avatar remoto con suficiente precisión).
   */
  followTargetId?: string | null;
  getFollowTargetPosition?: (userId: string) => { x: number; z: number } | null;
  /**
   * Config adaptativa por GPU tier. Gatea FOV dinámico (tier ≥ 2).
   * Cuando es undefined o `useDynamicFov=false`, FOV se mantiene fijo.
   */
  gpuRenderConfig?: import('@/core/infrastructure/r3f/gpuCapabilities').AdaptiveRenderConfig;
  /** OTS offset — 'left' | 'right' desplaza cámara lateralmente; 'center' = default. */
  cameraShoulderMode?: 'center' | 'left' | 'right';
  /**
   * Cuando `true`, la cámara hace auto-transición a overview framing
   * (bird's-eye) para que el admin pueda colocar pisos / zonas / plantillas
   * viendo todo el grid de la empresa. Fuente: `isDrawingZone` (store) OR
   * `plantillaZonaEnColocacion !== null` (prop Scene3D).
   */
  isInDrawingMode?: boolean;
  /**
   * Admin con `isEditMode` activo (colocando/moviendo objetos individuales).
   * En modo `free` se usa como guard adicional para deshabilitar el idle-hero
   * blend — sin esto, el admin que se queda quieto frente al objeto que coloca
   * recibe un dolly-in que le tapa la vista. Solo aplica al modo `free`; en
   * `isometric` el idle-hero está globalmente off.
   */
  isEditMode?: boolean;
  /** Centro del terreno en world coords — usado como target durante overview. */
  terrainCenter?: { x: number; z: number };
  /**
   * Timestamp (ms) de la última interacción manual con OrbitControls. Lo
   * actualiza `Scene3D` desde los callbacks `onStart`/`onEnd`. Cuando han
   * pasado `ZOOM_RETURN_IDLE_MS` desde ese timestamp y la cámara está en
   * modo isometric, el chase-cam la regresa al framing default (auto-recenter
   * canónico tipo Unity Cinemachine FreeLook).
   */
  userInteractionTimestampRef?: React.MutableRefObject<number>;
}> = ({ controlsRef, cameraMode = 'isometric', zonasEmpresa = [], empresaId = null, espacioObjetos = [], usersInCallIds, usersInAudioRangeIds, followTargetId = null, getFollowTargetPosition, gpuRenderConfig, cameraShoulderMode = 'center', isInDrawingMode = false, isEditMode = false, terrainCenter, userInteractionTimestampRef }) => {
  const { camera, scene } = useThree();
  const baseFovRef = useRef<number | null>(null);

  // ─── Camera collision (Tier 2) ────────────────────────────────────────
  // Raycaster reutilizable para detectar obstáculos entre el avatar (target)
  // y la cámara. Cuando hay hit, la cámara se acerca al target para evitar
  // que "atraviese" paredes. Patrón Unreal Spring Arm / Unity Cinemachine.
  // Ref: https://threejs.org/docs/#api/en/core/Raycaster
  // Ref: https://discussions.unity.com/t/complete-camera-collision-detection-third-person-games/593233
  const collisionRaycaster = useRef(new THREE.Raycaster());
  const collisionDirection = useRef(new THREE.Vector3());
  const collisionOrigin = useRef(new THREE.Vector3());
  const lastPlayerPos = useRef<{ x: number; z: number } | null>(null);
  const initialized = useRef(false);
  const introStartedAtRef = useRef<number | null>(null);
  const isDragging = useStore((s) => s.isDragging);

  // Chase-cam: ángulo objetivo basado en dirección del avatar
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  // Pausa auto-rotación si el usuario interactúa manualmente con la cámara
  const userInteractingRef = useRef(false);
  const lastPointerDownRef = useRef(0);

  // ─── Idle → Hero framing blend ────────────────────────────────────────
  // Cuando el avatar está quieto >IDLE_THRESHOLD_MS, la cámara hace dolly-in
  // al encuadre hero (cerca, alto, target al pecho). Al moverse, vuelve al
  // framing gameplay. Blend asimétrico: 250ms al volver a gameplay (snappy),
  // 600ms al entrar en idle (reveal cinematográfico).
  // Domain policy: src/core/domain/entities/espacio3d/CameraFramingPolicy.ts
  const idleTimeMsRef = useRef(IDLE_THRESHOLD_MS); // >=threshold para que el intro arranque en hero
  const idleBlendRef = useRef(1); // 0 = gameplay, 1 = hero. Inicia en hero.

  // ─── Drawing mode overview transition ────────────────────────────────
  // Cuando el admin entra en modo dibujo/colocación de zonas, la cámara
  // hace lerp suave a bird's-eye para ver todo el grid de la empresa
  // (50×50m). Al salir, vuelve a chase-cam. Durante drawing (no
  // transicionando), OrbitControls queda libre para zoom/pan manual.
  const wasInDrawingRef = useRef(false);
  const drawingTransitionStartedAtRef = useRef<number | null>(null);
  const drawingTransitionDirectionRef = useRef<'to-overview' | 'to-chase' | null>(null);
  // Snapshot de la posición/target de la cámara al iniciar la transición
  // (se interpolan desde este snapshot hacia el destino).
  const drawingTransitionFromRef = useRef<{
    camPos: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // Cached zone detection results — recomputed every ZONE_REEVAL_FRAMES to avoid per-frame work
  const ZONE_REEVAL_FRAMES = 30;
  const zoneFrameCounter = useRef(0);
  const cachedZoneResult = useRef<{
    usarVistaInterior: boolean;
    cameraTargetHeight: number;
    cameraHeight: number;
    cameraDistance: number;
  } | null>(null);

  const recintosCompactos = useMemo(() => {
    const grupos = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; paredes: number }>();

    espacioObjetos.forEach((objeto) => {
      const metaPlantilla = (objeto.configuracion_geometria as any)?.meta_plantilla_zona;
      const grupo = String(objeto.plantilla_origen || metaPlantilla?.zona_id || '').trim();
      const geometria = String(objeto.built_in_geometry || '').trim().toLowerCase();
      const tipo = String(objeto.tipo || '').trim().toLowerCase();
      const esPared = tipo === 'pared' || geometria.startsWith('wall') || geometria === 'pared' || geometria === 'muro';
      if (!grupo || !esPared) return;

      const dimensiones = obtenerDimensionesObjetoRuntime(objeto);
      const rotacion = objeto.rotacion_y || 0;
      const halfX = Math.abs(Math.cos(rotacion)) * (dimensiones.ancho / 2) + Math.abs(Math.sin(rotacion)) * (dimensiones.profundidad / 2);
      const halfZ = Math.abs(Math.sin(rotacion)) * (dimensiones.ancho / 2) + Math.abs(Math.cos(rotacion)) * (dimensiones.profundidad / 2);
      const actual = grupos.get(grupo);

      if (!actual) {
        grupos.set(grupo, { minX: objeto.posicion_x - halfX, maxX: objeto.posicion_x + halfX, minZ: objeto.posicion_z - halfZ, maxZ: objeto.posicion_z + halfZ, paredes: 1 });
        return;
      }

      actual.minX = Math.min(actual.minX, objeto.posicion_x - halfX);
      actual.maxX = Math.max(actual.maxX, objeto.posicion_x + halfX);
      actual.minZ = Math.min(actual.minZ, objeto.posicion_z - halfZ);
      actual.maxZ = Math.max(actual.maxZ, objeto.posicion_z + halfZ);
      actual.paredes += 1;
    });

    return Array.from(grupos.values())
      .map((g) => ({ ...g, ancho: g.maxX - g.minX, alto: g.maxZ - g.minZ }))
      .filter((g) => g.paredes >= 3 && Math.min(g.ancho, g.alto) <= 4.8);
  }, [espacioObjetos]);

  const CAMERA_INTRO_DURATION_MS = 1200;
  // El intro termina en hero framing (primer spawn = impacto avatar).
  // Ref: CameraFramingPolicy.ts — IDLE_HERO_FRAMING.
  const CAMERA_INTRO_HEIGHT = IDLE_HERO_FRAMING.height;
  const CAMERA_INTRO_DISTANCE = IDLE_HERO_FRAMING.distance;
  const CAMERA_INTRO_TARGET_HEIGHT = IDLE_HERO_FRAMING.targetHeight;
  const hayVideoProximidad = (usersInCallIds?.size || 0) > 0 || (usersInAudioRangeIds?.size || 0) > 0;
  // Framing gameplay. En isometric el framing es fijo (Lords Mobile-style);
  // en free se selecciona dinámicamente según proximidad social.
  const isIsometric = cameraMode === 'isometric';
  const gameplayFraming = isIsometric
    ? ISOMETRIC_FRAMING
    : selectGameplayFraming({ hayVideoProximidad });
  const CAMERA_DEFAULT_HEIGHT = gameplayFraming.height;
  const CAMERA_DEFAULT_DISTANCE = gameplayFraming.distance;
  const CAMERA_DEFAULT_TARGET_HEIGHT = gameplayFraming.targetHeight;

  useFrame((_, delta) => {
    const selfPos = (camera as any).userData?.playerPosition;
    const controls = controlsRef.current;
    if (!selfPos || !controls || !controls.target) return;

    // Issue 49120587 — si hay un target de follow, sustituimos la posición
    // del jugador propio por la del target remoto. El resto de la lógica
    // (zone detection, intro animation, interior camera) sigue idéntica
    // porque solo consume `playerPos`. Si el target ya no existe en el ECS,
    // caemos al comportamiento normal (cámara sobre el propio avatar).
    const targetPos = followTargetId && getFollowTargetPosition
      ? getFollowTargetPosition(followTargetId)
      : null;
    const playerPos = targetPos ?? selfPos;
    const isFollowing = targetPos !== null;

    // ─── Drawing mode overview transition ─────────────────────────────
    // Detecta transiciones de `isInDrawingMode` y hace lerp suave de la
    // cámara entre chase-cam ↔ bird's-eye del centro del terreno.
    // Durante drawing (no transicionando), OrbitControls queda libre
    // para que el admin haga zoom/pan/rotate manualmente al colocar pisos.
    if (isInDrawingMode !== wasInDrawingRef.current) {
      // Transición detectada — snapshot de posición actual + dirección.
      drawingTransitionFromRef.current = {
        camPos: camera.position.clone(),
        target: controls.target.clone(),
      };
      drawingTransitionStartedAtRef.current = performance.now();
      drawingTransitionDirectionRef.current = isInDrawingMode ? 'to-overview' : 'to-chase';
      wasInDrawingRef.current = isInDrawingMode;
    }

    if (drawingTransitionStartedAtRef.current !== null && drawingTransitionFromRef.current) {
      const elapsed = performance.now() - drawingTransitionStartedAtRef.current;
      const progress = Math.min(elapsed / TRANSITION_TO_DRAWING_MS, 1);
      // Ease-in-out cúbico (mismo pattern que el intro).
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const dir = drawingTransitionDirectionRef.current;
      const from = drawingTransitionFromRef.current;

      if (dir === 'to-overview') {
        // Destino: bird's-eye del centro del terreno. Si no hay terrainCenter
        // (edge case), usamos la posición actual del jugador como fallback.
        const cx = terrainCenter?.x ?? playerPos.x;
        const cz = terrainCenter?.z ?? playerPos.z;
        const toTarget = new THREE.Vector3(cx, DRAWING_OVERVIEW_FRAMING.targetHeight, cz);
        // Cámara en ángulo isométrico desde el sur-oeste del centro.
        const toCamPos = new THREE.Vector3(
          cx - DRAWING_OVERVIEW_FRAMING.distance * 0.7,
          DRAWING_OVERVIEW_FRAMING.height,
          cz + DRAWING_OVERVIEW_FRAMING.distance * 0.7,
        );
        controls.target.lerpVectors(from.target, toTarget, eased);
        camera.position.lerpVectors(from.camPos, toCamPos, eased);
        controls.update();
      } else if (dir === 'to-chase') {
        // Destino: chase-cam sobre el avatar. Se reutiliza el framing
        // gameplay default como target (el idle-hero se re-activará luego).
        const toTarget = new THREE.Vector3(playerPos.x, CAMERA_DEFAULT_TARGET_HEIGHT, playerPos.z);
        const toCamPos = new THREE.Vector3(
          playerPos.x,
          CAMERA_DEFAULT_HEIGHT,
          playerPos.z + CAMERA_DEFAULT_DISTANCE,
        );
        controls.target.lerpVectors(from.target, toTarget, eased);
        camera.position.lerpVectors(from.camPos, toCamPos, eased);
        controls.update();
      }

      if (progress >= 1) {
        drawingTransitionStartedAtRef.current = null;
        drawingTransitionDirectionRef.current = null;
        drawingTransitionFromRef.current = null;
      }
      return; // No ejecutar chase-cam durante la transición.
    }

    // Si está en drawing mode sin transicionar, dejar OrbitControls libre
    // (user controla zoom/pan/rotate para colocar el piso).
    if (isInDrawingMode) {
      return;
    }

    // Zone/interior detection: only recompute every ZONE_REEVAL_FRAMES
    zoneFrameCounter.current += 1;
    if (!cachedZoneResult.current || zoneFrameCounter.current >= ZONE_REEVAL_FRAMES) {
      zoneFrameCounter.current = 0;
      const zonaPropia = empresaId ? zonasEmpresa.find((z) => z.empresa_id === empresaId && z.estado === 'activa') || null : null;
      const anchoZona = zonaPropia ? Math.max(Number(zonaPropia.ancho) / 16, 0) : 0;
      const altoZona = zonaPropia ? Math.max(Number(zonaPropia.alto) / 16, 0) : 0;
      const centroZonaX = zonaPropia ? Number(zonaPropia.posicion_x) / 16 : 0;
      const centroZonaZ = zonaPropia ? Number(zonaPropia.posicion_y) / 16 : 0;
      const halfW = anchoZona / 2;
      const halfH = altoZona / 2;
      const dimensionMinima = Math.min(anchoZona || Number.POSITIVE_INFINITY, altoZona || Number.POSITIVE_INFINITY);
      const estaDentroZonaPropia = !!zonaPropia && Math.abs(playerPos.x - centroZonaX) <= halfW && Math.abs(playerPos.z - centroZonaZ) <= halfH;
      const recintoCompacto = recintosCompactos.find((g) => playerPos.x >= g.minX + 0.12 && playerPos.x <= g.maxX - 0.12 && playerPos.z >= g.minZ + 0.12 && playerPos.z <= g.maxZ - 0.12) || null;
      const dimensionMinimaRecinto = recintoCompacto ? Math.min(recintoCompacto.ancho, recintoCompacto.alto) : null;
      const usarVistaInterior = Boolean(recintoCompacto) || (estaDentroZonaPropia && Number.isFinite(dimensionMinima) && dimensionMinima <= 5);
      const dimensionBaseInterior = dimensionMinimaRecinto ?? dimensionMinima;
      cachedZoneResult.current = {
        usarVistaInterior,
        cameraTargetHeight: usarVistaInterior ? 1.2 : CAMERA_DEFAULT_TARGET_HEIGHT,
        cameraHeight: usarVistaInterior ? THREE.MathUtils.clamp(dimensionBaseInterior * 0.58, 2.1, 3.1) : CAMERA_DEFAULT_HEIGHT,
        cameraDistance: usarVistaInterior ? THREE.MathUtils.clamp(dimensionBaseInterior * 0.42, 1.55, 2.7) : CAMERA_DEFAULT_DISTANCE,
      };
    }

    const { usarVistaInterior } = cachedZoneResult.current;
    let { cameraTargetHeight, cameraHeight, cameraDistance } = cachedZoneResult.current;

    // ─── Idle blend (hero framing cuando el avatar está quieto) ──────────
    // El blend se calcula per-frame (no cacheado) porque el threshold/timings
    // son sub-segundo. Usa MathUtils.damp para frame-rate independence
    // (ref: https://threejs.org/docs/#api/en/math/MathUtils.damp).
    // Signal: camera.userData.playerMoving escrito por Player3D cada frame.
    //
    // Blend se desactiva cuando:
    //  - modo `isometric` (vista fija sin close-up por diseño)
    //  - dentro de recintos compactos (vista interior maneja su framing)
    //  - siguiendo a un remoto (`isFollowing`)
    //  - admin con `isEditMode` o `isInDrawingMode` (no taparle la vista al
    //    objeto que está colocando; fix 2026-05-12)
    const playerMovingForIdle = (camera as any).userData?.playerMoving as boolean | undefined;
    if (playerMovingForIdle) {
      idleTimeMsRef.current = 0;
    } else {
      idleTimeMsRef.current += delta * 1000;
    }
    const idleHeroAllowed = !isIsometric && !isEditMode && !isInDrawingMode;
    const wantIdleHero = idleHeroAllowed && !usarVistaInterior && !isFollowing && idleTimeMsRef.current >= IDLE_THRESHOLD_MS;
    const idleTargetBlend = wantIdleHero ? 1 : 0;
    // Asimetría: entrar en idle más lento (reveal cinematográfico),
    // salir más rápido (input del usuario debe sentirse inmediato).
    const transitionMs = wantIdleHero ? TRANSITION_TO_IDLE_MS : TRANSITION_TO_MOVING_MS;
    const lambda = dampLambdaForDurationMs(transitionMs);
    idleBlendRef.current = THREE.MathUtils.damp(idleBlendRef.current, idleTargetBlend, lambda, delta);

    // Aplica blend solo fuera de vista interior y follow remoto.
    if (!usarVistaInterior && !isFollowing && idleBlendRef.current > 0.001) {
      const b = idleBlendRef.current;
      cameraDistance = THREE.MathUtils.lerp(cameraDistance, IDLE_HERO_FRAMING.distance, b);
      cameraHeight = THREE.MathUtils.lerp(cameraHeight, IDLE_HERO_FRAMING.height, b);
      cameraTargetHeight = THREE.MathUtils.lerp(cameraTargetHeight, IDLE_HERO_FRAMING.targetHeight, b);
    }

    // ─── Auto-return al framing isométrico tras zoom manual ──────────────
    // Si el usuario hizo zoom in/out (drag o wheel) y se alejó del default,
    // tras `ZOOM_RETURN_IDLE_MS` sin nueva interacción la cámara regresa al
    // framing canónico. Mismo pattern que Cinemachine FreeLook m_RecenterTime.
    //
    // Solo aplica en modo isometric (free tiene chase-cam rotativo que ya
    // tiene su propia lógica). Y no durante drawing / edit / interior /
    // follow remoto (cada uno ya gobierna el framing por su cuenta).
    const lastInteractAt = userInteractionTimestampRef?.current ?? 0;
    const sinceInteractionMs = lastInteractAt > 0 ? Date.now() - lastInteractAt : Number.POSITIVE_INFINITY;
    const zoomReturnActive = isIsometric
      && !isFollowing
      && !usarVistaInterior
      && !isInDrawingMode
      && !isEditMode
      && sinceInteractionMs >= ZOOM_RETURN_IDLE_MS;

    if (zoomReturnActive) {
      cameraDistance = ISOMETRIC_FRAMING.distance;
      cameraHeight = ISOMETRIC_FRAMING.height;
      cameraTargetHeight = ISOMETRIC_FRAMING.targetHeight;
    }

    controls.enabled = !isDragging;
    controls.minDistance = usarVistaInterior ? 1.05 : 1.1;
    controls.maxDistance = usarVistaInterior ? Math.max(cameraDistance + 1.1, 3.2) : 50;

    const moved = !lastPlayerPos.current || Math.abs(playerPos.x - lastPlayerPos.current.x) > 0.001 || Math.abs(playerPos.z - lastPlayerPos.current.z) > 0.001;

    if (!initialized.current) {
      controls.target.set(playerPos.x, CAMERA_INTRO_TARGET_HEIGHT, playerPos.z);
      camera.position.set(playerPos.x, CAMERA_INTRO_HEIGHT, playerPos.z + CAMERA_INTRO_DISTANCE);
      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
      initialized.current = true;
      introStartedAtRef.current = performance.now();
      return;
    }

    if (introStartedAtRef.current !== null) {
      const elapsed = performance.now() - introStartedAtRef.current;
      const progress = Math.min(elapsed / CAMERA_INTRO_DURATION_MS, 1);
      const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      controls.target.set(playerPos.x, THREE.MathUtils.lerp(CAMERA_INTRO_TARGET_HEIGHT, cameraTargetHeight, easedProgress), playerPos.z);
      camera.position.set(playerPos.x, THREE.MathUtils.lerp(CAMERA_INTRO_HEIGHT, cameraHeight, easedProgress), playerPos.z + THREE.MathUtils.lerp(CAMERA_INTRO_DISTANCE, cameraDistance, easedProgress));
      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
      if (progress >= 1) introStartedAtRef.current = null;
      return;
    }

    // ── Chase-cam: dirección → ángulo objetivo ──
    // Mapeo de las 8 direcciones del avatar a ángulos en radianes.
    // La cámara se posiciona DETRÁS del avatar (ángulo + PI).
    // Ref: Three.js OrbitControls spherical coordinate system
    const playerDir = (camera as any).userData?.playerDirection as string | undefined;
    const playerMoving = (camera as any).userData?.playerMoving as boolean | undefined;

    const DIRECTION_TO_ANGLE: Record<string, number> = {
      front: 0,            // avatar mira hacia -Z → cámara detrás en +Z
      back: Math.PI,       // avatar mira hacia +Z → cámara detrás en -Z
      left: Math.PI / 2,   // avatar mira hacia -X → cámara detrás en +X
      right: -Math.PI / 2, // avatar mira hacia +X → cámara detrás en -X
      up: 0,               // alias de front en algunos mapeos
    };

    // Chase-cam SOLO sobre el avatar propio. Al estar siguiendo a otro usuario
    // no tenemos `playerDirection` fiable del remoto, así que congelamos el
    // ángulo objetivo — la cámara orbita al target manteniendo la orientación
    // actual y el usuario puede rotar con el mouse.
    if (!isFollowing && playerDir && playerMoving && DIRECTION_TO_ANGLE[playerDir] !== undefined) {
      targetAngleRef.current = DIRECTION_TO_ANGLE[playerDir];
      // Reset user interaction flag cuando el avatar se mueve
      // (el usuario espera que la cámara siga)
      if (Date.now() - lastPointerDownRef.current > 2000) {
        userInteractingRef.current = false;
      }
    }

    if (moved && lastPlayerPos.current) {
      const deltaX = playerPos.x - lastPlayerPos.current.x;
      const deltaZ = playerPos.z - lastPlayerPos.current.z;

      // Seguir posición del avatar (siempre)
      controls.target.x += deltaX;
      controls.target.z += deltaZ;

      // Chase-cam rotation: rotar offset alrededor del avatar.
      // Deshabilitada en isometric (la cámara mantiene azimuth fija por diseño).
      // En modo `free`, solo se aplica si el usuario no está interactuando
      // manualmente y fuera de vista interior.
      if (!isIsometric && !userInteractingRef.current && !usarVistaInterior) {
        // Lerp suave del ángulo actual al objetivo
        const angleDiff = targetAngleRef.current - currentAngleRef.current;
        // Normalizar diferencia al rango [-PI, PI]
        const normalizedDiff = ((angleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        currentAngleRef.current += normalizedDiff * 0.025; // Factor de lerp suave

        // Calcular nueva posición de cámara basada en ángulo rotado
        const targetCamX = controls.target.x + Math.sin(currentAngleRef.current) * cameraDistance;
        const targetCamZ = controls.target.z + Math.cos(currentAngleRef.current) * cameraDistance;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.04);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.04);
      } else {
        // Modo manual o interior: mover cámara con offset fijo (comportamiento original)
        camera.position.x += deltaX;
        camera.position.z += deltaZ;
      }

      controls.update();
      lastPlayerPos.current = { x: playerPos.x, z: playerPos.z };
    }

    const offsetX = camera.position.x - controls.target.x;
    const offsetZ = camera.position.z - controls.target.z;
    const distanciaHorizontalActual = Math.max(Math.hypot(offsetX, offsetZ), 0.001);
    const smoothing = usarVistaInterior ? 0.18 : 0.1;
    const offsetYActual = camera.position.y - controls.target.y;

    // Sincronizar currentAngle con la posición real de la cámara
    // (permite que OrbitControls manual actualice el ángulo)
    currentAngleRef.current = Math.atan2(offsetX, offsetZ);

    controls.target.y = THREE.MathUtils.lerp(controls.target.y, cameraTargetHeight, smoothing);

    // Pull-in activo: dentro de recintos compactos (siempre), durante el
    // blend hero-idle (fuera de interior y sin follow), o durante el
    // auto-return al framing isométrico tras zoom manual. El blend / auto-
    // return reasignan `cameraDistance/Height/TargetHeight`, pero OrbitControls
    // no mueve camera.position.y ni la radial automáticamente — hay que
    // tirarla activamente aquí (pattern Cinemachine dolly).
    const pullInActive = usarVistaInterior
      || (!isFollowing && idleBlendRef.current > 0.01)
      || zoomReturnActive;

    if (pullInActive && distanciaHorizontalActual > cameraDistance + 0.08) {
      const factorDistancia = cameraDistance / distanciaHorizontalActual;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, controls.target.x + (offsetX * factorDistancia), smoothing);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, controls.target.z + (offsetZ * factorDistancia), smoothing);
    }

    if (pullInActive) {
      const alturaRelativaObjetivo = Math.max(cameraHeight - cameraTargetHeight, 1.05);
      if (offsetYActual > alturaRelativaObjetivo + 0.35 && distanciaHorizontalActual > cameraDistance + 0.04) {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, controls.target.y + alturaRelativaObjetivo, smoothing * 0.9);
      }
    }

    // ─── Camera collision — pull-in cuando hay obstáculo entre target y cámara ──
    // Un raycast desde el target hacia la cámara detecta geometría bloqueante.
    // Si hay hit más cerca que la distancia deseada, aproximamos la cámara al
    // punto de impacto (menos padding 0.2) con lerp suave para evitar snap.
    //
    // Filtrado: ignora SkinnedMesh (avatars), Sprite (labels), InstancedMesh
    // con userData.cameraIgnore=true, meshes con material.transparent (burbujas),
    // y cualquier mesh cuyo nombre contenga 'ui', 'label', 'bubble', 'sky'.
    // Esto evita que partículas, etiquetas flotantes y el skydome activen la
    // colisión. Ref: Three.js Raycaster docs + Unity best practice "layer mask".
    collisionOrigin.current.set(controls.target.x, controls.target.y, controls.target.z);
    collisionDirection.current.set(
      camera.position.x - controls.target.x,
      camera.position.y - controls.target.y,
      camera.position.z - controls.target.z,
    );
    const desiredDistance = collisionDirection.current.length();
    if (desiredDistance > 0.1) {
      collisionDirection.current.normalize();
      collisionRaycaster.current.set(collisionOrigin.current, collisionDirection.current);
      collisionRaycaster.current.far = desiredDistance;
      collisionRaycaster.current.near = 0.2;
      // Fix crítico (2026-04-21): Three.js requiere `raycaster.camera` seteado
      // cuando el grafo contiene `THREE.Sprite` (labels de avatares, burbujas).
      // Sin esto, al testear un Sprite el raycast lee `matrixWorld` de un
      // objeto no preparado y lanza `Cannot read properties of null`. El
      // error se dispara en cada frame del useFrame → spam → congelación.
      // Ref: https://threejs.org/docs/#api/en/core/Raycaster (section Sprites)
      //      https://threejs.org/docs/#api/en/objects/Sprite
      collisionRaycaster.current.camera = camera;
      const hits = collisionRaycaster.current.intersectObjects(scene.children, true);
      // Filtro: el primer hit que sea "camera blocker" (geometría sólida).
      let firstBlocker: THREE.Intersection | null = null;
      for (const hit of hits) {
        const obj = hit.object as THREE.Mesh;
        // Skip: SkinnedMesh, Sprite, meshes UI/transparentes, skydome, flag explícito.
        if ((obj as any).isSkinnedMesh) continue;
        if ((obj as any).isSprite) continue;
        if (obj.userData?.cameraIgnore === true) continue;
        const name = (obj.name || '').toLowerCase();
        if (name.includes('sky') || name.includes('label') || name.includes('bubble') || name.includes('ui')) continue;
        // material transparent => burbuja de video, emoji reaction, etc.
        const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
        const matArr = Array.isArray(mat) ? mat : (mat ? [mat] : []);
        if (matArr.some((m) => m && (m as any).transparent === true)) continue;
        firstBlocker = hit;
        break;
      }
      if (firstBlocker) {
        // Mover cámara al hit - padding. Lerp 0.25 → transición rápida (cámara
        // dentro de pared es molesta) pero no snap (evita jitter si el hit
        // oscila entre frames por physics).
        const pulledDistance = Math.max(firstBlocker.distance - 0.2, 0.3);
        const tx = controls.target.x + collisionDirection.current.x * pulledDistance;
        const ty = controls.target.y + collisionDirection.current.y * pulledDistance;
        const tz = controls.target.z + collisionDirection.current.z * pulledDistance;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.25);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.25);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, tz, 0.25);
      }
    }

    // ─── FOV dinámico (Tier 2) — feel de velocidad al correr ─────────────
    // Lectura del animState vía userData (pub/sub con Player3D, zero coupling).
    // Valores: run=55°, walk=52°, idle/sit=50° (base). Lerp suave 0.05 para
    // que la transición sea orgánica (no snap al presionar shift).
    // Ref: GTA V / Forza / Zelda BOTW pattern.
    if (gpuRenderConfig?.useDynamicFov && !usarVistaInterior && !isFollowing) {
      const persp = camera as THREE.PerspectiveCamera;
      if (persp.isPerspectiveCamera) {
        if (baseFovRef.current === null) baseFovRef.current = persp.fov;
        const baseFov = baseFovRef.current;
        const animState = (camera as any).userData?.playerAnimState as string | undefined;
        const targetFov = animState === 'run' ? baseFov + 5 : animState === 'walk' ? baseFov + 2 : baseFov;
        const newFov = THREE.MathUtils.lerp(persp.fov, targetFov, 0.05);
        if (Math.abs(newFov - persp.fov) > 0.01) {
          persp.fov = newFov;
          persp.updateProjectionMatrix();
        }
      }
    }

    // ─── OTS offset (Tier 2, opt-in via setting) ─────────────────────────
    // Desplaza el target lateralmente según la orientación cámara→avatar, de
    // modo que el avatar quede ligeramente descentrado a un hombro. Más
    // cinemático que vista centrada pura. Solo cuando el usuario lo activa
    // explícitamente en settings (default: 'center' = comportamiento actual).
    // Ref: GTA V shoulder swap, Fortnite L/R toggle, Witcher 3 OTS.
    if (cameraShoulderMode !== 'center' && !usarVistaInterior && !isFollowing) {
      const shoulderSign = cameraShoulderMode === 'right' ? 1 : -1;
      const shoulderOffset = 0.3;
      // Vector perpendicular a la dirección cámara→avatar en el plano XZ.
      const dx = camera.position.x - controls.target.x;
      const dz = camera.position.z - controls.target.z;
      const len = Math.hypot(dx, dz) || 1;
      const perpX = -dz / len;
      const perpZ = dx / len;
      controls.target.x = THREE.MathUtils.lerp(controls.target.x, playerPos.x + perpX * shoulderOffset * shoulderSign, 0.12);
      controls.target.z = THREE.MathUtils.lerp(controls.target.z, playerPos.z + perpZ * shoulderOffset * shoulderSign, 0.12);
    }

    controls.update();
  }, -1);

  // Detectar interacción manual del usuario con OrbitControls
  // Si el usuario arrastra la cámara manualmente, pausar auto-rotation
  // del chase-cam durante 2 segundos para no interferir.
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const onPointerDown = () => {
      userInteractingRef.current = true;
      lastPointerDownRef.current = Date.now();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return null;
};

CameraFollow.displayName = 'CameraFollow';
