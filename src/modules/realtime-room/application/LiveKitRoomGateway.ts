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
  type ModerationNoticePayload,
  parseDataPacketContract,
  type PinParticipantPayload,
  type RaiseHandPayload,
  type ReactionPayload,
  type RecordingStatusPayload,
  type SpeakerHintPayload,
  createConsentRequestDataPacket,
  createConsentResponseDataPacket,
  createModerationNoticeDataPacket,
  createPinParticipantDataPacket,
  createRaiseHandDataPacket,
  createReactionDataPacket,
  createRecordingStatusDataPacket,
  createSpeakerHintDataPacket,
} from '../domain/types';
import { RealtimeEventBus } from './RealtimeEventBus';

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

  constructor(options: LiveKitRoomGatewayOptions = {}) {
    this.options = options;
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

  async publishData(data: DataPacketContract, reliable: boolean = true): Promise<boolean> {
    if (!this.room || this.room.state !== 'connected') {
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(data));
      await this.room.localParticipant.publishData(payload, { reliable });
      return true;
    } catch (error) {
      console.error('[LiveKitRoomGateway] Failed to publish data:', error);
      return false;
    }
  }

  async sendReaction(payload: ReactionPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createReactionDataPacket(payload), reliable);
  }

  async sendRecordingStatus(payload: RecordingStatusPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createRecordingStatusDataPacket(payload), reliable);
  }

  async sendConsentRequest(payload: ConsentRequestPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createConsentRequestDataPacket(payload), reliable);
  }

  async sendConsentResponse(payload: ConsentResponsePayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createConsentResponseDataPacket(payload), reliable);
  }

  async sendRaiseHand(payload: RaiseHandPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createRaiseHandDataPacket(payload), reliable);
  }

  async sendPinParticipant(payload: PinParticipantPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createPinParticipantDataPacket(payload), reliable);
  }

  async sendSpeakerHint(payload: SpeakerHintPayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createSpeakerHintDataPacket(payload), reliable);
  }

  async sendModerationNotice(payload: ModerationNoticePayload, reliable: boolean = true): Promise<boolean> {
    return this.publishData(createModerationNoticeDataPacket(payload), reliable);
  }

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

  private notifyStateChange(): void {
    this.options.onStateChange?.(this.getState());
  }

  private setupEventHandlers(room: Room): void {
    const bind = <TArgs extends unknown[]>(event: RoomEvent, handler: (...args: TArgs) => void) => {
      room.on(event, handler as (...args: any[]) => void);
      this.cleanupFns.push(() => {
        room.off(event, handler as (...args: any[]) => void);
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

    bind(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const decoder = new TextDecoder();
        const raw = JSON.parse(decoder.decode(payload));
        const data = parseDataPacketContract(raw);
        if (!data) {
          console.warn('[LiveKitRoomGateway] Ignoring invalid data packet');
          return;
        }

        this.eventBus.emit(data, participant?.identity);
        this.options.onDataReceived?.(data, participant);
      } catch (error) {
        console.warn('[LiveKitRoomGateway] Failed to parse received data:', error);
      }
    });
  }
}
