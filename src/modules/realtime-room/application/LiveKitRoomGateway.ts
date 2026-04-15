/**
 * LiveKitRoomGateway — Observador de Room para meetings/videocall.
 *
 * A diferencia de SpaceRealtimeCoordinator que POSEE el ciclo de vida de Room,
 * este Gateway RECIBE una Room ya conectada (vía bindRoom) y observa eventos.
 *
 * La publicación de datos y el parsing de DataReceived se delegan a
 * RealtimeDataPublisher y RealtimeEventParser (composición, no herencia)
 * para eliminar la duplicación entre ambos pipelines.
 */

import {
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackPublication,
} from 'livekit-client';
import {
  type ConsentRequestPayload,
  type ConsentResponsePayload,
  type DataPacketContract,
  type PublishableDataPacketContract,
  type ModerationNoticePayload,
  type PinParticipantPayload,
  type RaiseHandPayload,
  type ReactionPayload,
  type RecordingStatusPayload,
  type SpeakerHintPayload,
} from '../domain/types';
import { RealtimeEventBus } from './RealtimeEventBus';
import { RealtimeDataPublisher } from './RealtimeDataPublisher';
import { RealtimeEventParser } from './RealtimeEventParser';
import { logger } from '@/lib/logger';

const log = logger.child('livekit-room-gateway');

export interface LiveKitRoomGatewayState {
  connected: boolean;
  roomName: string | null;
  localParticipantId: string | null;
  localParticipantName: string | null;
  remoteParticipants: RemoteParticipant[];
  speakingParticipants: string[];
}

export interface LiveKitRoomGatewayOptions {
  onConnectionChange?: (connected: boolean) => void;
  onTrackPublished?: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  onLocalTrackPublished?: (publication: LocalTrackPublication) => void;
  onLocalTrackUnpublished?: (publication: LocalTrackPublication) => void;
  onRemoteTrackSubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onRemoteTrackUnsubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onDataReceived?: (payload: DataPacketContract, participant?: RemoteParticipant) => void;
  onSpeakerChange?: (speakingParticipants: string[]) => void;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onStateChange?: (state: LiveKitRoomGatewayState) => void;
}

export class LiveKitRoomGateway {
  private room: Room | null = null;
  private eventBus = new RealtimeEventBus();
  private connected = false;
  private speakingParticipants: Set<string> = new Set();
  private cleanupFns: Array<() => void> = [];
  private options: LiveKitRoomGatewayOptions;

  /** Servicio compuesto — publicación de datos (compartido con SpaceRealtimeCoordinator) */
  private readonly dataPublisher: RealtimeDataPublisher;
  /** Servicio compuesto — parsing de DataReceived (compartido con SpaceRealtimeCoordinator) */
  private eventParser: RealtimeEventParser;

  constructor(options: LiveKitRoomGatewayOptions = {}) {
    this.options = options;
    this.dataPublisher = new RealtimeDataPublisher(() => this.room);
    this.eventParser = new RealtimeEventParser(this.eventBus, options.onDataReceived);
  }

  bindRoom(room: Room): void {
    if (this.room === room) {
      this.connected = room.state === 'connected';
      this.speakingParticipants = new Set(room.activeSpeakers.map((speaker) => speaker.identity));
      this.notifyStateChange();
      return;
    }

    this.unbindRoom();
    this.room = room;
    this.connected = room.state === 'connected';
    this.speakingParticipants = new Set(room.activeSpeakers.map((speaker) => speaker.identity));
    this.setupEventHandlers(room);
    this.options.onConnectionChange?.(this.connected);
    this.options.onSpeakerChange?.(Array.from(this.speakingParticipants));
    this.notifyStateChange();
  }

  unbindRoom(): void {
    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
    this.room = null;
    this.connected = false;
    this.speakingParticipants.clear();
    this.notifyStateChange();
  }

  destroy(): void {
    this.unbindRoom();
    this.eventBus.clear();
  }

  // ─── Data Publishing (delegado a RealtimeDataPublisher) ──────────

  async publishData(data: PublishableDataPacketContract, reliableOverride?: boolean): Promise<boolean> {
    return this.dataPublisher.publish(data, reliableOverride);
  }

