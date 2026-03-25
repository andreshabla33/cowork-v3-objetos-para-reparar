/**
 * Domain types for realtime-room module
 * Core entities and value objects for media, permissions, and room state
 */

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export type TrackState = 'unpublished' | 'publishing' | 'published' | 'unpublishing' | 'error';

export type LayoutMode = 'gallery' | 'speaker' | 'sidebar' | '3d-pinned' | '3d-bubble-only';

export type ParticipantPriority = 'local' | 'speaker' | 'raised-hand' | 'pinned' | 'proximity' | 'default';

export interface DeviceInfo {
  id: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

export interface MediaTrackState {
  trackId: string;
  kind: 'audio' | 'video';
  deviceId: string;
  enabled: boolean;
  muted: boolean;
  state: TrackState;
}

export interface PreflightCheck {
  camera: PermissionState;
  microphone: PermissionState;
  hasCameraDevice: boolean;
  hasMicrophoneDevice: boolean;
  cameraTrackReady: boolean;
  microphoneTrackReady: boolean;
  errors: PreflightError[];
  ready: boolean;
}

export interface PreflightError {
  type: 'permission-denied' | 'no-device' | 'track-error' | 'browser-not-supported';
  device?: 'camera' | 'microphone';
  message: string;
  recoverable: boolean;
}

export interface ScreenShareSession {
  active: boolean;
  withAudio: boolean;
  track?: MediaStreamTrack;
  stream?: MediaStream;
}

export interface AudioProcessingOptions {
  noiseReduction: boolean;
  noiseReductionLevel: 'off' | 'standard' | 'enhanced';
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface DevicePreferences {
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;
}

export interface RoomEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  participantId?: string;
}

export interface ReactionPayload {
  emoji: string;
  from?: string;
  fromName?: string;
}

export interface ChatPayload {
  message: string;
  from: string;
  fromName: string;
}

export interface WavePayload {
  from: string;
  fromName: string;
  to?: string;
}

export interface NudgePayload {
  from: string;
  fromName: string;
  to?: string;
}

export interface InvitePayload {
  from: string;
  fromName: string;
  to?: string;
  x: number;
  y: number;
}

export interface MovementPayload {
  id: string;
  x: number;
  y: number;
  direction: string;
  isMoving: boolean;
  animState?: string;
  chunk?: string;
  timestamp?: number;
}

export interface LockConversationPayload {
  locked: boolean;
  by: string;
  participants: string[];
}

export interface RecordingStatusPayload {
  isRecording: boolean;
  by: string;
}

export interface ConsentRequestPayload {
  grabacionId: string;
  guestName: string;
  guestEmail: string;
  by: string;
}

export interface ConsentResponsePayload {
  accepted: boolean;
  grabacionId: string;
  by: string;
}

export interface RaiseHandPayload {
  participantId: string;
  raised: boolean;
  by: string;
}

export interface PinParticipantPayload {
  participantId: string | null;
  pinned: boolean;
  by: string;
}

export interface SpeakerHintPayload {
  participantId: string;
  speaking: boolean;
}

export interface ModerationNoticePayload {
  targetParticipantId: string;
  action: 'mute_microphone';
  by: string;
  message?: string;
}

export type DataPacketType =
  | 'movement'
  | 'chat'
  | 'reaction'
  | 'wave'
  | 'nudge'
  | 'invite'
  | 'lock_conversation'
  | 'recording_status'
  | 'consent_request'
  | 'consent_response'
  | 'raise_hand'
  | 'pin_participant'
  | 'speaker_hint'
  | 'moderation_notice';

export type MovementDataPacket = { type: 'movement'; payload: MovementPayload };
export type ChatDataPacket = { type: 'chat'; payload: ChatPayload };
export type ReactionDataPacket = { type: 'reaction'; payload: ReactionPayload };
export type WaveDataPacket = { type: 'wave'; payload: WavePayload };
export type NudgeDataPacket = { type: 'nudge'; payload: NudgePayload };
export type InviteDataPacket = { type: 'invite'; payload: InvitePayload };
export type LockConversationDataPacket = { type: 'lock_conversation'; payload: LockConversationPayload };
export type RecordingStatusDataPacket = { type: 'recording_status'; payload: RecordingStatusPayload };
export type ConsentRequestDataPacket = { type: 'consent_request'; payload: ConsentRequestPayload };
export type ConsentResponseDataPacket = { type: 'consent_response'; payload: ConsentResponsePayload };
export type RaiseHandDataPacket = { type: 'raise_hand'; payload: RaiseHandPayload };
export type PinParticipantDataPacket = { type: 'pin_participant'; payload: PinParticipantPayload };
export type SpeakerHintDataPacket = { type: 'speaker_hint'; payload: SpeakerHintPayload };
export type ModerationNoticeDataPacket = { type: 'moderation_notice'; payload: ModerationNoticePayload };

export type DataPacketContract =
  | MovementDataPacket
  | ChatDataPacket
  | ReactionDataPacket
  | WaveDataPacket
  | NudgeDataPacket
  | InviteDataPacket
  | LockConversationDataPacket
  | RecordingStatusDataPacket
  | ConsentRequestDataPacket
  | ConsentResponseDataPacket
  | RaiseHandDataPacket
  | PinParticipantDataPacket
  | SpeakerHintDataPacket
  | ModerationNoticeDataPacket;

export type DataPacketByType<TType extends DataPacketType> = Extract<DataPacketContract, { type: TType }>;

export const createMovementDataPacket = (payload: MovementPayload): MovementDataPacket => ({ type: 'movement', payload });

export const createChatDataPacket = (payload: ChatPayload): ChatDataPacket => ({ type: 'chat', payload });

export const createReactionDataPacket = (payload: ReactionPayload): ReactionDataPacket => ({ type: 'reaction', payload });

export const createWaveDataPacket = (payload: WavePayload): WaveDataPacket => ({ type: 'wave', payload });

export const createNudgeDataPacket = (payload: NudgePayload): NudgeDataPacket => ({ type: 'nudge', payload });

export const createInviteDataPacket = (payload: InvitePayload): InviteDataPacket => ({ type: 'invite', payload });

export const createLockConversationDataPacket = (payload: LockConversationPayload): LockConversationDataPacket => ({ type: 'lock_conversation', payload });

export const createRecordingStatusDataPacket = (payload: RecordingStatusPayload): RecordingStatusDataPacket => ({ type: 'recording_status', payload });

export const createConsentRequestDataPacket = (payload: ConsentRequestPayload): ConsentRequestDataPacket => ({ type: 'consent_request', payload });

export const createConsentResponseDataPacket = (payload: ConsentResponsePayload): ConsentResponseDataPacket => ({ type: 'consent_response', payload });

export const createRaiseHandDataPacket = (payload: RaiseHandPayload): RaiseHandDataPacket => ({ type: 'raise_hand', payload });

export const createPinParticipantDataPacket = (payload: PinParticipantPayload): PinParticipantDataPacket => ({ type: 'pin_participant', payload });

export const createSpeakerHintDataPacket = (payload: SpeakerHintPayload): SpeakerHintDataPacket => ({ type: 'speaker_hint', payload });

export const createModerationNoticeDataPacket = (payload: ModerationNoticePayload): ModerationNoticeDataPacket => ({ type: 'moderation_notice', payload });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isDataPacketContract(value: unknown): value is DataPacketContract {
  if (!isRecord(value) || typeof value.type !== 'string' || !('payload' in value)) {
    return false;
  }

  const payload = value.payload;
  if (!isRecord(payload)) {
    return false;
  }

  switch (value.type) {
    case 'movement':
      return typeof payload.id === 'string'
        && typeof payload.x === 'number'
        && typeof payload.y === 'number'
        && typeof payload.direction === 'string'
        && typeof payload.isMoving === 'boolean'
        && isOptionalString(payload.animState)
        && isOptionalString(payload.chunk)
        && (payload.timestamp === undefined || typeof payload.timestamp === 'number');
    case 'chat':
      return typeof payload.message === 'string'
        && typeof payload.from === 'string'
        && typeof payload.fromName === 'string';
    case 'reaction':
      return typeof payload.emoji === 'string'
        && isOptionalString(payload.from)
        && isOptionalString(payload.fromName);
    case 'wave':
    case 'nudge':
      return typeof payload.from === 'string'
        && typeof payload.fromName === 'string'
        && isOptionalString(payload.to);
    case 'invite':
      return typeof payload.from === 'string'
        && typeof payload.fromName === 'string'
        && isOptionalString(payload.to)
        && typeof payload.x === 'number'
        && typeof payload.y === 'number';
    case 'lock_conversation':
      return typeof payload.locked === 'boolean'
        && typeof payload.by === 'string'
        && isStringArray(payload.participants);
    case 'recording_status':
      return typeof payload.isRecording === 'boolean' && typeof payload.by === 'string';
    case 'consent_request':
      return typeof payload.grabacionId === 'string'
        && typeof payload.guestName === 'string'
        && typeof payload.guestEmail === 'string'
        && typeof payload.by === 'string';
    case 'consent_response':
      return typeof payload.accepted === 'boolean'
        && typeof payload.grabacionId === 'string'
        && typeof payload.by === 'string';
    case 'raise_hand':
      return typeof payload.participantId === 'string'
        && typeof payload.raised === 'boolean'
        && typeof payload.by === 'string';
    case 'pin_participant':
      return (payload.participantId === null || typeof payload.participantId === 'string')
        && typeof payload.pinned === 'boolean'
        && typeof payload.by === 'string';
    case 'speaker_hint':
      return typeof payload.participantId === 'string' && typeof payload.speaking === 'boolean';
    case 'moderation_notice':
      return typeof payload.targetParticipantId === 'string'
        && payload.action === 'mute_microphone'
        && typeof payload.by === 'string'
        && isOptionalString(payload.message);
    default:
      return false;
  }
}

export function parseDataPacketContract(value: unknown): DataPacketContract | null {
  return isDataPacketContract(value) ? value : null;
}
