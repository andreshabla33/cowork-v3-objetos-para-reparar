import type { TipoReunion } from './MeetingControlBar';
import type { TipoReunionUnificado, InvitadoExterno } from '@/types/meeting-types';
import type { CargoLaboral } from '../recording/types/analysis';
import type { PreferenciasIngresoReunion } from '@/hooks/app/useRutasReunion';

export interface MeetingRoomProps {
  salaId: string;
  tokenInvitacion?: string;
  nombreInvitado?: string;
  preferenciasIngreso?: PreferenciasIngresoReunion;
  tipoReunion?: TipoReunion;
  reunionId?: string;
  onLeave?: () => void;
  onError?: (error: string) => void;
}

export interface TokenData {
  token: string;
  url: string;
  sala_nombre: string;
  sala_id?: string;
  participante_id: string;
  permisos: {
    canPublish: boolean;
    canSubscribe: boolean;
    roomAdmin: boolean;
  };
  tipo_reunion?: TipoReunionUnificado;
  tipo_grabacion?: string;
  reunion_id?: string;
  invitado_externo?: InvitadoExterno;
}

export interface GuestPermissions {
  allowChat: boolean;
  allowVideo: boolean;
}

export type MeetingConnectionPhase = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'error';

export interface MeetingRecoveryState {
  phase: MeetingConnectionPhase;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  lastRecoverableError: string | null;
  recoveryMessage: string | null;
}

export interface MeetingQualityState {
  mode: 'high' | 'medium' | 'low';
  poorConnectionParticipants: number;
  reason: string | null;
}

export interface MeetingRoomContentProps {
  theme: string;
  isHost: boolean;
  isExternalGuest?: boolean;
  tokenInvitacion?: string;
  onLeave?: () => void;
  onRetryConnection?: () => void;
  tipoReunion: TipoReunion;
  salaId: string;
  reunionId?: string;
  initialCameraEnabled: boolean;
  initialMicrophoneEnabled: boolean;
  showChat: boolean;
  onToggleChat: () => void;
  espacioId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  cargoUsuario: CargoLaboral;
  invitadosExternos?: InvitadoExterno[];
  guestPermissions?: GuestPermissions;
  recoveryState?: MeetingRecoveryState;
  qualityState?: MeetingQualityState;
}

export interface MeetingConsentRequest {
  by: string;
  grabacionId: string;
}
