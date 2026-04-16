/**
 * SpaceRealtimeCoordinator - Application layer coordinator for LiveKit/WebRTC realtime communication
 * Extracted from useLiveKit logic to provide clean separation of concerns.
 *
 * REMEDIATION-004b: Soporte de credenciales TURN dinámicas vía iceServerProvider.
 * @see https://docs.livekit.io/reference/client-sdk-js/interfaces/connectoptions.html
 *   RoomConnectOptions.rtcConfig.iceServers — array de RTCIceServer que se fusiona
 *   con los ICE servers provistos por el SFU durante el handshake.
 */

import { Room, RoomConnectOptions, RoomEvent, Track, TrackPublication, RemoteParticipant, LocalTrack, LocalTrackPublication } from 'livekit-client';
import { logger } from '@/lib/logger';
import {
  PreflightError,
  DataPacketContract,
  type PublishableDataPacketContract,
  type RaiseHandPayload,
  type ConsentRequestPayload,
  type ConsentResponsePayload,
  type SpeakerHintPayload,
  type ModerationNoticePayload,
} from '../domain/types';
import { RealtimeEventBus } from './RealtimeEventBus';
import { RealtimeDataPublisher } from './RealtimeDataPublisher';
import { RealtimeEventParser } from './RealtimeEventParser';
import { crearOpcionesPublicacionTrackLiveKit, crearOpcionesSalaLiveKit } from './PoliticaTransporteLiveKit';

export interface SpaceRealtimeCoordinatorOptions {
  serverUrl: string;
  token: string;

  /**
   * Proveedor asíncrono de ICE servers (STUN + TURN dinámicos).
   * REMEDIATION-004b: Reemplaza los ICE servers estáticos de env.ts.
   * Cuando se provee, se llama antes de cada connect() para obtener
   * credenciales TURN frescas con TTL corto.
   *
   * Justificación (LiveKit JS SDK docs):
   *   RoomConnectOptions.rtcConfig.iceServers se fusiona con los ICE
   *   servers provistos por el SFU — no los reemplaza completamente.
   *   Esto permite añadir TURN privados sin perder los STUN del servidor.
   *
   * @see https://docs.livekit.io/reference/client-sdk-js/interfaces/connectoptions.html
   */
  iceServerProvider?: () => Promise<RTCIceServer[]>;

  onConnectionChange?: (connected: boolean) => void;
  onTrackPublished?: (track: LocalTrack, publication: LocalTrackPublication) => void;
  onTrackUnpublished?: (publication: LocalTrackPublication) => void;
  onRemoteTrackSubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onRemoteTrackUnsubscribed?: (track: Track, publication: TrackPublication, participant: RemoteParticipant) => void;
  onDataReceived?: (payload: DataPacketContract, participant?: RemoteParticipant) => void;
  onSpeakerChange?: (speakingParticipants: string[]) => void;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onConnectionQualityChanged?: (participantId: string, quality: string) => void;
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

/** Timeout en ms para forzar reconexión si el estado es "Reconnecting" */
const RECONNECTING_TIMEOUT_MS = 60_000;

export class SpaceRealtimeCoordinator {
  private room: Room | null = null;
  private options: SpaceRealtimeCoordinatorOptions;
  private eventBus = new RealtimeEventBus();
  private log = logger.child('space-realtime-coordinator');

  /** Servicio compuesto — publicación de datos (elimina duplicación con Gateway) */
  private readonly dataPublisher: RealtimeDataPublisher;
  /** Servicio compuesto — parsing de DataReceived (elimina duplicación con Gateway) */
  private eventParser: RealtimeEventParser;

  // State
  private connected = false;
  private localTrackPublications: Map<string, LocalTrackPublication> = new Map();
  private remoteTrackSubscriptions: Map<string, Track> = new Map();
  private speakingParticipants: Set<string> = new Set();

  /**
   * Timer de heartbeat: si la sala permanece en "Reconnecting" más de
   * RECONNECTING_TIMEOUT_MS (60s), fuerza disconnect() + reconexión limpia.
   * Roadmap REMEDIATION-005: evita que el cliente quede zombie indefinidamente.
   */
  private _reconnectingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SpaceRealtimeCoordinatorOptions) {
    this.options = options;
    this.dataPublisher = new RealtimeDataPublisher(() => this.room);
    this.eventParser = new RealtimeEventParser(this.eventBus, options.onDataReceived);
  }