  async sendReaction(payload: ReactionPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'reaction', payload }, reliable)
      : this.dataPublisher.sendReaction(payload);
  }

  async sendRecordingStatus(payload: RecordingStatusPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'recording_status', payload }, reliable)
      : this.dataPublisher.sendRecordingStatus(payload);
  }

  async sendConsentRequest(payload: ConsentRequestPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'consent_request', payload }, reliable)
      : this.dataPublisher.sendConsentRequest(payload);
  }

  async sendConsentResponse(payload: ConsentResponsePayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'consent_response', payload }, reliable)
      : this.dataPublisher.sendConsentResponse(payload);
  }

  async sendRaiseHand(payload: RaiseHandPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'raise_hand', payload }, reliable)
      : this.dataPublisher.sendRaiseHand(payload);
  }

  async sendPinParticipant(payload: PinParticipantPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'pin_participant', payload }, reliable)
      : this.dataPublisher.sendPinParticipant(payload);
  }

  async sendSpeakerHint(payload: SpeakerHintPayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'speaker_hint', payload }, reliable)
      : this.dataPublisher.sendSpeakerHint(payload);
  }

  async sendModerationNotice(payload: ModerationNoticePayload, reliable?: boolean): Promise<boolean> {
    return reliable !== undefined
      ? this.dataPublisher.publish({ type: 'moderation_notice', payload }, reliable)
      : this.dataPublisher.sendModerationNotice(payload);
  }

  // ─── State & Accessors ──────────────────────────────────────────

  getRoom(): Room | null {
    return this.room;
  }

  getEventBus(): RealtimeEventBus {
    return this.eventBus;
  }

  getState(): LiveKitRoomGatewayState {
    return {
      connected: this.connected,
      roomName: this.room?.name ?? null,
      localParticipantId: this.room?.localParticipant?.identity ?? null,
      localParticipantName: this.room?.localParticipant?.name ?? null,
      remoteParticipants: this.room ? Array.from(this.room.remoteParticipants.values()) : [],
      speakingParticipants: Array.from(this.speakingParticipants),
    };
  }

  // ─── Private ────────────────────────────────────────────────────

  private notifyStateChange(): void {
    this.options.onStateChange?.(this.getState());
  }

  private setupEventHandlers(room: Room): void {
    const bind = <TArgs extends unknown[]>(event: RoomEvent, handler: (...args: TArgs) => void) => {
      room.on(event, handler as (...args: TArgs) => void);
      this.cleanupFns.push(() => {
        room.off(event, handler as (...args: TArgs) => void);
      });
    };

    bind(RoomEvent.Connected, () => {
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    bind(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.options.onConnectionChange?.(false);
      this.notifyStateChange();
    });

    bind(RoomEvent.Reconnected, () => {
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    bind(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      this.options.onLocalTrackPublished?.(publication);
      this.notifyStateChange();
    });

    bind(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      this.options.onLocalTrackUnpublished?.(publication);
      this.notifyStateChange();
    });

    bind(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      this.options.onTrackPublished?.(publication, participant);
      this.notifyStateChange();
    });

    bind(RoomEvent.TrackSubscribed, (track: Track, publication: TrackPublication, participant: RemoteParticipant) => {
      this.options.onRemoteTrackSubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    bind(RoomEvent.TrackUnsubscribed, (track: Track, publication: TrackPublication, participant: RemoteParticipant) => {
      this.options.onRemoteTrackUnsubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    bind(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.options.onParticipantConnected?.(participant);
      this.notifyStateChange();
    });

    bind(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.options.onParticipantDisconnected?.(participant);
      this.notifyStateChange();
    });

    bind(RoomEvent.ActiveSpeakersChanged, (speakers: RemoteParticipant[]) => {
      this.speakingParticipants = new Set(speakers.map((speaker) => speaker.identity));
      this.options.onSpeakerChange?.(Array.from(this.speakingParticipants));
      this.notifyStateChange();
    });

    // Data events — delegado a RealtimeEventParser
    bind(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      this.eventParser.handleRawPayload(payload, participant);
    });
  }
}
