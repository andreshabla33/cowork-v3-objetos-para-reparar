/**
 * SpaceRealtimeCoordinator - Application layer coordinator for LiveKit/WebRTC realtime communication
 * Extracted from useLiveKit logic to provide clean separation of concerns
 */

import { Room, RoomEvent, Track, TrackPublication, RemoteParticipant, LocalTrack, LocalTrackPublication } from 'livekit-client';
import {
  PreflightError,
  DataPacketContract,
  parseDataPacketContract,
  type RaiseHandPayload,
  ConsentRequestPayload,
  ConsentResponsePayload,
  createConsentRequestDataPacket,
  createConsentResponseDataPacket,
  createPinParticipantDataPacket,
  createRaiseHandDataPacket,
  createReactionDataPacket,
  createRecordingStatusDataPacket,
} from '../domain/types';
import { RealtimeEventBus } from './RealtimeEventBus';
import { crearOpcionesPublicacionTrackLiveKit, crearOpcionesSalaLiveKit } from './PoliticaTransporteLiveKit';

export interface SpaceRealtimeCoordinatorOptions {
  serverUrl: string;
  token: string;
  onConnectionChange?: (connected: boolean) => void;
  onTrackPublished?: (track: LocalTrack, publication: LocalTrackPublication) => void;
  onTrackUnpublished?: (publication: LocalTrackPublication) => void;
  onRemoteTrackSubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onRemoteTrackUnsubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onDataReceived?: (payload: DataPacketContract, participant?: RemoteParticipant) => void;
  onSpeakerChange?: (speakingParticipants: string[]) => void;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onStateChange?: (state: SpaceRealtimeCoordinatorState) => void;
  onError?: (error: PreflightError) => void;
}

export interface SpaceRealtimeCoordinatorState {
  connected: boolean;
  roomName: string | null;
  localParticipantId: string | null;
  localParticipantName: string | null;
  remoteParticipants: RemoteParticipant[];
  speakingParticipants: string[];
  localTrackPublications: LocalTrackPublication[];
  remoteTrackSubscriptions: Track[];
}

export class SpaceRealtimeCoordinator {
  private room: Room | null = null;
  private options: SpaceRealtimeCoordinatorOptions;
  private eventBus = new RealtimeEventBus();

  // State
  private connected = false;
  private localTrackPublications: Map<string, LocalTrackPublication> = new Map();
  private remoteTrackSubscriptions: Map<string, Track> = new Map();
  private speakingParticipants: Set<string> = new Set();

  constructor(options: SpaceRealtimeCoordinatorOptions) {
    this.options = options;
  }

  /**
   * Connect to LiveKit room
   */
  async connect(): Promise<boolean> {
    try {
      if (this.room?.state === 'connected') {
        console.log('[SpaceRealtimeCoordinator] Already connected');
        return true;
      }

      this.room = new Room(crearOpcionesSalaLiveKit());

      // Setup event handlers
      this.setupEventHandlers();

      // Connect
      await this.room.connect(this.options.serverUrl, this.options.token);
      this.connected = true;

      console.log('[SpaceRealtimeCoordinator] Connected to room:', this.room.name);
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();

      return true;
    } catch (error) {
      console.error('[SpaceRealtimeCoordinator] Failed to connect:', error);
      this.options.onError?.({
        type: 'track-error',
        message: 'Error al conectar con la sala de reunión',
        recoverable: true,
      });
      return false;
    }
  }

  /**
   * Disconnect from room
   */
  disconnect(): void {
    if (this.room) {
      // Unpublish all tracks first
      this.localTrackPublications.forEach((pub) => {
        if (pub.track) {
          this.room?.localParticipant.unpublishTrack(pub.track as LocalTrack);
          if (typeof (pub.track as LocalTrack).stop === 'function') {
            (pub.track as LocalTrack).stop();
          }
        }
      });
      this.localTrackPublications.clear();

      // Disconnect
      this.room.disconnect();
      this.room = null;
    }

    this.connected = false;
    this.speakingParticipants.clear();
    this.remoteTrackSubscriptions.clear();
    this.options.onConnectionChange?.(false);
    this.notifyStateChange();
  }

  /**
   * Publish local track
   */
  async publishTrack(track: MediaStreamTrack, source: 'camera' | 'microphone' | 'screen_share'): Promise<LocalTrackPublication | null> {
    if (!this.room || this.room.state !== 'connected') {
      console.warn('[SpaceRealtimeCoordinator] Cannot publish track - not connected');
      return null;
    }

    try {
      const publishOptions = crearOpcionesPublicacionTrackLiveKit(source);

      const publication = await this.room.localParticipant.publishTrack(track, publishOptions);

      this.localTrackPublications.set(publication.trackSid, publication);
      this.options.onTrackPublished?.(publication.track as LocalTrack, publication);
      this.notifyStateChange();

      console.log('[SpaceRealtimeCoordinator] Published track:', publication.trackSid, source);
      return publication;
    } catch (error) {
      console.error('[SpaceRealtimeCoordinator] Failed to publish track:', error);
      return null;
    }
  }

