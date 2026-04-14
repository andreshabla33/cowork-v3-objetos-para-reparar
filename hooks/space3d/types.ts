/**
 * @module hooks/space3d/types
 * Tipos e interfaces compartidas entre todos los hooks de Space3D.
 * Centraliza las definiciones para evitar duplicación y circular dependencies.
 */

import type { User, PresenceStatus, AutorizacionEmpresa, ZonaEmpresa, Workspace } from '@/types';
import type { CameraSettings, AudioSettings } from '@/modules/realtime-room';
import type { JoystickInput } from '@/components/3d/MobileJoystick';
import type { EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import type { GpuInfo } from '@/lib/gpuCapabilities';
import type { UserSettings } from '@/lib/userSettings';
import type { Room } from 'livekit-client';
import type { Session } from '@supabase/supabase-js';
import type { DataPacketContract, RealtimeEventBus, SpaceRealtimeCoordinator, SpaceRealtimeCoordinatorState } from '@/modules/realtime-room';
import type { AccionXP } from '@/lib/gamificacion';
import type { SpaceMediaCoordinatorState } from '@/modules/realtime-room';

// ========== Constantes globales ==========

export const MOVE_SPEED = 4;
export const RUN_SPEED = 8;
export const WORLD_SIZE = 100;
export const PROXIMITY_RADIUS = 130;
export const PROXIMITY_ACTIVATION_FACTOR = 0.8;
export const PROXIMITY_EXIT_FACTOR = 1.2;
export const AUDIO_SPATIAL_RADIUS_FACTOR = 1.25;
export const TELEPORT_DISTANCE = 15;
export const CHAIR_SIT_RADIUS = 1.5;
export const CHAIR_POSITIONS_3D = [[8, 8], [12, 8], [8, 12], [12, 12], [8, 10], [12, 10]];
export const ZONA_SOLICITUD_RADIO = 140;
export const LOD_NEAR_DISTANCE = 25;
export const LOD_MID_DISTANCE = 60;
export const MOVEMENT_BROADCAST_MS = 100;
export const PROXIMITY_COORD_THRESHOLD = 8;

export type RealtimeTransportMode = 'livekit';

// ========== Tipos auxiliares ==========

export interface RealtimePositionEntry {
  x: number;
  y: number;
  direction?: string;
  isMoving?: boolean;
  animState?: string;
  timestamp: number;
}

export type AvatarLodLevel = 'high' | 'mid' | 'low';
export type DireccionAvatar = User['direction'] | 'up' | 'down' | 'front-left' | 'front-right' | 'up-left' | 'up-right';

// ========== Interfaces de Props ==========

export interface VirtualSpace3DProps {
  theme?: string;
  isGameHubOpen?: boolean;
  isPlayingGame?: boolean;
  showroomMode?: boolean;
  showroomDuracionMin?: number;
  showroomNombreVisitante?: string;
}

// ========== Interfaces de retorno de hooks ==========

export interface UseUserSettingsReturn {
  userSettingsVersion: number;
  // Fix pendiente #2: `ReturnType<typeof getSettingsSection>` sin genérico
  // colapsaba a la union de TODAS las secciones y rompía el narrowing
  // downstream. Usar `UserSettings['<section>']` directamente preserva
  // el tipo concreto de cada sección.
  space3dSettings: import('@/lib/userSettings').UserSettings['space3d'];
  meetingsSettings: import('@/lib/userSettings').UserSettings['meetings'];
  notifSettings: import('@/lib/userSettings').UserSettings['notifications'];
  performanceSettings: import('@/lib/userSettings').UserSettings['performance'];
  gpuInfo: GpuInfo | null;
  gpuRenderConfig: ReturnType<typeof import('@/lib/gpuCapabilities').adaptiveConfigFromTier> | null;
  radioInteresChunks: number;
  userMoveSpeed: number;
  userRunSpeed: number;
  userProximityRadius: number;
  maxDpr: number;
  minDpr: number;
  adaptiveDpr: number;
  setAdaptiveDpr: React.Dispatch<React.SetStateAction<number>>;
  enableDayNightCycle: boolean;
  cameraSettings: CameraSettings;
  setCameraSettings: React.Dispatch<React.SetStateAction<CameraSettings>>;
  audioSettings: AudioSettings;
  setAudioSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  isInActiveCall: () => boolean;
}

export interface UseRecordingReturn {
  isRecording: boolean;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  recordingDuration: number;
  setRecordingDuration: React.Dispatch<React.SetStateAction<number>>;
  consentimientoAceptado: boolean;
  setConsentimientoAceptado: React.Dispatch<React.SetStateAction<boolean>>;
  tipoGrabacionActual: string | null;
  setTipoGrabacionActual: React.Dispatch<React.SetStateAction<string | null>>;
  recordingTrigger: boolean;
  setRecordingTrigger: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleRecording: () => void;
}

export interface UseNotificationsReturn {
  notificacionAutorizacion: {
    id: string;
    titulo: string;
    mensaje?: string | null;
    tipo: string;
    datos_extra?: Record<string, unknown> | null;
  } | null;
  setNotificacionAutorizacion: React.Dispatch<React.SetStateAction<UseNotificationsReturn['notificacionAutorizacion']>>;
  solicitudesEnviadas: AutorizacionEmpresa[];
  solicitandoAcceso: boolean;
  zonasEmpresa: ZonaEmpresa[];
  zonaAccesoProxima: { zona: ZonaEmpresa; distancia: number; pendiente: boolean } | null;
  handleSolicitarAccesoZona: () => Promise<void>;
  cargarAutorizaciones: () => Promise<void>;
  refrescarZonasEmpresa: () => Promise<void>;
  setZonaColisionadaId: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface UseChunkSystemReturn {
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  chunkWorkerRef: React.MutableRefObject<Worker | null>;
  interpolacionWorkerRef: React.MutableRefObject<Worker | null>;
  posicionesInterpoladasRef: React.MutableRefObject<Map<string, { x: number; z: number; direction?: DireccionAvatar; isMoving?: boolean }>>;
  currentUserEcs: User;
  onlineUsersEcs: User[];
  usuariosEnChunks: User[];
  usuariosParaConexion: User[];
  usuariosParaMinimapa: User[];
  chunkActual: ReturnType<typeof import('@/lib/chunkSystem').obtenerChunk>;
  chunkVecinosRef: React.MutableRefObject<Set<string>>;
  usuariosVisiblesRef: React.MutableRefObject<Set<string>>;
  setPositionEcs: (x: number, y: number, direction?: string, isSitting?: boolean, isMoving?: boolean) => void;
  normalizarDireccion: (direccion?: string) => User['direction'] | undefined;
}

export interface UseMediaStreamReturn {
  stream: MediaStream | null;
  setStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  screenStream: MediaStream | null;
  setScreenStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  activeStreamRef: React.MutableRefObject<MediaStream | null>;
  activeScreenRef: React.MutableRefObject<MediaStream | null>;
  handleToggleScreenShare: () => Promise<void>;
  crearAudioProcesado: (track: MediaStreamTrack, nivel: 'standard' | 'enhanced') => Promise<MediaStreamTrack | null>;
  limpiarAudioProcesado: () => void;
}

export interface UseLiveKitReturn {
  realtimeTransportMode: RealtimeTransportMode;
  livekitRoomRef: React.MutableRefObject<Room | null>;
  realtimeCoordinatorRef: React.MutableRefObject<SpaceRealtimeCoordinator | null>;
  realtimeEventBusRef: React.MutableRefObject<RealtimeEventBus | null>;
  realtimeCoordinatorState: SpaceRealtimeCoordinatorState | null;
  livekitConnected: boolean;
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  remoteAudioTracks: Map<string, MediaStreamTrack>;
  speakingUsers: Set<string>;
  setSpeakingUsers: React.Dispatch<React.SetStateAction<Set<string>>>;
  publicarTrackLocal: (track: MediaStreamTrack, tipo: 'audio' | 'video' | 'screen') => Promise<void>;
  despublicarTrackLocal: (tipo: 'audio' | 'video' | 'screen') => Promise<void>;
  sincronizarTracksLocales: () => Promise<void>;
  conectarLivekit: (roomName: string) => Promise<void>;
  limpiarLivekit: () => Promise<void>;
  enviarDataLivekit: (mensaje: DataPacketContract, reliable?: boolean) => boolean;
  permitirMediaParticipante: (metadata?: string | null) => boolean;
  getPublishedVideoTrack: () => import('livekit-client').LocalVideoTrack | null;
}

export interface UseProximityReturn {
  stableProximityCoords: { x: number; y: number };
  usersInCall: User[];
  orderedUsersInCall: User[];
  usersInCallIds: Set<string>;
  hasActiveCall: boolean;
  usersInAudioRange: User[];
  usersInAudioRangeIds: Set<string>;
  userDistances: Map<string, number>;
  remoteStreamsRouted: Map<string, MediaStream>;
  remoteScreenStreamsRouted: Map<string, MediaStream>;
  conversacionBloqueada: boolean;
  setConversacionBloqueada: React.Dispatch<React.SetStateAction<boolean>>;
  conversacionesBloqueadasRemoto: Map<string, string[]>;
  setConversacionesBloqueadasRemoto: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  conversacionProximaBloqueada: { lockerId: string; participants: string[]; nombre: string } | null;
}

export interface UseBroadcastReturn {
  broadcastMovement: (x: number, y: number, direction: string, isMoving: boolean, animState?: string, reliable?: boolean) => void;
  manejarEventoInstantaneo: (mensaje: DataPacketContract) => void;
  bloquearConversacion: () => void;
  handleSendMessage: () => Promise<void>;
  handleTriggerReaction: (emoji: string) => void;
  handleToggleRaiseHand: () => void;
  // UI state gestionado por broadcast (chat, emojis)
  showEmojis: boolean;
  setShowEmojis: React.Dispatch<React.SetStateAction<boolean>>;
  showChat: boolean;
  setShowChat: React.Dispatch<React.SetStateAction<boolean>>;
  showStatusPicker: boolean;
  setShowStatusPicker: React.Dispatch<React.SetStateAction<boolean>>;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  localMessage: string | null;
  remoteMessages: Map<string, string>;
  localReactions: Array<{ id: string; emoji: string }>;
  remoteReaction: { emoji: string; from: string; fromName: string } | null;
  raisedHandParticipantIds: Set<string>;
  isLocalHandRaised: boolean;
  incomingWave: { from: string; fromName: string } | null;
  setIncomingWave: React.Dispatch<React.SetStateAction<{ from: string; fromName: string } | null>>;
}

export interface UseGatherInteractionsReturn {
  selectedRemoteUser: User | null;
  setSelectedRemoteUser: React.Dispatch<React.SetStateAction<User | null>>;
  followTargetId: string | null;
  setFollowTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  followTargetIdRef: React.MutableRefObject<string | null>;
  incomingNudge: { from: string; fromName: string } | null;
  setIncomingNudge: React.Dispatch<React.SetStateAction<{ from: string; fromName: string } | null>>;
  incomingInvite: { from: string; fromName: string; x: number; y: number } | null;
  setIncomingInvite: React.Dispatch<React.SetStateAction<{ from: string; fromName: string; x: number; y: number } | null>>;
  handleClickRemoteAvatar: (userId: string) => void;
  handleGoToUser: (userId: string) => void;
  handleNudgeUser: (userId: string) => void;
  handleInviteUser: (userId: string) => void;
  handleFollowUser: (userId: string) => void;
  handleWaveUser: (userId: string) => void;
  handleAcceptInvite: () => void;
  avatarInteractionsMemo: {
    onGoTo: (userId: string) => void;
    onNudge: (userId: string) => void;
    onInvite: (userId: string) => void;
    onFollow: (userId: string) => void;
    onWave: (userId: string) => void;
    followTargetId: string | null;
    profilePhoto: string | null;
  };
}

// ========== Interfaces de parámetros de hooks ==========

export interface UseUserSettingsParams {
  livekitRoomRef: React.MutableRefObject<Room | null>;
  hasActiveCallRef: React.MutableRefObject<boolean>;
  toggleMic: () => void;
  toggleCamera: () => void;
}

export interface UseChunkSystemParams {
  currentUser: User;
  onlineUsers: User[];
  empresasAutorizadas: string[];
  radioInteresChunks: number;
  setPosition: (x: number, y: number, direction?: User['direction'], isSitting?: boolean, isMoving?: boolean) => void;
}

export interface UseProximityParams {
  currentUserEcs: User;
  usuariosEnChunks: User[];
  session: Session | null;
  currentUser: User;
  userProximityRadius: number;
  conversacionesBloqueadasRemoto: Map<string, string[]>;
  remoteStreams: Map<string, MediaStream>;
  remoteScreenStreams: Map<string, MediaStream>;
  speakingUsers: Set<string>;
  performanceSettings: UserSettings['performance'];
  usersInAudioRange: User[];
  selectedRemoteUser: User | null;
  setSelectedRemoteUser: React.Dispatch<React.SetStateAction<User | null>>;
  handleToggleScreenShare: () => Promise<void>;
}

export interface UseBroadcastParams {
  session: Session | null;
  currentUser: User;
  currentUserEcs: User;
  activeWorkspace: Workspace | null;
  usersInCall: User[];
  enviarDataLivekit: (mensaje: DataPacketContract, reliable?: boolean) => boolean;
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  usuariosVisiblesRef: React.MutableRefObject<Set<string>>;
  realtimePositionsRef: React.MutableRefObject<Map<string, RealtimePositionEntry>>;
  realtimeEventBusRef: React.MutableRefObject<RealtimeEventBus | null>;
  conversacionBloqueada: boolean;
  setConversacionBloqueada: React.Dispatch<React.SetStateAction<boolean>>;
  setConversacionesBloqueadasRemoto: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  grantXP: (accion: AccionXP, cooldownMs?: number) => void;
  notifSettings: UserSettings['notifications'];
  setPrivacy: (value: boolean) => void;
  hasActiveCall: boolean;
  proximidadNotificadaRef: React.MutableRefObject<boolean>;
}

export interface UseGatherInteractionsParams {
  session: Session | null;
  currentUser: User;
  currentUserEcs: User;
  usuariosEnChunks: User[];
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  enviarDataLivekit: (mensaje: DataPacketContract, reliable?: boolean) => boolean;
  grantXP: (accion: AccionXP, cooldownMs?: number) => void;
  setTeleportTarget: React.Dispatch<React.SetStateAction<{ x: number; z: number } | null>>;
  setMoveTarget: React.Dispatch<React.SetStateAction<{ x: number; z: number } | null>>;
  setIncomingNudge: React.Dispatch<React.SetStateAction<{ from: string; fromName: string } | null>>;
  setIncomingInvite: React.Dispatch<React.SetStateAction<{ from: string; fromName: string; x: number; y: number } | null>>;
}

export interface UseNotificationsParams {
  session: Session | null;
  activeWorkspace: Workspace | null;
  currentUser: User;
  empresasAutorizadas: string[];
  setEmpresasAutorizadas: (empresas: string[]) => void;
  currentUserEcs: User;
  notifSettings: UserSettings['notifications'];
}

export interface UseLiveKitParams {
  activeWorkspace: Workspace | null;
  session: Session | null;
  currentUser: User;
  empresasAutorizadas: string[];
  onlineUsers: User[];
  activeStreamRef: React.MutableRefObject<MediaStream | null>;
  activeScreenRef: React.MutableRefObject<MediaStream | null>;
  desiredMediaState: { isMicrophoneEnabled: boolean; isCameraEnabled: boolean; isScreenShareEnabled: boolean };
  mediaCoordinatorState: SpaceMediaCoordinatorState | null;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraSettings: { backgroundEffect: string };
  performanceSettings?: { graphicsQuality?: string; batterySaver?: boolean };
  hasActiveCall: boolean;
  usersInCall: User[];
  usersInAudioRange: User[];
  conversacionesBloqueadasRemoto: Map<string, string[]>;
}