  /**
   * Connect to LiveKit room
   */
  async connect(): Promise<boolean> {
    try {
      if (this.room?.state === 'connected') {
        this.log.info('Already connected');
        return true;
      }

      this.room = new Room(crearOpcionesSalaLiveKit());
      this.setupEventHandlers();

      // REMEDIATION-004b: Obtener ICE servers dinámicos antes de conectar.
      // LiveKit JS SDK: RoomConnectOptions.rtcConfig.iceServers se FUSIONA con
      // los ICE servers del SFU (no los reemplaza). Fuente oficial:
      // https://docs.livekit.io/reference/client-sdk-js/interfaces/connectoptions.html
      const connectOpts: RoomConnectOptions = {};
      if (this.options.iceServerProvider) {
        const dynamicIceServers = await this.options.iceServerProvider();
        if (dynamicIceServers.length > 0) {
          connectOpts.rtcConfig = { iceServers: dynamicIceServers };
          this.log.info('Using dynamic TURN servers', { count: dynamicIceServers.length });
        }
      }

      await this.room.connect(this.options.serverUrl, this.options.token, connectOpts);
      this.connected = true;

      this.log.info('Connected to room', { roomName: this.room.name });
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();

      return true;
    } catch (error) {
      this.log.error('Failed to connect', { error });
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
    // Cancelar heartbeat timer al desconectar manualmente
    this._clearReconnectingTimer();

    if (this.room) {
      // Unpublish all tracks first
      this.localTrackPublications.forEach((pub) => {
        if (pub.track) {
          const localTrack = pub.track;
          if (localTrack instanceof LocalTrack) {
            this.room?.localParticipant.unpublishTrack(localTrack);
            if (typeof localTrack.stop === 'function') {
              localTrack.stop();
            }
          }
        }
      });
      this.localTrackPublications.clear();

      this.room.disconnect();
      this.room = null;
    }

    this.connected = false;
    this.speakingParticipants.clear();
    this.remoteTrackSubscriptions.clear();
    this.options.onConnectionChange?.(false);
    this.notifyStateChange();
  }

  /** Cancela el heartbeat timer de reconexión si está activo */
  private _clearReconnectingTimer(): void {
    if (this._reconnectingTimer !== null) {
      clearTimeout(this._reconnectingTimer);
      this._reconnectingTimer = null;
    }
  }

  /**
   * Publish local track
   */
  async publishTrack(track: MediaStreamTrack, source: 'camera' | 'microphone' | 'screen_share'): Promise<LocalTrackPublication | null> {
    if (!this.room || this.room.state !== 'connected') {
      this.log.warn('Cannot publish track - not connected');
      return null;
    }

    try {
      const publishOptions = crearOpcionesPublicacionTrackLiveKit(source);

      const publication = await this.room.localParticipant.publishTrack(track, publishOptions);

      this.localTrackPublications.set(publication.trackSid, publication);
      this.options.onTrackPublished?.(publication.track as LocalTrack, publication);
      this.notifyStateChange();

      this.log.info('Published track', { trackSid: publication.trackSid, source });
      return publication;
    } catch (error) {
      this.log.error('Failed to publish track', { error });
      return null;
    }
  }

  /**
   * Unpublish local track.
   *
   * `stopOnUnpublish` (default `true`) controla si el `MediaStreamTrack`
   * subyacente se detiene al despublicar. En gating por proximidad debe
   * pasarse `false` — el stream lo posee `useMediaStream` y detenerlo aquí
   * forzaría al usuario a re-seleccionar micro/cámara al re-entrar en
   * proximidad (el track queda `ended` y `sincronizarTracksLocales` no lo
   * re-publica). Ref: LiveKit SDK v2 `LocalParticipant.unpublishTrack(track, stopOnUnpublish?)`.
   */
  async unpublishTrack(trackSid: string, stopOnUnpublish = true): Promise<boolean> {
    if (!this.room || this.room.state !== 'connected') {
      return false;
    }

    try {
      const publication = this.localTrackPublications.get(trackSid);
      if (!publication?.track) {
        return false;
      }

      const localTrack = publication.track;
      if (localTrack instanceof LocalTrack) {
        await this.room.localParticipant.unpublishTrack(localTrack, stopOnUnpublish);
      }
      this.localTrackPublications.delete(trackSid);
      this.notifyStateChange();

      this.log.info('Unpublished track', { trackSid, stopOnUnpublish });
      return true;
    } catch (error) {
      this.log.error('Failed to unpublish track', { trackSid, error });
      return false;
    }
  }

  /**
   * Unpublish all tracks of a specific source.
   * Ver `unpublishTrack` para la semántica de `stopOnUnpublish`.
   */
  async unpublishTracksBySource(source: 'camera' | 'microphone' | 'screen_share', stopOnUnpublish = true): Promise<void> {
    const trackSource = source === 'camera' ? Track.Source.Camera
      : source === 'microphone' ? Track.Source.Microphone
      : Track.Source.ScreenShare;

    const publications = Array.from(this.localTrackPublications.values())
      .filter(pub => pub.source === trackSource);

    await Promise.all(publications.map(pub => this.unpublishTrack(pub.trackSid, stopOnUnpublish)));
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

    const currentTrack = publication.track;
    if (currentTrack instanceof LocalTrack && 'mediaStreamTrack' in currentTrack && currentTrack.mediaStreamTrack?.id === newTrack.id) {
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
      const trackToReplace = publication?.track;
      if (!trackToReplace || !(trackToReplace instanceof LocalTrack) || typeof trackToReplace.replaceTrack !== 'function') {
        return false;
      }

      await trackToReplace.replaceTrack(newTrack);
      this.log.info('Replaced track', { trackSid });
      this.notifyStateChange();
      return true;
    } catch (error) {
      this.log.error('Failed to replace track', { trackSid, error });
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

  // ─── Data Publishing (delegado a RealtimeDataPublisher) ──────────

  /**
   * Publica un paquete de datos en la sala LiveKit.
   * Delegado a RealtimeDataPublisher que resuelve automáticamente lossy/reliable.
   */
  async publishData(data: PublishableDataPacketContract, reliableOverride?: boolean): Promise<boolean> {
    return this.dataPublisher.publish(data, reliableOverride);
  }

  async sendReaction(emoji: string): Promise<boolean> {
    return this.dataPublisher.sendReaction({ emoji });
  }

  async sendRecordingStatus(isRecording: boolean, by: string): Promise<boolean> {
    return this.dataPublisher.sendRecordingStatus({ isRecording, by });
  }

  async sendConsentRequest(payload: ConsentRequestPayload): Promise<boolean> {
    return this.dataPublisher.sendConsentRequest(payload);
  }

  async sendConsentResponse(payload: ConsentResponsePayload): Promise<boolean> {
    return this.dataPublisher.sendConsentResponse(payload);
  }

  async sendRaiseHand(payload: RaiseHandPayload): Promise<boolean> {
    return this.dataPublisher.sendRaiseHand(payload);
  }

  async sendPinParticipant(participantId: string | null, pinned: boolean): Promise<boolean> {
    const by = this.room?.localParticipant?.name || 'Anonymous';
    return this.dataPublisher.sendPinParticipant({ participantId, pinned, by });
  }

  /** Nuevo: speaker hint (antes solo disponible en Gateway) */
  async sendSpeakerHint(payload: SpeakerHintPayload): Promise<boolean> {
    return this.dataPublisher.sendSpeakerHint(payload);
  }

  /** Nuevo: moderation notice (antes solo disponible en Gateway) */
  async sendModerationNotice(payload: ModerationNoticePayload): Promise<boolean> {
    return this.dataPublisher.sendModerationNotice(payload);
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
      this.log.info('Room connected');
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      this.log.info('Room disconnected', { reason });
      this.connected = false;
      this.options.onConnectionChange?.(false);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      this.log.info('Room reconnecting — heartbeat timeout started', {
        timeoutMs: RECONNECTING_TIMEOUT_MS,
      });

      // Inicia el timer de heartbeat: si en 60s no reconecta → fuerza reconexión limpia
      this._clearReconnectingTimer();
      this._reconnectingTimer = setTimeout(async () => {
        this.log.warn('Reconnecting timeout reached — forcing clean reconnect', {
          timeoutMs: RECONNECTING_TIMEOUT_MS,
        });
        try {
          await this.room?.disconnect();
        } catch {
          // Ignorar errores de disconnect durante estado degradado
        }
        // La lógica de re-connect con token fresco queda en manos del llamador
        // (el store/hook detectará la desconexión y obtendrá un nuevo token)
        this.connected = false;
        this.options.onConnectionChange?.(false);
        this.notifyStateChange();
      }, RECONNECTING_TIMEOUT_MS);
    });

    this.room.on(RoomEvent.Reconnected, () => {
      this.log.info('Room reconnected — heartbeat timer cleared');
      this._clearReconnectingTimer();
      this.connected = true;
      this.options.onConnectionChange?.(true);
      this.notifyStateChange();
    });

    // Track events
    this.room.on(RoomEvent.LocalTrackPublished, (publication) => {
      this.log.info('Local track published', { trackSid: publication.trackSid });
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      this.log.info('Local track unpublished', { trackSid: publication.trackSid });
      this.localTrackPublications.delete(publication.trackSid);
      this.options.onTrackUnpublished?.(publication);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      this.log.info('Remote track subscribed', { trackSid: track.sid, participantId: participant.identity });
      if (track.sid) {
        this.remoteTrackSubscriptions.set(track.sid, track);
      }
      this.options.onRemoteTrackSubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      this.log.info('Remote track unsubscribed', { trackSid: track.sid, participantId: participant.identity });
      if (track.sid) {
        this.remoteTrackSubscriptions.delete(track.sid);
      }
      this.options.onRemoteTrackUnsubscribed?.(track, publication, participant);
      this.notifyStateChange();
    });

    // Participant events
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      this.log.info('Participant connected', { participantId: participant.identity });
      this.options.onParticipantConnected?.(participant);
      this.notifyStateChange();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.log.info('Participant disconnected', { participantId: participant.identity });
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

    // Connection quality monitoring
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      this.log.debug('Connection quality changed', {
        participantId: participant.identity,
        quality,
        isLocal: participant === this.room?.localParticipant,
      });
      this.options.onConnectionQualityChanged?.(participant.identity, quality);
    });

    // Data events — delegado a RealtimeEventParser
    this.room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      this.eventParser.handleRawPayload(payload, participant);
    });
  }
}