  /**
   * Unpublish local track
   */
  async unpublishTrack(trackSid: string): Promise<boolean> {
    if (!this.room || this.room.state !== 'connected') {
      return false;
    }

    try {
      const publication = this.localTrackPublications.get(trackSid);
      if (!publication?.track) {
        return false;
      }

      await this.room.localParticipant.unpublishTrack(publication.track as LocalTrack);
      if (typeof (publication.track as LocalTrack).stop === 'function') {
        (publication.track as LocalTrack).stop();
      }
      this.localTrackPublications.delete(trackSid);
      this.notifyStateChange();

      console.log('[SpaceRealtimeCoordinator] Unpublished track:', trackSid);
      return true;
    } catch (error) {
      console.error('[SpaceRealtimeCoordinator] Failed to unpublish track:', error);
      return false;
    }
  }

  /**
   * Unpublish all tracks of a specific source
   */
  async unpublishTracksBySource(source: 'camera' | 'microphone' | 'screen_share'): Promise<void> {
    const trackSource = source === 'camera' ? Track.Source.Camera
      : source === 'microphone' ? Track.Source.Microphone
      : Track.Source.ScreenShare;

    const publications = Array.from(this.localTrackPublications.values())
      .filter(pub => pub.source === trackSource);

    await Promise.all(publications.map(pub => this.unpublishTrack(pub.trackSid)));
  }

  getLocalTrackPublicationBySource(source: 'camera' | 'microphone' | 'screen_share'): LocalTrackPublication | null {
    const trackSource = source === 'camera' ? Track.Source.Camera
      : source === 'microphone' ? Track.Source.Microphone
      : Track.Source.ScreenShare;

    return Array.from(this.localTrackPublications.values())
      .find(pub => pub.source === trackSource) ?? null;
  }

  async replaceTrackBySource(source: 'camera' | 'microphone' | 'screen_share', newTrack: MediaStreamTrack): Promise<boolean> {
    const publication = this.getLocalTrackPublicationBySource(source);
    if (!publication) {
      return !!(await this.publishTrack(newTrack, source));
    }

    const currentTrack = publication.track as LocalTrack | undefined;
    if ((currentTrack as LocalTrack & { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack?.id === newTrack.id) {
      return true;
    }

    return this.replaceTrack(publication.trackSid, newTrack);
  }

  /**
   * Replace local track (for hot-swap)
   */
  async replaceTrack(trackSid: string, newTrack: MediaStreamTrack): Promise<boolean> {
    if (!this.room || this.room.state !== 'connected') {
      return false;
    }

    try {
      const publication = this.localTrackPublications.get(trackSid);
      const localTrack = publication?.track as LocalTrack | undefined;
      if (!localTrack || typeof localTrack.replaceTrack !== 'function') {
        return false;
      }

      await localTrack.replaceTrack(newTrack);
      console.log('[SpaceRealtimeCoordinator] Replaced track:', trackSid);
      this.notifyStateChange();
      return true;
    } catch (error) {
      console.error('[SpaceRealtimeCoordinator] Failed to replace track:', error);
      return false;
    }
  }

  /**
   * Subscribe to remote track
   */
  subscribeToTrack(participant: RemoteParticipant, trackSid: string): boolean {
    const publication = participant.trackPublications.get(trackSid);
    if (!publication || !(publication instanceof TrackPublication)) {
      return false;
    }

    publication.setSubscribed(true);
    return true;
  }

  /**
   * Unsubscribe from remote track
   */
  unsubscribeFromTrack(participant: RemoteParticipant, trackSid: string): boolean {
    const publication = participant.trackPublications.get(trackSid);
    if (!publication || !(publication instanceof TrackPublication)) {
      return false;
    }

    publication.setSubscribed(false);
    return true;
  }

  /**
   * Publish data message
   */
  async publishData(data: DataPacketContract, reliable: boolean = true): Promise<boolean> {
    if (!this.room || this.room.state !== 'connected') {
      console.warn('[SpaceRealtimeCoordinator] Cannot publish data - not connected');
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(data));
      
      await this.room.localParticipant.publishData(payload, { reliable });
      return true;
    } catch (error) {
      console.error('[SpaceRealtimeCoordinator] Failed to publish data:', error);
      return false;
    }
  }

  /**
   * Send a reaction
   */
  async sendReaction(emoji: string): Promise<boolean> {
    return this.publishData(createReactionDataPacket({ emoji }));
  }

  /**
   * Send recording status
   */
  async sendRecordingStatus(isRecording: boolean, by: string): Promise<boolean> {
    return this.publishData(createRecordingStatusDataPacket({ isRecording, by }));
  }

  /**
   * Send consent request
   */
  async sendConsentRequest(payload: ConsentRequestPayload): Promise<boolean> {
    return this.publishData(createConsentRequestDataPacket(payload));
  }

  /**
   * Send consent response
   */
  async sendConsentResponse(payload: ConsentResponsePayload): Promise<boolean> {
    return this.publishData(createConsentResponseDataPacket(payload));
  }

  /**
   * Send raise hand
   */
  async sendRaiseHand(payload: RaiseHandPayload): Promise<boolean> {
    return this.publishData(createRaiseHandDataPacket(payload));
  }

  /**
   * Send pin participant
   */
  async sendPinParticipant(participantId: string | null, pinned: boolean): Promise<boolean> {
    const by = this.room?.localParticipant?.name || 'Anonymous';
    return this.publishData(createPinParticipantDataPacket({ participantId, pinned, by }));
  }

  getState(): SpaceRealtimeCoordinatorState {
    return {
      connected: this.connected,
      roomName: this.room?.name || null,
      localParticipantId: this.room?.localParticipant?.identity || null,
      localParticipantName: this.room?.localParticipant?.name || null,
      remoteParticipants: this.room ? Array.from(this.room.remoteParticipants.values()) : [],
      speakingParticipants: Array.from(this.speakingParticipants),
      localTrackPublications: Array.from(this.localTrackPublications.values()),
      remoteTrackSubscriptions: Array.from(this.remoteTrackSubscriptions.values()),
    };
  }

  /**
   * Get the room instance for direct access if needed
   */
  getRoom(): Room | null {
    return this.room;
  }

  getEventBus(): RealtimeEventBus {
    return this.eventBus;
  }

  private notifyStateChange(): void {
    this.options.onStateChange?.(this.getState());
  }

  private setupEventHandlers(): void {
    if (!this.room) return;

    // Connection events
    this.room.on(RoomEvent.Connected, () => {
      console.log('[SpaceRealtimeCoordinator] Room connected');
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('[SpaceRealtimeCoordinator] Room disconnected:', reason);
      this.connected = false;
      this.options.onConnectionChange?.(false);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('[SpaceRealtimeCoordinator] Room reconnecting');
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.log('[SpaceRealtimeCoordinator] Room reconnected');
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    // Track events
    this.room.on(RoomEvent.LocalTrackPublished, (publication) => {
      console.log('[SpaceRealtimeCoordinator] Local track published:', publication.trackSid);
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      console.log('[SpaceRealtimeCoordinator] Local track unpublished:', publication.trackSid);
      this.localTrackPublications.delete(publication.trackSid);
      this.options.onTrackUnpublished?.(publication);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('[SpaceRealtimeCoordinator] Remote track subscribed:', track.sid, 'from', participant.identity);
      this.remoteTrackSubscriptions.set(track.sid, track);
      this.options.onRemoteTrackSubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log('[SpaceRealtimeCoordinator] Remote track unsubscribed:', track.sid, 'from', participant.identity);
      this.remoteTrackSubscriptions.delete(track.sid);
      this.options.onRemoteTrackUnsubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    // Participant events
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('[SpaceRealtimeCoordinator] Participant connected:', participant.identity);
      this.options.onParticipantConnected?.(participant);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('[SpaceRealtimeCoordinator] Participant disconnected:', participant.identity);
      this.options.onParticipantDisconnected?.(participant);
      this.notifyStateChange();
    });

    // Speaking events
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakerIds = speakers.map(s => s.identity);
      this.speakingParticipants = new Set(speakerIds);
      this.options.onSpeakerChange?.(speakerIds);
      this.notifyStateChange();
    });

    // Data events
    this.room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const decoder = new TextDecoder();
        const raw = JSON.parse(decoder.decode(payload));
        const data = parseDataPacketContract(raw);
        if (!data) {
          console.warn('[SpaceRealtimeCoordinator] Ignoring invalid data packet');
          return;
        }
        console.log('[SpaceRealtimeCoordinator] Data received:', data.type, 'from', participant?.identity);
        this.eventBus.emit(data, participant?.identity);
        this.options.onDataReceived?.(data, participant);
      } catch (error) {
        console.warn('[SpaceRealtimeCoordinator] Failed to parse received data:', error);
      }
    });
  }
}
